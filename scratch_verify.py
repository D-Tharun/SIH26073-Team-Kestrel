import requests
import asyncio
import websockets

url = 'https://sih26073-team-kestrel-1.onrender.com'
vercel_url = 'https://sih-26073-team-kestrel.vercel.app'

def check_http():
    print("--- HTTP Checks ---")
    try:
        r1 = requests.get(vercel_url)
        print(f'Vercel Frontend: HTTP {r1.status_code}')
        
        r2 = requests.get(f'{url}/docs')
        print(f'Render Backend (Docs): HTTP {r2.status_code}')
        
        r3 = requests.get(f'{url}/api/stations')
        print(f'Render Backend (API): HTTP {r3.status_code}')
        if r3.status_code == 200:
            data = r3.json()
            print(f"API returned {len(data.get('stations', []))} stations")
    except Exception as e:
        print(f'HTTP Error: {e}')

async def check_ws():
    print("\n--- WebSocket Checks ---")
    try:
        ws_url = 'wss://sih26073-team-kestrel-1.onrender.com/ws'
        async with websockets.connect(ws_url) as websocket:
            print('WebSocket: Connected successfully!')
            msg = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            print(f'WebSocket received message snippet: {msg[:100]}...')
    except Exception as e:
        print(f'WebSocket Error: {e}')

check_http()
asyncio.run(check_ws())
