"""
SkyGuard AI — Feature Engineering Pipeline
Transforms raw sensor readings (temp, pressure, humidity) into 22 engineered features.
"""
import numpy as np
from typing import List, Optional
from collections import deque

class FeatureEngine:
    """
    Computes 22 engineered features from a sliding window of raw sensor data.
    
    Feature breakdown:
      [0-2]   Raw: temp, pressure, humidity
      [3-8]   Rolling mean (6-step): temp, pressure, humidity mean & std
      [9-11]  Rate of change: Δtemp, Δpressure, Δhumidity
      [12-13] Cyclical hour: sin(hour), cos(hour)
      [14-15] Cyclical month: sin(month), cos(month)
      [16-17] Interactions: temp×humidity, pressure×temp
      [18-19] Lag-1 features: temp(t-1), humidity(t-1)
      [20]    Lag-2 feature: temp(t-2)
      [21]    Dewpoint: Magnus formula estimate
    """
    
    NUM_FEATURES = 22
    ROLLING_WINDOW = 6
    
    def __init__(self):
        self._buffer: deque = deque(maxlen=64)
    
    def reset(self):
        """Clear the internal buffer."""
        self._buffer.clear()
    
    def add_reading(self, temp_c: float, pressure_hpa: float, 
                    humidity_pct: float, hour: float = 12.0, 
                    month: float = 6.0) -> Optional[np.ndarray]:
        """
        Add a raw reading and compute features if buffer has enough data.
        
        Returns:
            np.ndarray of shape (22,) if enough data, else None.
        """
        self._buffer.append({
            "temp_c": temp_c,
            "pressure_hpa": pressure_hpa,
            "humidity_pct": humidity_pct,
            "hour": hour,
            "month": month,
        })
        
        if len(self._buffer) < self.ROLLING_WINDOW:
            return None
        
        return self._compute_features()
    
    def compute_features_from_window(self, window: List[dict]) -> np.ndarray:
        """
        Compute features from an explicit window of readings.
        Each dict must have: temp_c, pressure_hpa, humidity_pct, hour, month.
        """
        self._buffer.clear()
        for reading in window:
            self._buffer.append(reading)
        return self._compute_features()
    
    def _compute_features(self) -> np.ndarray:
        """Internal feature computation from current buffer state."""
        features = np.zeros(self.NUM_FEATURES, dtype=np.float32)
        
        current = self._buffer[-1]
        temp = current["temp_c"]
        pres = current["pressure_hpa"]
        hum = current["humidity_pct"]
        hour = current["hour"]
        month = current["month"]
        
        # [0-2] Raw features
        features[0] = temp
        features[1] = pres
        features[2] = hum
        
        # [3-8] Rolling statistics (mean & std over last ROLLING_WINDOW)
        recent = list(self._buffer)[-self.ROLLING_WINDOW:]
        temps = [r["temp_c"] for r in recent]
        press = [r["pressure_hpa"] for r in recent]
        hums = [r["humidity_pct"] for r in recent]
        
        features[3] = np.mean(temps)
        features[4] = np.std(temps) if len(temps) > 1 else 0.0
        features[5] = np.mean(press)
        features[6] = np.std(press) if len(press) > 1 else 0.0
        features[7] = np.mean(hums)
        features[8] = np.std(hums) if len(hums) > 1 else 0.0
        
        # [9-11] Rate of change (first derivative)
        if len(self._buffer) >= 2:
            prev = self._buffer[-2]
            features[9] = temp - prev["temp_c"]
            features[10] = pres - prev["pressure_hpa"]
            features[11] = hum - prev["humidity_pct"]
        
        # [12-13] Cyclical hour encoding
        features[12] = np.sin(2 * np.pi * hour / 24.0)
        features[13] = np.cos(2 * np.pi * hour / 24.0)
        
        # [14-15] Cyclical month encoding
        features[14] = np.sin(2 * np.pi * month / 12.0)
        features[15] = np.cos(2 * np.pi * month / 12.0)
        
        # [16-17] Interaction terms
        features[16] = temp * hum / 1000.0  # Scaled
        features[17] = pres * temp / 10000.0  # Scaled
        
        # [18-19] Lag-1 features
        if len(self._buffer) >= 2:
            prev = self._buffer[-2]
            features[18] = prev["temp_c"]
            features[19] = prev["humidity_pct"]
        else:
            features[18] = temp
            features[19] = hum
        
        # [20] Lag-2 feature
        if len(self._buffer) >= 3:
            features[20] = self._buffer[-3]["temp_c"]
        else:
            features[20] = temp
        
        # [21] Dewpoint (Magnus formula approximation)
        features[21] = self._compute_dewpoint(temp, hum)
        
        return features
    
    @staticmethod
    def _compute_dewpoint(temp_c: float, humidity_pct: float) -> float:
        """
        Compute dew point using the Magnus formula.
        Td = (b × α) / (a − α)
        where α = (a × T) / (b + T) + ln(RH / 100)
        a = 17.27, b = 237.7°C
        """
        if humidity_pct <= 0:
            humidity_pct = 0.1
        a = 17.27
        b = 237.7
        alpha = (a * temp_c) / (b + temp_c) + np.log(humidity_pct / 100.0)
        dewpoint = (b * alpha) / (a - alpha)
        return dewpoint
    
    @staticmethod
    def get_feature_names() -> List[str]:
        """Return ordered list of feature names."""
        return [
            "temp_c", "pressure_hpa", "humidity_pct",
            "rolling_temp_mean", "rolling_temp_std",
            "rolling_pres_mean", "rolling_pres_std",
            "rolling_hum_mean", "rolling_hum_std",
            "rate_temp", "rate_pres", "rate_hum",
            "hour_sin", "hour_cos",
            "month_sin", "month_cos",
            "interaction_temp_hum", "interaction_pres_temp",
            "lag1_temp", "lag1_hum",
            "lag2_temp",
            "dewpoint_c",
        ]


def build_feature_matrix(data: List[dict], window_size: int = 8) -> np.ndarray:
    """
    Build a feature matrix from a list of reading dicts.
    
    Args:
        data: List of dicts with keys: temp_c, pressure_hpa, humidity_pct, hour, month
        window_size: Number of timesteps per sample window
    
    Returns:
        np.ndarray of shape (N - window_size + 1, window_size, 22)
    """
    engine = FeatureEngine()
    all_features = []
    
    for reading in data:
        feat = engine.add_reading(
            temp_c=reading["temp_c"],
            pressure_hpa=reading["pressure_hpa"],
            humidity_pct=reading["humidity_pct"],
            hour=reading.get("hour", 12.0),
            month=reading.get("month", 6.0),
        )
        if feat is not None:
            all_features.append(feat)
    
    if len(all_features) < window_size:
        return np.array([]).reshape(0, window_size, FeatureEngine.NUM_FEATURES)
    
    # Create sliding windows
    feature_array = np.array(all_features)
    windows = []
    for i in range(len(feature_array) - window_size + 1):
        windows.append(feature_array[i:i + window_size])
    
    return np.array(windows, dtype=np.float32)
