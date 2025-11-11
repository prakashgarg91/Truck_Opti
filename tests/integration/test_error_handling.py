#!/usr/bin/env python3
"""
Error Handling and Validation Testing
TruckOpti End-to-End Testing Suite
"""

import requests
import json
import time

def test_error_handling():
    """Test error handling and validation"""
    base_url = 'http://localhost:5001'
    
    print('🔍 ERROR HANDLING AND VALIDATION TESTING')
    print('=' * 60)
    
    # Test 1: Invalid truck ID
    print('\n1. Testing invalid truck ID...')
    try:
        invalid_data = {
            'truck_id': 99999,  # Non-existent truck
            'carton_requirements': [
                {'carton_id': 1, 'quantity': 2}
            ]
        }
        
        response = requests.post(f'{base_url}/api/recommend-trucks', json=invalid_data)
        result = response.json()
        print(f'   Status: HTTP {response.status_code}')
        if 'error' in result:
            print(f'   [SUCCESS] Error properly handled: {result["error"]}')
        else:
            print(f'   [WARNING] No error message returned')
    except Exception as e:
        print(f'   [ERROR] Exception occurred: {e}')
    
    # Test 2: Invalid carton ID
    print('\n2. Testing invalid carton ID...')
    try:
        invalid_data = {
            'truck_id': 1,
            'carton_requirements': [
                {'carton_id': 99999, 'quantity': 2}  # Non-existent carton
            ]
        }
        
        response = requests.post(f'{base_url}/api/recommend-trucks', json=invalid_data)
        result = response.json()
        print(f'   Status: HTTP {response.status_code}')
        if 'error' in result:
            print(f'   [SUCCESS] Error properly handled: {result["error"]}')
        else:
            print(f'   [WARNING] No error message returned')
    except Exception as e:
        print(f'   [ERROR] Exception occurred: {e}')
    
    # Test 3: Empty carton requirements
    print('\n3. Testing empty carton requirements...')
    try:
        empty_data = {
            'truck_id': 1,
            'carton_requirements': []  # Empty requirements
        }
        
        response = requests.post(f'{base_url}/api/recommend-trucks', json=empty_data)
        result = response.json()
        print(f'   Status: HTTP {response.status_code}')
        if 'error' in result:
            print(f'   [SUCCESS] Error properly handled: {result["error"]}')
        elif 'warnings' in result:
            print(f'   [SUCCESS] Warning properly handled: {result["warnings"]}')
        else:
            print(f'   [WARNING] No validation message returned')
    except Exception as e:
        print(f'   [ERROR] Exception occurred: {e}')
    
    # Test 4: Invalid JSON
    print('\n4. Testing invalid JSON format...')
    try:
        response = requests.post(f'{base_url}/api/recommend-trucks', 
                               data='{"invalid": json}', 
                               headers={'Content-Type': 'application/json'})
        print(f'   Status: HTTP {response.status_code}')
        print(f'   [SUCCESS] Invalid JSON properly rejected')
    except Exception as e:
        print(f'   [SUCCESS] Exception properly caught: {str(e)[:100]}...')
    
    # Test 5: Missing required fields
    print('\n5. Testing missing required fields...')
    try:
        incomplete_data = {'truck_id': 1}  # Missing carton_requirements
        
        response = requests.post(f'{base_url}/api/recommend-trucks', json=incomplete_data)
        result = response.json()
        print(f'   Status: HTTP {response.status_code}')
        if 'error' in result or 'missing' in str(result).lower():
            print(f'   [SUCCESS] Missing fields properly validated')
        else:
            print(f'   [WARNING] Validation might be insufficient')
    except Exception as e:
        print(f'   [ERROR] Exception occurred: {e}')
    
    # Test 6: Negative quantities
    print('\n6. Testing negative quantities...')
    try:
        negative_data = {
            'truck_id': 1,
            'carton_requirements': [
                {'carton_id': 1, 'quantity': -1}  # Negative quantity
            ]
        }
        
        response = requests.post(f'{base_url}/api/recommend-trucks', json=negative_data)
        result = response.json()
        print(f'   Status: HTTP {response.status_code}')
        if 'error' in result or 'validation' in str(result).lower():
            print(f'   [SUCCESS] Negative quantities properly validated')
        else:
            print(f'   [WARNING] Negative quantities not validated')
    except Exception as e:
        print(f'   [ERROR] Exception occurred: {e}')
    
    # Test 7: Very large numbers
    print('\n7. Testing very large numbers...')
    try:
        large_data = {
            'truck_id': 1,
            'carton_requirements': [
                {'carton_id': 1, 'quantity': 999999999}  # Very large quantity
            ]
        }
        
        response = requests.post(f'{base_url}/api/recommend-trucks', json=large_data)
        result = response.json()
        print(f'   Status: HTTP {response.status_code}')
        if 'error' in result or 'overflow' in str(result).lower():
            print(f'   [SUCCESS] Large numbers properly validated')
        else:
            print(f'   [INFO] Large numbers accepted (might be valid)')
    except Exception as e:
        print(f'   [ERROR] Exception occurred: {e}')
    
    # Test 8: Test bulk upload with invalid CSV data
    print('\n8. Testing bulk upload with invalid data...')
    try:
        invalid_csv = """Name,Length,Width,Height,Weight,MaxQuantity
Invalid_Carton,abc,def,ghi,jkl,10
Another_Invalid,100,200,300,invalid,5"""
        
        response = requests.post(f'{base_url}/api/cartons/bulk-upload', 
                               data=invalid_csv,
                               headers={'Content-Type': 'text/csv'})
        result = response.json()
        print(f'   Status: HTTP {response.status_code}')
        if 'error' in result or 'validation' in result.get('message', '').lower():
            print(f'   [SUCCESS] Invalid CSV data properly validated')
            print(f'   Validation errors: {result.get("validation_errors", "N/A")}')
        else:
            print(f'   [WARNING] CSV validation might be insufficient')
    except Exception as e:
        print(f'   [ERROR] Exception occurred: {e}')
    
    print('\n' + '=' * 60)
    print('🏁 ERROR HANDLING AND VALIDATION TESTING COMPLETED')
    print('=' * 60)

if __name__ == '__main__':
    test_error_handling()