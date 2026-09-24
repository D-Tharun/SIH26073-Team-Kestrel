"""
SkyGuard AI — Model Evaluation Pipeline
Evaluates the trained Triple-Model Ensemble and 4-Pillar Decision Engine on held-out test data
with realistic injected anomalies (spikes, drifts, frozen values, physical bounds).
Computes Accuracy, Precision, Recall, F1-Score, ROC-AUC, and per-fault detection rates.

NOTE: Test windows are loaded from pre-saved artifacts produced by train.py.
These windows were NOT seen during training (strict chronological split).
"""
import json
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix
)

from server.config import (
    RAW_DATA_DIR, ARTIFACTS_DIR, SLIDING_WINDOW_SIZE,
    TRAIN_TEST_SPLIT, ANOMALY_INJECTION_RATE,
    TEST_WINDOWS_PATH, SPLIT_METADATA_PATH,
)
from server.training.train import load_and_preprocess_data, create_sliding_windows
from server.models.ensemble import EnsembleDetector
from server.engine.decision_engine import DecisionEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("skyguard.eval")


def update_derived_features(window: np.ndarray) -> np.ndarray:
    """
    Recompute derived physical features across a window after raw channel corruption:
    - Rates of change: Δtemp, Δpressure, Δhumidity
    - Rolling 6-step mean and std
    - Interactions: temp×hum, pres×temp
    - Lags: lag-1, lag-2
    - Dewpoint via August-Roche-Magnus formula
    """
    t = window[:, 0]
    p = window[:, 1]
    h = window[:, 2]
    
    # Rates of change (features 9, 10, 11)
    window[1:, 9] = np.diff(t)
    window[1:, 10] = np.diff(p)
    window[1:, 11] = np.diff(h)
    
    # Rolling statistics over last 6 steps (features 3, 4, 5, 6, 7, 8)
    for i in range(len(window)):
        start = max(0, i - 5)
        window[i, 3] = np.mean(t[start:i + 1])
        window[i, 4] = np.std(t[start:i + 1]) if i > start else 0.0
        window[i, 5] = np.mean(p[start:i + 1])
        window[i, 6] = np.std(p[start:i + 1]) if i > start else 0.0
        window[i, 7] = np.mean(h[start:i + 1])
        window[i, 8] = np.std(h[start:i + 1]) if i > start else 0.0
    
    # Physical interaction terms (features 16, 17)
    window[:, 16] = (t * h) / 100.0
    window[:, 17] = (p * t) / 1000.0
    
    # Lags (features 18, 19, 20)
    window[1:, 18] = t[:-1]
    window[1:, 19] = h[:-1]
    if len(window) > 2:
        window[2:, 20] = t[:-2]
        
    # Thermodynamic Dewpoint via Magnus formula (feature 21)
    a, b = 17.27, 237.7
    h_safe = np.clip(h, 0.1, 100.0)
    alpha = (a * t) / (b + t) + np.log(h_safe / 100.0)
    window[:, 21] = (b * alpha) / (a - alpha)
    
    return window


