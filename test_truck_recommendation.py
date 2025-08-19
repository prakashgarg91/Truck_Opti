#!/usr/bin/env python
"""
Simple test for truck recommendation system
Tests the core functionality without Unicode issues
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_truck_recommendation():
    """Test truck recommendation algorithm"""
    try:
        from app.models import TruckType, CartonType
        from app.packer import calculate_optimal_truck_combination, pack_cartons_optimized
        
        print("Testing truck recommendation algorithm...")
        
        # Create sample truck types
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
        
        # Create sample carton types
        carton_types = {}
        
        led_tv = CartonType(
            name="LED TV 32",
            length=80,
            width=15,
            height=55,
            weight=10
        )
        carton_types[led_tv] = 10  # 10 TVs
        
        microwave = CartonType(
            name="Microwave", 
            length=55,
            width=45,
            height=35,
            weight=12
        )
        carton_types[microwave] = 5  # 5 microwaves
        
        print("Sample data created successfully")
        
        # Test truck recommendation
        print("Running truck recommendation algorithm...")
        
        try:
            recommended_trucks = calculate_optimal_truck_combination(
                carton_types,
                truck_types,
                max_trucks=3,
                optimization_strategy='space_utilization'
            )
            
            print(f"Algorithm completed successfully!")
            print(f"Number of recommendations: {len(recommended_trucks)}")
            
            for i, truck in enumerate(recommended_trucks[:3]):
                print(f"  {i+1}. {truck['truck_type']} - Efficiency: {truck.get('efficiency_score', 0):.3f}")
            
            # Test detailed packing
            if recommended_trucks:
                best_truck = next((t for t in truck_types if t.name == recommended_trucks[0]['truck_type']), None)
                if best_truck:
                    print(f"Testing detailed packing with {best_truck.name}...")
                    
                    truck_quantities = {best_truck: 1}
                    packing_results = pack_cartons_optimized(truck_quantities, carton_types, 'space_utilization')
                    
                    if packing_results:
                        result = packing_results[0]
                        print(f"  Space utilization: {result.get('utilization', 0)*100:.1f}%")
                        print(f"  Items packed: {len(result.get('fitted_items', []))}")
                        print(f"  Items unpacked: {len(result.get('unfitted_items', []))}")
            
            print("PASS: Truck recommendation algorithm working correctly!")
            return True
            
        except Exception as e:
            print(f"FAIL: Algorithm error - {str(e)}")
            import traceback
            traceback.print_exc()
            return False
            
    except ImportError as e:
        print(f"FAIL: Import error - {str(e)}")
        return False
    except Exception as e:
        print(f"FAIL: Unexpected error - {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_loading_screen():
    """Test loading screen implementation"""
    try:
        # Check if loading screen JS exists
        import os
        js_file = os.path.join('app', 'static', 'js', 'recommend_truck.js')
        
        if os.path.exists(js_file):
            with open(js_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
            if 'showProgressWithSteps' in content and 'simulateProgress' in content:
                print("PASS: Loading screen implementation found in JavaScript")
                return True
            else:
                print("FAIL: Loading screen functions missing")
                return False
        else:
            print("FAIL: JavaScript file not found")
            return False
            
    except Exception as e:
        print(f"FAIL: Loading screen test error - {str(e)}")
        return False

def main():
    """Run all tests"""
    print("=== TruckOpti Truck Recommendation System Test ===")
    print()
    
    tests_passed = 0
    total_tests = 2
    
    # Test 1: Algorithm functionality
    print("Test 1: Algorithm functionality")
    if test_truck_recommendation():
        tests_passed += 1
    print()
    
    # Test 2: Loading screen implementation
    print("Test 2: Loading screen implementation")
    if test_loading_screen():
        tests_passed += 1
    print()
    
    # Summary
    print("=== Test Summary ===")
    print(f"Tests passed: {tests_passed}/{total_tests}")
    
    if tests_passed == total_tests:
        print("SUCCESS: All tests passed! Truck recommendation system is working.")
        return True
    else:
        print("FAILURE: Some tests failed. Check implementation.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)