"""
SkyGuard AI — Isolation Forest Wrapper
Ensemble consensus model using scikit-learn Isolation Forest.
"""
import numpy as np
import joblib
from pathlib import Path
from typing import Optional
from sklearn.ensemble import IsolationForest as SklearnIF
from sklearn.preprocessing import StandardScaler


class IsolationForestModel:
    """
    Isolation Forest wrapper for anomaly detection.
    
    Isolation Forest isolates anomalies by randomly partitioning the feature space.
    Anomalies are isolated quickly (short path length), while normal data requires
    more partitions. Normalized score in [0, 1] where 1 = most anomalous.
    """
    
    def __init__(
        self,
        n_estimators: int = 200,
        contamination: float = 0.05,
        max_features: float = 0.8,
        random_state: int = 42,
    ):
        self.model = SklearnIF(
            n_estimators=n_estimators,
            contamination=contamination,
            max_features=max_features,
            random_state=random_state,
            n_jobs=-1,
        )
        self.scaler = StandardScaler()
        self.is_fitted = False
    
    def fit(self, X: np.ndarray):
        """
        Fit Isolation Forest on normal data.
        
        Args:
            X: (n_samples, n_features) — flattened feature vectors
        """
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled)
        raw_scores = -self.model.score_samples(X_scaled)
        self.score_min = float(np.percentile(raw_scores, 1))
        self.score_max = float(np.percentile(raw_scores, 99))
        self.is_fitted = True
    
    def compute_anomaly_score(self, X: np.ndarray) -> np.ndarray:
        """
        Compute normalized anomaly scores.
        
        Args:
            X: (n_samples, n_features) — feature vectors
        Returns:
            scores: (n_samples,) — normalized to [0, 1], higher = more anomalous
        """
        if not self.is_fitted:
            raise RuntimeError("Model not fitted. Call fit() first.")
        
        X_scaled = self.scaler.transform(X)
        # sklearn returns negative scores (more negative = more anomalous)
        raw_scores = -self.model.score_samples(X_scaled)
        
        score_min = getattr(self, "score_min", 0.35)
        score_max = getattr(self, "score_max", 0.70)
        
        if score_max - score_min > 1e-8:
            normalized = np.clip((raw_scores - score_min) / (score_max - score_min), 0.0, 1.0)
        else:
            normalized = np.zeros_like(raw_scores)
        
        return normalized.astype(np.float32)
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Binary prediction: 1 = normal, -1 = anomaly.
        """
        if not self.is_fitted:
            raise RuntimeError("Model not fitted. Call fit() first.")
        X_scaled = self.scaler.transform(X)
        return self.model.predict(X_scaled)
    
    def save(self, model_path: Path, scaler_path: Path = None):
        """
        Save model and scaler to disk.
        
        NOTE: The scaler_path here should be IFOREST_SCALER_PATH (separate from
        the neural model scaler) to prevent overwriting the neural StandardScaler.
        """
        data = {
            "model": self.model,
            "score_min": getattr(self, "score_min", 0.35),
            "score_max": getattr(self, "score_max", 0.70),
        }
        joblib.dump(data, model_path)
        if scaler_path is not None:
            joblib.dump(self.scaler, scaler_path)
    
    def load(self, model_path: Path, scaler_path: Path = None):
        """
        Load model and scaler from disk.
        
        If scaler_path is not provided, falls back to the model's internal scaler.
        """
        loaded = joblib.load(model_path)
        if isinstance(loaded, dict):
            self.model = loaded["model"]
            self.score_min = loaded.get("score_min", 0.35)
            self.score_max = loaded.get("score_max", 0.70)
        else:
            self.model = loaded
            self.score_min = 0.35
            self.score_max = 0.70
        if scaler_path is not None and Path(scaler_path).exists():
            self.scaler = joblib.load(scaler_path)
        self.is_fitted = True


def flatten_windows_for_if(windows: np.ndarray) -> np.ndarray:
    """
    Flatten sliding windows for Isolation Forest input.
    
    Args:
        windows: (n_samples, window_size, n_features)
    Returns:
        flattened: (n_samples, window_size * n_features)
    """
    n_samples = windows.shape[0]
    return windows.reshape(n_samples, -1)
