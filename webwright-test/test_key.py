import os
key = os.environ.get("OPENROUTER_API_KEY", "")
print(f"Full key length: {len(key)}")
print(f"Key: {key[:20]}...{key[-20:]}")
# Try just the first key (typically ~64 chars)
first_key = key[:52]  # sk-or-v1- + 44 hex chars
print(f"\nFirst 52 chars: {first_key}")
import httpx
r = httpx.get(
    'https://openrouter.ai/api/v1/models',
    headers={'Authorization': f'Bearer {first_key}'}
)
print(f"First key test: {r.status_code}")