def inject_test_anomalies(
    windows: np.ndarray, 
    anomaly_rate: float = 0.05, 
    seed: int = 42
) -> tuple[np.ndarray, np.ndarray, dict]:
    """
    Inject realistic meteorological sensor faults into test windows:
    - Temperature spike (+12°C to +25°C)
    - Sensor freeze (zero-variance consecutive readings)
    - Calibration drift (linear multi-step drift)
    - Physical out-of-bounds corruptions (extreme pressure/temp)
    """
    np.random.seed(seed)
    n_samples = len(windows)
    labels = np.zeros(n_samples, dtype=int)
    corrupted_windows = windows.copy()
    fault_types = {}
    
    n_anomalies = int(n_samples * anomaly_rate)
    anomaly_indices = np.random.choice(n_samples, size=n_anomalies, replace=False)
    
    logger.info("Injecting %d anomalies across %d test windows (%.1f%%)...",
                n_anomalies, n_samples, anomaly_rate * 100)
    
    for idx in anomaly_indices:
        labels[idx] = 1
        fault_type = np.random.choice(["spike", "freeze", "drift", "out_of_bounds"])
        fault_types[idx] = fault_type
        
        if fault_type == "spike":
            corrupted_windows[idx, -1, 0] += np.random.uniform(12.0, 25.0)
        elif fault_type == "freeze":
            corrupted_windows[idx, :, 2] = corrupted_windows[idx, 0, 2]
        elif fault_type == "drift":
            drift_profile = np.linspace(0, 10.0, windows.shape[1])
            corrupted_windows[idx, :, 0] += drift_profile
        elif fault_type == "out_of_bounds":
            if np.random.rand() > 0.5:
                corrupted_windows[idx, -1, 1] = np.random.uniform(600.0, 800.0)
            else:
                corrupted_windows[idx, -1, 0] = np.random.uniform(65.0, 85.0)
                
        # Recompute derived physical dimensions so feature space is consistent
        corrupted_windows[idx] = update_derived_features(corrupted_windows[idx])
                
    return corrupted_windows, labels, fault_types


def evaluate_pipeline(test_windows: np.ndarray, labels: np.ndarray, fault_types: dict) -> dict:
    """Run both EnsembleDetector and 4-Pillar DecisionEngine across test windows."""
    logger.info("Loading EnsembleDetector and DecisionEngine...")
    ensemble = EnsembleDetector()
    ensemble.load_models(ARTIFACTS_DIR)
    decision_engine = DecisionEngine()
    
    ml_predictions = []
    ml_scores = []
    engine_predictions = []
    fault_counts = {"spike": 0, "freeze": 0, "drift": 0, "out_of_bounds": 0}
    fault_detected = {"spike": 0, "freeze": 0, "drift": 0, "out_of_bounds": 0}
    
    # Representative buddy network for spatial consistency evaluation
    dummy_buddies = {
        "station_02": {"temp_c": 15.0, "pressure_hpa": 1013.0, "humidity_pct": 60.0},
        "station_03": {"temp_c": 15.2, "pressure_hpa": 1012.8, "humidity_pct": 61.0},
    }
    
    logger.info("Evaluating %d samples...", len(test_windows))
    for i in range(len(test_windows)):
        w = test_windows[i]
        res = ensemble.detect(w)
        ml_predictions.append(1 if res["is_anomaly"] else 0)
        ml_scores.append(res["ensemble_score"])
        
        # 4-Pillar Decision Engine evaluation
        current_obs = {
            "temp_c": float(w[-1, 0]),
            "pressure_hpa": float(w[-1, 1]),
            "humidity_pct": float(w[-1, 2]),
        }
        history = [
            {
                "temp_c": float(w[s, 0]),
                "pressure_hpa": float(w[s, 1]),
                "humidity_pct": float(w[s, 2]),
            }
            for s in range(len(w) - 1)
        ]
        
        dec = decision_engine.evaluate(
            station_id="station_01",
            current_obs=current_obs,
            history=history,
            ml_result=res,
            all_station_data=dummy_buddies,
        )
        is_engine_fault = (dec["quality"] in ("SENSOR_FAULT", "sensor_fault"))
        engine_predictions.append(1 if is_engine_fault else 0)
        
        if labels[i] == 1:
            ft = fault_types[i]
            fault_counts[ft] += 1
            if is_engine_fault or res["is_anomaly"]:
                fault_detected[ft] += 1
        
    ml_predictions = np.array(ml_predictions)
    ml_scores = np.array(ml_scores)
    engine_predictions = np.array(engine_predictions)
    
    acc = accuracy_score(labels, ml_predictions)
    prec = precision_score(labels, ml_predictions, zero_division=0)
    rec = recall_score(labels, ml_predictions, zero_division=0)
    f1 = f1_score(labels, ml_predictions, zero_division=0)
    try:
        auc = roc_auc_score(labels, ml_scores)
    except Exception:
        auc = 0.0
        
    cm = confusion_matrix(labels, ml_predictions)
    
    metrics = {
        "accuracy": round(float(acc) * 100, 2),
        "precision": round(float(prec) * 100, 2),
        "recall": round(float(rec) * 100, 2),
        "f1_score": round(float(f1) * 100, 2),
        "roc_auc": round(float(auc) * 100, 2),
        "total_test_samples": len(labels),
        "total_anomalies": int(labels.sum()),
        "confusion_matrix": cm.tolist(),
        "fault_detection_rates": {
            k: round((fault_detected[k] / fault_counts[k]) * 100, 1) if fault_counts[k] > 0 else 100.0
            for k in fault_counts
        },
    }
    
    logger.info("=========================================")
    logger.info("📊 1. Standalone ML Ensemble Results:")
    logger.info("  Accuracy:  %.2f%%", metrics["accuracy"])
    logger.info("  Precision: %.2f%%", metrics["precision"])
    logger.info("  Recall:    %.2f%% (Caught %d of %d anomalies)", metrics["recall"], cm[1, 1], labels.sum())
    logger.info("  F1-Score:  %.2f%%", metrics["f1_score"])
    logger.info("  ROC-AUC:   %.2f%%", metrics["roc_auc"])
    logger.info("  Confusion Matrix: %s", metrics["confusion_matrix"])
    logger.info("-----------------------------------------")
    logger.info("🛡️ 2. End-to-End Fault Detection Rates:")
    for ft, rate in metrics["fault_detection_rates"].items():
        logger.info("  %-15s: %.1f%%", ft, rate)
    logger.info("=========================================")
    
    return metrics


