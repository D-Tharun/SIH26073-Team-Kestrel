# SkyGuard AI — ESP32 Hardware Integration

## Wiring Diagram

This document outlines the wiring for the SkyGuard AI edge sensing node using an ESP32 microcontroller and two BME280 environment sensors for redundancy.

### Components Needed
1.  **ESP32 Development Board** (e.g., ESP32-WROOM-32D)
2.  **2x BME280 Sensors** (Temperature, Humidity, Pressure)
3.  **Breadboard & Jumper Wires**
4.  **Power Supply** (5V Micro USB or 3.3V battery pack)

### Pinout Connections

The BME280 sensors communicate over the I2C bus. We will connect both sensors to the same I2C bus (SDA/SCL pins).
**Important**: You must change the I2C address of one of the BME280 sensors to avoid conflicts. Usually, this is done by connecting the SDO pin of one sensor to VCC (0x77) and the other to GND (0x76).

| ESP32 Pin | Sensor 1 (BME280, Addr: 0x76) | Sensor 2 (BME280, Addr: 0x77) | Description |
| :--- | :--- | :--- | :--- |
| **3V3** | VCC | VCC | 3.3V Power |
| **GND** | GND | GND | Ground |
| **GPIO 21** | SDA | SDA | I2C Data Line |
| **GPIO 22** | SCL | SCL | I2C Clock Line |
| **GND** | SDO | - | Sets address to 0x76 |
| **3V3** | - | SDO | Sets address to 0x77 |

### Power Considerations
- The ESP32 and BME280 sensors operate at 3.3V logic levels. Do NOT connect the sensors to the 5V output unless your breakout board specifically has a level shifter.
- To use deep sleep and wake-up cycles on battery power, you may need a battery management module.

### Setup Instructions
1.  Connect the components according to the table above.
2.  Install the required Arduino libraries: `Adafruit BME280 Library`, `Adafruit Unified Sensor`, `PubSubClient`, and `ArduinoJson`.
3.  Flash the `esp32_firmware.ino` onto your ESP32.
4.  The ESP32 will connect to WiFi, read the dual sensors, perform edge quality control, and publish the telemetry to your MQTT broker.

### Complete Technical Guide
For the full end-to-end guide including MQTT broker configuration, Mosquitto setup, packet schemas, deep-sleep battery calculations, and live FastAPI backend integration, see:
👉 [HARDWARE_WIRING_AND_BACKEND_INTEGRATION.md](../../HARDWARE_WIRING_AND_BACKEND_INTEGRATION.md)

