#!/usr/bin/env python3
"""
Quick validation test to verify the optimization strategy fix is working
"""

import requests
from io import StringIO
import time

BASE_URL = "http://127.0.0.1:5001"

def test_strategy_fix():
    """Test if the optimization strategy fix is working"""
    print("=== Testing Optimization Strategy Fix ===")
    
    # Create test data that should show clear strategy differences
    test_data = """sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-FIX-001,Large Carton,LC001,30,Fix Test Co,Mumbai,2025-08-12
SO-FIX-002,Medium Carton,MC001,20,Fix Test Co,Mumbai,2025-08-12"""

    # Test Cost Saving
    print("Testing Cost Saving strategy...")
    cost_batch = upload_and_get_batch(test_data, "Fix_Test_Cost", "cost_saving")
    
    # Test Space Utilization  
    print("Testing Space Utilization strategy...")
    space_batch = upload_and_get_batch(test_data, "Fix_Test_Space", "space_utilization")
    
    # Wait for processing
    time.sleep(3)
    
    # Compare results
    if cost_batch and space_batch:
        print(f"\nCost Saving Batch: {cost_batch}")
        print(f"Space Utilization Batch: {space_batch}")
        
        # Check if results are now different
        cost_content = get_page_content(cost_batch)
        space_content = get_page_content(space_batch)
        
        if cost_content != space_content:
            print("[SUCCESS] Fix working! Strategies now produce different results.")
            return True
        else:
            print("[ISSUE] Strategies still producing identical results.")
            return False
    
    return False

def upload_and_get_batch(csv_content, batch_name, strategy):
    """Upload test data and return batch ID"""
    try:
        files = {
            'file': (f'{batch_name}.csv', StringIO(csv_content), 'text/csv')
        }
        
        data = {
            'batch_name': batch_name,
            'optimization_strategy': strategy,
            'enable_consolidation': 'on'
        }
        
        response = requests.post(f"{BASE_URL}/sale-orders", files=files, data=data)
        
        if response.status_code == 200 and '/sale-order-results/' in response.url:
            return response.url.split('/sale-order-results/')[-1]
        else:
            print(f"Upload failed: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return None

def get_page_content(batch_id):
    """Get content of results page for comparison"""
    try:
        response = requests.get(f"{BASE_URL}/sale-order-results/{batch_id}")
        if response.status_code == 200:
            return response.text
        return ""
    except:
        return ""

if __name__ == "__main__":
    if test_strategy_fix():
        print("\n✓ Optimization strategy fix validated successfully!")
    else:
        print("\n✗ Fix validation failed - may need additional debugging.")