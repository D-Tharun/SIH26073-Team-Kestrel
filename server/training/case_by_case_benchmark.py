"""
SkyGuard AI — Case-by-Case Meteorological Scenario Benchmark: V1 vs V2
Compares Version 1 (D:\\sih ps-2) and Version 2 (D:\\skyguard-ps2) across
5 canonical operational weather quality scenarios.
"""
import os
import sys
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
sys.stdout.reconfigure(encoding='utf-8')

V1_DIR = r"D:\sih ps-2"
V2_DIR = r"D:\skyguard-ps2"

sys.path.insert(0, V1_DIR)
sys.path.insert(0, V2_DIR)

from src.models.iforest_model import MultivariateIForest
from src.models.lstm_ae_model import TemporalLSTMAE
from src.qc.physics_qc import PhysicsEngine
from src.qc.stat_qc import StatisticalQCEngine
from src.qc.fusion import EventAwareFusionEngine

from server.models.ensemble import EnsembleDetector
from server.engine.decision_engine import DecisionEngine
from server.models.feature_engine import FeatureEngine
from server.config import ARTIFACTS_DIR

# Load V1 models
print("Loading V1 (D:\\sih ps-2) models...")
v1_if = MultivariateIForest()
v1_if.load(os.path.join(V1_DIR, "models", "iforest_v2.pkl"))
v1_lstm = TemporalLSTMAE()
v1_lstm.load(os.path.join(V1_DIR, "models", "lstm_ae_v2"))
v1_phys = PhysicsEngine()
v1_stat = StatisticalQCEngine()
v1_fus = EventAwareFusionEngine()

# Load V2 models
print("Loading V2 (D:\\skyguard-ps2) models...")
v2_ens = EnsembleDetector()
v2_ens.load_models(ARTIFACTS_DIR)
v2_dec = DecisionEngine()


def evaluate_scenario(name, temp_seq, pres_seq, hum_seq, buddy_temp=None, expected_state="NORMAL"):
    N = len(temp_seq)
    
    # Run V1 Pipeline
    # If buddy_temp is provided, create a multi-station dataframe for spatial fusion in V1
    if buddy_temp is not None:
        timestamps = pd.date_range("2024-05-15 12:00", periods=N, freq="h")
        df_target = pd.DataFrame({
            "timestamp": timestamps,
            "station": "STATION_TARGET",
            "temperature_c": [float(x) for x in temp_seq],
            "surface_pressure_hpa": [float(x) for x in pres_seq],
            "relative_humidity_pct": [float(x) for x in hum_seq],
        })
        df_buddy = pd.DataFrame({
            "timestamp": timestamps,
            "station": "STATION_BUDDY",
            "temperature_c": [float(x) for x in buddy_temp],
            "surface_pressure_hpa": [float(x) for x in pres_seq],
            "relative_humidity_pct": [float(x) for x in hum_seq],
        })
        df1 = pd.concat([df_target, df_buddy], ignore_index=True)
        df1 = v1_phys.add_derived_features(df1)
        df1["physics_score"] = v1_phys.run_physics_checks(df1)
        df1["stat_score"], df1["spike_flag"], df1["freeze_flag"] = v1_stat.run_statistical_checks(df1)
        df1["if_score"] = v1_if.predict(df1)
        df1["lstm_score"] = v1_lstm.predict(df1)
        df1 = v1_fus.run_fusion(df1, disable_spatial=False)
        target_rows = df1[df1["station"] == "STATION_TARGET"]
        v1_state = str(target_rows.iloc[-1]["final_state"])
    else:
        df1 = pd.DataFrame({
            "timestamp": pd.date_range("2024-05-15 12:00", periods=N, freq="h"),
            "station": "STATION_TARGET",
            "temperature_c": [float(x) for x in temp_seq],
            "surface_pressure_hpa": [float(x) for x in pres_seq],
            "relative_humidity_pct": [float(x) for x in hum_seq],
        })
        df1 = v1_phys.add_derived_features(df1)
        df1["physics_score"] = v1_phys.run_physics_checks(df1)
        df1["stat_score"], df1["spike_flag"], df1["freeze_flag"] = v1_stat.run_statistical_checks(df1)
        df1["if_score"] = v1_if.predict(df1)
        df1["lstm_score"] = v1_lstm.predict(df1)
        df1 = v1_fus.run_fusion(df1, disable_spatial=True)
        v1_state = str(df1.iloc[-1]["final_state"])
    
    # Run V2 Pipeline
    fe = FeatureEngine()
    history = []
    dec = None
    for i in range(N):
        t, p, h = temp_seq[i], pres_seq[i], hum_seq[i]
        feats = fe.add_reading(t, p, h)
        current_obs = {"temp_c": t, "pressure_hpa": p, "humidity_pct": h}
        buddies = {}
        if buddy_temp is not None:
            buddies["buddy_station"] = {
                "temp_c": buddy_temp[i],
                "pressure_hpa": pres_seq[i],
                "humidity_pct": hum_seq[i],
            }
            
        ml_res = {"is_anomaly": False, "ensemble_score": 0.1}
        if len(history) >= 8:
            temp_f = FeatureEngine()
            w = []
            for hist in history[-8:]:
                f_ = temp_f.add_reading(hist["temp_c"], hist["pressure_hpa"], hist["humidity_pct"])
                if f_ is not None:
                    w.append(f_)
            if len(w) == 8:
                ml_res = v2_ens.detect(np.array(w, dtype=np.float32))
        
        dec = v2_dec.evaluate("STATION_TARGET", current_obs, history[-12:], ml_res, buddies)
        history.append(current_obs)
    
    v2_state = dec["quality"]
    
    # Check correctness under SIH taxonomy
    if expected_state == "SENSOR_FAULT":
        v1_correct = ("FAULT" in v1_state) or ("SPIKE" in v1_state) or ("FREEZE" in v1_state) or ("DRIFT" in v1_state)
        v2_correct = (v2_state == "SENSOR_FAULT")
    elif expected_state == "GENUINE_EVENT":
        v1_correct = ("EVENT" in v1_state)
        v2_correct = (v2_state == "GENUINE_EVENT")
    else:  # NORMAL
        v1_correct = (v1_state == "NORMAL")
        v2_correct = (v2_state == "NORMAL")
    
    s_anom = dec["S_anomaly"]
    s_ev = dec["S_event"]
    
    print(f"Scenario: {name}")
    print(f"  Expected State:  {expected_state}")
    print(f"  V1 Output:       {v1_state:<24} | Correct: {v1_correct}")
    print(f"  V2 Output:       {v2_state:<24} | Correct: {v2_correct} (S_anomaly={s_anom:.2f}, S_event={s_ev:.2f})")
    print("-" * 75)
    return {
        "scenario": name,
        "expected": expected_state,
        "v1_output": v1_state,
        "v1_correct": v1_correct,
        "v2_output": v2_state,
        "v2_correct": v2_correct,
        "v2_s_anomaly": s_anom,
        "v2_s_event": s_ev,
    }


