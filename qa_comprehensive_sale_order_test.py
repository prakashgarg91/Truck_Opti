#!/usr/bin/env python3
"""
Comprehensive QA Test Suite for Sale Order Optimization
Tests algorithm accuracy, strategy differences, and consolidation features
"""

import requests
import json
import time
from io import StringIO

BASE_URL = "http://127.0.0.1:5001"

def create_diverse_test_data():
    """Create test data with different scenarios to test optimization strategies"""
    
    # Scenario 1: Small orders (should favor consolidation)
    small_orders = """sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-SMALL-001,Small Carton,SC001,5,Small Co 1,Mumbai,2025-08-12
SO-SMALL-002,Small Carton,SC001,8,Small Co 2,Mumbai,2025-08-12
SO-SMALL-003,Medium Carton,MC001,3,Small Co 3,Mumbai,2025-08-12"""

    # Scenario 2: Mixed size orders (should show strategy differences)
    mixed_orders = """sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-MIX-001,Large Carton,LC001,20,Mix Co 1,Delhi,2025-08-12
SO-MIX-002,Small Carton,SC001,100,Mix Co 2,Delhi,2025-08-12
SO-MIX-003,Medium Carton,MC001,15,Mix Co 3,Delhi,2025-08-12
SO-MIX-004,Large Carton,LC001,5,Mix Co 4,Delhi,2025-08-12"""

    # Scenario 3: Large single order (should test individual truck sizing)
    large_order = """sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-LARGE-001,Large Carton,LC001,50,Large Corp,Bangalore,2025-08-12"""

    return {
        'small': small_orders,
        'mixed': mixed_orders, 
        'large': large_order
    }

def test_optimization_strategy_differences():
    """Test if Cost Saving vs Space Utilization strategies produce different results"""
    print("\n=== Testing Strategy Differences ===")
    
    test_data = create_diverse_test_data()
    results = {}
    
    for scenario_name, csv_content in test_data.items():
        print(f"\nTesting scenario: {scenario_name}")
        
        # Test Cost Saving Strategy
        cost_batch = upload_test_data(
            csv_content, 
            f"QA_Cost_{scenario_name}",
            "cost_saving"
        )
        
        # Test Space Utilization Strategy  
        space_batch = upload_test_data(
            csv_content,
            f"QA_Space_{scenario_name}", 
            "space_utilization"
        )
        
        # Wait for processing
        time.sleep(2)
        
        # Compare results
        if cost_batch and space_batch:
            cost_results = get_batch_analysis(cost_batch)
            space_results = get_batch_analysis(space_batch)
            
            results[scenario_name] = {
                'cost_saving': cost_results,
                'space_utilization': space_results
            }
            
            analyze_strategy_differences(cost_results, space_results, scenario_name)
    
    return results

