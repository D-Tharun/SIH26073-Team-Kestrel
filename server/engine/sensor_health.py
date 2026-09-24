"""
SkyGuard AI — Sensor Health Monitor
Tracks sensor drift, predicts maintenance needs, scores sensor reliability.
"""
import numpy as np
from typing import Dict, List, Optional
from collections import deque
from datetime import datetime


class SensorHealthMonitor:
    """
    Monitors long-term sensor health metrics.
    
    Capabilities:
      1. Drift detection (gradual offset accumulation)
      2. Noise level monitoring (measurement precision degradation)
      3. Response time estimation (sluggish sensor detection)
      4. Remaining useful life prediction
      5. Maintenance scheduling recommendation
    """
    
    def __init__(self, max_history: int = 1000):
        self._histories: Dict[str, deque] = {}
        self._max_history = max_history
    
    def add_observation(self, station_id: str, sensor: str,
                        primary_value: float, secondary_value: float,
                        timestamp: str = None):
        """
        Record a dual-sensor observation for health tracking.
        
        Args:
            station_id: AWS station identifier
            sensor: Parameter name (temp_c, pressure_hpa, humidity_pct)
            primary_value: Reading from primary BME280 sensor
            secondary_value: Reading from secondary BME280 sensor
            timestamp: ISO timestamp
        """
        key = f"{station_id}:{sensor}"
        if key not in self._histories:
            self._histories[key] = deque(maxlen=self._max_history)
        
        self._histories[key].append({
            "primary": primary_value,
            "secondary": secondary_value,
            "delta": primary_value - secondary_value,
            "timestamp": timestamp or datetime.utcnow().isoformat(),
        })
    
    def get_health_report(self, station_id: str) -> Dict:
        """
        Generate comprehensive sensor health report.
        """
        sensors = ["temp_c", "pressure_hpa", "humidity_pct"]
        sensor_reports = {}
        overall_score = 100.0
        
        for sensor in sensors:
            key = f"{station_id}:{sensor}"
            history = list(self._histories.get(key, []))
            
            if len(history) < 10:
                sensor_reports[sensor] = {
                    "health_score": 85.0,
                    "drift_rate": 0.0,
                    "noise_level": 0.0,
                    "agreement_pct": 100.0,
                    "status": "monitoring",
                    "recommended_action": "Insufficient data — continue monitoring",
                    "remaining_useful_life_hours": None,
                }
                continue
            
            report = self._analyze_sensor(sensor, history)
            sensor_reports[sensor] = report
            overall_score = min(overall_score, report["health_score"])
        
        # Overall station health
        if overall_score >= 80:
            station_status = "healthy"
            next_maintenance = "Scheduled maintenance in 30+ days"
        elif overall_score >= 60:
            station_status = "degrading"
            next_maintenance = "Maintenance recommended within 14 days"
        elif overall_score >= 40:
            station_status = "warning"
            next_maintenance = "Maintenance recommended within 7 days"
        else:
            station_status = "critical"
            next_maintenance = "Immediate maintenance required"
        
        return {
            "station_id": station_id,
            "overall_health_score": round(overall_score, 1),
            "station_status": station_status,
            "next_maintenance": next_maintenance,
            "sensors": sensor_reports,
        }
    
    def _analyze_sensor(self, sensor: str, history: List[Dict]) -> Dict:
        """Analyze health of a single sensor parameter."""
        deltas = [h["delta"] for h in history]
        
        # Drift detection (trend in delta over time)
        x = np.arange(len(deltas))
        coeffs = np.polyfit(x, deltas, 1)
        drift_rate = float(coeffs[0])  # Slope = drift per reading
        
        # Noise level (std of deltas)
        noise_level = float(np.std(deltas))
        
        # Agreement percentage (how often sensors agree within tolerance)
        tolerances = {"temp_c": 0.5, "pressure_hpa": 1.0, "humidity_pct": 3.0}
        tol = tolerances.get(sensor, 1.0)
        agree_count = sum(1 for d in deltas if abs(d) <= tol)
        agreement_pct = (agree_count / len(deltas)) * 100
        
        # Health score computation
        health_score = 100.0
        
        # Penalize drift
        drift_magnitude = abs(drift_rate) * 100  # Amplify for scoring
        health_score -= min(30, drift_magnitude * 10)
        
        # Penalize noise
        if noise_level > tol * 2:
            health_score -= min(25, (noise_level / tol) * 5)
        
        # Penalize disagreement
        if agreement_pct < 90:
            health_score -= min(30, (100 - agreement_pct) * 0.5)
        
        health_score = max(0, min(100, health_score))
        
        # Remaining useful life prediction (simple linear extrapolation)
        rul_hours = None
        if abs(drift_rate) > 0.001:
            # How many more readings until delta exceeds critical threshold
            critical_delta = tol * 5
            current_delta = abs(np.mean(deltas[-5:]))
            remaining_readings = max(0, (critical_delta - current_delta) / abs(drift_rate))
            rul_hours = round(remaining_readings * 10 / 60, 1)  # Assuming 10-min intervals
        
        # Status
        if health_score >= 80:
            status = "healthy"
            action = "No action required"
        elif health_score >= 60:
            status = "degrading"
            action = f"Monitor drift rate ({drift_rate:.4f}/reading)"
        elif health_score >= 40:
            status = "warning"
            action = "Recalibration recommended"
        else:
            status = "critical"
            action = "Sensor replacement required"
        
        return {
            "health_score": round(health_score, 1),
            "drift_rate": round(drift_rate, 6),
            "noise_level": round(noise_level, 4),
            "agreement_pct": round(agreement_pct, 1),
            "status": status,
            "recommended_action": action,
            "remaining_useful_life_hours": rul_hours,
        }
