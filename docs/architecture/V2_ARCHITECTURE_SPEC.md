# SkyGuard V2 Complete Architecture Specification

## 1. System Overview
SkyGuard V2 is an advanced meteorological quality-control system designed to solve the critical disambiguation problem: **distinguishing genuine extreme weather events from localized sensor hardware faults.** 

Unlike standard outlier-detection systems which simply flag statistically unusual data, SkyGuard V2 understands physical meteorology. It uses a hybrid physics-informed machine learning pipeline to ensure that genuine climate anomalies (like heatwaves or sudden storms) are preserved, while transient sensor spikes, drift, and freeze faults are isolated and imputed.

---

## 2. Hardware Layer (Edge Node)
**Target Platform:** uPesy ESP32-C3 Mini
**Sensors:** Dual BME280 Environmental Sensors (I2C Addresses: `0x76`, `0x77`)
**Pinout:**
- SDA: GPIO6
- SCL: GPIO7

### Edge Responsibilities:
1. **Raw Acquisition:** Samples Temperature ($^\circ C$), Humidity ($\%$), and Pressure ($hPa$) sequentially from both sensors.
2. **Payload Generation:** Packages raw values into an uncompressed JSON payload. No complex edge ML is performed to save battery and compute.
3. **Transmission:** Streams data to the central server every 1 second over WiFi/MQTT.

---

## 3. Server Pipeline (Live API Path)
The server ingests the streaming payload and routes it through a sequential pipeline taking approximately ~33ms per observation.

### Phase 1: Feature Engine (`server/models/feature_engine.py`)
Stateful processor that maintains a sliding window (deque) of the last 8 observations.
- Extends the 3 raw variables into **22 thermodynamic and temporal features**.
- **Key Features Extracted:**
  - Vapor Pressure Deficit (VPD)
  - Dewpoint Spread
  - First-order derivatives (Rate of Change)
  - Statistical variance over the window

### Phase 2: Ensemble Detector (ML Layer) (`server/models/ensemble.py`)
Utilizes PyTorch-based neural networks optimized for sequential weather data.
- **Model 1: Transformer-VAE**
  - Learns the latent manifold of normal weather.
  - Outputs a reconstruction error (VAE Score). If the sequence cannot be reconstructed, it is flagged as statistically anomalous.
- **Model 2: Anomaly Transformer**
  - Analyzes attention association discrepancies across the sequence window.
  - Excellent at detecting subtle prolonged drift that a standard VAE might miss.

*Output:* An `ml_result` dictionary containing anomaly flags and normalized severity scores.

### Phase 3: The 4-Pillar Decision Engine (`server/engine/decision_engine.py`)
This is the core scientific contribution of V2. It takes the statistical ML output and contextualizes it using physical laws and spatial networks.

It independently scores the observation across four pillars:

1. **Temporal Pillar**
   - Monitors max rate-of-change (spikes).
   - Monitors variance (flags "frozen" stuck sensors if variance hits 0.0 over time).
2. **Spatial Pillar (The Buddy Check)**
   - Compares the local station's data against nearby "buddy" stations.
   - Calculates $\Delta T$ and $\Delta P$ over geographic distance.
3. **Physics Pillar**
   - Enforces absolute climatological bounds (e.g., $T > 60^\circ C$ is impossible).
   - Enforces Environmental Lapse Rates.
4. **Multivariate Pillar**
   - Evaluates covariant relationships. (e.g., if Temperature spikes by $15^\circ C$, Relative Humidity *must* physically plummet. If both rise simultaneously, it violates thermodynamics).

### Phase 4: Dual-Evidence Resolution
The Decision Engine synthesizes the ML scores and the 4-Pillars into two competing metrics:

- **$S_{anomaly}$ (Evidence of a Fault):** High if physics limits are broken, variance is zero, or ML scores are extremely high.
- **$S_{event}$ (Evidence of a Genuine Event):** High if buddy stations corroborate the anomaly, and multivariate physics remain consistent.

**The Matrix:**
- Low $S_{anomaly}$, Low $S_{event}$ $\rightarrow$ `NORMAL`
- High $S_{anomaly}$, Low $S_{event}$ $\rightarrow$ `SENSOR_FAULT`
- Low $S_{anomaly}$, High $S_{event}$ $\rightarrow$ `GENUINE_EVENT`
- High $S_{anomaly}$, High $S_{event}$ $\rightarrow$ **CONFLICT RESOLUTION**:
  - If Buddy Stations corroborate the severity $\rightarrow$ `GENUINE_EVENT` (It's a massive regional storm).
  - If Buddy Stations contradict (they show normal weather) $\rightarrow$ `SENSOR_FAULT` (It's a local hardware failure).

### Phase 5: Imputation Engine (`server/engine/imputation_engine.py`)
If Phase 4 classifies the data as `SENSOR_FAULT` or `DATA_COMMUNICATION_FAULT` (NaNs), the Imputation Engine activates.
- Replaces the faulty data with a weighted interpolation relying heavily on the spatial buddy station data and historical trends.
- Passes the corrected observation to the frontend dashboard.

---

## 4. Performance Metrics (Compared to V1)
Based on rigorous 3,000-hour synthetic testing on the exact same dataset:
- **False Positive Rate:** Reduced from 22.92% (V1) to **0.57% (V2)**.
- **Precision:** Increased from 14.13% (V1) to **87.79% (V2)**.
- **Event Preservation (GEPR):** 94.29% of extreme genuine events are correctly passed through, solving V1's critical flaw of deleting valid extreme weather. 
- **Event + Fault Accuracy:** 100%. Perfectly isolates localized faults occurring *during* regional extreme weather events.
