# SkyGuard AI — Hardware Wiring & Backend Integration Guide
## Dual BME280 + ESP32 Microcontroller Integration with SkyGuard AI Backend

---

## 1. Overview & Hardware Architecture

The SkyGuard AI field sensing node utilizes an **ESP32-WROOM-32D** microcontroller connected to **two physical Bosch BME280 environmental sensors** over a shared I2C bus. 

### Why Dual Sensors?
In mission-critical automated weather stations (AWS), a single sensor failure cannot be distinguished from a sudden microclimatic anomaly. By deploying dual redundant sensors on the same bus with distinct I2C slave addresses:
1. The ESP32 executes on-chip differential cross-checks ($|\Delta T| \le 2.0^\circ\text{C}$).
2. Hardware failures (drift, contamination, pin disconnects) are isolated at the edge.
3. Observations are validated prior to radio transmission, conserving battery and bandwidth.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SKYGUARD SENSING NODE                           │
│                                                                        │
│   ┌───────────────────────────┐      ┌───────────────────────────┐     │
│   │   Bosch BME280 Sensor 1   │      │   Bosch BME280 Sensor 2   │     │
│   │    (Primary - SDO=GND)    │      │   (Redundant - SDO=3V3)   │     │
│   │      I2C Addr: 0x76       │      │      I2C Addr: 0x77       │     │
│   └─────────────┬─────────────┘      └─────────────┬─────────────┘     │
│                 │                                  │                   │
│                 │           Shared I2C Bus         │                   │
│                 │      (SDA=GPIO21, SCL=GPIO22)    │                   │
│                 └─────────────────┬────────────────┘                   │
│                                   │                                    │
│                     ┌─────────────▼──────────────┐                     │
│                     │    ESP32-WROOM-32D MCU     │                     │
│                     │  • Edge QC Validation      │                     │
│                     │  • Deep Sleep Management   │                     │
│                     │  • WiFi & MQTT Client      │                     │
│                     └─────────────┬──────────────┘                     │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │ WiFi / MQTT (Port 1883)
                                    ▼
                     ┌─────────────────────────────┐
                     │    MQTT Broker (Mosquitto)  │
                     └──────────────┬──────────────┘
                                    │ Subscribed: skyguard/+/telemetry
                                    ▼
                     ┌─────────────────────────────┐
                     │ SkyGuard AI FastAPI Backend │
                     │ • Feature Engineering (22D) │
                     │ • Triple ML Ensemble        │
                     │ • 4-Pillar Decision Engine  │
                     └──────────────┬──────────────┘
                                    │ WebSocket (/ws)
                                    ▼
                     ┌─────────────────────────────┐
                     │ React 19 Command Center UI  │
                     └─────────────────────────────┘
