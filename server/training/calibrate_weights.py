"""
SkyGuard AI — Ensemble Weight Calibration
Grid-search over ensemble weight combinations to find optimal F1-score
on validation data with injected anomalies.
"""
import os
import json
import logging
import argparse
import numpy as np
from pathlib import Path
from itertools import product
from sklearn.metrics import f1_score, precision_score, recall_score

from server.config import (
    ARTIFACTS_DIR, VAL_WINDOWS_PATH, ANOMALY_INJECTION_RATE,
    ENSEMBLE_WEIGHTS,
)
from server.models.ensemble import EnsembleDetector
from server.training.evaluate import inject_test_anomalies

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("skyguard.calibrate")


def calibrate_weights(
    val_windows: np.ndarray,
    ensemble: EnsembleDetector,
    anomaly_rate: float = 0.05,
    weight_step: float = 0.05,
    seed: int = 42,
) -> dict:
    """
    Grid search over (w_vae, w_at, w_if) weight combinations.
    All weights must be >= 0 and sum to 1.0.
    
    Returns:
        dict with best_weights, best_f1, comparison table
    """
    # Inject anomalies into validation windows
    corrupted_windows, labels, fault_types = inject_test_anomalies(
        val_windows, anomaly_rate=anomaly_rate, seed=seed
    )
    
    # Pre-compute individual model scores for all windows
    logger.info("Pre-computing individual model scores for %d windows...", len(corrupted_windows))
    all_vae_scores = []
    all_at_scores = []
    all_if_scores = []
    
    for i in range(len(corrupted_windows)):
        w = corrupted_windows[i]
        res = ensemble.detect(w)
        all_vae_scores.append(res["vae_score"])
        all_at_scores.append(res["at_score"])
        all_if_scores.append(res["if_score"])
    
    all_vae_scores = np.array(all_vae_scores)
    all_at_scores = np.array(all_at_scores)
    all_if_scores = np.array(all_if_scores)
    
    # Grid search
    steps = np.arange(0.0, 1.0 + weight_step, weight_step)
    steps = np.round(steps, 2)
    
    best_f1 = -1
    best_weights = None
    results = []
    
    logger.info("Running grid search with step=%.2f...", weight_step)
    
    for w_vae in steps:
        for w_at in steps:
            w_if = round(1.0 - w_vae - w_at, 2)
            if w_if < 0 or w_if > 1.0:
                continue
            
            # Compute ensemble scores with these weights
            total_weight = w_vae + w_at + w_if
            if total_weight < 1e-8:
                continue
            
            weighted_avg = (
                all_vae_scores * w_vae +
                all_at_scores * w_at +
                all_if_scores * w_if
            ) / total_weight
            
            max_scores = np.maximum(np.maximum(all_vae_scores, all_at_scores), all_if_scores)
            ensemble_scores = 0.65 * weighted_avg + 0.35 * max_scores
            
            # Use current ensemble threshold
            threshold = ensemble.thresholds.get("ensemble_threshold", 0.50)
            predictions = (ensemble_scores >= threshold).astype(int)
            
            f1 = f1_score(labels, predictions, zero_division=0)
            prec = precision_score(labels, predictions, zero_division=0)
            rec = recall_score(labels, predictions, zero_division=0)
            
            results.append({
                "w_vae": w_vae, "w_at": w_at, "w_if": w_if,
                "f1": round(f1, 4), "precision": round(prec, 4), "recall": round(rec, 4),
            })
            
            if f1 > best_f1:
                best_f1 = f1
                best_weights = {"transformer_vae": w_vae, "anomaly_transformer": w_at, "isolation_forest": w_if}
    
    # Sort results by F1
    results.sort(key=lambda x: x["f1"], reverse=True)
    
    return {
        "best_weights": best_weights,
        "best_f1": round(best_f1, 4),
        "current_weights": dict(ENSEMBLE_WEIGHTS),
        "top_10_combinations": results[:10],
        "total_combinations_tested": len(results),
    }


def main():
    parser = argparse.ArgumentParser(description="Calibrate SkyGuard Ensemble Weights")
    parser.add_argument("--step", type=float, default=0.05, help="Weight grid step size")
    parser.add_argument("--anomaly-rate", type=float, default=ANOMALY_INJECTION_RATE)
    parser.add_argument("--save", action="store_true", help="Save calibrated weights to config")
    args = parser.parse_args()
    
    # Load validation windows
    if not VAL_WINDOWS_PATH.exists():
        logger.error("Validation windows not found at %s. Run training first.", VAL_WINDOWS_PATH)
        return
    
    val_windows = np.load(VAL_WINDOWS_PATH)
    logger.info("Loaded %d validation windows", len(val_windows))
    
    # Load ensemble
    ensemble = EnsembleDetector()
    ensemble.load_models(ARTIFACTS_DIR)
    
    # Calibrate
    result = calibrate_weights(
        val_windows, ensemble,
        anomaly_rate=args.anomaly_rate,
        weight_step=args.step,
    )
    
    logger.info("=========================================")
    logger.info("📊 Weight Calibration Results")
    logger.info("Current weights: %s", result["current_weights"])
    logger.info("Best weights:    %s", result["best_weights"])
    logger.info("Best F1:         %.4f", result["best_f1"])
    logger.info("Tested %d combinations", result["total_combinations_tested"])
    logger.info("-----------------------------------------")
    logger.info("Top 10 weight combinations:")
    for i, r in enumerate(result["top_10_combinations"]):
        logger.info("  %2d. VAE=%.2f AT=%.2f IF=%.2f → F1=%.4f P=%.4f R=%.4f",
                    i + 1, r["w_vae"], r["w_at"], r["w_if"], r["f1"], r["precision"], r["recall"])
    logger.info("=========================================")
    
    # Save results
    output_path = ARTIFACTS_DIR / "weight_calibration_results.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    logger.info("Saved calibration results to %s", output_path)


if __name__ == "__main__":
    main()
