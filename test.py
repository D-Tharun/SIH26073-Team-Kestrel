import requests
r = requests.get('https://sih26073-team-kestrel.onrender.com/api/stations')
for s in r.json()['stations']: print(f"{s['id']}: {s['quality']}")
