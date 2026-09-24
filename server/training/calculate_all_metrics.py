import os
import sys
import time
import numpy as np
import pandas as pd
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix

import warnings
warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

V1_DIR = r"D:\sih ps-2"
V2_DIR = r"D:\skyguard-ps2"

sys.path.insert(0, V1_DIR)
sys.path.insert(0, V2_DIR)

# --- Initialize V1 ---
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

# --- Initialize V2 ---
from server.models.ensemble import EnsembleDetector
from server.engine.decision_engine import DecisionEngine
from server.models.feature_engine import FeatureEngine
from server.config import ARTIFACTS_DIR

v2_ensemble = EnsembleDetector()
v2_ensemble.load_models(ARTIFACTS_DIR)
v2_decision = DecisionEngine()


# --- Generate Synthetic Benchmark Data ---
def generate_benchmark_data(num_samples=2000):
    np.random.seed(42)
    # Generate diurnal cycle
    t = np.arange(num_samples)
    temp = 25 + 10 * np.sin(2 * np.pi * t / 24) + np.random.normal(0, 0.5, num_samples)
    # RH inversely proportional to temp
    rh = 80 - 2 * (temp - 15) + np.random.normal(0, 2, num_samples)
    rh = np.clip(rh, 10, 100)
    pres = 1010 + 5 * np.cos(2 * np.pi * t / 24) + np.random.normal(0, 1, num_samples)

    df = pd.DataFrame({
        "timestamp": pd.date_range("2024-01-01", periods=num_samples, freq="h"),
        "station": "STATION_1",
        "temperature_c": temp,
        "relative_humidity_pct": rh,
        "surface_pressure_hpa": pres
    })

    # Labels for different types of anomalies
    df["label"] = 0  # 0: Normal, 1: Anomaly
    df["anomaly_type"] = "NORMAL"

    # Inject Spike (Type 1)
    for idx in range(100, num_samples - 100, 200):
        df.loc[idx, "temperature_c"] += 15
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "SPIKE"

    # Inject Drift (Type 2) - 10 hour duration
    for idx in range(250, num_samples - 100, 300):
        for i in range(10):
            if idx + i < num_samples:
                df.loc[idx + i, "temperature_c"] += 0.5 * (i + 1)
                df.loc[idx + i, "label"] = 1
                df.loc[idx + i, "anomaly_type"] = "DRIFT"

    # Inject Frozen (Type 3) - 15 hour duration
    for idx in range(350, num_samples - 100, 300):
        val_t = df.loc[idx, "temperature_c"]
        val_rh = df.loc[idx, "relative_humidity_pct"]
        for i in range(15):
            if idx + i < num_samples:
                df.loc[idx + i, "temperature_c"] = val_t
                df.loc[idx + i, "relative_humidity_pct"] = val_rh
                df.loc[idx + i, "label"] = 1
                df.loc[idx + i, "anomaly_type"] = "FROZEN"

    # Inject Range (Type 4) - Out of bounds
    for idx in range(450, num_samples - 100, 300):
        df.loc[idx, "temperature_c"] = 65  # Above physical limit
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "RANGE"

    # Inject Communication Fault (Type 5) - NaNs
    for idx in range(500, num_samples - 100, 300):
        df.loc[idx, "temperature_c"] = np.nan
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "COMMUNICATION"

    # Inject Multivariate (Type 6) - T and RH both increase unphysically
    for idx in range(550, num_samples - 100, 300):
        df.loc[idx, "temperature_c"] += 8
        df.loc[idx, "relative_humidity_pct"] += 30
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "MULTIVARIATE"
        
    # Inject Genuine Event (Label 0, but unusual values) - Heatwave
    for idx in range(600, num_samples - 100, 300):
        for i in range(5):
            if idx + i < num_samples:
                df.loc[idx + i, "temperature_c"] += 12
                df.loc[idx + i, "relative_humidity_pct"] -= 20
                df.loc[idx + i, "label"] = 0
                df.loc[idx + i, "anomaly_type"] = "GENUINE_EVENT"

    # Generate buddy data
    buddy_df = df.copy()
    
    # Buddy should NOT have the faults, but MUST have the genuine event
    for i in range(num_samples):
        # Add slight spatial noise to everything first
        buddy_df.loc[i, "temperature_c"] += np.random.normal(0, 0.5)
        buddy_df.loc[i, "relative_humidity_pct"] += np.random.normal(0, 1.0)
        buddy_df.loc[i, "surface_pressure_hpa"] += np.random.normal(0, 0.5)
        
        # If it's a fault at the primary station, the buddy should see NORMAL weather (the base temp/rh/pres)
        if df.loc[i, "anomaly_type"] != "NORMAL" and df.loc[i, "anomaly_type"] != "GENUINE_EVENT":
            buddy_df.loc[i, "temperature_c"] = temp[i] + np.random.normal(0, 0.5)
            buddy_df.loc[i, "relative_humidity_pct"] = rh[i] + np.random.normal(0, 1.0)
            buddy_df.loc[i, "surface_pressure_hpa"] = pres[i] + np.random.normal(0, 0.5)

    return df, buddy_df

