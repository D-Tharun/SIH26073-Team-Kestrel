"""
SkyGuard AI — Central Configuration
Station definitions, physical bounds, anomaly thresholds, model paths.
"""
import os
from pathlib import Path

# ─── Paths ─────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

ARTIFACTS_DIR.mkdir(exist_ok=True)
RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)

# ─── Model Artifact Paths ──────────────────────────────────────────────
TRANSFORMER_VAE_PATH = ARTIFACTS_DIR / "transformer_vae.pt"
ANOMALY_TRANSFORMER_PATH = ARTIFACTS_DIR / "anomaly_transformer.pt"
ISOLATION_FOREST_PATH = ARTIFACTS_DIR / "isolation_forest.pkl"
SCALER_PATH = ARTIFACTS_DIR / "scaler.pkl"
THRESHOLDS_PATH = ARTIFACTS_DIR / "thresholds.json"

# ─── Feature Engineering ───────────────────────────────────────────────
WINDOW_SIZE = 8  # Number of timesteps in sliding window
RAW_FEATURES = ["temp_c", "pressure_hpa", "humidity_pct"]
NUM_ENGINEERED_FEATURES = 22
ROLLING_WINDOW = 6  # Steps for rolling statistics

# ─── Physical Bounds (Range Checks) ───────────────────────────────────
PHYSICAL_BOUNDS = {
    "temp_c": {"min": -50.0, "max": 60.0},
    "pressure_hpa": {"min": 870.0, "max": 1084.0},
    "humidity_pct": {"min": 0.0, "max": 100.0},
}

# ─── Rate of Change Limits (per 10-min interval) ──────────────────────
RATE_OF_CHANGE_LIMITS = {
    "temp_c": 5.0,        # °C per 10 min
    "pressure_hpa": 3.0,  # hPa per 10 min
    "humidity_pct": 15.0,  # % per 10 min
}

# ─── Frozen Value Detection ────────────────────────────────────────────
FROZEN_VALUE_WINDOW = 6  # Consecutive identical readings to flag frozen
FROZEN_VALUE_TOLERANCE = 0.01  # Allow tiny float noise

# ─── Ensemble Weights ─────────────────────────────────────────────────
ENSEMBLE_WEIGHTS = {
    "transformer_vae": 0.45,
    "anomaly_transformer": 0.35,
    "isolation_forest": 0.20,
}

# ─── Severity Thresholds (as multiples of base threshold) ─────────────
SEVERITY_LEVELS = {
    "LOW": 1.0,
    "MEDIUM": 1.5,
    "HIGH": 3.0,
}

# ─── 4-Pillar Decision Weights ────────────────────────────────────────
PILLAR_WEIGHTS = {
    "temporal": 0.30,
    "multivariate": 0.25,
    "physics": 0.25,
    "spatial": 0.20,
}

# ─── MQTT Configuration ───────────────────────────────────────────────
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC_PREFIX = "skyguard"

# ─── Server Configuration ─────────────────────────────────────────────
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"]

# ─── Simulator Configuration ──────────────────────────────────────────
SIMULATOR_INTERVAL_SEC = 2.0  # Seconds between simulated updates
SIMULATOR_SPEEDUP = 300  # 1 real second = 300 simulated seconds (5 min)

# ─── Training Configuration ───────────────────────────────────────────
TRAIN_EPOCHS_VAE = 5
TRAIN_EPOCHS_AT = 3
TRAIN_BATCH_SIZE = 64
TRAIN_LR = 1e-3

# Chronological split ratios (MUST sum to 1.0)
TRAIN_SPLIT = 0.70   # First 70% for model training
VAL_SPLIT = 0.15     # Next 15% for threshold calibration
TEST_SPLIT = 0.15    # Final 15% for held-out evaluation

# Legacy aliases (kept for backward compatibility with evaluate.py imports)
TRAIN_VAL_SPLIT = VAL_SPLIT
TRAIN_TEST_SPLIT = TEST_SPLIT

ANOMALY_INJECTION_RATE = 0.05  # 5% of test data gets anomalies
SLIDING_WINDOW_SIZE = WINDOW_SIZE

# ─── Additional Artifact Paths ────────────────────────────────────────
IFOREST_SCALER_PATH = ARTIFACTS_DIR / "scaler_iforest.pkl"
SPLIT_METADATA_PATH = ARTIFACTS_DIR / "split_metadata.json"
TEST_WINDOWS_PATH = ARTIFACTS_DIR / "test_windows.npy"
VAL_WINDOWS_PATH = ARTIFACTS_DIR / "val_windows.npy"

VAE_CONFIG = {
    "d_model": 64,
    "n_heads": 4,
    "n_layers": 2,
    "latent_dim": 16,
    "dropout": 0.1,
    "learning_rate": TRAIN_LR,
    "epochs": TRAIN_EPOCHS_VAE,
    "batch_size": TRAIN_BATCH_SIZE
}

AT_CONFIG = {
    "d_model": 64,
    "n_heads": 4,
    "n_layers": 2,
    "dropout": 0.1,
    "learning_rate": TRAIN_LR,
    "epochs": TRAIN_EPOCHS_AT,
    "batch_size": TRAIN_BATCH_SIZE
}

