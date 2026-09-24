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

from server.models.ensemble import EnsembleDetector
from server.engine.decision_engine import DecisionEngine
from server.models.feature_engine import FeatureEngine
from server.config import ARTIFACTS_DIR

v2_ensemble = EnsembleDetector()
v2_ensemble.load_models(ARTIFACTS_DIR)
v2_decision = DecisionEngine()

def generate_benchmark_data(num_samples=3000):
    np.random.seed(42)
    t = np.arange(num_samples)
    temp = 25 + 10 * np.sin(2 * np.pi * t / 24) + np.random.normal(0, 0.5, num_samples)
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

    df["label"] = 0
    df["anomaly_type"] = "NORMAL"
    df["spatial_unavailable"] = False

    for idx in range(100, num_samples - 100, 400):
        df.loc[idx, "temperature_c"] += 15
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "SPIKE"

    for idx in range(150, num_samples - 100, 400):
        for i in range(10):
            if idx + i < num_samples:
                df.loc[idx + i, "temperature_c"] += 0.5 * (i + 1)
                df.loc[idx + i, "label"] = 1
                df.loc[idx + i, "anomaly_type"] = "DRIFT"

    for idx in range(200, num_samples - 100, 400):
        val_t = df.loc[idx, "temperature_c"]
        val_rh = df.loc[idx, "relative_humidity_pct"]
        for i in range(15):
            if idx + i < num_samples:
                df.loc[idx + i, "temperature_c"] = val_t
                df.loc[idx + i, "relative_humidity_pct"] = val_rh
                df.loc[idx + i, "label"] = 1
                df.loc[idx + i, "anomaly_type"] = "FROZEN"

    for idx in range(250, num_samples - 100, 400):
        df.loc[idx, "temperature_c"] = 65
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "RANGE"

    for idx in range(300, num_samples - 100, 400):
        df.loc[idx, "temperature_c"] = np.nan
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "COMMUNICATION"

    for idx in range(350, num_samples - 100, 400):
        df.loc[idx, "temperature_c"] += 8
        df.loc[idx, "relative_humidity_pct"] += 30
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "MULTIVARIATE"
        
    for idx in range(400, num_samples - 100, 400):
        for i in range(5):
            if idx + i < num_samples:
                df.loc[idx + i, "temperature_c"] += 12
                df.loc[idx + i, "relative_humidity_pct"] -= 20
                df.loc[idx + i, "label"] = 0
                df.loc[idx + i, "anomaly_type"] = "GENUINE_EVENT"

    for idx in range(450, num_samples - 100, 400):
        for i in range(5):
            if idx + i < num_samples:
                df.loc[idx + i, "temperature_c"] += 12
                df.loc[idx + i, "relative_humidity_pct"] -= 20
                df.loc[idx + i, "label"] = 0
                df.loc[idx + i, "anomaly_type"] = "GENUINE_EVENT_WITH_FAULT"
        spike_idx = idx + 2
        df.loc[spike_idx, "temperature_c"] += 15
        df.loc[spike_idx, "label"] = 1

    for idx in range(480, num_samples - 100, 400):
        df.loc[idx, "temperature_c"] += 15
        df.loc[idx, "label"] = 1
        df.loc[idx, "anomaly_type"] = "SPATIAL_UNAVAILABLE"
        df.loc[idx, "spatial_unavailable"] = True

    buddy_df = df.copy()
    for i in range(num_samples):
        buddy_df.loc[i, "temperature_c"] += np.random.normal(0, 0.5)
        buddy_df.loc[i, "relative_humidity_pct"] += np.random.normal(0, 1.0)
        buddy_df.loc[i, "surface_pressure_hpa"] += np.random.normal(0, 0.5)
        
        if df.loc[i, "anomaly_type"] not in ["NORMAL", "GENUINE_EVENT", "GENUINE_EVENT_WITH_FAULT"]:
            buddy_df.loc[i, "temperature_c"] = temp[i] + np.random.normal(0, 0.5)
            buddy_df.loc[i, "relative_humidity_pct"] = rh[i] + np.random.normal(0, 1.0)
            buddy_df.loc[i, "surface_pressure_hpa"] = pres[i] + np.random.normal(0, 0.5)
            
        if df.loc[i, "anomaly_type"] == "GENUINE_EVENT_WITH_FAULT" and df.loc[i, "label"] == 1:
            buddy_df.loc[i, "temperature_c"] -= 15
            
    return df, buddy_df

print("Generating benchmark data...")
df, buddy_df = generate_benchmark_data(3000)

print("Evaluating V1...")
df_v1 = df.copy()
df_v1["temperature_c"] = df_v1["temperature_c"].ffill().fillna(25)
df_v1["relative_humidity_pct"] = df_v1["relative_humidity_pct"].ffill().fillna(50)
df_v1["surface_pressure_hpa"] = df_v1["surface_pressure_hpa"].ffill().fillna(1013)

start_time = time.time()
df_eval = df_v1.copy()
df_eval = v1_physics.add_derived_features(df_eval)
df_eval["physics_score"] = v1_physics.run_physics_checks(df_eval)
df_eval["stat_score"], df_eval["spike_flag"], df_eval["freeze_flag"] = v1_stat.run_statistical_checks(df_eval)
df_eval["if_score"] = v1_iforest.predict(df_eval)
df_eval["lstm_score"] = v1_lstm.predict(df_eval)
df_eval = v1_fusion.run_fusion(df_eval, disable_spatial=True)
v1_time = (time.time() - start_time) / len(df) * 1000