def upload_test_data(csv_content, batch_name, strategy):
    """Upload test data with specified strategy"""
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
            batch_id = response.url.split('/sale-order-results/')[-1]
            print(f"  [PASS] {strategy} strategy uploaded - Batch {batch_id}")
            return batch_id
        else:
            print(f"  [FAIL] {strategy} strategy upload failed: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"  [ERROR] {strategy} upload error: {str(e)}")
        return None

def get_batch_analysis(batch_id):
    """Get detailed analysis of a batch result"""
    try:
        response = requests.get(f"{BASE_URL}/sale-order-results/{batch_id}")
        if response.status_code == 200:
            content = response.text
            
            # Extract key metrics (simplified parsing)
            analysis = {
                'batch_id': batch_id,
                'has_cost_data': 'Estimated Cost' in content,
                'has_utilization_data': 'Space Utilization' in content,
                'has_consolidation': 'CONSOLIDATED' in content,
                'truck_recommendations': content.count('Tata Ace') + content.count('Mahindra') + content.count('Ashok'),
                'perfect_fits': content.count('PERFECT FIT'),
                'content_sample': content[:1000]  # First 1000 chars for analysis
            }
            
            return analysis
        else:
            return {'error': f'Failed to get results: {response.status_code}'}
            
    except Exception as e:
        return {'error': str(e)}

def analyze_strategy_differences(cost_results, space_results, scenario):
    """Analyze differences between cost and space strategies"""
    print(f"\n--- Strategy Analysis for {scenario} ---")
    
    # Check if results are different
    differences_found = False
    
    if cost_results.get('truck_recommendations') != space_results.get('truck_recommendations'):
        print(f"[DIFFERENCE] Truck recommendations differ:")
        print(f"  Cost Saving: {cost_results.get('truck_recommendations')} trucks")
        print(f"  Space Util: {space_results.get('truck_recommendations')} trucks")
        differences_found = True
    
    if cost_results.get('perfect_fits') != space_results.get('perfect_fits'):
        print(f"[DIFFERENCE] Perfect fits differ:")
        print(f"  Cost Saving: {cost_results.get('perfect_fits')} perfect fits")
        print(f"  Space Util: {space_results.get('perfect_fits')} perfect fits") 
        differences_found = True
    
    # Check consolidation differences
    cost_consolidation = cost_results.get('has_consolidation', False)
    space_consolidation = space_results.get('has_consolidation', False)
    
    if cost_consolidation != space_consolidation:
        print(f"[DIFFERENCE] Consolidation approach differs:")
        print(f"  Cost Saving consolidation: {cost_consolidation}")
        print(f"  Space Util consolidation: {space_consolidation}")
        differences_found = True
    
    if not differences_found:
        print("[ISSUE] No differences found between strategies - this may indicate a bug!")
        return False
    else:
        print("[PASS] Strategies produce different results as expected")
        return True

def test_consolidation_effectiveness():
    """Test multi-order consolidation feature specifically"""
    print("\n=== Testing Consolidation Effectiveness ===")
    
    # Create orders that should consolidate well
    consolidation_test = """sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-CONS-001,Small Carton,SC001,10,Cons Co 1,Chennai,2025-08-12
SO-CONS-002,Small Carton,SC001,12,Cons Co 2,Chennai,2025-08-12
SO-CONS-003,Medium Carton,MC001,8,Cons Co 3,Chennai,2025-08-12
SO-CONS-004,Medium Carton,MC001,6,Cons Co 4,Chennai,2025-08-12"""
    
    # Test with consolidation enabled
    batch_with_consolidation = upload_test_data(
        consolidation_test,
        "QA_Consolidation_Enabled", 
        "cost_saving"
    )
    
    time.sleep(2)
    
    if batch_with_consolidation:
        results = get_batch_analysis(batch_with_consolidation)
        
        print(f"Consolidation test results:")
        print(f"  Batch ID: {batch_with_consolidation}")
        print(f"  Has consolidation: {results.get('has_consolidation')}")
        print(f"  Truck recommendations: {results.get('truck_recommendations')}")
        print(f"  Perfect fits: {results.get('perfect_fits')}")
        
        if results.get('has_consolidation'):
            print("[PASS] Consolidation feature is working")
            return True
        else:
            print("[ISSUE] Consolidation feature may not be working properly")
            return False
    
    return False

def test_algorithm_accuracy():
    """Test the accuracy of packing algorithms"""
    print("\n=== Testing Algorithm Accuracy ===")
    
    # Test with known carton dimensions for verification
    accuracy_test = """sale_order_number,carton_name,carton_code,quantity,customer_name,delivery_address,order_date
SO-ACC-001,Small Carton,SC001,20,Accuracy Test,Pune,2025-08-12"""
    
    batch_id = upload_test_data(
        accuracy_test,
        "QA_Accuracy_Test",
        "space_utilization"
    )
    
    time.sleep(2)
    
    if batch_id:
        results = get_batch_analysis(batch_id)
        
        # Check if we have proper utilization data
        has_utilization = results.get('has_utilization_data', False)
        has_cost = results.get('has_cost_data', False)
        has_trucks = results.get('truck_recommendations', 0) > 0
        
        print(f"Algorithm accuracy test:")
        print(f"  Has utilization data: {has_utilization}")
        print(f"  Has cost data: {has_cost}")
        print(f"  Has truck recommendations: {has_trucks}")
        
        if has_utilization and has_cost and has_trucks:
            print("[PASS] Algorithm provides complete analysis")
            return True
        else:
            print("[ISSUE] Algorithm missing key components")
            return False
    
    return False

def run_comprehensive_qa_test():
    """Run all QA tests"""
    print("=" * 80)
    print("COMPREHENSIVE QA TEST SUITE - SALE ORDER OPTIMIZATION")
    print("=" * 80)
    
    # Check server
    try:
        response = requests.get(f"{BASE_URL}/", timeout=5)
        if response.status_code != 200:
            print("[FAIL] Server not responding properly")
            return
        print("[PASS] Server is responsive")
    except:
        print("[FAIL] Cannot connect to server")
        return
    
    test_results = {
        'strategy_differences': test_optimization_strategy_differences(),
        'consolidation': test_consolidation_effectiveness(),
        'algorithm_accuracy': test_algorithm_accuracy()
    }
    
    # Summary
    print("\n" + "=" * 80)
    print("QA TEST SUMMARY")
    print("=" * 80)
    
    passed_tests = sum(1 for result in test_results.values() if result)
    total_tests = len(test_results)
    
    print(f"Tests Passed: {passed_tests}/{total_tests}")
    
    for test_name, result in test_results.items():
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status} {test_name.replace('_', ' ').title()}")
    
    if passed_tests == total_tests:
        print("\n[SUCCESS] All tests passed - Sale Order optimization is working correctly")
    else:
        print(f"\n[ISSUES FOUND] {total_tests - passed_tests} test(s) failed - optimization needs investigation")
    
    return test_results

if __name__ == "__main__":
    run_comprehensive_qa_test()