def main():
    # Prefer pre-saved test windows from the training pipeline
    if TEST_WINDOWS_PATH.exists():
        logger.info("Loading pre-saved test windows from %s", TEST_WINDOWS_PATH)
        test_windows = np.load(TEST_WINDOWS_PATH)
        
        # Log split metadata if available
        if SPLIT_METADATA_PATH.exists():
            with open(SPLIT_METADATA_PATH) as f:
                meta = json.load(f)
            logger.info(
                "Split metadata: train=%d, val=%d, test=%d (ratio %.0f/%.0f/%.0f)",
                meta["train_size"], meta["val_size"], meta["test_size"],
                meta["train_ratio"] * 100, meta["val_ratio"] * 100, meta["test_ratio"] * 100,
            )
            logger.info("Test data range: %s (genuinely unseen)", meta["test_range"])
    else:
        # Fallback: load from raw data (legacy path, NOT recommended)
        logger.warning(
            "Pre-saved test windows not found at %s. "
            "Falling back to loading from raw data. "
            "Run training first for proper evaluation!",
            TEST_WINDOWS_PATH,
        )
        data_path = RAW_DATA_DIR / "jena_climate_2009_2016.csv"
        features_df = load_and_preprocess_data(data_path)
        X_seq = create_sliding_windows(features_df.values, SLIDING_WINDOW_SIZE)
        
        # Take test split from the end
        n_test = min(2500, int(len(X_seq) * TRAIN_TEST_SPLIT))
        test_windows = X_seq[-n_test:]
        logger.warning(
            "Using last %d windows as test set — but these may overlap with training data! "
            "Re-run training with --force to generate proper splits.",
            len(test_windows),
        )
    
    logger.info("Evaluating on test set of %d windows", len(test_windows))
    
    # Inject anomalies
    corrupted_windows, labels, fault_types = inject_test_anomalies(
        test_windows, anomaly_rate=ANOMALY_INJECTION_RATE
    )
    
    # Run evaluation
    metrics = evaluate_pipeline(corrupted_windows, labels, fault_types)
    
    # Save evaluation results
    eval_results_path = ARTIFACTS_DIR / "evaluation_results.json"
    with open(eval_results_path, "w") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Saved evaluation results to %s", eval_results_path)


if __name__ == "__main__":
    main()
