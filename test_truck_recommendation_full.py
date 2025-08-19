#!/usr/bin/env python
"""
Comprehensive test of truck recommendation system
Tests the complete workflow including algorithm selection and recommendations
"""

import requests
import time
import sys

def test_page_loading():
    """Test that the truck recommendation page loads correctly"""
    print("=== Testing Page Loading ===")
    try:
        response = requests.get('http://127.0.0.1:5002/recommend-truck', timeout=10)
        
        if response.status_code == 200:
            content = response.text
            print(f"[OK] Page loads successfully (Status: {response.status_code})")
            print(f"[OK] Page size: {len(content)} characters")
            
            # Check for key elements
            elements = {
                'Algorithm Selection': 'Algorithm & Optimization Goal' in content,
                'LAFF Algorithm Option': 'LAFF Algorithm' in content,
                'Form Element': 'cartonForm' in content,
                'Progress Function': 'showProgressWithSteps' in content,
                'Algorithm Preview': 'algorithmPreview' in content
            }
            
            all_found = True
            for element, found in elements.items():
                status = "[OK]" if found else "[FAIL]"
                print(f"{status} {element}: {'Present' if found else 'Missing'}")
                if not found:
                    all_found = False
            
            return all_found
        else:
            print(f"[FAIL] Page load failed with status: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Page loading error: {e}")
        return False

def test_algorithm_functionality():
    """Test the core algorithm functionality without HTTP timeout issues"""
    print("\\n=== Testing Algorithm Functionality ===")
    try:
        # Import the packer module to test directly
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        
        from app.models import TruckType, CartonType
        from app.packer import calculate_optimal_truck_combination, pack_cartons_optimized
        
        print("[OK] Successfully imported packer modules")
        
        # Create test data
        truck_types = []
        
        # Small truck
        small_truck = TruckType(
            name="Tata Ace",
            length=220,
            width=150, 
            height=120,
            max_weight=750
        )
        truck_types.append(small_truck)
        
        # Medium truck  
        medium_truck = TruckType(
            name="Eicher 14 ft",
            length=430,
            width=200,
            height=190,
            max_weight=10000
        )
        truck_types.append(medium_truck)
        
        # Test carton types
        carton_types = {}
        
        led_tv = CartonType(
            name="LED TV 32",
            length=80,
            width=15,
            height=55,
            weight=10
        )
        carton_types[led_tv] = 5  # 5 TVs
        
        print("[OK] Test data created successfully")
        
        # Test different algorithms
        algorithms = [
            ('space_utilization', 'LAFF Algorithm'),
            ('cost_saving', 'Cost-Optimized Algorithm'),
            ('balanced', 'Balanced Algorithm'),
            ('value_protected', 'Value-Protected Algorithm')
        ]
        
        for strategy, name in algorithms:
            print(f"\\n[TEST] Testing {name} ({strategy})...")
            
            try:
                recommended_trucks = calculate_optimal_truck_combination(
                    carton_types,
                    truck_types,
                    max_trucks=3,
                    optimization_strategy=strategy
                )
                
                if recommended_trucks and len(recommended_trucks) > 0:
                    print(f"[OK] {name} completed successfully")
                    print(f"[OK] Generated {len(recommended_trucks)} recommendations")
                    
                    # Show top recommendation
                    top_rec = recommended_trucks[0]
                    print(f"[OK] Top recommendation: {top_rec['truck_type']} (Efficiency: {top_rec.get('efficiency_score', 0):.3f})")
                else:
                    print(f"[WARN] {name} returned no recommendations")
                    
            except Exception as e:
                print(f"[FAIL] {name} error: {e}")
                return False
        
        print("\\n[OK] All algorithm tests completed successfully!")
        return True
        
    except Exception as e:
        print(f"[FAIL] Algorithm test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_form_elements():
    """Test that form elements are properly configured"""
    print("\\n=== Testing Form Elements ===")
    try:
        response = requests.get('http://127.0.0.1:5002/recommend-truck', timeout=10)
        content = response.text
        
        # Check for specific form elements
        form_elements = {
            'Carton Selection Dropdown': 'name="carton_type_1"' in content,
            'Quantity Input': 'name="carton_qty_1"' in content,
            'Optimization Goal': 'name="optimization_goal"' in content,
            'Submit Button': 'Get Smart Recommendations' in content,
            'Form ID': 'id="cartonForm"' in content
        }
        
        all_present = True
        for element, found in form_elements.items():
            status = "[OK]" if found else "[FAIL]"
            print(f"{status} {element}: {'Present' if found else 'Missing'}")
            if not found:
                all_present = False
        
        # Check for carton options
        carton_count = content.count('LED TV') + content.count('Microwave') + content.count('Refrigerator')
        print(f"[OK] Found {carton_count} carton type options")
        
        return all_present
        
    except Exception as e:
        print(f"[FAIL] Form elements test error: {e}")
        return False

def test_javascript_functionality():
    """Test JavaScript functionality in the page"""
    print("\\n=== Testing JavaScript Functionality ===")
    try:
        response = requests.get('http://127.0.0.1:5002/recommend-truck', timeout=10)
        content = response.text
        
        js_functions = {
            'Progress Function': 'function showProgressWithSteps' in content,
            'Form Submission Handler': 'cartonForm.addEventListener' in content,
            'Algorithm Detection': 'optimizationGoal' in content,
            'Algorithm Preview Update': 'algorithmPreview' in content,
            'Step Definitions': 'Running 3D packing simulations' in content
        }
        
        all_present = True
        for func, found in js_functions.items():
            status = "[OK]" if found else "[FAIL]"
            print(f"{status} {func}: {'Present' if found else 'Missing'}")
            if not found:
                all_present = False
        
        return all_present
        
    except Exception as e:
        print(f"[FAIL] JavaScript test error: {e}")
        return False

def main():
    """Run comprehensive tests"""
    print("=== TruckOpti Truck Recommendation System Test ===")
    print("Testing enhanced loading screen with algorithm display\\n")
    
    tests = [
        ("Page Loading", test_page_loading),
        ("Algorithm Functionality", test_algorithm_functionality), 
        ("Form Elements", test_form_elements),
        ("JavaScript Functionality", test_javascript_functionality)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\\n{'='*20} {test_name} {'='*20}")
        if test_func():
            passed += 1
            print(f"[PASS] {test_name} completed successfully")
        else:
            print(f"[FAIL] {test_name} has issues")
    
    print(f"\\n{'='*60}")
    print(f"RESULTS: {passed}/{total} tests passed")
    
    if passed == total:
        print("\\nSUCCESS: Truck recommendation system is fully functional!")
        print("   - Page loads correctly with algorithm selection")
        print("   - All algorithms work properly")
        print("   - Form elements are properly configured") 
        print("   - JavaScript loading screen is implemented")
        print("   - Algorithm information is displayed to users")
        return True
    else:
        print(f"\\nISSUES FOUND: {total - passed} tests failed")
        print("   Please review the failed test results above")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)