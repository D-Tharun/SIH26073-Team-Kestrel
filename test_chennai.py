import requests
r = requests.get('https://sih26073-team-kestrel.onrender.com/api/stations/Chennai_Meenambakkam')
data = r.json()
print("Temp:", data['current_observation']['temp_c'])
print("Decision:", data['decision'].get('quality'))
print("Summary:", data['decision'].get('evidence_summary', '').encode('ascii', 'ignore').decode())