```

---

## 2. Bill of Materials (BOM)

| Item | Component | Specification | Quantity | Purpose |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **ESP32 DevKit** | ESP32-WROOM-32D (30-pin or 38-pin) | 1 | Microcontroller running Edge QC & MQTT client |
| **2** | **Sensor 1** | Bosch BME280 Breakout (6-pin or 4-pin) | 1 | Primary Temperature, Humidity, Pressure sensor |
| **3** | **Sensor 2** | Bosch BME280 Breakout (6-pin or 4-pin) | 1 | Secondary Redundant sensor for consensus |
| **4** | **Breadboard / PCB** | Half-size solderless breadboard or perfboard | 1 | Component mounting |
| **5** | **Jumper Wires** | Male-to-Male / Male-to-Female | 10–12 | Circuit interconnects |
| **6** | **Pull-Up Resistors** | $4.7\,\text{k}\Omega$ (Optional for long wires $>20\,\text{cm}$) | 2 | I2C SDA and SCL bus line stabilization |
| **7** | **Power Supply** | Micro-USB Cable (5V 1A) or 3.7V 18650 LiPo | 1 | System power |

> [!IMPORTANT]
> **Logic Level & Voltage Warning**: The ESP32 and Bosch BME280 operate strictly at **3.3V logic**. Connect VCC only to the **3V3** pin of the ESP32. Do **NOT** connect the BME280 to the **VIN / 5V** pin unless your breakout board includes an onboard 3.3V low-dropout (LDO) regulator.

---

## 3. Detailed Pin-to-Pin Wiring Diagram

### 3.1 I2C Address Assignment Mechanism
Both BME280 sensors share the exact same I2C data lines (`SDA` on GPIO 21 and `SCL` on GPIO 22). To avoid I2C bus collision, the sensors are configured with different hardware addresses via their **`SDO` (Serial Data Out / Address)** pin:

* **Sensor 1 (Address `0x76`)**: Connect `SDO` to **`GND`**.
* **Sensor 2 (Address `0x77`)**: Connect `SDO` to **`3V3`**.
* **`CSB` (Chip Select Bar)**: On 6-pin breakout boards, connect `CSB` to **`3V3`** to force I2C mode (disables SPI mode).

### 3.2 Master Connection Matrix

| ESP32 Pin | Wire Color (Standard) | Sensor 1 (BME280 Primary) | Sensor 2 (BME280 Redundant) | Signal Description |
| :--- | :---: | :--- | :--- | :--- |
| **3V3** | Red | **VCC** | **VCC** | 3.3V Power Rail |
| **GND** | Black | **GND** | **GND** | Ground Rail |
| **GPIO 21** | Blue / Green | **SDA** | **SDA** | I2C Serial Data (Shared) |
| **GPIO 22** | Yellow | **SCL** | **SCL** | I2C Serial Clock (Shared) |
| **GND** | Black | **SDO** | *(Leave unconnected or to 3V3)* | Sets I2C Address to **`0x76`** |
| **3V3** | Red | *(Leave to GND)* | **SDO** | Sets I2C Address to **`0x77`** |
| **3V3** | Orange | **CSB** *(if present)* | **CSB** *(if present)* | Forces I2C communication mode |

### 3.3 Visual Circuit ASCII Schematic

```
                          ESP32-WROOM-32D
                        ┌─────────────────┐
                        │                 │
                  3V3 ──┤ [3V3]     [GND] ├── GND
                        │                 │
              GPIO 21 ──┤ [D21]     [D22] ├── GPIO 22 (SCL)
               (SDA)    │                 │
                        └─────────────────┘
                           │   │    │   │
           ┌───────────────┘   │    │   └────────────────┐
           │                   │    │                    │
           │      ┌────────────┘    └────────────┐       │
           │      │                              │       │
           ▼      ▼                              ▼       ▼
    ┌──────────────────────────┐          ┌──────────────────────────┐
    │  BME280 - SENSOR 1       │          │  BME280 - SENSOR 2       │
    │  (Primary Address 0x76)  │          │  (Backup Address 0x77)   │
    ├──────────────────────────┤          ├──────────────────────────┤
    │ VCC  ◄── 3V3 Rail        │          │ VCC  ◄── 3V3 Rail        │
    │ GND  ◄── GND Rail        │          │ GND  ◄── GND Rail        │
    │ SCL  ◄── GPIO 22         │          │ SCL  ◄── GPIO 22         │
    │ SDA  ◄── GPIO 21         │          │ SDA  ◄── GPIO 21         │
    │ CSB  ◄── 3V3 (I2C Mode)  │          │ CSB  ◄── 3V3 (I2C Mode)  │
    │ SDO  ◄── GND (0x76)      │          │ SDO  ◄── 3V3 (0x77)      │
    └──────────────────────────┘          └──────────────────────────┘
```

---

## 4. Power Management & Field Deployment (AWS Operations)

For real field automated weather stations, continuous WiFi operation depletes a battery in under 12 hours. SkyGuard AI implements an **ultra-low-power duty cycle**:

1. **Wake Up**: ESP32 boots via internal RTC timer.
2. **Read Sensors**: Samples Sensor 1 and Sensor 2 over I2C ($\approx 50\,\text{ms}$).
3. **Edge QC Check**: Evaluates consensus, bounds, and frozen bit status ($\approx 10\,\text{ms}$).
4. **Transmit**: Connects to WiFi, publishes MQTT telemetry payload ($\approx 1.5\text{–}3\,\text{seconds}$).
5. **Deep Sleep**: Shuts down WiFi, CPU, and peripherals, entering deep sleep ($\approx 10\mu\text{A}$) for 10 minutes (`SLEEP_SECONDS = 600`).

### Battery Life Calculation (2500mAh 18650 Li-Ion Cell)
* Active current: $150\,\text{mA}$ for 3 seconds per cycle.
* Sleep current: $0.015\,\text{mA}$ for 597 seconds per cycle.
* Average current: $\approx 0.76\,\text{mA}$.
* **Estimated Runtime**: **Over 3,200 hours ($\approx 4.5\text{ months}$)** on a single 18650 cell without solar recharging.

---

## 5. Firmware Configuration & Flashing

The firmware is located in your codebase at:
📄 **[`server/hardware/esp32_firmware.ino`](file:///d:/testing/server/hardware/esp32_firmware.ino)**

### 5.1 Required Arduino IDE Libraries
Install via **Arduino IDE Library Manager** (`Ctrl + Shift + I`):
1. `Adafruit BME280 Library` (by Adafruit)
2. `Adafruit Unified Sensor` (by Adafruit)
3. `PubSubClient` (by Nick O'Leary)
4. `ArduinoJson` (by Benoît Blanchon, version 6.x or 7.x)

### 5.2 Board Configuration
* **Board**: `ESP32 Dev Module` (or `DOIT ESP32 DEVKIT V1`)
* **Upload Speed**: `921600` (or `115200`)
* **Flash Frequency**: `80MHz`
* **Port**: Select your Silicon Labs / CH340 COM port (e.g., `COM3`, `COM4`)

### 5.3 Configuring Network & Broker Settings
Open `server/hardware/esp32_firmware.ino` and update the configuration section:

```cpp
// --- Configuration ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";          // Your 2.4 GHz WiFi Network
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";      // WiFi Password