print("Generating benchmark data...")
df, buddy_df = generate_benchmark_data(2500)

# --- Evaluate V1 ---
print("Evaluating V1...")
# Need to replace NaNs with forward fill for V1 to not crash immediately in ML
df_v1 = df.copy()
df_v1["temperature_c"] = df_v1["temperature_c"].ffill().fillna(25)
df_v1["relative_humidity_pct"] = df_v1["relative_humidity_pct"].ffill().fillna(50)
df_v1["surface_pressure_hpa"] = df_v1["surface_pressure_hpa"].ffill().fillna(1013)


start_time = time.time()
# Run V1 pipeline in batches or as whole
df_eval = df_v1.copy()
df_eval = v1_physics.add_derived_features(df_eval)
df_eval["physics_score"] = v1_physics.run_physics_checks(df_eval)
df_eval["stat_score"], df_eval["spike_flag"], df_eval["freeze_flag"] = v1_stat.run_statistical_checks(df_eval)
df_eval["if_score"] = v1_iforest.predict(df_eval)
df_eval["lstm_score"] = v1_lstm.predict(df_eval)
df_eval = v1_fusion.run_fusion(df_eval, disable_spatial=True)
v1_time = (time.time() - start_time) / len(df) * 1000  # ms per sample

v1_preds = np.array(["FAULT" in str(s) for s in df_eval["final_state"]])
v1_scores = df_eval["if_score"].values * 0.5 + df_eval["lstm_score"].values * 0.5

# For communication faults in V1: the original dataframe had NaNs, which we ffilled. V1 might not explicitly flag them as COMM FAULT unless physics catches it.
# Actually, let's strictly evaluate on the predictions.

# --- Evaluate V2 ---
print("Evaluating V2...")
from collections import deque
fe = FeatureEngine()
recent_features = deque(maxlen=8)
history = []
v2_preds = []
v2_scores = []
v2_states = []

start_time = time.time()
for idx, row in df.iterrows():
    t = float(row["temperature_c"])
    p = float(row["surface_pressure_hpa"])
    h = float(row["relative_humidity_pct"])
    
    # Comm fault detection
    if np.isnan(t) or np.isnan(p) or np.isnan(h):
        v2_preds.append(True)
        v2_scores.append(1.0)
        v2_states.append("DATA_COMMUNICATION_FAULT")
        continue

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
    buddy_data = {"buddy": {"temp_c": buddy_df.loc[idx, "temperature_c"], "pressure_hpa": buddy_df.loc[idx, "surface_pressure_hpa"], "humidity_pct": buddy_df.loc[idx, "relative_humidity_pct"]}}
    
    dec = v2_decision.evaluate(
        station_id="station_eval",
        current_obs=current_obs,
        history=history[-12:],
        ml_result=ml_res,
        all_station_data=buddy_data,
    )
    
    history.append(current_obs)
    
    is_fault = (dec["quality"] == "SENSOR_FAULT") or (dec["quality"] == "DATA_COMMUNICATION_FAULT")
    v2_preds.append(is_fault)
    v2_scores.append(dec["S_anomaly"])
    v2_states.append(dec["quality"])

