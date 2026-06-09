import httpx, os
r = httpx.get('https://openrouter.ai/api/v1/models', headers={'Authorization': f'Bearer {os.environ["OPENROUTER_API_KEY"]}'})
data = r.json()
for m in data.get('data', []):
    mid = m.get('id', '').lower()
    if 'minimax' in mid:
        print(m['id'], '-', m.get('name', ''))