def main():
    print("=" * 75)
    print("CASE-BY-CASE METEOROLOGICAL SCENARIO BENCHMARK: V1 vs V2")
    print("=" * 75)
    
    results = []
    
    # CASE 1: Normal Daytime Atmospheric Diurnal Cycle
    N = 24
    t_norm = [28.0 + 3.0 * np.sin(i / 3.0) for i in range(N)]
    p_norm = [1012.0 + 0.5 * np.cos(i / 4.0) for i in range(N)]
    h_norm = [65.0 - 6.0 * np.sin(i / 3.0) for i in range(N)]
    results.append(evaluate_scenario(
        "1. Normal Atmospheric Diurnal Cycle",
        t_norm, p_norm, h_norm,
        expected_state="NORMAL"
    ))
    
    # CASE 2: Single-Sensor Temperature Spike (+18°C sudden jump)
    t_spike = list(t_norm)
    t_spike[-1] += 18.0
    results.append(evaluate_scenario(
        "2. Sensor Fault: Sudden Temperature Spike (+18°C)",
        t_spike, p_norm, h_norm,
        expected_state="SENSOR_FAULT"
    ))
    
    # CASE 3: Frozen / Stuck Sensor (Humidity stuck for 12 hours)
    h_frozen = list(h_norm)
    for k in range(12, N):
        h_frozen[k] = 68.0
    results.append(evaluate_scenario(
        "3. Sensor Fault: Frozen / Stuck Humidity (Zero Variance)",
        t_norm, p_norm, h_frozen,
        expected_state="SENSOR_FAULT"
    ))
    
    # CASE 4: Calibration Drift (+0.8°C/hr accumulating over 14 hours while buddy is normal)
    t_drift = list(t_norm)
    b_drift = list(t_norm) # Buddy station stays normal
    for k in range(10, N):
        t_drift[k] += (k - 10) * 0.85
    results.append(evaluate_scenario(
        "4. Sensor Fault: Calibration Drift (+0.85°C/hr vs Normal Buddy)",
        t_drift, p_norm, h_norm,
        buddy_temp=b_drift,
        expected_state="SENSOR_FAULT"
    ))
    
    # CASE 5: Genuine Extreme Event (Severe Delhi Heatwave: 47.5°C, Corroborated by Palam Buddy)
    t_hw = [28.0 + (i * 0.85 if i >= 6 else 0) for i in range(N)]
    t_hw[-1] = 47.5 # Peak heatwave
    b_hw = [27.8 + (i * 0.85 if i >= 6 else 0) for i in range(N)]
    b_hw[-1] = 47.1 # Buddy confirms extreme heatwave!
    h_hw = [max(12.0, 65.0 - (i * 2.3 if i >= 6 else 0)) for i in range(N)]
    results.append(evaluate_scenario(
        "5. Genuine Extreme Event: Severe Delhi Heatwave (47.5°C Corroborated by Buddy)",
        t_hw, p_norm, h_hw,
        buddy_temp=b_hw,
        expected_state="GENUINE_EVENT"
    ))
    
    print("\n" + "=" * 75)
    print("FINAL HEAD-TO-HEAD SCORECARD")
    print("=" * 75)
    v1_total = sum(r["v1_correct"] for r in results)
    v2_total = sum(r["v2_correct"] for r in results)
    print(f"Version 1 (V1) Accuracy: {v1_total}/{len(results)} ({v1_total/len(results)*100:.0f}%)")
    print(f"Version 2 (V2) Accuracy: {v2_total}/{len(results)} ({v2_total/len(results)*100:.0f}%)")
    print("=" * 75)


if __name__ == "__main__":
    main()
