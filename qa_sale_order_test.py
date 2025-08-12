#!/usr/bin/env python3
"""
QA Test Suite for Sale Order Truck Selection Functionality
Testing both Space Utilization and Cost Saving optimization strategies
"""

import requests
import json
import os
import sys
import time
from io import StringIO

# Test server URL
BASE_URL = "http://127.0.0.1:5001"

def create_test_csv_content():
    """Create test CSV content for upload"""
    return """sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-2025-001,Large Carton,LC001,15,ABC Company,Mumbai,2025-08-11
SO-2025-002,Medium Carton,MC001,25,XYZ Corp,Delhi,2025-08-11
SO-2025-003,Small Carton,SC001,50,DEF Ltd,Bangalore,2025-08-11
SO-2025-004,Large Carton,LC001,10,GHI Industries,Chennai,2025-08-11
SO-2025-005,Medium Carton,MC001,30,JKL Enterprises,Pune,2025-08-11"""

def test_cost_saving_strategy():
    """Test Cost Saving optimization strategy"""
    print("=== Testing Cost Saving Strategy ===")
    
    # Prepare test data
    csv_content = create_test_csv_content()
    
    # Upload file with Cost Saving strategy
    files = {
        'file': ('test_cost_saving.csv', StringIO(csv_content), 'text/csv')
    }
    
    data = {
        'batch_name': 'QA_Test_Cost_Saving',
        'optimization_strategy': 'cost_saving',
        'enable_consolidation': 'on'
    }
    
    try:
        response = requests.post(f"{BASE_URL}/sale-orders", files=files, data=data)
        print(f"Response Status: {response.status_code}")
        print(f"Response URL: {response.url}")
        
        if response.status_code == 200:
            print("[PASS] Cost Saving strategy test initiated successfully")
            # Extract batch ID from redirect URL if available
            if '/sale-order-results/' in response.url:
                batch_id = response.url.split('/sale-order-results/')[-1]
                print(f"Batch ID: {batch_id}")
                return batch_id
        else:
            print(f"[FAIL] Cost Saving strategy test failed: {response.status_code}")
            print(response.text[:500])  # First 500 chars of response
            
    except Exception as e:
        print(f"[ERROR] Error testing Cost Saving strategy: {str(e)}")
    
    return None

def test_space_utilization_strategy():
    """Test Space Utilization optimization strategy"""
    print("\n=== Testing Space Utilization Strategy ===")
    
    # Prepare test data
    csv_content = create_test_csv_content()
    
    # Upload file with Space Utilization strategy
    files = {
        'file': ('test_space_util.csv', StringIO(csv_content), 'text/csv')
    }
    
    data = {
        'batch_name': 'QA_Test_Space_Utilization',
        'optimization_strategy': 'space_utilization',
        'enable_consolidation': 'on'
    }
    
    try:
        response = requests.post(f"{BASE_URL}/sale-orders", files=files, data=data)
        print(f"Response Status: {response.status_code}")
        print(f"Response URL: {response.url}")
        
        if response.status_code == 200:
            print("[PASS] Space Utilization strategy test initiated successfully")
            # Extract batch ID from redirect URL if available
            if '/sale-order-results/' in response.url:
                batch_id = response.url.split('/sale-order-results/')[-1]
                print(f"Batch ID: {batch_id}")
                return batch_id
        else:
            print(f"[FAIL] Space Utilization strategy test failed: {response.status_code}")
            print(response.text[:500])  # First 500 chars of response
            
    except Exception as e:
        print(f"[ERROR] Error testing Space Utilization strategy: {str(e)}")
    
    return None

def analyze_results(batch_id, strategy_name):
    """Analyze the results for a specific batch"""
    print(f"\n=== Analyzing {strategy_name} Results (Batch {batch_id}) ===")
    
    try:
        # Get batch results
        response = requests.get(f"{BASE_URL}/sale-order-results/{batch_id}")
        print(f"Results page status: {response.status_code}")
        
        if response.status_code == 200:
            print("[PASS] Results page accessible")
            # Check if results contain optimization data
            content = response.text
            
            # Check for key indicators of successful optimization
            indicators = {
                'cost_analysis': 'cost' in content.lower(),
                'utilization_data': 'utilization' in content.lower(),
                'truck_recommendations': 'truck' in content.lower(),
                'consolidation': 'consolidated' in content.lower()
            }
            
            print("Results Analysis:")
            for indicator, present in indicators.items():
                status = "[PASS]" if present else "[FAIL]"
                print(f"  {status} {indicator.replace('_', ' ').title()}: {present}")
                
            return indicators
        else:
            print(f"[FAIL] Failed to access results page: {response.status_code}")
            
    except Exception as e:
        print(f"[ERROR] Error analyzing results: {str(e)}")
    
    return None

def test_api_endpoints():
    """Test API endpoints for sale orders"""
    print("\n=== Testing API Endpoints ===")
    
    endpoints_to_test = [
        '/api/sale-orders',
        '/api/sale-order-batches'
    ]
    
    for endpoint in endpoints_to_test:
        try:
            response = requests.get(f"{BASE_URL}{endpoint}")
            print(f"API {endpoint}: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"  [PASS] Returned {len(data)} items")
            else:
                print(f"  [FAIL] Failed with status {response.status_code}")
                
        except Exception as e:
            print(f"  [ERROR] Error: {str(e)}")

def check_server_availability():
    """Check if the server is running and responsive"""
    print("=== Checking Server Availability ===")
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        if response.status_code == 200:
            print("[PASS] Server is running and responsive")
            return True
        else:
            print(f"[FAIL] Server returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Server not available: {str(e)}")
        return False

def main():
    """Main test execution"""
    print("QA Test Suite: Sale Order Truck Selection Functionality")
    print("=" * 60)
    
    # Check server availability
    if not check_server_availability():
        print("Server not available. Please ensure the application is running.")
        return
    
    # Test both strategies
    cost_saving_batch = test_cost_saving_strategy()
    space_util_batch = test_space_utilization_strategy()
    
    # Wait a bit for processing
    print("\nWaiting for processing to complete...")
    time.sleep(3)
    
    # Analyze results
    if cost_saving_batch:
        cost_results = analyze_results(cost_saving_batch, "Cost Saving")
    
    if space_util_batch:
        space_results = analyze_results(space_util_batch, "Space Utilization")
    
    # Test API endpoints
    test_api_endpoints()
    
    print("\n" + "=" * 60)
    print("QA Test Complete")
    
    # Summary
    print("\n=== SUMMARY ===")
    if cost_saving_batch:
        print("[PASS] Cost Saving strategy test executed")
    else:
        print("[FAIL] Cost Saving strategy test failed")
        
    if space_util_batch:
        print("[PASS] Space Utilization strategy test executed")
    else:
        print("[FAIL] Space Utilization strategy test failed")

if __name__ == "__main__":
    main()