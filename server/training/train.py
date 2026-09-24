"""
SkyGuard AI — Unified Training Pipeline
Trains the Triple-Model Ensemble on the Kaggle Jena Climate dataset.

CRITICAL: Implements strict chronological train/val/test split BEFORE scaling
to prevent data leakage. The scaler is fitted on training data ONLY.
"""
import os
import json
import joblib
import logging
import argparse
import numpy as np
import pandas as pd
import torch
from pathlib import Path
from typing import Tuple, Dict
from sklearn.preprocessing import StandardScaler

from server.config import (
    RAW_DATA_DIR, ARTIFACTS_DIR, VAE_CONFIG, AT_CONFIG,
    SLIDING_WINDOW_SIZE, SCALER_PATH, THRESHOLDS_PATH,
    TRAIN_SPLIT, VAL_SPLIT, TEST_SPLIT,
    IFOREST_SCALER_PATH, SPLIT_METADATA_PATH,
    TEST_WINDOWS_PATH, VAL_WINDOWS_PATH,
)
from server.models.feature_engine import FeatureEngine
from server.models.transformer_vae import TransformerVAE
from server.models.anomaly_transformer import AnomalyTransformerModel
from server.models.isolation_forest import IsolationForestModel
from server.models.ensemble import EnsembleDetector
from server.engine.multivariate_analyzer import MultivariateAnalyzer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("skyguard.train")


def load_and_preprocess_data(data_path: Path) -> pd.DataFrame:
    """Load Kaggle Jena Climate data and run through feature engine."""
    logger.info("Loading raw data from %s...", data_path)
    
    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {data_path}.\n"
            "Please download 'jena_climate_2009_2016.csv' from Kaggle "
            "and place it in server/data/raw/"
        )
    
    df = pd.read_csv(data_path)
    
    # Map columns
    col_map = {}
    for col in df.columns:
        c = col.lower()
        if "t (degc)" in c or "t" == c: col_map[col] = "temp_c"
        elif "p (mbar)" in c or "p" == c: col_map[col] = "pressure_hpa"
        elif "rh (%)" in c or "rh" == c: col_map[col] = "humidity_pct"
        elif "date" in c or "time" in c: col_map[col] = "datetime"
    
    df = df.rename(columns=col_map)
    df = df[["datetime", "temp_c", "pressure_hpa", "humidity_pct"]].dropna()
    
    # Parse datetime
    df["datetime"] = pd.to_datetime(df["datetime"], format="%d.%m.%Y %H:%M:%S", errors="coerce")
    df = df.dropna().reset_index(drop=True)
    
    df["hour"] = df["datetime"].dt.hour + df["datetime"].dt.minute / 60.0
    df["month"] = df["datetime"].dt.month
    
    # Subsample for faster training (take every 6th row -> 1 hr intervals)
    df = df.iloc[::6].reset_index(drop=True)
    
    logger.info("Running feature engineering pipeline on %d rows...", len(df))
    fe = FeatureEngine()
    
    features_list = []
    for _, row in df.iterrows():
        feats = fe.add_reading(
            temp_c=row["temp_c"],
            pressure_hpa=row["pressure_hpa"],
            humidity_pct=row["humidity_pct"],
            hour=row["hour"],
            month=row["month"],
        )
        if feats is not None:
            features_list.append(feats)
    
    features_df = pd.DataFrame(features_list, columns=FeatureEngine.get_feature_names())
    logger.info("Generated %d valid feature vectors (22 dims).", len(features_df))
    
    return features_df


def create_sliding_windows(data: np.ndarray, window_size: int) -> np.ndarray:
    """Create 3D tensor of sliding windows (samples, seq_len, features)."""
    windows = []
    for i in range(len(data) - window_size + 1):
        windows.append(data[i:i + window_size])
    return np.array(windows)


