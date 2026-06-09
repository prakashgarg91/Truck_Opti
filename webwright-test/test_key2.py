import os, httpx
key = os.environ.get("OPENROUTER_API_KEY", "").strip()
# Find the split point - OpenRouter keys are 'sk-or-v1-' + hex chars
# Check common lengths: 52, 56, 64
for length in [52, 56, 60, 64, 68]:
    test_key = key[:length]
    r = httpx.get(
        'https://openrouter.ai/api/v1/models',
        headers={'Authorization': f'Bearer {test_key}'}
    )
    marker = "OK" if r.status_code == 200 else "FAIL"
    print(f"Length {length}: {marker} ({r.status_code}) key={test_key[:15]}...{test_key[-5:]}")
