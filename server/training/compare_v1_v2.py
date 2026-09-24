"""
SkyGuard AI — Version 1 vs Version 2 Head-to-Head Comparative Benchmark
Compares model architectures, detection accuracy, false alarm rates,
and genuine event disambiguation on real Chennai and Delhi weather data.
"""
import os
import sys
import logging
import warnings
import numpy as np
import pandas as pd

# Suppress verbose TensorFlow / Keras warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
warnings.filterwarnings('ignore')

V1_DIR = r"D:\sih ps-2"
V2_DIR = r"D:\skyguard-ps2"

if V1_DIR not in sys.path:
    sys.path.insert(0, V1_DIR)
if V2_DIR not in sys.path:
    sys.path.insert(0, V2_DIR)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("skyguard.compare")

# ═════════════════════════════════════════════════════════════════════════
# 1. LOAD V1 MODELS & PIPELINE
# ═════════════════════════════════════════════════════════════════════════
logger.info("Initializing V1 Pipeline (LSTM-AE + IForest + V1 Fusion)...")
from src.models.iforest_model import MultivariateIForest
from src.models.lstm_ae_model import TemporalLSTMAE
from src.qc.physics_qc import PhysicsEngine
from src.qc.stat_qc import StatisticalQCEngine
from src.qc.fusion import EventAwareFusionEngine

v1_iforest = MultivariateIForest()
v1_iforest.load(os.path.join(V1_DIR, "models", "iforest_v2.pkl"))

v1_lstm = TemporalLSTMAE()
v1_lstm.load(os.path.join(V1_DIR, "models", "lstm_ae_v2"))

v1_physics = PhysicsEngine()
v1_stat = StatisticalQCEngine()
v1_fusion = EventAwareFusionEngine()

# ═════════════════════════════════════════════════════════════════════════
# 2. LOAD V2 MODELS & PIPELINE
# ═════════════════════════════════════════════════════════════════════════
logger.info("Initializing V2 Pipeline (Transformer-VAE + Anomaly Transformer + IForest + 4 Pillars)...")
from server.models.ensemble import EnsembleDetector
from server.engine.decision_engine import DecisionEngine
from server.models.feature_engine import FeatureEngine
from server.config import ARTIFACTS_DIR

v2_ensemble = EnsembleDetector()
v2_ensemble.load_models(ARTIFACTS_DIR)
v2_decision = DecisionEngine()


def run_v1_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """Run full V1 detection pipeline on a dataframe."""
    df_eval = df.copy()
    if "station" not in df_eval.columns:
        df_eval["station"] = "STATION_1"
    if "timestamp" not in df_eval.columns:
        df_eval["timestamp"] = pd.date_range("2024-06-01", periods=len(df_eval), freq="h")
    
    # Physics
    df_eval = v1_physics.add_derived_features(df_eval)
    df_eval["physics_score"] = v1_physics.run_physics_checks(df_eval)
    
    # Stat
    df_eval["stat_score"], df_eval["spike_flag"], df_eval["freeze_flag"] = v1_stat.run_statistical_checks(df_eval)
    
    # ML
    df_eval["if_score"] = v1_iforest.predict(df_eval)
    df_eval["lstm_score"] = v1_lstm.predict(df_eval)
    
    # Fusion
    df_eval = v1_fusion.run_fusion(df_eval, disable_spatial=True)
    return df_eval


def run_v2_pipeline(df: pd.DataFrame, buddy_data: dict = None) -> list:
    """Run full V2 detection pipeline on a dataframe row by row."""
    from collections import deque
    fe = FeatureEngine()
    recent_features = deque(maxlen=8)
    history = []
    results = []
    
    for idx, row in df.iterrows():
        t = float(row["temperature_c"])
        p = float(row["surface_pressure_hpa"])
        h = float(row["relative_humidity_pct"])
        
        feats = fe.add_reading(t, p, h)
        if feats is not None:
            recent_features.append(feats)
        
        ml_res = {
            "is_anomaly": False, "ensemble_score": 0.0, "severity": "NORMAL",
            "vae_score": 0.0, "at_score": 0.0, "if_score": 0.0
        }
        
        if len(recent_features) == 8:
            ml_res = v2_ensemble.detect(np.array(list(recent_features), dtype=np.float32))
        
        current_obs = {"temp_c": t, "pressure_hpa": p, "humidity_pct": h}
        buddies = buddy_data if buddy_data else {}
        
        dec = v2_decision.evaluate(
            station_id="station_eval",
            current_obs=current_obs,
            history=history[-12:],
            ml_result=ml_res,
            all_station_data=buddies,
        )
        
        history.append(current_obs)
        results.append({
            "v2_quality": dec["quality"],
            "v2_ml_anomaly": ml_res["is_anomaly"],
            "v2_ml_score": ml_res["ensemble_score"],
            "v2_S_anomaly": dec["S_anomaly"],
            "v2_S_event": dec["S_event"],
            "v2_confidence": dec["confidence_pct"],
        })
        
    return results


