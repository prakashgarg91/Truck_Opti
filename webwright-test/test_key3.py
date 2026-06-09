import os, httpx, json
key = os.environ.get("OPENROUTER_API_KEY", "").strip()

for length in [52, 56, 60, 64, 68, 72]:
    test_key = key[:length]
    try:
        r = httpx.post(
            'https://openrouter.ai/api/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {test_key}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'minimax/minimax-m3',
                'messages': [{'role': 'user', 'content': 'Say hi'}],
                'max_tokens': 10
            },
            timeout=30
        )
        status = r.status_code
        if status == 200:
            data = r.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            print(f"Length {length}: OK - {content[:50]}")
            break
        else:
            error_msg = r.json().get('error', {}).get('message', r.text[:100])
            print(f"Length {length}: FAIL ({status}) - {error_msg[:80]}")
    except Exception as e:
        print(f"Length {length}: ERROR - {e}")
