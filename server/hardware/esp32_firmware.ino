/**
 * SkyGuard AI — ESP32 Edge Sensing Node
 * 
 * Hardware: uPesy ESP32-C3 Mini + Dual BME280 Sensors (I2C)
 * Description: Reads temperature, humidity, and pressure from two redundant BME280 sensors.
 * Performs edge QC checks and transmits the primary (or average) reading over MQTT.
 * Utilizes deep sleep to conserve power between readings.
 */
// *** HARDWARE STATUS: NOT PHYSICALLY TESTED ***
// This firmware is written for the intended uPesy ESP32-C3 Mini target.
// Physical validation of I2C communication, sensor readings, and MQTT
// transmission has NOT been performed yet.

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <ArduinoJson.h>

// --- Configuration ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

const char* MQTT_BROKER = "192.168.1.100"; // IP address of the SkyGuard Backend MQTT broker
const int MQTT_PORT = 1883;
const char* STATION_ID = "STATION_1";

const int SLEEP_SECONDS = 600; // Sleep for 10 minutes between readings

// --- Globals ---
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Initialize two BME280 sensors on the same I2C bus with different addresses
Adafruit_BME280 bme1; // Expected address: 0x76
Adafruit_BME280 bme2; // Expected address: 0x77

bool bme1_status = false;
bool bme2_status = false;

void setup() {
  Serial.begin(115200);
  delay(10);
  
  Serial.println("\nSkyGuard AI - ESP32 Node Booting...");

  // Initialize sensors
  Wire.begin(6, 7); // SDA=GPIO6, SCL=GPIO7 (uPesy ESP32-C3 Mini)
  
  bme1_status = bme1.begin(0x76, &Wire);
  if (!bme1_status) {
    Serial.println("Warning: BME280 Sensor 1 (0x76) not found.");
  }
  
  bme2_status = bme2.begin(0x77, &Wire);
  if (!bme2_status) {
    Serial.println("Warning: BME280 Sensor 2 (0x77) not found.");
  }

  if (!bme1_status && !bme2_status) {
    Serial.println("CRITICAL: No sensors detected. Halting.");
    enterDeepSleep();
  }

  // Connect to WiFi
  setupWiFi();

  // Configure MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  // Take readings, transmit, and sleep
  processAndTransmit();
  enterDeepSleep();
}

void loop() {
  // Loop is empty because we use deep sleep in setup()
}

void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected.");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed. Going to sleep.");
    enterDeepSleep();
  }
}

bool connectMQTT() {
  int attempts = 0;
  while (!mqttClient.connected() && attempts < 3) {
    Serial.print("Connecting to MQTT broker...");
    
    // Create a random client ID
    String clientId = "SkyGuard-ESP32-";
    clientId += String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected.");
      return true;
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 2 seconds...");
      delay(2000);
      attempts++;
    }
  }
  return false;
}

void processAndTransmit() {
  if (!connectMQTT()) {
    Serial.println("Failed to connect to MQTT broker. Aborting transmission.");
    return;
  }

  float t1 = NAN, h1 = NAN, p1 = NAN;
  float t2 = NAN, h2 = NAN, p2 = NAN;

  // Read Sensor 1
  if (bme1_status) {
    t1 = bme1.readTemperature();
    h1 = bme1.readHumidity();
    p1 = bme1.readPressure() / 100.0F; // Convert Pa to hPa (mbar)
  }

  // Read Sensor 2
  if (bme2_status) {
    t2 = bme2.readTemperature();
    h2 = bme2.readHumidity();
    p2 = bme2.readPressure() / 100.0F;
  }

  // Edge QC & Aggregation
  float final_t = 0, final_h = 0, final_p = 0;
  bool primary_fault = false;
  
  // Simple edge QC: If both are active, check variance. 
  // If variance is too high (> 2 degrees), flag potential fault but use average.
  if (bme1_status && bme2_status) {
      if (abs(t1 - t2) > 2.0) primary_fault = true;
      final_t = (t1 + t2) / 2.0;
      final_h = (h1 + h2) / 2.0;
      final_p = (p1 + p2) / 2.0;
  } else if (bme1_status) {
      final_t = t1; final_h = h1; final_p = p1;
  } else if (bme2_status) {
      final_t = t2; final_h = h2; final_p = p2;
  }

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["station_id"] = STATION_ID;
  doc["timestamp"] = "auto"; // Backend will assign timestamp if "auto"
  doc["temperature"] = final_t;
  doc["humidity"] = final_h;
  doc["pressure"] = final_p;
  if (bme1_status) {
    doc["temp_primary"] = t1;
    doc["humidity_primary"] = h1;
    doc["pressure_primary"] = p1;
  }
  if (bme2_status) {
    doc["temp_secondary"] = t2;
    doc["humidity_secondary"] = h2;
    doc["pressure_secondary"] = p2;
  }
  doc["hardware_qc"] = primary_fault ? "fail" : "pass";

  char jsonBuffer[512];
  serializeJson(doc, jsonBuffer);

  // Publish to topic
  String topic = String("skyguard/") + STATION_ID + "/telemetry";
  Serial.print("Publishing to ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(jsonBuffer);

  mqttClient.publish(topic.c_str(), jsonBuffer);
  
  // Allow time for message transmission
  mqttClient.loop();
  delay(100); 
}

void enterDeepSleep() {
  Serial.print("Entering deep sleep for ");
  Serial.print(SLEEP_SECONDS);
  Serial.println(" seconds.");
  
  // Disconnect WiFi and MQTT cleanly
  if (mqttClient.connected()) mqttClient.disconnect();
  if (WiFi.status() == WL_CONNECTED) WiFi.disconnect(true);
  
  esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}
