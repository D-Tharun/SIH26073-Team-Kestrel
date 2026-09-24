"""
SkyGuard AI — Temporal Pattern Analyzer
Detects temporal anomalies: spikes, frozen values, abnormal trends.
"""
import numpy as np
from typing import Dict, List, Optional
from server.config import RATE_OF_CHANGE_LIMITS, FROZEN_VALUE_WINDOW, FROZEN_VALUE_TOLERANCE


class TemporalAnalyzer:
    """
    Temporal pillar: analyzes time-series patterns for anomalies.
    
    Checks:
      1. Rate-of-change spike detection
      2. Frozen value detection (zero variance)
      3. Trend deviation from diurnal pattern
      4. Rolling volatility analysis
    """
    
    def analyze(self, history: List[Dict], current: Dict) -> Dict:
        """
        Analyze temporal consistency of a station's readings.
        
        Args:
            history: List of recent reading dicts with temp_c, pressure_hpa, humidity_pct
            current: Current reading dict
        
        Returns:
            dict with: status, confidence_score, title, metric_label, metric_value, rationale
        """
        if len(history) < 3:
            return self._insufficient_data()
        
        issues = []
        score = 100.0  # Start at perfect, deduct for issues
        
        # 1. Rate-of-change check
        roc_result = self._check_rate_of_change(history, current)
        if roc_result["flagged"]:
            score -= roc_result["penalty"]
            issues.append(roc_result["detail"])
        
        # 2. Frozen value check
        frozen_result = self._check_frozen_values(history, current)
        if frozen_result["flagged"]:
            score -= frozen_result["penalty"]
            issues.append(frozen_result["detail"])
        
        # 3. Trend consistency check
        trend_result = self._check_trend_consistency(history, current)
        if trend_result["flagged"]:
            score -= trend_result["penalty"]
            issues.append(trend_result["detail"])
        
        # 4. Volatility check
        vol_result = self._check_volatility(history)
        if vol_result["flagged"]:
            score -= vol_result["penalty"]
            issues.append(vol_result["detail"])
        
        score = max(0.0, min(100.0, score))
        
        # Determine status
        if frozen_result["flagged"]:
            status = "sensor_fault"
        elif score >= 75:
            status = "normal"
        elif score >= 50:
            status = "uncertain"
        else:
            status = "sensor_fault"
        
        max_roc = max(
            abs(current.get("temp_c", 0) - history[-1].get("temp_c", 0)),
            abs(current.get("pressure_hpa", 0) - history[-1].get("pressure_hpa", 0)) / 3,
            abs(current.get("humidity_pct", 0) - history[-1].get("humidity_pct", 0)) / 15,
        ) if history else 0
        
        rationale = "; ".join(issues) if issues else "Temporal patterns consistent with expected diurnal cycle"
        
        return {
            "status": status,
            "confidence_score": round(score, 1),
            "title": "Temporal Analysis",
            "metric_label": "Max Rate-of-Change",
            "metric_value": f"{max_roc:.2f} units/step",
            "rationale": rationale,
        }
    
    def _check_rate_of_change(self, history: List[Dict], current: Dict) -> Dict:
        """Check if rate of change exceeds physical limits."""
        if not history:
            return {"flagged": False, "penalty": 0, "detail": ""}
        
        prev = history[-1]
        delta_t = abs(current.get("temp_c", 0) - prev.get("temp_c", 0))
        delta_p = abs(current.get("pressure_hpa", 0) - prev.get("pressure_hpa", 0))
        delta_h = abs(current.get("humidity_pct", 0) - prev.get("humidity_pct", 0))
        
        flagged = False
        details = []
        penalty = 0
        
        if delta_t > RATE_OF_CHANGE_LIMITS["temp_c"]:
            flagged = True
            penalty += 30
            details.append(f"Temperature spike: Δ{delta_t:.1f}°C exceeds {RATE_OF_CHANGE_LIMITS['temp_c']}°C/step limit")
        
        if delta_p > RATE_OF_CHANGE_LIMITS["pressure_hpa"]:
            flagged = True
            penalty += 25
            details.append(f"Pressure jump: Δ{delta_p:.1f}hPa exceeds {RATE_OF_CHANGE_LIMITS['pressure_hpa']}hPa/step limit")
        
        if delta_h > RATE_OF_CHANGE_LIMITS["humidity_pct"]:
            flagged = True
            penalty += 20
            details.append(f"Humidity shift: Δ{delta_h:.1f}% exceeds {RATE_OF_CHANGE_LIMITS['humidity_pct']}%/step limit")
        
        return {"flagged": flagged, "penalty": penalty, "detail": "; ".join(details)}
    
    def _check_frozen_values(self, history: List[Dict], current: Dict) -> Dict:
        """Check for stuck sensor (identical readings)."""
        all_readings = history + [current]
        if len(all_readings) < FROZEN_VALUE_WINDOW:
            return {"flagged": False, "penalty": 0, "detail": ""}
        
        recent = all_readings[-FROZEN_VALUE_WINDOW:]
        
        for param in ["temp_c", "pressure_hpa", "humidity_pct"]:
            values = [r.get(param, 0) for r in recent]
            if len(values) < 2:
                continue
            std = np.std(values)
            if std < FROZEN_VALUE_TOLERANCE:
                return {
                    "flagged": True,
                    "penalty": 75,
                    "detail": f"Frozen {param}: {FROZEN_VALUE_WINDOW} consecutive identical readings ({values[0]:.2f}), σ={std:.4f}",
                }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
    
    def _check_trend_consistency(self, history: List[Dict], current: Dict) -> Dict:
        """Check if current reading follows the established trend."""
        if len(history) < 4:
            return {"flagged": False, "penalty": 0, "detail": ""}
        
        temps = [r.get("temp_c", 0) for r in history[-4:]]
        # Simple linear trend
        x = np.arange(len(temps))
        coeffs = np.polyfit(x, temps, 1)
        predicted_next = coeffs[0] * len(temps) + coeffs[1]
        actual = current.get("temp_c", 0)
        deviation = abs(actual - predicted_next)
        
        if deviation > 8.0:  # Major trend break
            return {
                "flagged": True,
                "penalty": 25,
                "detail": f"Temperature deviates {deviation:.1f}°C from trend prediction ({predicted_next:.1f}°C expected, {actual:.1f}°C observed)",
            }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
    
    def _check_volatility(self, history: List[Dict]) -> Dict:
        """Check for abnormally high volatility in recent readings."""
        if len(history) < 4:
            return {"flagged": False, "penalty": 0, "detail": ""}
        
        temps = [r.get("temp_c", 0) for r in history[-6:]]
        std = np.std(temps)
        
        if std > 5.0:  # Unusually high temperature volatility
            return {
                "flagged": True,
                "penalty": 15,
                "detail": f"High temperature volatility: σ={std:.2f}°C over {len(temps)} readings",
            }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
    
    def _insufficient_data(self) -> Dict:
        return {
            "status": "uncertain",
            "confidence_score": 30.0,
            "title": "Temporal Analysis",
            "metric_label": "Data Points",
            "metric_value": "Insufficient",
            "rationale": "Insufficient temporal history for reliable analysis",
        }
