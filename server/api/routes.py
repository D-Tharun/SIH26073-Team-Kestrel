"""
SkyGuard AI — API Routes
REST endpoints + WebSocket for the dashboard.
"""
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from server.config import STATIONS, DEMO_SCENARIOS

logger = logging.getLogger("skyguard.api")

router = APIRouter(prefix="/api")


def get_app_state():
    """Get the global app state (injected at startup)."""
    import sys
    # Fix split-brain state if uvicorn started directly in server/ as 'main:app'
    if "main" in sys.modules and hasattr(sys.modules["main"], "app_state"):
        if sys.modules["main"].app_state.get("ensemble") is not None:
            return sys.modules["main"].app_state
            
    from server.main import app_state
    return app_state


import numpy as np

def sanitize_for_json(obj):
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.floating, float)):
        return float(obj)
    elif hasattr(obj, "item"):
        return obj.item()
    elif hasattr(obj, "tolist"):
        return obj.tolist()
    return obj


# ─── Station Endpoints ─────────────────────────────────────────────────

@router.get("/stations")
async def list_stations():
    """List all registered AWS stations with current status."""
    state = get_app_state()
    stations = []
    for sid, config in STATIONS.items():
        latest = state.get("latest_decisions", {}).get(sid, {})
        observation = state.get("latest_observations", {}).get(sid, {})
        
        stations.append({
            "id": sid,
            "name": config["name"],
            "code": config["code"],
            "state": config["state"],
            "district": config["district"],
            "lat": config["lat"],
            "lng": config["lng"],
            "elevation_m": config["elevation_m"],
            "climate_zone": config["climate_zone"],
            "quality": latest.get("quality", "NORMAL"),
            "confidence_pct": latest.get("confidence_pct", 95),
            "current_observation": {
                "temp_c": observation.get("temp_c", 25),
                "pressure_hpa": observation.get("pressure_hpa", 1013),
                "humidity_pct": observation.get("humidity_pct", 60),
                "timestamp": observation.get("timestamp", ""),
            },
        })
    
    return sanitize_for_json({"stations": stations, "count": len(stations)})


@router.get("/stations/{station_id}")
async def get_station_detail(station_id: str):
    """Get detailed status for a specific station."""
    state = get_app_state()
    config = STATIONS.get(station_id)
    if not config:
        # Check alias
        from server.config import STATION_ALIASES
        canonical = STATION_ALIASES.get(station_id)
        if canonical and canonical in STATIONS:
            config = STATIONS[canonical]
        else:
            return {"error": f"Station {station_id} not found"}, 404
    
    decision = state.get("latest_decisions", {}).get(station_id, {})
    observation = state.get("latest_observations", {}).get(station_id, {})
    explanation = state.get("latest_explanations", {}).get(station_id, {})
    health = state.get("latest_health", {}).get(station_id, {})
    
    return sanitize_for_json({
        "station": {
            "id": station_id,
            **config,
        },
        "current_observation": observation,
        "decision": decision,
        "explanation": explanation,
        "sensor_health": health,
    })


@router.get("/stations/{station_id}/history")
async def get_station_history(station_id: str, limit: int = Query(50, le=200)):
    """Get recent observation history for a station."""
    state = get_app_state()
    histories = state.get("station_histories", {})
    history = list(histories.get(station_id, []))[-limit:]
    return {"station_id": station_id, "history": history, "count": len(history)}


@router.get("/stations/{station_id}/decision")
async def get_station_decision(station_id: str):
    """Get latest 4-pillar decision for a station."""
    state = get_app_state()
    decision = state.get("latest_decisions", {}).get(station_id, {})
    return {"station_id": station_id, "decision": decision}


@router.get("/stations/{station_id}/health")
async def get_station_health(station_id: str):
    """Get sensor health report for a station."""
    state = get_app_state()
    health = state.get("latest_health", {}).get(station_id, {})
    return {"station_id": station_id, "health": health}


