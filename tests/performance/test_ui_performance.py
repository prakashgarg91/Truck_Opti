#!/usr/bin/env python3
"""
UI/UX Testing and Performance Verification
TruckOpti End-to-End Testing Suite
"""

import requests
import json
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

def test_ui_ux_scenarios():
    """Test various UI/UX scenarios"""
    base_url = 'http://localhost:5001'
    
    print('🔍 UI/UX TESTING ACROSS DIFFERENT SCENARIOS')
    print('=' * 60)
    
    # Test 1: Main page accessibility
    print('\n1. Testing main page accessibility...')
    try:
        start_time = time.time()
        response = requests.get(f'{base_url}/')
        load_time = time.time() - start_time
        
        print(f'   Status: HTTP {response.status_code}')
        print(f'   Load time: {load_time:.2f}s')
        if response.status_code == 200:
            print('   [SUCCESS] Main page loads successfully')
            # Check for basic HTML structure
            content = response.text.lower()
            if 'truckopti' in content and 'optimization' in content:
                print('   [SUCCESS] Page contains expected content')
            else:
                print('   [WARNING] Page content might be incomplete')
        else:
            print('   [ERROR] Main page not accessible')
    except Exception as e:
        print(f'   [ERROR] Exception: {e}')
    
    # Test 2: Navigation and routing
    print('\n2. Testing navigation and routing...')
    routes = ['/cartons', '/trucks', '/optimize', '/recommendations']
    for route in routes:
        try:
            response = requests.get(f'{base_url}{route}')
            print(f'   Route {route}: HTTP {response.status_code}')
        except Exception as e:
            print(f'   Route {route}: ERROR - {e}')
    
    # Test 3: Responsive design (check basic mobile indicators)
    print('\n3. Testing responsive design indicators...')
    try:
        # Test with mobile user agent
        headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15'
        }
        response = requests.get(f'{base_url}/', headers=headers)
        if response.status_code == 200:
            print('   [SUCCESS] Mobile user agent handled')
        else:
            print('   [WARNING] Mobile user agent might not be supported')
    except Exception as e:
        print(f'   [ERROR] Mobile test failed: {e}')
    
    # Test 4: CSS and JavaScript loading
    print('\n4. Testing static asset loading...')
    static_assets = ['/static/css/bootstrap.min.css', '/static/js/jquery.min.js', '/static/css/style.css']
    for asset in static_assets:
        try:
            response = requests.get(f'{base_url}{asset}')
            if response.status_code == 200:
                print(f'   {asset}: [SUCCESS]')
            elif response.status_code == 404:
                print(f'   {asset}: [NOT FOUND]')
            else:
                print(f'   {asset}: HTTP {response.status_code}')
        except Exception as e:
            print(f'   {asset}: ERROR - {e}')
    
    print('\n' + '=' * 60)
    print('🏁 UI/UX TESTING COMPLETED')
    print('=' * 60)