def chronological_split(
    features_df: pd.DataFrame,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Split features chronologically into train/val/test sets.
    
    CRITICAL: This split happens BEFORE scaling to prevent data leakage.
    The scaler must be fitted on the training set only.
    
    Args:
        features_df: Full feature DataFrame in chronological order
        train_ratio: Fraction of data for training
        val_ratio: Fraction of data for validation/threshold calibration
        test_ratio: Fraction of data for held-out evaluation
    
    Returns:
        (train_df, val_df, test_df) — all in chronological order
    """
    n = len(features_df)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)
    # test gets the remainder to avoid rounding issues
    
    train_df = features_df.iloc[:n_train]
    val_df = features_df.iloc[n_train:n_train + n_val]
    test_df = features_df.iloc[n_train + n_val:]
    
    logger.info(
        "Chronological split: TRAIN=%d (rows 0–%d) | VAL=%d (rows %d–%d) | TEST=%d (rows %d–%d)",
        len(train_df), n_train - 1,
        len(val_df), n_train, n_train + n_val - 1,
        len(test_df), n_train + n_val, n - 1,
    )
    
    return train_df, val_df, test_df


def train_transformer_vae(
    X_train: np.ndarray, X_val: np.ndarray, save_dir: Path
) -> Tuple[TransformerVAE, float]:
    """Train the Transformer-VAE model. Threshold calibrated on validation set."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    logger.info("Training Transformer-VAE on %s (%s)...", device, device_name)
    
    model = TransformerVAE(
        seq_len=SLIDING_WINDOW_SIZE,
        input_dim=X_train.shape[2],
        d_model=VAE_CONFIG["d_model"],
        n_heads=VAE_CONFIG["n_heads"],
        num_encoder_layers=VAE_CONFIG["n_layers"],
        num_decoder_layers=VAE_CONFIG["n_layers"],
        latent_dim=VAE_CONFIG["latent_dim"],
        dropout=VAE_CONFIG["dropout"]
    ).to(device)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=VAE_CONFIG["learning_rate"])
    
    batch_size = VAE_CONFIG["batch_size"]
    epochs = VAE_CONFIG["epochs"]
    
    dataset = torch.utils.data.TensorDataset(torch.tensor(X_train, dtype=torch.float32))
    dataloader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    model.train()
    for epoch in range(epochs):
        epoch_loss = 0.0
        for batch in dataloader:
            X_batch = batch[0].to(device)
            optimizer.zero_grad()
            
            recon, mu, logvar = model(X_batch)
            recon_loss = torch.mean((recon - X_batch) ** 2)
            kl_loss = -0.5 * torch.mean(torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1))
            loss = recon_loss + kl_loss
            
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
        
        logger.info("Epoch %d/%d - VAE Loss: %.4f", epoch + 1, epochs, epoch_loss / len(dataloader))
    
    # Calibrate threshold on VALIDATION set (not training data)
    model.eval()
    val_losses = []
    with torch.no_grad():
        val_dataset = torch.utils.data.TensorDataset(torch.tensor(X_val, dtype=torch.float32))
        val_loader = torch.utils.data.DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        for batch in val_loader:
            X_batch = batch[0].to(device)
            recon, mu, logvar = model(X_batch)
            recon_loss = torch.mean((recon - X_batch) ** 2, dim=[1, 2])
            kl_loss = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1)
            total_loss = recon_loss + kl_loss
            val_losses.extend(total_loss.cpu().numpy())
            
        threshold = float(np.percentile(val_losses, 99))
        logger.info("VAE Threshold (calibrated on validation set): %.4f", threshold)
    
    model_path = save_dir / "transformer_vae.pt"
    torch.save({
        "state_dict": model.cpu().state_dict(),
        "threshold": threshold,
        "config": VAE_CONFIG,
    }, model_path)
    logger.info("Saved VAE to %s", model_path)
    
    return model, threshold