v2_time = (time.time() - start_time) / len(df) * 1000  # ms per sample
v2_preds = np.array(v2_preds)
v2_scores = np.array(v2_scores)

# --- Calculate Metrics ---
y_true = df["label"].values

def get_f1_for_type(preds, target_type):
    mask = (df["anomaly_type"] == target_type) | (df["anomaly_type"] == "NORMAL")
    if target_type == "NORMAL": return 0 # N/A
    y_t = df.loc[mask, "label"].values
    y_p = preds[mask]
    return f1_score(y_t, y_p, zero_division=0)

# True if NO fault is predicted for Genuine Event
event_mask = (df["anomaly_type"] == "GENUINE_EVENT")
v1_event_pres = 1.0 - np.mean(v1_preds[event_mask]) if np.sum(event_mask) > 0 else 0
v2_event_pres = 1.0 - np.mean(v2_preds[event_mask]) if np.sum(event_mask) > 0 else 0

# Overall FPR
v1_tn, v1_fp, v1_fn, v1_tp = confusion_matrix(y_true, v1_preds).ravel()
v1_fpr = v1_fp / (v1_fp + v1_tn)
v2_tn, v2_fp, v2_fn, v2_tp = confusion_matrix(y_true, v2_preds).ravel()
v2_fpr = v2_fp / (v2_fp + v2_tn)

metrics = {
    "Precision": (precision_score(y_true, v1_preds, zero_division=0), precision_score(y_true, v2_preds, zero_division=0)),
    "Recall": (recall_score(y_true, v1_preds, zero_division=0), recall_score(y_true, v2_preds, zero_division=0)),
    "F1": (f1_score(y_true, v1_preds, zero_division=0), f1_score(y_true, v2_preds, zero_division=0)),
    "FPR": (v1_fpr, v2_fpr),
    "ROC-AUC": (roc_auc_score(y_true, v1_scores), roc_auc_score(y_true, v2_scores)),
    "Spike F1": (get_f1_for_type(v1_preds, "SPIKE"), get_f1_for_type(v2_preds, "SPIKE")),
    "Drift F1": (get_f1_for_type(v1_preds, "DRIFT"), get_f1_for_type(v2_preds, "DRIFT")),
    "Frozen F1": (get_f1_for_type(v1_preds, "FROZEN"), get_f1_for_type(v2_preds, "FROZEN")),
    "Range F1": (get_f1_for_type(v1_preds, "RANGE"), get_f1_for_type(v2_preds, "RANGE")),
    "Communication F1": (get_f1_for_type(v1_preds, "COMMUNICATION"), get_f1_for_type(v2_preds, "COMMUNICATION")),
    "Multivariate F1": (get_f1_for_type(v1_preds, "MULTIVARIATE"), get_f1_for_type(v2_preds, "MULTIVARIATE")),
    "Event preservation": (v1_event_pres, v2_event_pres),
    "Latency": (v1_time, v2_time)
}

print("\n" + "="*80)
print(f"{'Metric':<25} | {'V1':<20} | {'V2':<20}")
print("-" * 80)
for k, (m1, m2) in metrics.items():
    if k == "Latency":
        print(f"{k:<25} | {m1:>15.2f} ms | {m2:>15.2f} ms")
    elif k in ["FPR"]:
        print(f"{k:<25} | {m1:>15.4f}    | {m2:>15.4f}   ")
    else:
        print(f"{k:<25} | {m1:>15.4f}    | {m2:>15.4f}   ")
print("="*80)