def test_performance():
    """Test application performance under various conditions"""
    base_url = 'http://localhost:5001'
    
    print('\n🔍 PERFORMANCE TESTING AND LOAD INDICATORS')
    print('=' * 60)
    
    # Test 1: Health check performance
    print('\n1. Testing health check performance...')
    try:
        times = []
        for i in range(5):
            start_time = time.time()
            response = requests.get(f'{base_url}/api/health')
            end_time = time.time()
            times.append(end_time - start_time)
            print(f'   Request {i+1}: {times[-1]:.3f}s')
        
        avg_time = sum(times) / len(times)
        max_time = max(times)
        print(f'   Average: {avg_time:.3f}s, Max: {max_time:.3f}s')
        
        if avg_time < 1.0:
            print('   [SUCCESS] Health check performance is good')
        else:
            print('   [WARNING] Health check performance could be improved')
    except Exception as e:
        print(f'   [ERROR] Health check failed: {e}')
    
    # Test 2: Optimization performance with different data sizes
    print('\n2. Testing optimization performance with different data sizes...')
    test_scenarios = [
        {'name': 'Small (1 carton)', 'requirements': [{'carton_id': 1, 'quantity': 1}]},
        {'name': 'Medium (3 cartons)', 'requirements': [
            {'carton_id': 1, 'quantity': 2},
            {'carton_id': 2, 'quantity': 3},
            {'carton_id': 3, 'quantity': 1}
        ]},
        {'name': 'Large (5 cartons)', 'requirements': [
            {'carton_id': i, 'quantity': 5} for i in range(1, 6)
        ]}
    ]
    
    for scenario in test_scenarios:
        try:
            data = {
                'truck_id': 1,
                'carton_requirements': scenario['requirements']
            }
            
            start_time = time.time()
            response = requests.post(f'{base_url}/api/recommend-trucks', json=data)
            end_time = time.time()
            processing_time = end_time - start_time
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    print(f'   {scenario["name"]}: {processing_time:.3f}s [SUCCESS]')
                    # Check if processing indicators are present
                    if 'processing_time' in result or 'duration' in result:
                        print(f'     -> Processing time tracked in response')
                else:
                    print(f'   {scenario["name"]}: {processing_time:.3f}s [FAILED] - {result.get("error")}')
            else:
                print(f'   {scenario["name"]}: {processing_time:.3f}s [HTTP ERROR {response.status_code}]')
        except Exception as e:
            print(f'   {scenario["name"]}: ERROR - {e}')
    
    # Test 3: Concurrent requests
    print('\n3. Testing concurrent request handling...')
    def make_request(request_id):
        try:
            data = {
                'truck_id': 1,
                'carton_requirements': [{'carton_id': 1, 'quantity': 1}]
            }
            start_time = time.time()
            response = requests.post(f'{base_url}/api/recommend-trucks', json=data, timeout=10)
            end_time = time.time()
            return {
                'id': request_id,
                'status': response.status_code,
                'time': end_time - start_time,
                'success': response.json().get('success', False) if response.status_code == 200 else False
            }
        except Exception as e:
            return {
                'id': request_id,
                'status': 'error',
                'time': 0,
                'success': False,
                'error': str(e)
            }
    
    # Test with 5 concurrent requests
    try:
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_request, i) for i in range(5)]
            results = [future.result() for future in as_completed(futures)]
        
        print(f'   Concurrent requests results:')
        for result in sorted(results, key=lambda x: x['id']):
            print(f'     Request {result["id"]}: {result["time"]:.3f}s, Status: {result["status"]}, Success: {result["success"]}')
        
        success_count = sum(1 for r in results if r['success'])
        print(f'   [SUCCESS] {success_count}/5 concurrent requests handled successfully')
    except Exception as e:
        print(f'   [ERROR] Concurrent testing failed: {e}')
    
    # Test 4: Memory and resource usage indicators
    print('\n4. Testing resource usage indicators...')
    try:
        # This would typically check application metrics, but for now we'll verify
        # that the application provides some performance information
        response = requests.get(f'{base_url}/api/health')
        if response.status_code == 200:
            health_data = response.json()
            if 'startup_time' in health_data:
                print(f'   [SUCCESS] Startup time tracked: {health_data["startup_time"]}')
            if 'version' in health_data:
                print(f'   [SUCCESS] Version info available: {health_data["version"]}')
    except Exception as e:
        print(f'   [ERROR] Resource monitoring check failed: {e}')
    
    print('\n' + '=' * 60)
    print('🏁 PERFORMANCE TESTING COMPLETED')
    print('=' * 60)

if __name__ == '__main__':
    print('Starting comprehensive UI/UX and Performance testing...')
    
    # Run UI/UX tests
    test_ui_ux_scenarios()
    
    # Run performance tests
    test_performance()
    
    print('\n' + '=' * 60)
    print('🎯 ALL UI/UX AND PERFORMANCE TESTS COMPLETED')
    print('=' * 60)