"""
SkyGuard AI — Weighted Ensemble Scorer
Combines Transformer-VAE, Anomaly Transformer, and Isolation Forest
into a unified anomaly detection system with severity classification.
"""
import numpy as np
import torch
import json
import joblib
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

from server.models.transformer_vae import TransformerVAE
from server.models.anomaly_transformer import AnomalyTransformerModel
from server.models.isolation_forest import IsolationForestModel, flatten_windows_for_if
from server.models.feature_engine import FeatureEngine
from server.config import (
    ENSEMBLE_WEIGHTS, SEVERITY_LEVELS, WINDOW_SIZE,
    TRANSFORMER_VAE_PATH, ANOMALY_TRANSFORMER_PATH,
    ISOLATION_FOREST_PATH, SCALER_PATH, THRESHOLDS_PATH,
    IFOREST_SCALER_PATH,
    VAE_CONFIG, AT_CONFIG
)

logger = logging.getLogger("skyguard.ensemble")


class EnsembleDetector:
    """
    Triple-model ensemble anomaly detector.
    
    Combines:
      1. Transformer-VAE (weight=0.45): Reconstruction error + KL divergence
      2. Anomaly Transformer (weight=0.35): Association discrepancy
      3. Isolation Forest (weight=0.20): Path-length isolation score
    
    Severity levels:
      - NORMAL: Below threshold
      - LOW: 1.0–1.5× threshold
      - MEDIUM: 1.5–3.0× threshold
      - HIGH: >3.0× threshold
    """
    
    def __init__(self):
        self.vae: Optional[TransformerVAE] = None
        self.anomaly_tf: Optional[AnomalyTransformerModel] = None
        self.isolation_forest: Optional[IsolationForestModel] = None
        self.thresholds: Dict = {}
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.is_loaded = False
        self.feature_engine = FeatureEngine()
    
    def load_models(self, artifacts_dir: Optional[Path] = None):
        """Load all pre-trained model artifacts from disk."""
        vae_path = TRANSFORMER_VAE_PATH
        at_path = ANOMALY_TRANSFORMER_PATH
        if_path = ISOLATION_FOREST_PATH
        scaler_path = SCALER_PATH
        thresholds_path = THRESHOLDS_PATH
        
        if artifacts_dir:
            vae_path = artifacts_dir / "transformer_vae.pt"
            at_path = artifacts_dir / "anomaly_transformer.pt"
            if_path = artifacts_dir / "isolation_forest.pkl"
            scaler_path = artifacts_dir / "scaler.pkl"
            thresholds_path = artifacts_dir / "thresholds.json"
        
        # Load Transformer-VAE
        if vae_path.exists():
            self.vae = TransformerVAE(
                input_dim=FeatureEngine.NUM_FEATURES,
                seq_len=WINDOW_SIZE,
                d_model=VAE_CONFIG["d_model"],
                n_heads=VAE_CONFIG["n_heads"],
                num_encoder_layers=VAE_CONFIG["n_layers"],
                num_decoder_layers=VAE_CONFIG["n_layers"],
                latent_dim=VAE_CONFIG["latent_dim"],
                dropout=VAE_CONFIG["dropout"]
            ).to(self.device)
            ckpt = torch.load(vae_path, map_location=self.device, weights_only=True)
            self.vae.load_state_dict(ckpt["state_dict"])
            self.thresholds["vae_threshold"] = ckpt.get("threshold", 0.5)
            self.vae.eval()
            logger.info("Loaded Transformer-VAE on %s from %s", self.device, vae_path)
        else:
            logger.warning("Transformer-VAE not found at %s — using fallback scoring", vae_path)
        
        # Load Anomaly Transformer
        if at_path.exists():
            self.anomaly_tf = AnomalyTransformerModel(
                input_dim=FeatureEngine.NUM_FEATURES,
                seq_len=WINDOW_SIZE,
                d_model=AT_CONFIG["d_model"],
                n_heads=AT_CONFIG["n_heads"],
                num_layers=AT_CONFIG["n_layers"],
                dropout=AT_CONFIG["dropout"]
            ).to(self.device)
            ckpt = torch.load(at_path, map_location=self.device, weights_only=True)
            self.anomaly_tf.load_state_dict(ckpt["state_dict"])
            self.thresholds["at_threshold"] = ckpt.get("threshold", 0.5)
            self.anomaly_tf.eval()
            logger.info("Loaded Anomaly Transformer on %s from %s", self.device, at_path)
        else:
            logger.warning("Anomaly Transformer not found at %s — using fallback scoring", at_path)
        
        # Load Scaler
        if scaler_path.exists():
            self.scaler = joblib.load(scaler_path)
            logger.info("Loaded StandardScaler from %s", scaler_path)
        else:
            self.scaler = None

        # Load Isolation Forest (uses its own separate scaler)
        if_scaler_path = IFOREST_SCALER_PATH
        if artifacts_dir:
            if_scaler_path = artifacts_dir / "scaler_iforest.pkl"
        # Fallback: try legacy shared scaler path if IF-specific one doesn't exist
        if not if_scaler_path.exists():
            if_scaler_path = scaler_path
        
        if if_path.exists():
            self.isolation_forest = IsolationForestModel()
            self.isolation_forest.load(if_path, if_scaler_path)
            logger.info("Loaded Isolation Forest from %s (scaler: %s)", if_path, if_scaler_path)
        else:
            logger.warning("Isolation Forest not found — using fallback scoring")
        
        # Load thresholds
        if thresholds_path.exists():
            with open(thresholds_path) as f:
                self.thresholds = json.load(f)
            logger.info("Loaded thresholds: %s", self.thresholds)
        else:
            # Default thresholds (will be calibrated during training)
            self.thresholds = {
                "vae_threshold": 0.5,
                "at_threshold": 0.5,
                "if_threshold": 0.65,
                "ensemble_threshold": 0.5,
            }
            logger.warning("Using default thresholds — run training to calibrate")
        
        self.is_loaded = True
    
    def detect(self, window: np.ndarray) -> Dict:
        """
        Run anomaly detection on a single window.
        
        Args:
            window: np.ndarray of shape (window_size, n_features)
        
        Returns:
            dict with keys:
                - is_anomaly: bool
                - ensemble_score: float [0, 1]
                - severity: str (NORMAL/LOW/MEDIUM/HIGH)
                - vae_score: float
                - at_score: float
                - if_score: float
                - per_feature_error: list
                - confidence_pct: float
        """
        result = {
            "is_anomaly": False,
            "ensemble_score": 0.0,
            "severity": "NORMAL",
            "vae_score": 0.0,
            "at_score": 0.0,
            "if_score": 0.0,
            "per_feature_error": [],
            "confidence_pct": 95.0,
        }
        
        # Ensure correct shape: (1, window_size, n_features)
        if window.ndim == 2:
            window = window[np.newaxis, :]
            
        # Standardize window with fitted scaler
        if getattr(self, "scaler", None) is not None:
            orig_shape = window.shape
            window_norm = self.scaler.transform(window.reshape(-1, orig_shape[-1])).reshape(orig_shape)
        else:
            window_norm = window
        
        x_tensor = torch.FloatTensor(window_norm).to(self.device)
        
        scores = {}
        weights = {}
        active_weight_sum = 0.0
        
        # Score from Transformer-VAE
        if self.vae is not None:
            vae_raw = self.vae.compute_anomaly_score(x_tensor)
            vae_threshold = self.thresholds.get("vae_threshold", 200.0)
            vae_ratio = float(vae_raw[0]) / (vae_threshold + 1e-8)
            vae_normalized = float(np.clip(vae_ratio * 0.5, 0.0, 1.0))
            scores["vae"] = vae_normalized
            weights["vae"] = ENSEMBLE_WEIGHTS["transformer_vae"]
            active_weight_sum += weights["vae"]
            result["vae_score"] = round(vae_normalized, 4)
            
            # Per-feature errors for explainability
            per_feat = self.vae.get_reconstruction_error_per_feature(x_tensor)
            result["per_feature_error"] = per_feat[0].tolist()
        
        # Score from Anomaly Transformer
        if self.anomaly_tf is not None:
            at_raw = self.anomaly_tf.compute_anomaly_score(x_tensor)
            at_threshold = self.thresholds.get("at_threshold", 180.0)
            at_ratio = float(at_raw[0]) / (at_threshold + 1e-8)
            at_normalized = float(np.clip(at_ratio * 0.5, 0.0, 1.0))
            scores["at"] = at_normalized
            weights["at"] = ENSEMBLE_WEIGHTS["anomaly_transformer"]
            active_weight_sum += weights["at"]
            result["at_score"] = round(at_normalized, 4)
        
        # Score from Isolation Forest
        if self.isolation_forest is not None:
            latest_step = window[:, -1, :] if window.ndim == 3 else window[-1:, :]
            if_score = self.isolation_forest.compute_anomaly_score(latest_step)
            if_threshold = self.thresholds.get("if_threshold", 0.53)
            if_ratio = float(if_score[0]) / (if_threshold + 1e-8)
            if_normalized = float(np.clip(if_ratio * 0.5, 0.0, 1.0))
            scores["if"] = if_normalized
            weights["if"] = ENSEMBLE_WEIGHTS["isolation_forest"]
            active_weight_sum += weights["if"]
            result["if_score"] = round(if_normalized, 4)
        
        # Weighted ensemble
        if active_weight_sum > 0:
            avg_score = sum(
                scores[k] * weights[k] for k in scores
            ) / active_weight_sum
            # Combine weighted average with maximum model score so a sharp detection isn't diluted
            max_model_score = max(scores.values()) if scores else avg_score
            ensemble_score = 0.65 * avg_score + 0.35 * max_model_score
        else:
            # Fallback: simple heuristic based on raw values
            ensemble_score = self._fallback_score(window[0])
        
        result["ensemble_score"] = round(float(ensemble_score), 4)
        
        # Threshold check
        ensemble_threshold = self.thresholds.get("ensemble_threshold", 0.40)
        result["is_anomaly"] = ensemble_score >= ensemble_threshold
        
        # Severity classification
        if not result["is_anomaly"]:
            result["severity"] = "NORMAL"
            result["confidence_pct"] = round(min(99.0, (1 - ensemble_score / ensemble_threshold) * 100), 1)
        else:
            ratio = ensemble_score / max(ensemble_threshold, 1e-8)
            if ratio >= SEVERITY_LEVELS["HIGH"]:
                result["severity"] = "HIGH"
                result["confidence_pct"] = round(min(99.0, 85 + ratio * 2), 1)
            elif ratio >= SEVERITY_LEVELS["MEDIUM"]:
                result["severity"] = "MEDIUM"
                result["confidence_pct"] = round(min(95.0, 70 + ratio * 5), 1)
            else:
                result["severity"] = "LOW"
                result["confidence_pct"] = round(min(85.0, 55 + ratio * 10), 1)
        
        # Consensus check: require ≥2 models to agree for HIGH
        if result["severity"] == "HIGH":
            agree_count = sum(
                1 for k, v in scores.items()
                if v >= self.thresholds.get(f"{k}_threshold" if k != "if" else "if_threshold", 0.5)
            )
            if agree_count < 2:
                result["severity"] = "MEDIUM"
                result["confidence_pct"] = min(result["confidence_pct"], 80.0)
        
        return result
    
    def _fallback_score(self, features: np.ndarray) -> float:
        """
        Fallback heuristic scoring when ML models aren't available.
        Uses physical bounds and rate-of-change checks.
        """
        from server.config import PHYSICAL_BOUNDS, RATE_OF_CHANGE_LIMITS
        
        score = 0.0
        temp = features[0] if len(features) > 0 else 25.0
        pres = features[1] if len(features) > 1 else 1013.0
        hum = features[2] if len(features) > 2 else 50.0
        
        # Range check
        if temp < PHYSICAL_BOUNDS["temp_c"]["min"] or temp > PHYSICAL_BOUNDS["temp_c"]["max"]:
            score += 0.4
        if pres < PHYSICAL_BOUNDS["pressure_hpa"]["min"] or pres > PHYSICAL_BOUNDS["pressure_hpa"]["max"]:
            score += 0.3
        if hum < PHYSICAL_BOUNDS["humidity_pct"]["min"] or hum > PHYSICAL_BOUNDS["humidity_pct"]["max"]:
            score += 0.3
        
        # Rate of change (from feature 9-11)
        if len(features) > 11:
            if abs(features[9]) > RATE_OF_CHANGE_LIMITS["temp_c"]:
                score += 0.3
            if abs(features[10]) > RATE_OF_CHANGE_LIMITS["pressure_hpa"]:
                score += 0.2
            if abs(features[11]) > RATE_OF_CHANGE_LIMITS["humidity_pct"]:
                score += 0.2
        
        return min(score, 1.0)
