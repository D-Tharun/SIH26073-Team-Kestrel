"""
SkyGuard AI â€” FastAPI Application Entry Point
Main server orchestrating the anomaly detection pipeline.
"""
import asyncio
import sys

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import logging
from pathlib import Path
from collections import deque
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.config import STATIONS, CORS_ORIGINS, ARTIFACTS_DIR
from server.models.ensemble import EnsembleDetector
from server.models.feature_engine import FeatureEngine
from server.engine.decision_engine import DecisionEngine
from server.engine.sensor_health import SensorHealthMonitor
from server.explainability.shap_explainer import SHAPExplainer
from server.streaming.websocket_manager import WebSocketManager
from server.streaming.simulator import RealDataSimulator
from server.streaming.mqtt_handler import MQTTHandler
from server.api.routes import router as api_router

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("skyguard")

# â”€â”€â”€ Global Application State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app_state: Dict = {
    "mode": "demo",  # "demo" | "live" | "static"
    "simulator": None,
    "mqtt": None,
    "ws_manager": None,
    "ensemble": None,
    "decision_engine": None,
    "health_monitor": None,
    "explainer": None,
    "feature_engines": {},
    "latest_observations": {},
    "latest_decisions": {},
    "latest_explanations": {},
    "latest_health": {},
    "station_histories": {sid: deque(maxlen=50) for sid in STATIONS},
}

# â”€â”€â”€ FastAPI App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app = FastAPI(
    title="SkyGuard AI â€” Anomaly Detection Backend",
    description="Real-time weather station anomaly detection with triple-model ML ensemble",
    version="2.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS + ["*"],  # Allow all during development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register REST API routes
app.include_router(api_router)


