#!/usr/bin/env python3
"""
Quick test to analyze form validation behavior
"""

import requests
import json

def test_form_validation():
    base_url = "http://127.0.0.1:5001"
    session = requests.Session()
    
    print("Testing Form Validation Behavior")
    print("="*50)
    
    # Test 1: Valid data
    valid_data = {
        "name": "Valid Test Truck",
        "length": 500,
        "width": 200,
        "height": 200,
        "max_weight": 10000
    }
    
    response = session.post(f"{base_url}/api/truck-types", json=valid_data)
    print(f"Valid Data: HTTP {response.status_code}")
    if response.status_code != 201:
        print(f"  Response: {response.text}")
    else:
        result = response.json()
        print(f"  Created truck ID: {result.get('id')}")
    
    # Test 2: Missing name
    missing_name = {
        "length": 500,
        "width": 200,
        "height": 200
    }
    
    response = session.post(f"{base_url}/api/truck-types", json=missing_name)
    print(f"\nMissing Name: HTTP {response.status_code}")
    if response.status_code != 201:
        print(f"  Response: {response.text}")
    
    # Test 3: Negative dimensions
    negative_dims = {
        "name": "Negative Test",
        "length": -500,
        "width": -200,
        "height": 200
    }
    
    response = session.post(f"{base_url}/api/truck-types", json=negative_dims)
    print(f"\nNegative Dimensions: HTTP {response.status_code}")
    if response.status_code != 201:
        print(f"  Response: {response.text}")
    else:
        result = response.json()
        print(f"  Created truck ID: {result.get('id')} (This should not happen)")
    
    # Test 4: Check what the form submission does
    print(f"\nTesting Form Submission to /add-truck-type")
    form_data = {
        'name': 'Form Test Truck',
        'length': '600',
        'width': '250',
        'height': '250',
        'max_weight': '12000'
    }
    
    response = session.post(f"{base_url}/add-truck-type", data=form_data)
    print(f"Form Submission: HTTP {response.status_code}")
    if response.status_code == 302:
        print(f"  Redirected to: {response.headers.get('Location', 'Unknown')}")
    else:
        print(f"  Response content length: {len(response.text)}")

if __name__ == "__main__":
    test_form_validation()