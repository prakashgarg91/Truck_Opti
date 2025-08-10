#!/usr/bin/env python3
"""Debug file upload to see what's happening"""

import requests
import os

BASE_URL = "http://127.0.0.1:5000"
sample_file_path = "/workspaces/Truck_Opti/sample_sale_orders.csv"

# Test file upload with more debugging
print("🔍 Debugging file upload...")

try:
    with open(sample_file_path, 'rb') as f:
        files = {'file': ('sample_sale_orders.csv', f, 'text/csv')}
        data = {'batch_name': 'Debug_Test'}
        
        print("📤 Sending file upload request...")
        response = requests.post(
            f"{BASE_URL}/sale-orders",
            files=files,
            data=data,
            timeout=60,
            allow_redirects=False  # Don't follow redirects automatically
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        
        if 'Location' in response.headers:
            print(f"Redirect Location: {response.headers['Location']}")
            
        if response.status_code == 302:
            print("Following redirect manually...")
            redirect_url = response.headers.get('Location')
            if redirect_url:
                if redirect_url.startswith('/'):
                    redirect_url = BASE_URL + redirect_url
                
                print(f"Following redirect to: {redirect_url}")
                follow_response = requests.get(redirect_url)
                print(f"Redirect response status: {follow_response.status_code}")
                print("First 500 chars of redirect response:")
                print(follow_response.text[:500])
        else:
            print("First 1000 chars of response:")
            print(response.text[:1000])
            
except Exception as e:
    print(f"❌ Error: {e}")