// IP Address of the host machine running the SkyGuard backend and MQTT broker
const char* MQTT_BROKER = "192.168.1.100";        // Replace with your PC's LAN IP
const int MQTT_PORT = 1883;

// Station Identifier matching server/config.py STATIONS dictionary:
// Options: "Chennai_Meenambakkam", "Jaisalmer_Sam", "RJ_BARMER_002",
//          "Delhi_Safdarjung", "DL_PALAM_004", "KA_BLR_005", "ML_SHL_007"
const char* STATION_ID = "Jaisalmer_Sam";

const int SLEEP_SECONDS = 600; // 10 minutes between telemetry transmissions
```

---

## 6. Backend Integration: MQTT Broker & FastAPI Setup

To bridge physical hardware telemetry into the SkyGuard AI decision pipeline, follow these 3 steps:

### Step 1: Install & Run MQTT Broker (Mosquitto)

#### Option A: Windows Native (Recommended)
1. Install Eclipse Mosquitto:
   ```powershell
   winget install EclipseFoundation.Mosquitto
   ```
2. Navigate to Mosquitto installation directory (typically `C:\Program Files\mosquitto`).
3. Ensure `mosquitto.conf` contains:
   ```conf
   listener 1883
   allow_anonymous true
   ```
4. Start Mosquitto:
   ```powershell
   & "C:\Program Files\mosquitto\mosquitto.exe" -v -c "C:\Program Files\mosquitto\mosquitto.conf"
   ```

#### Option B: Docker
```bash
docker run -d --name skyguard-mqtt -p 1883:1883 eclipse-mosquitto
```

---

### Step 2: Install Backend Dependencies

Activate your Python virtual environment and ensure `paho-mqtt` is installed:

```powershell
cd d:\testing
# Activate existing virtual environment
.\venv\Scripts\Activate.ps1

# Install MQTT client and backend requirements
pip install paho-mqtt fastapi uvicorn torch scikit-learn
```

---

### Step 3: Start the SkyGuard AI Backend

Start the FastAPI application:

```powershell
cd d:\testing
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

When started, `server.main` automatically initializes:
1. `MQTTHandler` subscribing to `skyguard/+/telemetry`.
2. `EnsembleDetector` with pre-trained PyTorch Transformer-VAE weights.
3. `DecisionEngine` ready to process 4-pillar evaluations.
4. `WebSocketManager` broadcasting live updates to connected frontends.

---

## 7. Telemetry Packet Schema & Ingestion Flow

### 7.1 ESP32 Output Payload
When the ESP32 samples the sensors, it serializes a JSON packet published to topic:
`skyguard/{STATION_ID}/telemetry`

**Example JSON Payload:**
```json
{
  "station_id": "Jaisalmer_Sam",
  "timestamp": "auto",
  "temperature": 34.25,
  "humidity": 21.80,
  "pressure": 986.40,
  "hardware_qc": "pass"
}
```

* `temperature`: Calibrated average of Sensor 1 and Sensor 2 ($^\circ\text{C}$).
* `humidity`: Calibrated relative humidity ($\%RH$).
* `pressure`: Barometric station pressure ($\text{hPa}$).
* `hardware_qc`: `"pass"` if $|\text{Sensor}_1 - \text{Sensor}_2| \le 2.0^\circ\text{C}$; `"fail"` if divergence exceeds tolerance.

