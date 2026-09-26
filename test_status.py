import requests
r = requests.get('https://sih26073-team-kestrel.onrender.com/api/system/status')
print(r.json())
