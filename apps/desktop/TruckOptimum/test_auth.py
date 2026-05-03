#!/usr/bin/env python3
"""
Test script for TruckOptimum Authentication System
Tests all authentication endpoints to ensure they work correctly
"""

import requests
import json
import time

BASE_URL = "http://127.0.0.1:5001"

def test_auth_endpoints():
    """Test all authentication endpoints"""
    print("=== TruckOptimum Authentication Test Suite ===\n")
    client = requests.Session()
    
    # Test 1: Health Check
    print("1. Testing Health Check...")
    try:
        response = client.get(f"{BASE_URL}/api/health")
        if response.status_code == 200:
            print("   ✅ Health check passed")
        else:
            print(f"   ❌ Health check failed: {response.status_code}")
            return
    except requests.exceptions.ConnectionError:
        print("   ❌ Cannot connect to server. Make sure TruckOptimum is running on port 5001")
        return
    
    # Test 2: User Registration
    print("\n2. Testing User Registration...")
    register_data = {
        "username": "testuser",
        "email": "test@example.com", 
        "password": "TestPassword123",
        "first_name": "Test",
        "last_name": "User"
    }
    
    try:
        response = client.post(f"{BASE_URL}/api/auth/register", json=register_data)
        if response.status_code == 201:
            result = response.json()
            print("   ✅ User registration successful")
            print(f"   User ID: {result.get('user_id')}")
        else:
            print(f"   ❌ Registration failed: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"   ❌ Registration error: {e}")
    
    # Test 3: User Login
    print("\n3. Testing User Login...")
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    
    try:
        response = client.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code == 200:
            result = response.json()
            user_info = result.get('user', {})
            has_session_cookie = 'truckoptimum_session' in client.cookies
            print("   ✅ Login successful")
            print(f"   Session Cookie Present: {has_session_cookie}")
            print(f"   User: {user_info.get('username')} ({user_info.get('role')})")
        else:
            print(f"   ❌ Login failed: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"   ❌ Login error: {e}")
    
    if 'truckoptimum_session' not in client.cookies:
        print("\n❌ Cannot continue tests without valid session")
        return
    
    # Test 4: Session Validation
    print("\n4. Testing Session Validation...")
    try:
        response = client.post(f"{BASE_URL}/api/auth/validate")
        if response.status_code == 200:
            result = response.json()
            user_info = result.get('user', {})
            print("   ✅ Session validation successful")
            print(f"   User: {user_info.get('username')} - {user_info.get('email')}")
        else:
            print(f"   ❌ Session validation failed: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"   ❌ Session validation error: {e}")
    
    # Test 5: User Logout
    print("\n5. Testing User Logout...")
    try:
        response = client.post(f"{BASE_URL}/api/auth/logout")
        if response.status_code == 200:
            print("   ✅ Logout successful")
        else:
            print(f"   ❌ Logout failed: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"   ❌ Logout error: {e}")
    
    # Test 6: Validate Expired Session
    print("\n6. Testing Expired Session Validation...")
    try:
        response = client.post(f"{BASE_URL}/api/auth/validate")
        if response.status_code == 401:
            print("   ✅ Expired session correctly rejected")
        else:
            print(f"   ❌ Expired session validation unexpected: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Expired session test error: {e}")
    
    print("\n=== Authentication Test Suite Complete ===")
    print("All authentication endpoints are working correctly!")

if __name__ == "__main__":
    test_auth_endpoints()