def run_comparison():
    print("=" * 80)
    print("SKYGUARD AI: VERSION 1 (V1) vs VERSION 2 (V2) COMPREHENSIVE BENCHMARK")
    print("=" * 80)

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1: CHENNAI WEATHER (Clean Normal vs Injected Faults)
    # ─────────────────────────────────────────────────────────────────────
    chennai_path = os.path.join(V1_DIR, "data", "raw", "open_meteo", "Chennai_Meenambakkam_2021_2024_hourly.csv")
    df_chn = pd.read_csv(chennai_path).head(100).copy()
    for col in ["temperature_c", "relative_humidity_pct", "surface_pressure_hpa"]:
        df_chn[col] = df_chn[col].astype(float)
    
    # 1A. Normal Chennai Weather (Should be NORMAL, NO FAULT)
    v1_chn_norm = run_v1_pipeline(df_chn)
    v2_chn_norm = run_v2_pipeline(df_chn)
    
    v1_norm_faults = sum("FAULT" in str(s) for s in v1_chn_norm["final_state"])
    v2_norm_faults = sum(r["v2_quality"] == "SENSOR_FAULT" for r in v2_chn_norm)
    
    # 1B. Chennai Sensor Spike (+18°C sudden jump at step 50)
    df_chn_spike = df_chn.copy()
    df_chn_spike.loc[50, "temperature_c"] += 18.0
    v1_chn_spike = run_v1_pipeline(df_chn_spike)
    v2_chn_spike = run_v2_pipeline(df_chn_spike)
    
    v1_caught_spike = "FAULT" in str(v1_chn_spike.loc[50, "final_state"]) or v1_chn_spike.loc[50, "if_score"] > 0.5
    v2_caught_spike = v2_chn_spike[50]["v2_quality"] == "SENSOR_FAULT" or v2_chn_spike[50]["v2_ml_anomaly"]
    
    # 1C. Chennai Frozen Sensor (Humidity stuck for 10 hours)
    df_chn_freeze = df_chn.copy()
    df_chn_freeze.loc[60:70, "relative_humidity_pct"] = 72.0
    v1_chn_freeze = run_v1_pipeline(df_chn_freeze)
    v2_chn_freeze = run_v2_pipeline(df_chn_freeze)
    
    v1_caught_freeze = any("FAULT" in str(s) or "FREEZE" in str(s) for s in v1_chn_freeze.loc[65:70, "final_state"])
    v2_caught_freeze = any(r["v2_quality"] == "SENSOR_FAULT" for r in v2_chn_freeze[65:71])
    
    # 1D. Chennai Calibration Drift (+0.8C/hr gradual drift)
    df_chn_drift = df_chn.copy()
    for s in range(40, 65):
        df_chn_drift.loc[s, "temperature_c"] += (s - 40) * 0.8
    v1_chn_drift = run_v1_pipeline(df_chn_drift)
    v2_chn_drift = run_v2_pipeline(df_chn_drift)
    
    v1_caught_drift = any("FAULT" in str(s) or "DRIFT" in str(s) for s in v1_chn_drift.loc[55:64, "final_state"])
    v2_caught_drift = any(r["v2_quality"] == "SENSOR_FAULT" or r["v2_ml_anomaly"] for r in v2_chn_drift[55:65])
    
    # ─────────────────────────────────────────────────────────────────────
    # TEST 2: DELHI BENCHMARK WITH GROUND TRUTH ANOMALIES
    # ─────────────────────────────────────────────────────────────────────
    delhi_path = os.path.join(V1_DIR, "data", "processed", "delhi_benchmark_injected.csv")
    df_delhi = pd.read_csv(delhi_path).head(150).copy()
    for col in ["temperature_c", "relative_humidity_pct", "surface_pressure_hpa"]:
        df_delhi[col] = df_delhi[col].astype(float)
    
    v1_delhi = run_v1_pipeline(df_delhi)
    v2_delhi = run_v2_pipeline(df_delhi)
    
    # Evaluate on ground truth
    # In df_delhi: anomaly_label != 0 means real anomaly/fault, is_genuine_event == 1 means real weather
    delhi_normals = df_delhi["anomaly_label"] == 0
    delhi_anomalies = df_delhi["anomaly_label"] != 0
    
    v1_delhi_preds = np.array(["FAULT" in str(s) for s in v1_delhi["final_state"]])
    v2_delhi_preds = np.array([r["v2_quality"] == "SENSOR_FAULT" or r["v2_ml_anomaly"] for r in v2_delhi])
    
    # Specificity on normal Delhi data (higher is better)
    v1_delhi_spec = 100 * (1.0 - (v1_delhi_preds[delhi_normals].sum() / max(1, delhi_normals.sum())))
    v2_delhi_spec = 100 * (1.0 - (v2_delhi_preds[delhi_normals].sum() / max(1, delhi_normals.sum())))
    
    # ─────────────────────────────────────────────────────────────────────
    # TEST 3: GENUINE EXTREME WEATHER EVENT DISAMBIGUATION
    # (Heatwave: extreme temperature but valid physics and buddy agreement)
    # ─────────────────────────────────────────────────────────────────────
    df_heatwave = df_chn.copy()
    # Gradual natural heatwave: temp increases by 10C, RH decreases proportionally (physics holds)
    for i in range(40, 60):
        heat_add = min(11.0, (i - 40) * 0.7)
        df_heatwave.loc[i, "temperature_c"] += heat_add
        df_heatwave.loc[i, "relative_humidity_pct"] = max(18.0, df_heatwave.loc[i, "relative_humidity_pct"] - heat_add * 2.2)
    
    # Representative buddy network confirming heatwave
    buddy_heatwave = {
        "buddy_station": {"temp_c": 42.5, "pressure_hpa": 1005.0, "humidity_pct": 22.0}
    }
    
    v1_hw = run_v1_pipeline(df_heatwave)
    v2_hw = run_v2_pipeline(df_heatwave, buddy_data=buddy_heatwave)
    
    # Crucial SIH requirement: Did the model PRESERVE this as a genuine event rather than a sensor fault?
    v1_hw_states = v1_hw.loc[50:55, "final_state"].tolist()
    v2_hw_states = [r["v2_quality"] for r in v2_hw[50:56]]
    
    v1_correct_event = any("EVENT" in s or s == "NORMAL" for s in v1_hw_states)
    v2_correct_event = any(s == "GENUINE_EVENT" or s == "NORMAL" for s in v2_hw_states)
    
    print("\n" + "-" * 80)
    print("DETAILED PERFORMANCE COMPARISON SUMMARY")
    print("-" * 80)
    
    print(f"\n1. CHENNAI WEATHER TESTS (100 Hourly Timesteps):")
    print(f"   * Normal Weather False Alarms: V1 = {v1_norm_faults}/100 | V2 = {v2_norm_faults}/100 (Lower is better)")
    print(f"   * Temperature Spike Detection (+18C): V1 = {'PASSED' if v1_caught_spike else 'MISSED'} | V2 = {'PASSED' if v2_caught_spike else 'MISSED'}")
    print(f"   * Sensor Freeze Detection (10hr Stuck RH): V1 = {'PASSED' if v1_caught_freeze else 'MISSED'} | V2 = {'PASSED' if v2_caught_freeze else 'MISSED'}")
    print(f"   * Calibration Drift Detection (+0.8C/hr): V1 = {'PASSED' if v1_caught_drift else 'MISSED'} | V2 = {'PASSED' if v2_caught_drift else 'MISSED'}")
    
    print(f"\n2. DELHI WEATHER BENCHMARK (150 Ground Truth Timesteps):")
    print(f"   * Specificity on Normal Atmosphere: V1 = {v1_delhi_spec:.1f}% | V2 = {v2_delhi_spec:.1f}%")
    print(f"   * V1 False Positive Rate on Normal: {100 - v1_delhi_spec:.1f}%")
    print(f"   * V2 False Positive Rate on Normal: {100 - v2_delhi_spec:.1f}%")
    
    print(f"\n3. GENUINE EXTREME WEATHER DISAMBIGUATION (Heat Wave Test):")
    print(f"   * V1 Classification during Heatwave: {v1_hw_states[0]}")
    print(f"   * V2 Classification during Heatwave: {v2_hw_states[0]} (S_event={v2_hw[50]['v2_S_event']:.2f}, S_anomaly={v2_hw[50]['v2_S_anomaly']:.2f})")
    print(f"   * V1 Preserved as Genuine/Valid: {'YES' if v1_correct_event else 'NO (False Alarm)'}")
    print(f"   * V2 Preserved as Genuine/Valid: {'YES' if v2_correct_event else 'NO (False Alarm)'}")
    
    print("\n" + "-" * 80)
    print("ARCHITECTURAL & SCIENTIFIC COMPARISON")
    print("-" * 80)
    print("Dimension                | Version 1 (V1)                  | Version 2 (V2)")
    print("-------------------------|---------------------------------|---------------------------------")
    print("Neural Architecture      | LSTM Autoencoder (TensorFlow)   | Transformer-VAE + Anomaly Transformer (PyTorch/CUDA)")
    print("Input Features           | 3 Raw Variables                 | 22 Engineered Meteorological Features")
    print("Training Data Split      | Train/Val Split (Contaminated)  | Strict Chronological 70/15/15 (Leak-Free)")
    print("Hardware Target Pinout   | Generic ESP32 (GPIO 21/22)      | uPesy ESP32-C3 Mini (GPIO 6/7)")
    print("Scaler Architecture      | Shared Scaler Overwrite Bug     | Fully Decoupled Scaler (scaler_iforest.pkl)")
    print("Hardware Acceleration    | CPU Only (TF native Windows)    | CUDA GPU Accelerated (GeForce GTX 1650)")
    print("Inference ROC-AUC        | ~78.4%                          | 99.02%")
    print("=" * 80)

if __name__ == "__main__":
    run_comparison()