### 7.2 Backend Ingestion Route ([`server/main.py`](file:///d:/testing/server/main.py))
When `MQTTHandler` receives this packet:
1. It automatically assigns the server-side microsecond timestamp.
2. Appends the observation to that station's historical rolling FIFO buffer (`station_histories[station_id]`).
3. Computes the **22 engineered features** in `FeatureEngine`.
4. Runs inference across **Transformer-VAE**, **Anomaly Transformer**, and **Isolation Forest**.
5. Submits results to the **4-Pillar Decision Engine** (Temporal, Multivariate, Physics, Spatial).
6. Pushes the synthesized decision and sensor health to the web frontend over **WebSocket** (`ws://localhost:8000/ws`).

---

## 8. Verification & End-to-End Testing

### Test 1: I2C Bus Address Diagnostic (Hardware Check)
Upload a standard Arduino I2C Scanner sketch to verify the physical wiring before flashing the main firmware. The Serial Monitor output must show:

```text
Scanning I2C bus...
I2C device found at address 0x76 !  (BME280 Sensor 1)
I2C device found at address 0x77 !  (BME280 Sensor 2)
done. Found 2 devices.
```

### Test 2: ESP32 Serial Monitor Output
Open Arduino Serial Monitor at **115200 baud**. You should observe:

```text
SkyGuard AI - ESP32 Node Booting...
BME280 Sensor 1 (0x76) initialized.
BME280 Sensor 2 (0x77) initialized.
Connecting to WiFi: MyHomeNetwork......
WiFi connected. IP address: 192.168.1.145
Connecting to MQTT broker...connected.
Sensor 1 -> T: 29.40°C, RH: 73.20%, P: 1007.30 hPa
Sensor 2 -> T: 29.50°C, RH: 72.90%, P: 1007.20 hPa
Edge QC: Delta T = 0.10°C (PASS)
Publishing to skyguard/Jaisalmer_Sam/telemetry: 
{"station_id":"Jaisalmer_Sam","timestamp":"auto","temperature":29.45,"humidity":73.05,"pressure":1007.25,"hardware_qc":"pass"}
Entering deep sleep for 600 seconds.
```

### Test 3: Command Line MQTT Verification
On your computer terminal, subscribe to the telemetry topic using Mosquitto tools:
```powershell
mosquitto_sub -h localhost -p 1883 -t "skyguard/+/telemetry" -v
```
You will see the raw JSON string arriving every time the ESP32 transmits.

### Test 4: Live Verification on Command Center UI
1. Run the frontend:
   ```powershell
   cd d:\testing
   npm run dev
   ```
2. Open `http://localhost:3000` in your browser.
3. In the top navigation bar, toggle **Data Mode** from `Demo` to **`Live`**.
4. The station marker corresponding to `STATION_ID` (e.g., Jaisalmer Sam Dunes) will immediately update in real time with telemetry from your physical hardware.

---

## 9. Troubleshooting Guide

| Issue / Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **"Warning: BME280 Sensor 2 (0x77) not found"** | SDO pin of Sensor 2 is floating or tied to GND. | Connect SDO of Sensor 2 securely to **3V3**. |
| **"CRITICAL: No sensors detected"** | SDA / SCL lines reversed, or poor breadboard contact. | Swap GPIO 21 (SDA) and GPIO 22 (SCL). Verify 3.3V power rails with a multimeter. |
| **ESP32 repeatedly restarts (Brownout detector)** | WiFi current spike ($>200\text{mA}$) causes voltage sag on USB port. | Connect ESP32 to an external 5V 1A powered USB hub or add a $100\mu\text{F}$ capacitor across 3V3 and GND. |
| **MQTT `rc=-2` (Connection Failed)** | Wrong IP address or firewall blocking port 1883. | Check your host PC IP using `ipconfig`. Ensure Windows Defender Firewall allows inbound TCP traffic on port 1883. |
| **Sensors report 0°C or 100% RH** | Sensor breakout is in SPI mode instead of I2C. | Tie the **CSB** pin of both sensors to **3V3**. |
| **Backend logs: `paho-mqtt not installed`** | Missing Python MQTT client package in virtual environment. | Run `pip install paho-mqtt` in `d:\testing\venv`. |

---

## 10. Summary Documentation File Location
This complete hardware wiring and integration specification is saved permanently in your workspace at:
📄 **[`d:\testing\HARDWARE_WIRING_AND_BACKEND_INTEGRATION.md`](file:///d:/testing/HARDWARE_WIRING_AND_BACKEND_INTEGRATION.md)**
Also review:
* Firmware Code: [`server/hardware/esp32_firmware.ino`](file:///d:/testing/server/hardware/esp32_firmware.ino)
* Backend Ingestion Handler: [`server/streaming/mqtt_handler.py`](file:///d:/testing/server/streaming/mqtt_handler.py)
* Backend Main Application: [`server/main.py`](file:///d:/testing/server/main.py)