# ─── System Endpoints ──────────────────────────────────────────────────

@router.get("/system/status")
async def system_status():
    """Get system status."""
    state = get_app_state()
    simulator = state.get("simulator")
    ws_manager = state.get("ws_manager")
    ensemble = state.get("ensemble")
    
    return {
        "status": "running",
        "mode": state.get("mode", "demo"),
        "simulator_running": simulator.is_running if simulator else False,
        "simulator_progress": simulator.progress if simulator else {},
        "websocket_clients": ws_manager.client_count if ws_manager else 0,
        "models_loaded": ensemble.is_loaded if ensemble else False,
        "active_stations": len(STATIONS),
    }


@router.get("/scenarios")
async def list_scenarios():
    """List available demo anomaly scenarios."""
    return {"scenarios": list(DEMO_SCENARIOS.values())}


@router.post("/scenarios/{scenario_id}/activate")
async def activate_scenario(scenario_id: str):
    """Activate a demo anomaly scenario."""
    state = get_app_state()
    simulator = state.get("simulator")
    
    if scenario_id not in DEMO_SCENARIOS and scenario_id != "reset":
        return {"error": f"Unknown scenario: {scenario_id}"}, 404
    
    if simulator:
        if scenario_id == "reset":
            simulator.set_scenario(None)
            return {"status": "reset", "message": "All scenarios deactivated"}
        else:
            simulator.set_scenario(scenario_id)
            return {
                "status": "activated",
                "scenario": DEMO_SCENARIOS[scenario_id],
            }
    
    return {"error": "Simulator not running"}, 503


@router.get("/models/info")
async def model_info():
    """Get information about loaded ML models."""
    state = get_app_state()
    ensemble = state.get("ensemble")
    
    if not ensemble:
        return {"models_loaded": False}
    
    return {
        "models_loaded": ensemble.is_loaded,
        "models": {
            "transformer_vae": {
                "name": "Transformer-VAE",
                "type": "Reconstruction + KL Divergence",
                "weight": 0.45,
                "loaded": ensemble.vae is not None,
            },
            "anomaly_transformer": {
                "name": "Anomaly Transformer",
                "type": "Association Discrepancy",
                "weight": 0.35,
                "loaded": ensemble.anomaly_tf is not None,
            },
            "isolation_forest": {
                "name": "Isolation Forest",
                "type": "Path-Length Isolation",
                "weight": 0.20,
                "loaded": ensemble.isolation_forest is not None,
            },
        },
        "thresholds": ensemble.thresholds,
    }


# ─── Live Weather Endpoint ─────────────────────────────────────────────

