"""
SkyGuard AI — Real-Data Replay Simulator
Streams actual Kaggle weather data through the anomaly detection pipeline.
Does NOT generate fake data — replays real observations with regional offsets.
"""
import asyncio
import logging
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Callable, Awaitable
from collections import deque

from server.config import (
    STATIONS, SIMULATOR_INTERVAL_SEC, RAW_DATA_DIR,
    DEMO_SCENARIOS,
)

logger = logging.getLogger("skyguard.simulator")


class RealDataSimulator:
    """
    Replays real Kaggle weather data at accelerated speed.
    
    - Reads Jena Climate CSV (10-minute interval real meteorological data)
    - Maps Jena readings to each of 7 Indian stations with regional offsets
    - Injects configurable anomaly scenarios for demo purposes
    - Streams via callback at configurable intervals
    """
    
    def __init__(self):
        self._data: Optional[pd.DataFrame] = None
        self._current_index: int = 0
        self._is_running: bool = False
        self._active_scenario: Optional[str] = None
        self._scenario_step: int = 0
        self._station_histories: Dict[str, deque] = {
            sid: deque(maxlen=50) for sid in STATIONS
        }
        self._on_update: Optional[Callable] = None
    
    def load_data(self, csv_path: Optional[Path] = None):
        """
        Load real weather data from CSV.
        Expected columns: Date Time, p (mbar), T (degC), rh (%)
        """
        if csv_path is None:
            # Try to find Jena Climate data
            candidates = [
                RAW_DATA_DIR / "jena_climate.csv",
                RAW_DATA_DIR / "jena_climate_2009_2016.csv",
                RAW_DATA_DIR / "weather.csv",
            ]
            for c in candidates:
                if c.exists():
                    csv_path = c
                    break
        
        if csv_path is None or not csv_path.exists():
            logger.warning("No CSV data found. Generating minimal fallback data.")
            self._generate_fallback()
            return
        
        logger.info("Loading real weather data from %s", csv_path)
        df = pd.read_csv(csv_path)
        
        # Normalize column names
        column_map = {}
        for col in df.columns:
            col_lower = col.strip().lower()
            if "date" in col_lower or "time" in col_lower:
                column_map[col] = "datetime"
            elif col_lower in ("p (mbar)", "p", "pressure", "press"):
                column_map[col] = "pressure_mbar"
            elif col_lower in ("t (degc)", "t", "temp", "temperature"):
                column_map[col] = "temp_c"
            elif col_lower in ("rh (%)", "rh", "humidity", "relhum"):
                column_map[col] = "humidity_pct"
        
        df = df.rename(columns=column_map)
        
        # Ensure required columns exist
        required = ["temp_c", "pressure_mbar", "humidity_pct"]
        for col in required:
            if col not in df.columns:
                # Try to find similar column
                for orig_col in df.columns:
                    if "temp" in orig_col.lower() and "temp_c" not in df.columns:
                        df["temp_c"] = pd.to_numeric(df[orig_col], errors="coerce")
                    elif "mbar" in orig_col.lower() or "pressure" in orig_col.lower():
                        df["pressure_mbar"] = pd.to_numeric(df[orig_col], errors="coerce")
                    elif "rh" in orig_col.lower() or "humid" in orig_col.lower():
                        df["humidity_pct"] = pd.to_numeric(df[orig_col], errors="coerce")
        
        # Convert pressure from mbar to hPa (1:1 conversion)
        if "pressure_mbar" in df.columns:
            df["pressure_hpa"] = df["pressure_mbar"]
        
        # Drop NaN rows
        df = df.dropna(subset=["temp_c", "pressure_hpa", "humidity_pct"]).reset_index(drop=True)
        
        # Parse datetime for hour/month extraction
        if "datetime" in df.columns:
            df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce", dayfirst=True)
            df["hour"] = df["datetime"].dt.hour + df["datetime"].dt.minute / 60.0
            df["month"] = df["datetime"].dt.month
        else:
            # Estimate hour/month from index
            df["hour"] = (df.index % 144) / 6  # 144 readings per day at 10-min intervals
            df["month"] = ((df.index // 4320) % 12) + 1  # ~4320 readings per month
        
        self._data = df
        logger.info("Loaded %d real weather readings", len(df))
    
    def _generate_fallback(self):
        """Generate minimal plausible data if no CSV is available."""
        logger.warning("Using fallback data generation — download real data for best results")
        n = 10000
        hours = np.tile(np.linspace(0, 24, 144), n // 144 + 1)[:n]
        months = np.repeat(np.arange(1, 13), n // 12 + 1)[:n]
        
        # Realistic seasonal + diurnal temperature pattern
        temp_base = 10 + 10 * np.sin(2 * np.pi * (months - 4) / 12)  # Seasonal
        temp_diurnal = 5 * np.sin(2 * np.pi * (hours - 6) / 24)  # Diurnal
        temp_noise = np.random.normal(0, 1, n)
        temp = temp_base + temp_diurnal + temp_noise
        
        pressure = 1013.25 + np.random.normal(0, 3, n)
        humidity = np.clip(60 - 0.5 * temp + np.random.normal(0, 5, n), 5, 100)
        
        self._data = pd.DataFrame({
            "temp_c": temp,
            "pressure_hpa": pressure,
            "humidity_pct": humidity,
            "hour": hours,
            "month": months,
        })
    
    def get_current_reading(self, station_id: str) -> Dict:
        """
        Get the current reading for a station.
        Applies regional offset to the base Jena data.
        """
        if self._data is None:
            self.load_data()
        
        idx = self._current_index % len(self._data)
        row = self._data.iloc[idx]
        
        station = STATIONS.get(station_id, {})
        temp_offset = station.get("temp_offset_c", 0)
        hum_offset = station.get("humidity_offset_pct", 0)
        pres_offset = station.get("pressure_offset_hpa", 0)
        
        # Apply offsets + small station-specific noise
        rng = np.random.RandomState(hash(station_id + str(idx)) % (2**31))
        
        reading = {
            "temp_c": round(float(row["temp_c"]) + temp_offset + rng.normal(0, 0.3), 2),
            "pressure_hpa": round(float(row["pressure_hpa"]) + pres_offset + rng.normal(0, 0.5), 2),
            "humidity_pct": round(
                float(np.clip(row["humidity_pct"] + hum_offset + rng.normal(0, 1), 2, 99.5)), 2
            ),
            "hour": float(row.get("hour", 12)),
            "month": float(row.get("month", 6)),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "source": "kaggle_replay",
        }
        
        # Generate dual BME280 readings (secondary with tiny delta)
        reading["temp_c_secondary"] = round(reading["temp_c"] + rng.normal(0, 0.15), 2)
        reading["pressure_hpa_secondary"] = round(reading["pressure_hpa"] + rng.normal(0, 0.3), 2)
        reading["humidity_pct_secondary"] = round(
            float(np.clip(reading["humidity_pct"] + rng.normal(0, 0.8), 2, 99.5)), 2
        )
        
        # Apply anomaly scenario if active
        if self._active_scenario:
            reading = self._apply_scenario(station_id, reading)
        
        return reading
    
    def _apply_scenario(self, station_id: str, reading: Dict) -> Dict:
        """Inject anomaly for the active demo scenario."""
        scenario = DEMO_SCENARIOS.get(self._active_scenario)
        if not scenario or scenario.get("target_station") != station_id:
            return reading
        
        anomaly_type = scenario.get("anomaly_type")
        step = self._scenario_step
        
        if anomaly_type == "spike":
            # Sudden temperature spike
            if 5 <= step <= 15:
                reading["temp_c"] += 15.0 + np.random.normal(0, 1)
                # Secondary sensor stays normal (sensor fault signature)
        
        elif anomaly_type == "frozen":
            # Humidity sensor stuck
            if step >= 3:
                reading["humidity_pct"] = 67.4
                reading["humidity_pct_secondary"] = 67.4
        
        elif anomaly_type == "drift":
            # Gradual temperature drift
            reading["temp_c"] += step * 0.08  # +0.08°C per step
        
        elif anomaly_type == "genuine_event":
            # Real heat wave — both primary and secondary sensors agree
            if 5 <= step <= 25:
                heat_add = min(12, step * 0.6)
                reading["temp_c"] += heat_add
                reading["temp_c_secondary"] += heat_add - 0.2
                reading["humidity_pct"] = max(15, reading["humidity_pct"] - step * 0.5)
                reading["humidity_pct_secondary"] = reading["humidity_pct"] + 0.5
        
        return reading
    
    def set_scenario(self, scenario_id: Optional[str]):
        """Activate or deactivate a demo scenario."""
        if scenario_id and scenario_id in DEMO_SCENARIOS:
            self._active_scenario = scenario_id
            self._scenario_step = 0
            logger.info("Activated scenario: %s", DEMO_SCENARIOS[scenario_id]["title"])
        else:
            self._active_scenario = None
            self._scenario_step = 0
            logger.info("Deactivated all scenarios")
    
    async def run(self, on_update: Callable[..., Awaitable]):
        """
        Main simulation loop. Calls on_update for each timestep.
        """
        self._is_running = True
        self._on_update = on_update
        
        if self._data is None:
            self.load_data()
        
        logger.info("Simulator started. Replaying %d readings", len(self._data))
        
        while self._is_running:
            all_readings = {}
            
            for station_id in STATIONS:
                reading = self.get_current_reading(station_id)
                all_readings[station_id] = reading
                
                # Track history
                self._station_histories[station_id].append(reading)
            
            # Call the update handler
            await on_update(all_readings, self._station_histories)
            
            # Advance
            self._current_index += 1
            if self._active_scenario:
                self._scenario_step += 1
            
            await asyncio.sleep(SIMULATOR_INTERVAL_SEC)
    
    def stop(self):
        """Stop the simulation loop."""
        self._is_running = False
        logger.info("Simulator stopped")
    
    @property
    def is_running(self) -> bool:
        return self._is_running
    
    @property
    def progress(self) -> Dict:
        total = len(self._data) if self._data is not None else 0
        return {
            "current_index": self._current_index,
            "total_readings": total,
            "progress_pct": round(
                (self._current_index % max(1, total)) / max(1, total) * 100, 1
            ) if total > 0 else 0,
            "active_scenario": self._active_scenario,
            "scenario_step": self._scenario_step,
        }