# ─── The 7 AWS Stations ───────────────────────────────────────────────
STATIONS = {
    "Chennai_Meenambakkam": {
        "name": "Chennai Meenambakkam AWS",
        "code": "AWS-TN-CHN-01",
        "state": "Tamil Nadu",
        "district": "Chennai",
        "lat": 12.9941,
        "lng": 80.1809,
        "elevation_m": 16,
        "climate_zone": "tropical_coastal",
        "temp_offset_c": 8.0,
        "humidity_offset_pct": 10.0,
        "pressure_offset_hpa": -5.0,
    },
    "Jaisalmer_Desert": {
        "name": "Jaisalmer Desert AWS",
        "code": "AWS-RJ-JAI-01",
        "state": "Rajasthan",
        "district": "Jaisalmer",
        "lat": 26.9157,
        "lng": 70.9083,
        "elevation_m": 225,
        "climate_zone": "hot_arid",
        "temp_offset_c": 15.0,
        "humidity_offset_pct": -30.0,
        "pressure_offset_hpa": -8.0,
    },
    "New_Delhi_Safdarjung": {
        "name": "New Delhi Safdarjung AWS",
        "code": "AWS-DL-NDL-01",
        "state": "Delhi",
        "district": "New Delhi",
        "lat": 28.5889,
        "lng": 77.2069,
        "elevation_m": 216,
        "climate_zone": "subtropical",
        "temp_offset_c": 10.0,
        "humidity_offset_pct": -5.0,
        "pressure_offset_hpa": -6.0,
    },
    "Shimla_Himalayan": {
        "name": "Shimla Himalayan AWS",
        "code": "AWS-HP-SHM-01",
        "state": "Himachal Pradesh",
        "district": "Shimla",
        "lat": 31.1048,
        "lng": 77.1734,
        "elevation_m": 2205,
        "climate_zone": "alpine_montane",
        "temp_offset_c": -6.0,
        "humidity_offset_pct": 10.0,
        "pressure_offset_hpa": -220.0,
    },
    "Bengaluru_HAL": {
        "name": "Bengaluru HAL AWS",
        "code": "AWS-KA-BLR-01",
        "state": "Karnataka",
        "district": "Bengaluru Urban",
        "lat": 12.9554,
        "lng": 77.6713,
        "elevation_m": 920,
        "climate_zone": "tropical_highland",
        "temp_offset_c": 4.0,
        "humidity_offset_pct": 5.0,
        "pressure_offset_hpa": -90.0,
    },
    "Mumbai_Santacruz": {
        "name": "Mumbai Santacruz AWS",
        "code": "AWS-MH-MUM-01",
        "state": "Maharashtra",
        "district": "Mumbai Suburban",
        "lat": 19.0760,
        "lng": 72.8777,
        "elevation_m": 14,
        "climate_zone": "tropical_coastal",
        "temp_offset_c": 9.0,
        "humidity_offset_pct": 15.0,
        "pressure_offset_hpa": -6.0,
    },
    "Cherrapunji_Mawsynram": {
        "name": "Cherrapunji Mawsynram AWS",
        "code": "AWS-ML-EKH-01",
        "state": "Meghalaya",
        "district": "East Khasi Hills",
        "lat": 25.2986,
        "lng": 91.5822,
        "elevation_m": 1430,
        "climate_zone": "pluvial_highland",
        "temp_offset_c": 1.0,
        "humidity_offset_pct": 25.0,
        "pressure_offset_hpa": -140.0,
    },
}

# Aliases for backward compatibility with old test scripts
STATION_ALIASES = {
    "Jaisalmer_Sam": "Jaisalmer_Desert",
    "RJ_BARMER_002": "Jaisalmer_Desert",
    "Delhi_Safdarjung": "New_Delhi_Safdarjung",
    "DL_PALAM_004": "New_Delhi_Safdarjung",
    "KA_BLR_005": "Bengaluru_HAL",
    "ML_SHL_007": "Cherrapunji_Mawsynram",
}

# ─── Buddy Station Pairs (for spatial analysis) ───────────────────────
BUDDY_PAIRS = [
    ("Jaisalmer_Desert", "New_Delhi_Safdarjung"),
    ("Chennai_Meenambakkam", "Bengaluru_HAL"),
    ("Mumbai_Santacruz", "Bengaluru_HAL"),
    ("Shimla_Himalayan", "New_Delhi_Safdarjung"),
    ("Cherrapunji_Mawsynram", "Shimla_Himalayan"),
]

# ─── Demo Scenarios ───────────────────────────────────────────────────
DEMO_SCENARIOS = {
    "scenario_a": {
        "id": "scenario_a",
        "title": "Normal Operations — All Stations Validated",
        "target_station": "Chennai_Meenambakkam",
        "anomaly_type": None,
        "description": "Baseline normal operations across all stations.",
    },
    "scenario_b": {
        "id": "scenario_b",
        "title": "Sensor Fault — Temperature Spike at Jaisalmer",
        "target_station": "Jaisalmer_Desert",
        "anomaly_type": "spike",
        "description": "BME280 sensor reports +15°C spike while buddy stations show normal readings.",
    },
    "scenario_c": {
        "id": "scenario_c",
        "title": "Genuine Event — Delhi Heat Wave",
        "target_station": "New_Delhi_Safdarjung",
        "anomaly_type": "genuine_event",
        "description": "Regional extreme heat confirmed by spatial buddy correlation.",
    },
    "scenario_d": {
        "id": "scenario_d",
        "title": "Frozen Sensor — Bangalore Humidity Stuck",
        "target_station": "Bengaluru_HAL",
        "anomaly_type": "frozen",
        "description": "Humidity sensor stuck at 67.4% for 12 consecutive readings.",
    },
    "scenario_e": {
        "id": "scenario_e",
        "title": "Calibration Drift — Cherrapunji Gradual Offset",
        "target_station": "Cherrapunji_Mawsynram",
        "anomaly_type": "drift",
        "description": "Temperature sensor drifting +0.8°C/hour, indicating calibration degradation.",
    },
}