@router.get("/live-weather")
@router.post("/live-weather/sync")
async def fetch_live_weather():
    """
    Fetch real-time live atmospheric observation data from Open-Meteo API for all 7 AWS station locations,
    run each through the SkyGuard AI anomaly detection pipeline (Transformer-VAE, Anomaly-Transformer,
    Isolation Forest, 4 Pillars), and broadcast to the dashboard.
    """
    import asyncio
    import requests
    from datetime import datetime
    
    station_ids = list(STATIONS.keys())
    lats = [str(STATIONS[sid]["lat"]) for sid in station_ids]
    lngs = [str(STATIONS[sid]["lng"]) for sid in station_ids]
    
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={','.join(lats)}"
        f"&longitude={','.join(lngs)}"
        f"&current=temperature_2m,relative_humidity_2m,surface_pressure,weather_code,wind_speed_10m"
    )
    
    try:
        resp = await asyncio.to_thread(requests.get, url, timeout=8)
        resp.raise_for_status()
        meteo_data = resp.json()
        if not isinstance(meteo_data, list):
            meteo_data = [meteo_data]
    except Exception as e:
        logger.error("Failed to fetch live weather from Open-Meteo: %s", e)
        return {"error": f"Failed to fetch live weather: {str(e)}"}, 502

    now_iso = datetime.utcnow().isoformat() + "Z"
    all_readings = {}
    
    for sid, m_item in zip(station_ids, meteo_data):
        cur = m_item.get("current", {})
        temp = float(cur.get("temperature_2m", 25.0))
        humidity = float(cur.get("relative_humidity_2m", 60.0))
        pressure = float(cur.get("surface_pressure", 1013.25))
        w_code = int(cur.get("weather_code", 0))
        wind_spd = float(cur.get("wind_speed_10m", 0.0))
        
        all_readings[sid] = {
            "station_id": sid,
            "temp_c": temp,
            "humidity_pct": humidity,
            "pressure_hpa": pressure,
            "weather_code": w_code,
            "wind_speed_kmh": wind_spd,
            "timestamp": now_iso,
            "source": "OPEN_METEO_LIVE",
        }
        
    state = get_app_state()
    try:
        from server.main import process_station_updates
        await process_station_updates(all_readings, state["station_histories"])
    except Exception as e:
        logger.error("Error running processing pipeline for live weather: %s", e)
    
    def sanitize_for_json(obj):
        if isinstance(obj, dict):
            return {k: sanitize_for_json(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_for_json(v) for v in obj]
        elif hasattr(obj, "item"):
            return obj.item()
        return obj

    # Return formatted station status
    result = []
    for sid in station_ids:
        obs = all_readings[sid]
        dec = sanitize_for_json(state.get("latest_decisions", {}).get(sid, {}))
        result.append({
            "id": sid,
            "name": STATIONS[sid]["name"],
            "lat": STATIONS[sid]["lat"],
            "lng": STATIONS[sid]["lng"],
            "current_observation": obs,
            "decision": dec,
            "quality": dec.get("quality", "NORMAL"),
        })
        
    return {
        "status": "success",
        "timestamp": now_iso,
        "source": "Open-Meteo Live API",
        "stations": result,
        "count": len(result),
    }


from pydantic import BaseModel

class TelemetryPayload(BaseModel):
    station_id: str
    temp_c: float
    humidity_pct: float
    pressure_hpa: float

@router.post("/inject")
async def inject_telemetry(payload: TelemetryPayload):
    """
    Inject custom telemetry to test the ML engine in real-time.
    Acts as a virtual edge node.
    """
    import datetime
    from server.config import STATION_ALIASES
    state = get_app_state()

    # Map alias if needed (e.g. New_Delhi_Safdarjung or Delhi_Safdarjung)
    target_sid = payload.station_id
    canonical_sid = STATION_ALIASES.get(target_sid, target_sid)
    
    # Format exactly as the simulator does
    reading = {
        "station_id": target_sid,
        "temp_c": payload.temp_c,
        "humidity_pct": payload.humidity_pct,
        "pressure_hpa": payload.pressure_hpa,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "source": "MANUAL_INJECT",
    }
    
    try:
        from server.main import process_station_updates
        # Process for both target_sid and canonical_sid to ensure all consumers see it
        new_decisions = await process_station_updates({target_sid: reading}, state.get("station_histories", {}))
        if canonical_sid != target_sid:
            reading_canon = dict(reading, station_id=canonical_sid)
            new_decisions.update(await process_station_updates({canonical_sid: reading_canon}, state.get("station_histories", {})))
    except Exception as e:
        logger.error("Error processing manual injection: %s", e)
        return {"error": str(e)}, 500
        
    def sanitize_for_json(obj):
        if isinstance(obj, dict):
            return {k: sanitize_for_json(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_for_json(v) for v in obj]
        elif hasattr(obj, "item"):
            return obj.item()
        return obj
        
    dec = (
        sanitize_for_json(new_decisions.get(target_sid, {}))
        or sanitize_for_json(new_decisions.get(canonical_sid, {}))
    )
    
    return {
        "status": "success",
        "message": "Telemetry injected into ML pipeline",
        "reading": reading,
        "decision": dec,
        "final_quality": dec.get("quality", "NORMAL")
    }