v1_preds = np.array(["FAULT" in str(s) for s in df_eval["final_state"]])
v1_scores = df_eval["if_score"].values * 0.5 + df_eval["lstm_score"].values * 0.5

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
    
    if np.isnan(t) or np.isnan(p) or np.isnan(h):
        v2_preds.append(True)
        v2_scores.append(1.0)
        v2_states.append("DATA_COMMUNICATION_FAULT")
        history.append({"temp_c": 25, "pressure_hpa": 1013, "humidity_pct": 50})
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
    
    if row["spatial_unavailable"]:
        buddy_data = {}
    else:
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

v2_time = (time.time() - start_time) / len(df) * 1000
v2_preds = np.array(v2_preds)
v2_scores = np.array(v2_scores)

y_true = df["label"].values

def get_f1_for_type(preds, target_type):
    mask = (df["anomaly_type"] == target_type) | (df["anomaly_type"] == "NORMAL")
    y_t = df.loc[mask, "label"].values
    y_p = preds[mask]
    return f1_score(y_t, y_p, zero_division=0)

def get_acc_for_type(preds, target_type, target_label=None):
    mask = (df["anomaly_type"] == target_type)
    if target_label is not None:
        mask = mask & (df["label"] == target_label)
    if np.sum(mask) == 0: return 0
    y_t = df.loc[mask, "label"].values
    y_p = preds[mask]
    return np.mean(y_t == y_p)

# Event Preservation (Accuracy on Genuine Event where label=0)
v1_event_pres = get_acc_for_type(v1_preds, "GENUINE_EVENT", target_label=0)
v2_event_pres = get_acc_for_type(v2_preds, "GENUINE_EVENT", target_label=0)

# False alerts during genuine events (FPR during Genuine Event)
v1_false_alert_ge = 1.0 - v1_event_pres
v2_false_alert_ge = 1.0 - v2_event_pres

# Event + faulty station accuracy (Accuracy on Genuine Event WITH Fault where label=1)
v1_ev_fault = get_acc_for_type(v1_preds, "GENUINE_EVENT_WITH_FAULT", target_label=1)
v2_ev_fault = get_acc_for_type(v2_preds, "GENUINE_EVENT_WITH_FAULT", target_label=1)

# Spatial unavailable case
v1_spatial_unavail = get_acc_for_type(v1_preds, "SPATIAL_UNAVAILABLE")
v2_spatial_unavail = get_acc_for_type(v2_preds, "SPATIAL_UNAVAILABLE")

v1_tn, v1_fp, v1_fn, v1_tp = confusion_matrix(y_true, v1_preds).ravel()
v1_fpr = v1_fp / (v1_fp + v1_tn)
v2_tn, v2_fp, v2_fn, v2_tp = confusion_matrix(y_true, v2_preds).ravel()
v2_fpr = v2_fp / (v2_fp + v2_tn)

print("\n" + "="*80)
print(f"{'Metric':<30} | {'V1':<20} | {'V2':<20}")
print("-" * 80)
print("Fault Detection Metrics:")
print(f"{'Precision':<30} | {precision_score(y_true, v1_preds, zero_division=0):>15.4f}    | {precision_score(y_true, v2_preds, zero_division=0):>15.4f}")
print(f"{'Recall':<30} | {recall_score(y_true, v1_preds, zero_division=0):>15.4f}    | {recall_score(y_true, v2_preds, zero_division=0):>15.4f}")
print(f"{'F1':<30} | {f1_score(y_true, v1_preds, zero_division=0):>15.4f}    | {f1_score(y_true, v2_preds, zero_division=0):>15.4f}")
print(f"{'FPR':<30} | {v1_fpr:>15.4f}    | {v2_fpr:>15.4f}")
print(f"{'ROC-AUC':<30} | {roc_auc_score(y_true, v1_scores):>15.4f}    | {roc_auc_score(y_true, v2_scores):>15.4f}")
print(f"{'Spike F1':<30} | {get_f1_for_type(v1_preds, 'SPIKE'):>15.4f}    | {get_f1_for_type(v2_preds, 'SPIKE'):>15.4f}")
print(f"{'Drift F1':<30} | {get_f1_for_type(v1_preds, 'DRIFT'):>15.4f}    | {get_f1_for_type(v2_preds, 'DRIFT'):>15.4f}")
print(f"{'Frozen F1':<30} | {get_f1_for_type(v1_preds, 'FROZEN'):>15.4f}    | {get_f1_for_type(v2_preds, 'FROZEN'):>15.4f}")
print(f"{'Range F1':<30} | {get_f1_for_type(v1_preds, 'RANGE'):>15.4f}    | {get_f1_for_type(v2_preds, 'RANGE'):>15.4f}")
print(f"{'Communication F1':<30} | {get_f1_for_type(v1_preds, 'COMMUNICATION'):>15.4f}    | {get_f1_for_type(v2_preds, 'COMMUNICATION'):>15.4f}")
print(f"{'Multivariate F1':<30} | {get_f1_for_type(v1_preds, 'MULTIVARIATE'):>15.4f}    | {get_f1_for_type(v2_preds, 'MULTIVARIATE'):>15.4f}")
print("-" * 80)
print("SkyGuard-Specific Behavior:")
print(f"{'GEPR (Genuine Event Pres)':<30} | {v1_event_pres:>15.4f}    | {v2_event_pres:>15.4f}")
print(f"{'False Alerts during Genuine':<30} | {v1_false_alert_ge:>15.4f}    | {v2_false_alert_ge:>15.4f}")
print(f"{'Event + Faulty Station Acc':<30} | {v1_ev_fault:>15.4f}    | {v2_ev_fault:>15.4f}")
print(f"{'Spatial Unavailable Case Acc':<30} | {v1_spatial_unavail:>15.4f}    | {v2_spatial_unavail:>15.4f}")
print("-" * 80)
print("Operational:")
print(f"{'Latency':<30} | {v1_time:>15.2f} ms | {v2_time:>15.2f} ms")
print("="*80)
