"""
SkyGuard AI — SHAP Explainability Engine
Provides feature attribution and natural language explanations for anomaly detections.
"""
import numpy as np
from typing import Dict, List, Optional
from server.models.feature_engine import FeatureEngine


class SHAPExplainer:
    """
    Generates human-readable explanations for anomaly detections.
    
    Uses per-feature reconstruction errors from the Transformer-VAE
    as a proxy for SHAP-like feature importance when full SHAP is
    computationally expensive for real-time use.
    """
    
    FEATURE_DESCRIPTIONS = {
        "temp_c": "Air Temperature",
        "pressure_hpa": "Atmospheric Pressure",
        "humidity_pct": "Relative Humidity",
        "rolling_temp_mean": "Temperature Trend (6-step avg)",
        "rolling_temp_std": "Temperature Volatility",
        "rolling_pres_mean": "Pressure Trend (6-step avg)",
        "rolling_pres_std": "Pressure Volatility",
        "rolling_hum_mean": "Humidity Trend (6-step avg)",
        "rolling_hum_std": "Humidity Volatility",
        "rate_temp": "Temperature Rate of Change",
        "rate_pres": "Pressure Rate of Change",
        "rate_hum": "Humidity Rate of Change",
        "hour_sin": "Diurnal Cycle (sine)",
        "hour_cos": "Diurnal Cycle (cosine)",
        "month_sin": "Seasonal Cycle (sine)",
        "month_cos": "Seasonal Cycle (cosine)",
        "interaction_temp_hum": "Temperature×Humidity Interaction",
        "interaction_pres_temp": "Pressure×Temperature Interaction",
        "lag1_temp": "Previous Temperature",
        "lag1_hum": "Previous Humidity",
        "lag2_temp": "Temperature (2 steps ago)",
        "dewpoint_c": "Dewpoint Temperature",
    }
    
    def explain(
        self,
        per_feature_error: List[float],
        ml_result: Dict,
        current_obs: Dict,
    ) -> Dict:
        """
        Generate explanation for an anomaly detection.
        
        Args:
            per_feature_error: List of 22 per-feature reconstruction errors
            ml_result: Output from ensemble detector
            current_obs: Current observation dict
        
        Returns:
            dict with top_features, natural_language_explanation, feature_attributions
        """
        feature_names = FeatureEngine.get_feature_names()
        
        if not per_feature_error or len(per_feature_error) == 0:
            return self._no_explanation(ml_result)
        
        # Normalize errors to get relative importance
        errors = np.array(per_feature_error)
        total_error = errors.sum()
        if total_error < 1e-8:
            importances = np.zeros_like(errors)
        else:
            importances = errors / total_error
        
        # Sort by importance
        sorted_indices = np.argsort(-importances)
        
        top_features = []
        for idx in sorted_indices[:5]:
            name = feature_names[idx] if idx < len(feature_names) else f"feature_{idx}"
            top_features.append({
                "feature_name": name,
                "description": self.FEATURE_DESCRIPTIONS.get(name, name),
                "importance": round(float(importances[idx]) * 100, 1),
                "error": round(float(errors[idx]), 6),
            })
        
        # Generate natural language explanation
        explanation = self._generate_explanation(
            top_features, ml_result, current_obs
        )
        
        # Full feature attributions
        feature_attributions = []
        for i, name in enumerate(feature_names):
            if i < len(importances):
                feature_attributions.append({
                    "feature": name,
                    "description": self.FEATURE_DESCRIPTIONS.get(name, name),
                    "importance_pct": round(float(importances[i]) * 100, 2),
                    "reconstruction_error": round(float(errors[i]), 6),
                })
        
        return {
            "top_contributing_features": top_features,
            "natural_language_explanation": explanation,
            "feature_attributions": feature_attributions,
            "total_reconstruction_error": round(float(total_error), 6),
        }
    
    def _generate_explanation(self, top_features: List[Dict],
                               ml_result: Dict, current_obs: Dict) -> str:
        """Generate human-readable explanation text."""
        severity = ml_result.get("severity", "NORMAL")
        ensemble_score = ml_result.get("ensemble_score", 0)
        
        if severity == "NORMAL":
            return (
                f"Observation validated with ensemble score {ensemble_score:.3f}. "
                "All sensor readings are within expected patterns."
            )
        
        parts = []
        parts.append(
            f"Anomaly detected with {severity} severity "
            f"(ensemble score: {ensemble_score:.3f})."
        )
        
        if top_features:
            top = top_features[0]
            parts.append(
                f"Primary driver: {top['description']} "
                f"(contributing {top['importance']:.1f}% to reconstruction error)."
            )
            
            if len(top_features) > 1:
                secondary_names = [f["description"] for f in top_features[1:3]]
                parts.append(
                    f"Secondary factors: {', '.join(secondary_names)}."
                )
        
        # Add context from current observation
        temp = current_obs.get("temp_c")
        pres = current_obs.get("pressure_hpa")
        hum = current_obs.get("humidity_pct")
        
        if temp is not None and (temp > 45 or temp < -10):
            parts.append(f"Current temperature ({temp:.1f}°C) is in extreme range.")
        if hum is not None and (hum > 95 or hum < 5):
            parts.append(f"Current humidity ({hum:.1f}%) is at physical bounds.")
        
        return " ".join(parts)
    
    def _no_explanation(self, ml_result: Dict) -> Dict:
        """Fallback when feature errors aren't available."""
        return {
            "top_contributing_features": [],
            "natural_language_explanation": (
                f"Anomaly score: {ml_result.get('ensemble_score', 0):.3f}. "
                "Feature-level attribution unavailable — models may not be loaded."
            ),
            "feature_attributions": [],
            "total_reconstruction_error": 0,
        }
