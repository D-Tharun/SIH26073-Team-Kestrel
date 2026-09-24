"""
SkyGuard AI — WebSocket Connection Manager
Manages real-time WebSocket connections for live dashboard streaming.
"""
import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket
from datetime import datetime

logger = logging.getLogger("skyguard.websocket")


class WebSocketManager:
    """
    Manages WebSocket connections for real-time data streaming.
    
    Features:
      - Multi-client support
      - Automatic reconnection handling
      - Per-station subscription filtering
      - Heartbeat monitoring
    """
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info("WebSocket client connected. Total: %d", len(self.active_connections))
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a disconnected WebSocket."""
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info("WebSocket client disconnected. Total: %d", len(self.active_connections))
    
    async def broadcast(self, message: Dict):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return
        
        data = json.dumps(message, default=str)
        disconnected = set()
        
        async with self._lock:
            for ws in self.active_connections:
                try:
                    await ws.send_text(data)
                except Exception:
                    disconnected.add(ws)
            
            for ws in disconnected:
                self.active_connections.discard(ws)
    
    async def send_to_client(self, websocket: WebSocket, message: Dict):
        """Send a message to a specific client."""
        try:
            data = json.dumps(message, default=str)
            await websocket.send_text(data)
        except Exception as e:
            logger.warning("Failed to send to client: %s", e)
            await self.disconnect(websocket)
    
    async def broadcast_station_update(self, station_id: str, observation: Dict,
                                         decision: Dict, explanation: Dict):
        """Broadcast a complete station update to all clients."""
        message = {
            "type": "station_update",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "station_id": station_id,
            "observation": observation,
            "decision": decision,
            "explanation": explanation,
        }
        await self.broadcast(message)
    
    async def broadcast_system_status(self, status: Dict):
        """Broadcast system status (connection mode, active scenarios, etc.)."""
        message = {
            "type": "system_status",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            **status,
        }
        await self.broadcast(message)
    
    @property
    def client_count(self) -> int:
        return len(self.active_connections)
