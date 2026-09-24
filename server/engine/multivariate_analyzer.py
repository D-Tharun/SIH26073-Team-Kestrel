"""
SkyGuard AI — Multivariate Consistency Analyzer
Cross-parameter consistency checking using Mahalanobis distance.
"""
import numpy as np
from typing import Dict, List


class MultivariateAnalyzer:
    """
    Multivariate pillar: checks consistency between temperature, pressure, and humidity.
    
    Checks:
      1. Temperature-humidity inverse correlation
      2. Pressure-temperature consistency
      3. Mahalanobis distance from normal multivariate distribution
    """
    
    def __init__(self):
        # Typical correlation patterns (from meteorological principles)
        self._normal_mean = np.array([25.0, 1010.0, 60.0])  # temp, pressure, humidity
        self._normal_cov = np.array([
            [100.0, -15.0, -80.0],  # temp variance, temp-pres covariance, temp-hum covariance
            [-15.0, 50.0, 10.0],     # pres-temp, pres variance, pres-hum covariance
            [-80.0, 10.0, 400.0],    # hum-temp, hum-pres, hum variance
        ])
        try:
            self._cov_inv = np.linalg.inv(self._normal_cov)
        except np.linalg.LinAlgError:
            self._cov_inv = np.eye(3)
    
    def update_baselines(self, mean: np.ndarray, cov: np.ndarray):
        """Update the normal distribution baselines from training data."""
        self._normal_mean = mean
        self._normal_cov = cov
        try:
            self._cov_inv = np.linalg.inv(cov)
        except np.linalg.LinAlgError:
            self._cov_inv = np.eye(3)
    
    def analyze(self, temp_c: float, pressure_hpa: float, humidity_pct: float,
                history: List[Dict] = None) -> Dict:
        """
        Analyze multivariate consistency of an observation.
        """
        issues = []
        score = 100.0
        
        # 1. Mahalanobis distance check
        obs = np.array([temp_c, pressure_hpa, humidity_pct])
        maha_dist = self._mahalanobis_distance(obs)
        
        if maha_dist > 4.0:
            score -= 35
            issues.append(f"Mahalanobis distance {maha_dist:.2f} — extreme multivariate outlier")
        elif maha_dist > 3.0:
            score -= 20
            issues.append(f"Mahalanobis distance {maha_dist:.2f} — significant multivariate deviation")
        elif maha_dist > 2.5:
            score -= 10
            issues.append(f"Mahalanobis distance {maha_dist:.2f} — mild multivariate deviation")
        
        # 2. Temperature-humidity inverse correlation check
        th_result = self._temp_humidity_correlation(temp_c, humidity_pct)
        if th_result["flagged"]:
            score -= th_result["penalty"]
            issues.append(th_result["detail"])
        
        # 3. Cross-parameter consistency with history
        if history and len(history) >= 3:
            hist_result = self._historical_consistency(temp_c, pressure_hpa, humidity_pct, history)
            if hist_result["flagged"]:
                score -= hist_result["penalty"]
                issues.append(hist_result["detail"])
        
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
            "title": "Multivariate Consistency",
            "metric_label": "Mahalanobis Distance",
            "metric_value": f"{maha_dist:.2f}σ",
            "rationale": "; ".join(issues) if issues else "Cross-parameter relationships consistent",
        }
    
    def _mahalanobis_distance(self, obs: np.ndarray) -> float:
        """Compute Mahalanobis distance from normal distribution center."""
        diff = obs - self._normal_mean
        left = diff @ self._cov_inv
        dist_sq = left @ diff
        return float(np.sqrt(max(0, dist_sq)))
    
    def _temp_humidity_correlation(self, temp_c: float, humidity_pct: float) -> Dict:
        """
        In general, temperature and humidity are inversely correlated:
        - Hot days tend to have lower relative humidity
        - Cool nights tend to have higher relative humidity
        
        Flag when both are simultaneously extreme in the same direction.
        """
        if temp_c > 45 and humidity_pct > 90:
            return {
                "flagged": True,
                "penalty": 25,
                "detail": f"Extreme heat ({temp_c:.1f}°C) with extreme humidity ({humidity_pct:.1f}%) is meteorologically rare",
            }
        
        if temp_c < -10 and humidity_pct > 95:
            return {
                "flagged": True,
                "penalty": 15,
                "detail": f"Very cold ({temp_c:.1f}°C) with very high humidity ({humidity_pct:.1f}%) — sensor icing possible",
            }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
    
    def _historical_consistency(self, temp_c: float, pressure_hpa: float,
                                 humidity_pct: float, history: List[Dict]) -> Dict:
        """
        Check if the relationship between parameters has changed suddenly.
        E.g., if temp went up but humidity didn't change — might be sensor issue.
        """
        recent = history[-3:]
        avg_temp = np.mean([r.get("temp_c", 0) for r in recent])
        avg_hum = np.mean([r.get("humidity_pct", 0) for r in recent])
        
        temp_change = temp_c - avg_temp
        hum_change = humidity_pct - avg_hum
        
        # If temperature jumped significantly but humidity barely moved
        if abs(temp_change) > 5.0 and abs(hum_change) < 2.0:
            return {
                "flagged": True,
                "penalty": 15,
                "detail": f"Temperature changed {temp_change:+.1f}°C but humidity only {hum_change:+.1f}% — decoupled parameters",
            }
        
        return {"flagged": False, "penalty": 0, "detail": ""}
