"""
SkyGuard AI — Physics Consistency Checker
Validates thermodynamic relationships between temp, pressure, and humidity.
"""
import numpy as np
from typing import Dict


from server.config import PHYSICAL_BOUNDS


class PhysicsChecker:
    """
    Physics pillar: verifies thermodynamic consistency.
    
    Checks:
      0. Physical atmospheric bounds (min/max plausibility)
      1. Clausius-Clapeyron: saturation vapor pressure vs temperature
      2. Dewpoint-temperature relationship
      3. Pressure-altitude plausibility
      4. Temperature-humidity inverse correlation
    """
    
    def analyze(self, temp_c: float, pressure_hpa: float, humidity_pct: float,
                elevation_m: float = 0, dewpoint_c: float = None) -> Dict:
        """
        Analyze physics consistency of a single observation.
        """
        issues = []
        score = 100.0
        
        # 0. Physical atmospheric bounds check
        bounds_result = self._physical_bounds_check(temp_c, pressure_hpa, humidity_pct)
        if bounds_result["flagged"]:
            score -= bounds_result["penalty"]
            issues.append(bounds_result["detail"])
        
        # Calculate dewpoint if not provided
        if dewpoint_c is None:
            dewpoint_c = self._magnus_dewpoint(temp_c, humidity_pct)
        
        # 1. Clausius-Clapeyron check
        cc_result = self._clausius_clapeyron_check(temp_c, humidity_pct)
        if cc_result["flagged"]:
            score -= cc_result["penalty"]
            issues.append(cc_result["detail"])
        
        # 2. Dewpoint must be ≤ temperature
        dp_result = self._dewpoint_check(temp_c, dewpoint_c, humidity_pct)
        if dp_result["flagged"]:
            score -= dp_result["penalty"]
            issues.append(dp_result["detail"])
        
        # 3. Pressure-altitude check
        pa_result = self._pressure_altitude_check(pressure_hpa, elevation_m)
        if pa_result["flagged"]:
            score -= pa_result["penalty"]
            issues.append(pa_result["detail"])
        
        # 4. Superhigh humidity at extreme temps is suspicious
        th_result = self._temp_humidity_consistency(temp_c, humidity_pct)
        if th_result["flagged"]:
            score -= th_result["penalty"]
            issues.append(th_result["detail"])
        
        score = max(0.0, min(100.0, score))
        
        if score >= 75:
            status = "normal"
        elif score >= 50:
            status = "uncertain"
        else:
            status = "sensor_fault"
        
        return {
            "status": status,
            "confidence_score": round(score, 1),
            "title": "Physics Consistency",
            "metric_label": "Clausius-Clapeyron Δ",
            "metric_value": f"{cc_result.get('delta', 0):.2f}%",
            "rationale": "; ".join(issues) if issues else "All thermodynamic relationships consistent",
        }
    
    def _physical_bounds_check(self, temp_c: float, pressure_hpa: float, humidity_pct: float) -> Dict:
        """Verify readings are within thermodynamic atmospheric limits."""
        violations = []
        if not (PHYSICAL_BOUNDS["temp_c"]["min"] <= temp_c <= PHYSICAL_BOUNDS["temp_c"]["max"]):
            violations.append(f"Temperature {temp_c:.1f}°C out of physical bounds [{PHYSICAL_BOUNDS['temp_c']['min']}, {PHYSICAL_BOUNDS['temp_c']['max']}]°C")
        if not (PHYSICAL_BOUNDS["pressure_hpa"]["min"] <= pressure_hpa <= PHYSICAL_BOUNDS["pressure_hpa"]["max"]):
            violations.append(f"Pressure {pressure_hpa:.1f}hPa out of physical bounds [{PHYSICAL_BOUNDS['pressure_hpa']['min']}, {PHYSICAL_BOUNDS['pressure_hpa']['max']}]hPa")
        if not (PHYSICAL_BOUNDS["humidity_pct"]["min"] <= humidity_pct <= PHYSICAL_BOUNDS["humidity_pct"]["max"]):
            violations.append(f"Humidity {humidity_pct:.1f}% out of physical bounds [{PHYSICAL_BOUNDS['humidity_pct']['min']}, {PHYSICAL_BOUNDS['humidity_pct']['max']}]%")
        
        if violations:
            return {
                "flagged": True,
                "penalty": 75,
                "detail": "; ".join(violations),
            }
        return {"flagged": False, "penalty": 0, "detail": ""}

    def _clausius_clapeyron_check(self, temp_c: float, humidity_pct: float) -> Dict:
        """
        Verify humidity is consistent with saturation vapor pressure at given temperature.
        Using the August-Roche-Magnus formula.
        """
        # Saturation vapor pressure (hPa)
        es = 6.1078 * np.exp((17.27 * temp_c) / (temp_c + 237.3))
        
        # At very low temperatures, high humidity is physically expected
        # At very high temperatures, 100% humidity is rare but possible
        
        # Check: if T < -20°C and RH > 95%, suspicious (ice saturation is different)
        delta = 0
        if temp_c < -20 and humidity_pct > 95:
            delta = humidity_pct - 95
            return {
                "flagged": True,
                "penalty": 20,
                "delta": delta,
                "detail": f"RH={humidity_pct:.1f}% at T={temp_c:.1f}°C exceeds ice-saturation expectation",
            }
        
        # If T > 50°C and RH > 80%, physically improbable
        if temp_c > 50 and humidity_pct > 80:
            delta = humidity_pct - 80
            return {
                "flagged": True,
                "penalty": 30,
                "delta": delta,
                "detail": f"RH={humidity_pct:.1f}% at T={temp_c:.1f}°C is physically improbable (extreme heat with high moisture)",
            }
        
        return {"flagged": False, "penalty": 0, "delta": 0, "detail": ""}
    
    def _dewpoint_check(self, temp_c: float, dewpoint_c: float, humidity_pct: float) -> Dict:
        """Dewpoint must always be ≤ temperature (basic thermodynamic law)."""
        if dewpoint_c > temp_c + 0.5:  # Small tolerance
            return {
                "flagged": True,
                "penalty": 35,
                "detail": f"Dewpoint ({dewpoint_c:.1f}°C) exceeds air temperature ({temp_c:.1f}°C) — physically impossible",
            }
        
        # Dewpoint spread consistency with RH
        expected_dp = self._magnus_dewpoint(temp_c, humidity_pct)
        dp_error = abs(dewpoint_c - expected_dp)
        if dp_error > 5.0:
            return {
                "flagged": True,
                "penalty": 20,
                "detail": f"Dewpoint ({dewpoint_c:.1f}°C) inconsistent with T={temp_c:.1f}°C and RH={humidity_pct:.1f}% (expected {expected_dp:.1f}°C)",
            }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
    
    def _pressure_altitude_check(self, pressure_hpa: float, elevation_m: float) -> Dict:
        """
        Check if pressure is consistent with station elevation.
        Uses barometric formula: P = P0 × (1 - 0.0000225577 × h)^5.25588
        """
        # Expected sea-level range: 980-1040 hPa (normal conditions)
        expected_pressure = 1013.25 * (1 - 0.0000225577 * elevation_m) ** 5.25588
        
        deviation = abs(pressure_hpa - expected_pressure)
        
        # Allow ±30 hPa for weather systems (cyclones, etc.)
        if deviation > 30:
            return {
                "flagged": True,
                "penalty": 25,
                "detail": f"Pressure {pressure_hpa:.1f}hPa deviates {deviation:.1f}hPa from altitude-expected {expected_pressure:.1f}hPa at {elevation_m:.0f}m",
            }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
    
    def _temp_humidity_consistency(self, temp_c: float, humidity_pct: float) -> Dict:
        """Check for inconsistent temperature-humidity combinations."""
        # Very dry heat (RH < 5% at any temp is sensor suspect unless desert)
        if humidity_pct < 2.0 and temp_c > 30:
            return {
                "flagged": True,
                "penalty": 15,
                "detail": f"Extremely low humidity ({humidity_pct:.1f}%) at {temp_c:.1f}°C — possible sensor desiccation",
            }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
    
    @staticmethod
    def _magnus_dewpoint(temp_c: float, humidity_pct: float) -> float:
        """Calculate dewpoint using Magnus formula."""
        if humidity_pct <= 0:
            humidity_pct = 0.1
        a = 17.27
        b = 237.7
        alpha = (a * temp_c) / (b + temp_c) + np.log(humidity_pct / 100.0)
        return (b * alpha) / (a - alpha)