# â”€â”€â”€ Startup / Shutdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.on_event("startup")
async def startup():
    """Initialize all subsystems on server start."""
    logger.info("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
    logger.info("â•‘  SkyGuard AI â€” Backend Starting...           â•‘")
    logger.info("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")
    
    # Initialize WebSocket manager
    app_state["ws_manager"] = WebSocketManager()
    
    # Initialize ML ensemble
    ensemble = EnsembleDetector()
    ensemble.load_models(ARTIFACTS_DIR)
    app_state["ensemble"] = ensemble
    
    # Initialize engines
    app_state["decision_engine"] = DecisionEngine()
    app_state["health_monitor"] = SensorHealthMonitor()
    app_state["explainer"] = SHAPExplainer()
    
    # Initialize per-station feature engines
    for sid in STATIONS:
        app_state["feature_engines"][sid] = FeatureEngine()
    
    import os
    if not os.getenv("DISABLE_SIMULATOR"):
        # Start simulator
        simulator = RealDataSimulator()
        simulator.load_data()
        app_state["simulator"] = simulator
        
        # Launch simulation loop
        asyncio.create_task(simulator.run(on_update=process_station_updates))
        logger.info("Simulator initialized and running.")
    else:
        logger.info("Simulator disabled via environment variable.")

    # Initialize MQTT (Use public broker so local hardware can route to Render)
    mqtt_broker = os.getenv("MQTT_BROKER", "broker.hivemq.com")
    mqtt_handler = MQTTHandler(broker=mqtt_broker, port=1883)
    if mqtt_handler.is_available():
        mqtt_handler.connect(on_telemetry=process_single_telemetry)
    app_state["mqtt"] = mqtt_handler
    
    logger.info("All subsystems initialized. Simulator running.")
    logger.info("Dashboard API: http://localhost:8000/docs")
    logger.info("WebSocket: ws://localhost:8000/ws")


@app.on_event("shutdown")
async def shutdown():
    """Clean shutdown."""
    simulator = app_state.get("simulator")
    if simulator:
        simulator.stop()
    
    mqtt = app_state.get("mqtt")
    if mqtt:
        mqtt.disconnect()
        
    logger.info("SkyGuard AI backend shut down.")


import math

def validate_observation(reading: Dict) -> Optional[str]:
    """Basic QC Gate: Returns None if valid, otherwise returns error reason."""
    required = ["temp_c", "pressure_hpa", "humidity_pct", "timestamp"]
    for req in required:
        if req not in reading or reading[req] is None:
            logger.error(f"QC GATE FAIL: Missing field {req}")
            return f"Missing required field: {req}"
        
    for param in ["temp_c", "pressure_hpa", "humidity_pct"]:
        val = reading[param]
        if not isinstance(val, (int, float)):
            return f"Non-numeric value for {param}"
        if math.isnan(val) or math.isinf(val):
            return f"Invalid numeric value (NaN/Inf) for {param}"
            
    ts = reading.get("timestamp")
    if not isinstance(ts, str):
        logger.error(f"QC GATE FAIL: Invalid timestamp {ts}")
        return "Invalid timestamp format (must be string)"
        
    return None

async def process_single_telemetry(station_id: str, payload: Dict):
    """Handle a single telemetry update from MQTT (Hardware Mode)."""
    await process_station_updates({station_id: payload}, app_state["station_histories"])

def get_global_app_state():
    import sys
    if "main" in sys.modules and hasattr(sys.modules["main"], "app_state"):
        if sys.modules["main"].app_state.get("ensemble") is not None:
            return sys.modules["main"].app_state
    return app_state

async def process_station_updates(
    all_readings: Dict[str, Dict],
    station_histories: Dict[str, deque],
):
    """
    Main processing pipeline called by the simulator for each timestep.
    """
    state = get_global_app_state()
    ensemble: EnsembleDetector = state["ensemble"]
    decision_engine: DecisionEngine = state["decision_engine"]
    health_monitor: SensorHealthMonitor = state["health_monitor"]
    explainer: SHAPExplainer = state["explainer"]
    ws_manager: WebSocketManager = state["ws_manager"]
    feature_engines: Dict[str, FeatureEngine] = state["feature_engines"]
    
    new_decisions = {}
    
    # â”€â”€ Basic QC Gate â”€â”€
    valid_readings = {}
    fault_decisions = {}
    for sid, reading in all_readings.items():
        err = validate_observation(reading)
        if err:
            fault_decisions[sid] = err
        else:
            valid_readings[sid] = reading

    # Build spatial data snapshot ONLY from valid readings + known good state
    spatial_snapshot = {}
    for sid, reading in valid_readings.items():
        spatial_snapshot[sid] = {
            "temp_c": reading.get("temp_c"),
            "pressure_hpa": reading.get("pressure_hpa"),
            "humidity_pct": reading.get("humidity_pct"),
        }
    for sid in STATIONS:
        if sid not in spatial_snapshot:
            last_good = state["latest_observations"].get(sid)
            if last_good:
                spatial_snapshot[sid] = {
                    "temp_c": last_good.get("temp_c"),
                    "pressure_hpa": last_good.get("pressure_hpa"),
                    "humidity_pct": last_good.get("humidity_pct"),
                }
    
    for station_id, reading in all_readings.items():
        try:
            # If QC Gate failed, handle DATA_COMMUNICATION_FAULT explicitly
            if station_id in fault_decisions:
                err = fault_decisions[station_id]
                decision = {
                    "quality": "DATA_COMMUNICATION_FAULT",
                    "confidence_pct": 99.0,
                    "weighted_pillar_score": 0.0,
                    "S_anomaly": 1.0,
                    "S_event": 0.0,
                    "evidence_summary": f"âš  Basic QC Gate failed: {err}. Sample rejected.",
                    "corrected_observation": None,
                    "pillars": {},
                    "ml_ensemble": {
                        "is_anomaly": True, "ensemble_score": 1.0, "severity": "HIGH",
                        "vae_score": 0, "at_score": 0, "if_score": 0,
                    },
                }
                state["latest_decisions"][station_id] = decision
                new_decisions[station_id] = decision
                await ws_manager.broadcast_station_update(
                    station_id=station_id,
                    observation=reading,
                    decision=decision,
                    explanation=None,
                )
                continue

            # Ensure station history deque exists dynamically
            if station_id not in state["station_histories"]:
                state["station_histories"][station_id] = deque(maxlen=200)

            # Store latest VALID observation
            state["latest_observations"][station_id] = reading
            state["station_histories"][station_id].append(reading)
            
            # 1. Feature engineering
            fe = feature_engines.get(station_id)
            if not fe:
                fe = FeatureEngine()
                feature_engines[station_id] = fe
            
            features = fe.add_reading(
                temp_c=reading.get("temp_c"),
                pressure_hpa=reading.get("pressure_hpa"),
                humidity_pct=reading.get("humidity_pct"),
                hour=reading.get("hour", 12),
                month=reading.get("month", 6),
            )
            
            # 2. ML ensemble detection
            ml_result = {"is_anomaly": False, "ensemble_score": 0, "severity": "NORMAL",
                         "vae_score": 0, "at_score": 0, "if_score": 0,
                         "per_feature_error": [], "confidence_pct": 95}
            
            if features is not None:
                # Build a window from recent features
                recent_features = []
                recent_history = list(state["station_histories"][station_id])
                
                temp_fe = FeatureEngine()
                for r in recent_history[-20:]:
                    f = temp_fe.add_reading(
                        r.get("temp_c", 25), r.get("pressure_hpa", 1013),
                        r.get("humidity_pct", 60), r.get("hour", 12), r.get("month", 6),
                    )
                    if f is not None:
                        recent_features.append(f)
                
                if len(recent_features) >= 8:
                    window = np.array(recent_features[-8:], dtype=np.float32)
                    ml_result = ensemble.detect(window)
            
            # Hackathon Demo Mode: Force the simulator baseline to be NORMAL
            # so the dashboard stays green until the user manually injects a spike.
            if reading.get("source", "") == "kaggle_replay":
                decision = {
                    "is_anomaly": False, 
                    "ensemble_score": 0.1, 
                    "severity": "NORMAL", 
                    "quality": "NORMAL",
                    "evidence_summary": "Simulated normal weather baseline.",
                    "confidence_pct": 98
                }
            else:
                # 3. 4-Pillar decision for MANUAL_INJECT or real hardware
                history = list(state["station_histories"][station_id])
                decision = decision_engine.evaluate(
                    station_id=station_id,
                    current_obs=reading,
                    history=history[:-1],  # Exclude current
                    ml_result=ml_result,
                    all_station_data=spatial_snapshot,
                )
            state["latest_decisions"][station_id] = decision
            new_decisions[station_id] = decision
            
            # 4. SHAP explanation
            explanation = explainer.explain(
                per_feature_error=ml_result.get("per_feature_error", []),
                ml_result=ml_result,
                current_obs=reading,
            )
            state["latest_explanations"][station_id] = explanation
            
            # 5. Sensor health update
            for param in ["temp_c", "pressure_hpa", "humidity_pct"]:
                health_monitor.add_observation(
                    station_id=station_id,
                    sensor=param,
                    primary_value=reading.get(param, 0),
                    secondary_value=reading.get(f"{param}_secondary", reading.get(param, 0)),
                )
            
            health_report = health_monitor.get_health_report(station_id)
            state["latest_health"][station_id] = health_report
            
            # 6. Broadcast via WebSocket
            await ws_manager.broadcast_station_update(
                station_id=station_id,
                observation=reading,
                decision=decision,
                explanation=explanation,
            )
        
        except Exception as e:
            logger.error("Error processing station %s: %s", station_id, e, exc_info=True)
            
    return new_decisions


# â”€â”€â”€ WebSocket Endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time dashboard updates."""
    ws_manager: WebSocketManager = get_global_app_state()["ws_manager"]
    await ws_manager.connect(websocket)
    
    try:
        # Send initial state on connect
        initial_state = {
            "type": "initial_state",
            "stations": {},
            "mode": get_global_app_state().get("mode", "demo"),
        }
        for sid in STATIONS:
            initial_state["stations"][sid] = {
                "observation": get_global_app_state().get("latest_observations", {}).get(sid, {}),
                "decision": get_global_app_state().get("latest_decisions", {}).get(sid, {}),
            }
        await ws_manager.send_to_client(websocket, initial_state)
        
        # Keep connection alive and handle client messages
        while True:
            data = await websocket.receive_text()
            # Handle client commands (scenario activation, etc.)
            try:
                import json
                msg = json.loads(data)
                if msg.get("type") == "activate_scenario":
                    simulator = get_global_app_state().get("simulator")
                    if simulator:
                        simulator.set_scenario(msg.get("scenario_id"))
                elif msg.get("type") == "ping":
                    await ws_manager.send_to_client(websocket, {"type": "pong"})
            except Exception:
                pass
    
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)


# â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )


