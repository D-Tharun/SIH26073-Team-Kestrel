"""
SkyGuard AI — MQTT Handler for ESP32 Hardware Integration
"""
import json
import logging
import asyncio
from typing import Dict, Callable, Awaitable, Optional

logger = logging.getLogger("skyguard.mqtt")

# paho-mqtt is optional — only needed for hardware mode
try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False
    logger.info("paho-mqtt not installed — hardware mode disabled, software demo available")


class MQTTHandler:
    """
    Handles MQTT communication with ESP32 weather stations.
    
    Subscribes to: skyguard/{station_id}/telemetry
    Publishes to:  skyguard/{station_id}/command
    """
    
    def __init__(self, broker: str = "localhost", port: int = 1883,
                 topic_prefix: str = "skyguard"):
        self.broker = broker
        self.port = port
        self.topic_prefix = topic_prefix
        self._client: Optional[object] = None
        self._on_telemetry: Optional[Callable] = None
        self._connected = False
    
    def is_available(self) -> bool:
        return MQTT_AVAILABLE
    
    def connect(self, on_telemetry: Callable[[str, Dict], Awaitable] = None):
        """Connect to MQTT broker."""
        if not MQTT_AVAILABLE:
            logger.warning("paho-mqtt not installed — MQTT disabled")
            return False
        
        self._on_telemetry = on_telemetry
        
        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        self._client.on_disconnect = self._on_disconnect
        
        try:
            self._client.connect(self.broker, self.port, 60)
            self._client.loop_start()
            logger.info("Connecting to MQTT broker at %s:%d", self.broker, self.port)
            return True
        except Exception as e:
            logger.error("Failed to connect to MQTT broker: %s", e)
            return False
    
    def disconnect(self):
        """Disconnect from MQTT broker."""
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            self._connected = False
    
    def _on_connect(self, client, userdata, flags, rc, properties=None):
        """MQTT connection callback."""
        if rc == 0:
            self._connected = True
            topic = f"{self.topic_prefix}/+/telemetry"
            client.subscribe(topic)
            logger.info("MQTT connected. Subscribed to: %s", topic)
        else:
            logger.error("MQTT connection failed with code %d", rc)
    
    def _on_disconnect(self, client, userdata, flags, rc, properties=None):
        self._connected = False
        logger.warning("MQTT disconnected (rc=%d)", rc)
    
    def _on_message(self, client, userdata, msg):
        """Handle incoming MQTT telemetry message."""
        try:
            topic_parts = msg.topic.split("/")
            if len(topic_parts) >= 3 and topic_parts[2] == "telemetry":
                station_id = topic_parts[1]
                payload = json.loads(msg.payload.decode("utf-8"))
                
                logger.debug("MQTT telemetry from %s: %s", station_id, payload)
                
                if self._on_telemetry:
                    # Schedule the async callback
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.ensure_future(self._on_telemetry(station_id, payload))
        except Exception as e:
            logger.error("Error processing MQTT message: %s", e)
    
    def publish_command(self, station_id: str, command: Dict):
        """Send a command to an ESP32 station."""
        if self._client and self._connected:
            topic = f"{self.topic_prefix}/{station_id}/command"
            self._client.publish(topic, json.dumps(command))
    
    @property
    def connected(self) -> bool:
        return self._connected