def train_anomaly_transformer(
    X_train: np.ndarray, X_val: np.ndarray, save_dir: Path
) -> Tuple[AnomalyTransformerModel, float]:
    """Train the Anomaly Transformer model. Threshold calibrated on validation set."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    logger.info("Training Anomaly Transformer on %s (%s)...", device, device_name)
    
    model = AnomalyTransformerModel(
        seq_len=SLIDING_WINDOW_SIZE,
        input_dim=X_train.shape[2],
        d_model=AT_CONFIG["d_model"],
        n_heads=AT_CONFIG["n_heads"],
        num_layers=AT_CONFIG["n_layers"],
        dropout=AT_CONFIG["dropout"]
    ).to(device)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=AT_CONFIG["learning_rate"])
    
    batch_size = AT_CONFIG["batch_size"]
    epochs = AT_CONFIG["epochs"]
    
    dataset = torch.utils.data.TensorDataset(torch.tensor(X_train, dtype=torch.float32))
    dataloader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    model.train()
    for epoch in range(epochs):
        epoch_loss = 0.0
        for batch in dataloader:
            X_batch = batch[0].to(device)
            optimizer.zero_grad()
            
            # Anomaly transformer optimizes reconstruction and association discrepancy
            output, all_series, all_prior = model(X_batch)
            total_loss, recon_loss, ad_loss = AnomalyTransformerModel.loss_function(
                output, X_batch, all_series, all_prior
            )
            
            total_loss.backward()
            optimizer.step()
            epoch_loss += total_loss.item()
            
        logger.info("Epoch %d/%d - AT Loss: %.4f", epoch + 1, epochs, epoch_loss / len(dataloader))
    
    # Calibrate threshold on VALIDATION set (not training data)
    model.eval()
    val_scores = []
    with torch.no_grad():
        val_dataset = torch.utils.data.TensorDataset(torch.tensor(X_val, dtype=torch.float32))
        val_loader = torch.utils.data.DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        for batch in val_loader:
            X_batch = batch[0].to(device)
            scores = model.compute_anomaly_score(X_batch)
            val_scores.extend(scores)
            
        threshold = float(np.percentile(val_scores, 99))
        logger.info("AT Discrepancy Threshold (calibrated on validation set): %.4f", threshold)
    
    model_path = save_dir / "anomaly_transformer.pt"
    torch.save({
        "state_dict": model.cpu().state_dict(),
        "threshold": threshold,
        "config": AT_CONFIG,
    }, model_path)
    logger.info("Saved AT to %s", model_path)
    
    return model, threshold


def train_isolation_forest(
    train_features: np.ndarray, save_dir: Path
) -> Tuple[IsolationForestModel, float]:
    """
    Train the Isolation Forest on TRAINING split features only.
    
    Uses its own internal scaler, saved separately from the neural model scaler.
    """
    logger.info("Training Isolation Forest on CPU (multi-core)...")
    
    model = IsolationForestModel()
    model.fit(train_features)
    
    # Baseline threshold calculation on training data
    scores = model.compute_anomaly_score(train_features)
    threshold = float(np.percentile(scores, 95))
    logger.info("IF Anomaly Threshold set to %.4f", threshold)
    
    model_path = save_dir / "isolation_forest.pkl"
    iforest_scaler_path = save_dir / "scaler_iforest.pkl"
    model.save(model_path, iforest_scaler_path)
    logger.info("Saved Isolation Forest to %s (scaler: %s)", model_path, iforest_scaler_path)
    
    return model, threshold


def extract_multivariate_baselines(train_features_df: pd.DataFrame, save_dir: Path):
    """Extract covariance matrix for Mahalanobis distance from TRAINING data only."""
    logger.info("Extracting multivariate baselines from training split...")
    
    # We only care about temp, pressure, humidity for the pillar
    # (Indexes 0, 1, 2 in our feature engine)
    core_features = train_features_df.iloc[:, :3].values
    
    mean_vec = np.mean(core_features, axis=0)
    cov_matrix = np.cov(core_features, rowvar=False)
    
    baseline_path = save_dir / "multivariate_baselines.npy"
    np.save(baseline_path, {"mean": mean_vec, "cov": cov_matrix})
    logger.info("Saved multivariate baselines (from training split).")


def main():
    parser = argparse.ArgumentParser(description="Train SkyGuard AI Ensemble")
    parser.add_argument("--data", type=str, default=str(RAW_DATA_DIR / "jena_climate_2009_2016.csv"))
    parser.add_argument("--force", action="store_true", help="Force retrain even if models exist")
    args = parser.parse_args()
    
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    
    if not args.force and (ARTIFACTS_DIR / "transformer_vae.pt").exists():
        logger.info("Models already exist in %s. Use --force to retrain.", ARTIFACTS_DIR)
        return
    
    try:
        # ═══════════════════════════════════════════════════════════
        # 1. Load and engineer features (on full dataset)
        # ═══════════════════════════════════════════════════════════
        features_df = load_and_preprocess_data(Path(args.data))
        
        # ═══════════════════════════════════════════════════════════
        # 2. CHRONOLOGICAL SPLIT — before any scaling
        # ═══════════════════════════════════════════════════════════
        train_df, val_df, test_df = chronological_split(
            features_df,
            train_ratio=TRAIN_SPLIT,
            val_ratio=VAL_SPLIT,
            test_ratio=TEST_SPLIT,
        )
        
        # Save split metadata for reproducibility
        split_meta = {
            "total_features": len(features_df),
            "train_size": len(train_df),
            "val_size": len(val_df),
            "test_size": len(test_df),
            "train_ratio": TRAIN_SPLIT,
            "val_ratio": VAL_SPLIT,
            "test_ratio": TEST_SPLIT,
            "train_range": f"rows 0–{len(train_df) - 1}",
            "val_range": f"rows {len(train_df)}–{len(train_df) + len(val_df) - 1}",
            "test_range": f"rows {len(train_df) + len(val_df)}–{len(features_df) - 1}",
            "window_size": SLIDING_WINDOW_SIZE,
        }
        with open(SPLIT_METADATA_PATH, "w") as f:
            json.dump(split_meta, f, indent=2)
        logger.info("Saved split metadata to %s", SPLIT_METADATA_PATH)
        
        # ═══════════════════════════════════════════════════════════
        # 3. Extract multivariate baselines from TRAINING data only
        # ═══════════════════════════════════════════════════════════
        extract_multivariate_baselines(train_df, ARTIFACTS_DIR)
        
        # ═══════════════════════════════════════════════════════════
        # 4. Fit StandardScaler on TRAINING data only, transform all
        # ═══════════════════════════════════════════════════════════
        logger.info("Fitting StandardScaler on TRAINING split (%d vectors)...", len(train_df))
        scaler = StandardScaler()
        train_norm = scaler.fit_transform(train_df.values)
        val_norm = scaler.transform(val_df.values)
        test_norm = scaler.transform(test_df.values)
        joblib.dump(scaler, SCALER_PATH)
        logger.info("Saved fitted StandardScaler to %s (fitted on training data only)", SCALER_PATH)
        
        # ═══════════════════════════════════════════════════════════
        # 5. Create sliding windows for each split
        # ═══════════════════════════════════════════════════════════
        logger.info("Creating sliding windows (size=%d)...", SLIDING_WINDOW_SIZE)
        X_train = create_sliding_windows(train_norm, SLIDING_WINDOW_SIZE)
        X_val = create_sliding_windows(val_norm, SLIDING_WINDOW_SIZE)
        X_test = create_sliding_windows(test_norm, SLIDING_WINDOW_SIZE)
        
        # Raw (unscaled) windows for evaluation, anomaly injection, and inference pipelines
        X_val_raw = create_sliding_windows(val_df.values, SLIDING_WINDOW_SIZE)
        X_test_raw = create_sliding_windows(test_df.values, SLIDING_WINDOW_SIZE)
        
        logger.info(
            "Window shapes: TRAIN=%s | VAL=%s | TEST=%s",
            X_train.shape, X_val.shape, X_test.shape
        )
        
        # Save raw validation and test windows for evaluate.py and calibrate_weights.py
        # (ensemble.detect() internally applies scaler.transform(), so it expects raw features)
        np.save(VAL_WINDOWS_PATH, X_val_raw)
        np.save(TEST_WINDOWS_PATH, X_test_raw)
        logger.info("Saved raw validation windows to %s", VAL_WINDOWS_PATH)
        logger.info("Saved raw test windows to %s", TEST_WINDOWS_PATH)
        
        # ═══════════════════════════════════════════════════════════
        # 6. Train models on TRAINING windows only
        #    Thresholds calibrated on VALIDATION windows
        # ═══════════════════════════════════════════════════════════
        _, vae_threshold = train_transformer_vae(X_train, X_val, ARTIFACTS_DIR)
        _, at_threshold = train_anomaly_transformer(X_train, X_val, ARTIFACTS_DIR)
        
        # Isolation Forest: uses raw (unscaled) training features
        # It maintains its own internal StandardScaler, saved separately
        _, if_threshold = train_isolation_forest(train_df.values, ARTIFACTS_DIR)
        
        # ═══════════════════════════════════════════════════════════
        # 7. Save calibrated thresholds
        # ═══════════════════════════════════════════════════════════
        thresholds = {
            "vae_threshold": round(float(vae_threshold), 4),
            "at_threshold": round(float(at_threshold), 4),
            "if_threshold": round(float(if_threshold), 4),
            "ensemble_threshold": 0.50,
        }
        with open(THRESHOLDS_PATH, "w") as f:
            json.dump(thresholds, f, indent=2)
        logger.info("Saved calibrated thresholds to %s: %s", THRESHOLDS_PATH, thresholds)
        
        logger.info("=========================================")
        logger.info("🚀 Training Pipeline Complete (Leakage-Free)")
        logger.info("  Scaler fitted on: TRAINING split only (%d vectors)", len(train_df))
        logger.info("  Thresholds calibrated on: VALIDATION split (%d windows)", len(X_val))
        logger.info("  Held-out test: %d windows (genuinely unseen)", len(X_test))
        logger.info("  Artifacts saved to: %s", ARTIFACTS_DIR)
        logger.info("=========================================")
        
    except Exception as e:
        logger.error("Training failed: %s", e, exc_info=True)


if __name__ == "__main__":
    main()
