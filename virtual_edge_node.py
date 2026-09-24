import requests
import json
import time

API_URL = "http://localhost:8000/api/inject"

def send_telemetry():
    print("="*60)
    print("📡 SkyGuard V2 Virtual Edge Node Simulator")
    print("="*60)
    print("This script acts as the ESP32 hardware, sending live data to the server.")
    print("The server will instantly run it through the ML Ensemble and 4 Pillars.\n")
    
    station_id = input("Enter Station ID (e.g., Chennai_Meenambakkam, Jaisalmer_Sam): ").strip()
    if not station_id:
        station_id = "Chennai_Meenambakkam"
        print(f"Defaulting to {station_id}")
        
    while True:
        try:
            print("\n" + "-"*40)
            temp_str = input(f"[{station_id}] Enter Temperature (°C) [or 'q' to quit]: ")
            if temp_str.lower() == 'q':
                break
                
            temp_c = float(temp_str)
            hum_pct = float(input(f"[{station_id}] Enter Humidity (%): "))
            pres_hpa = float(input(f"[{station_id}] Enter Pressure (hPa): "))
            
            payload = {
                "station_id": station_id,
                "temp_c": temp_c,
                "humidity_pct": hum_pct,
                "pressure_hpa": pres_hpa
            }
            
            print("\nSending payload to SkyGuard Server ML Pipeline...")
            
            start_time = time.time()
            response = requests.post(API_URL, json=payload)
            latency = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                decision = data.get("decision", {})
                quality = data.get("final_quality")
                
                print(f"✅ Success! (Latency: {latency:.1f} ms)")
                print(f"\n🧠 ML & 4-Pillar Engine Output:")
                print(f"   => S_anomaly : {decision.get('S_anomaly', 0):.2f}")
                print(f"   => S_event   : {decision.get('S_event', 0):.2f}")
                print(f"   => Final Quality : {quality}")
                
                # Check if it was caught by a pillar
                pillars = decision.get("pillars", {})
                temporal = pillars.get("temporal", {}).get("status")
                spatial = pillars.get("spatial", {}).get("status")
                
                print(f"   => Temporal Status: {temporal}")
                print(f"   => Spatial Buddy Agreement: {spatial}")
                
                print("\nCheck the React Dashboard! The map and charts should have instantly updated.")
                
            else:
                print(f"❌ Error: Server returned {response.status_code}")
                print(response.text)
                
        except ValueError:
            print("Invalid input! Please enter numbers only.")
        except requests.exceptions.ConnectionError:
            print("❌ Connection Error: Is the FastAPI server running on port 8000?")
            break
        except KeyboardInterrupt:
            break

if __name__ == "__main__":
    send_telemetry()
