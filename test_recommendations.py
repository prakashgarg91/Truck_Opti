#!/usr/bin/env python3
"""
Comprehensive Testing Script for TruckOpti Recommendation System
Tests different load scenarios to verify algorithm diversity
"""

import requests
import json
import sys
import time

BASE_URL = "http://127.0.0.1:5000"

def get_carton_types():
    """Get all available carton types"""
    response = requests.get(f"{BASE_URL}/api/carton-types")
    if response.status_code == 200:
        return response.json()
    return []

def test_truck_recommendations(carton_data, scenario_name):
    """Test truck recommendations for given carton data"""
    print(f"\n{'='*60}")
    print(f"TESTING: {scenario_name}")
    print(f"{'='*60}")
    
    # Calculate total cartons
    total_cartons = sum(item['quantity'] for item in carton_data)
    print(f"Total cartons in this scenario: {total_cartons}")
    
    # Make API call to truck recommendation AI
    payload = {
        'cartons': carton_data,
        'max_trucks': 10
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/truck-recommendation-ai", json=payload)
        if response.status_code == 200:
            result = response.json()
            recommendations = result.get('recommendations', [])
            
            if recommendations:
                print(f"✅ Got {len(recommendations)} recommendations")
                for i, rec in enumerate(recommendations, 1):
                    print(f"\n  {i}. {rec['truck_type']} (Qty: {rec['quantity']})")
                    print(f"     Dimensions: {rec['truck_dimensions']}")
                    print(f"     Total Cost: ₹{rec['total_cost']:.2f}")
                    print(f"     Avg Utilization: {rec['avg_utilization']:.1%}")
                    print(f"     Packing Success: {rec['packing_success_rate']:.1%}")
                    print(f"     Efficiency Score: {rec['efficiency_score']:.3f}")
                    print(f"     Cost per Item: ₹{rec['cost_per_item']:.2f}")
                
                # Check for diversity (not all same truck type)
                unique_trucks = set(rec['truck_type'] for rec in recommendations)
                if len(unique_trucks) > 1:
                    print(f"\n✅ DIVERSITY CHECK PASSED: {len(unique_trucks)} different truck types recommended")
                else:
                    print(f"\n⚠️  DIVERSITY CHECK FAILED: Only '{list(unique_trucks)[0]}' recommended")
                    
                return recommendations
            else:
                print("❌ No recommendations received")
                return []
        else:
            print(f"❌ API call failed: {response.status_code}")
            print(f"Response: {response.text}")
            return []
    except Exception as e:
        print(f"❌ Error making request: {e}")
        return []

def run_comprehensive_tests():
    """Run all test scenarios"""
    print("🚀 Starting Comprehensive Truck Recommendation Testing")
    
    # Get available carton types
    carton_types = get_carton_types()
    if not carton_types:
        print("❌ Could not fetch carton types")
        return
    
    print(f"📦 Found {len(carton_types)} carton types in system")
    
    # Create a mapping for easy access
    cartons = {c['name']: c for c in carton_types}
    
    test_scenarios = []
    
    # Test 1: Small load scenario (1-5 cartons)
    if 'Microwave' in cartons and 'Toaster' in cartons:
        small_load = [
            {'id': cartons['Microwave']['id'], 'quantity': 2},
            {'id': cartons['Toaster']['id'], 'quantity': 3}
        ]
        test_scenarios.append((small_load, "Small Load Scenario (5 cartons total)"))
    
    # Test 2: Medium load scenario (10-20 cartons)
    if 'LED TV 32' in cartons and 'Microwave' in cartons:
        medium_load = [
            {'id': cartons['LED TV 32']['id'], 'quantity': 8},
            {'id': cartons['Microwave']['id'], 'quantity': 7}
        ]
        test_scenarios.append((medium_load, "Medium Load Scenario (15 cartons total)"))
    
    # Test 3: Large load scenario (50+ cartons)  
    if 'LED TV 32' in cartons and 'LED TV 43' in cartons and 'Microwave' in cartons:
        large_load = [
            {'id': cartons['LED TV 32']['id'], 'quantity': 25},
            {'id': cartons['LED TV 43']['id'], 'quantity': 20},
            {'id': cartons['Microwave']['id'], 'quantity': 15}
        ]
        test_scenarios.append((large_load, "Large Load Scenario (60 cartons total)"))
    
    # Test 4: Mixed carton types (different sizes)
    available_cartons = list(cartons.keys())[:6]  # First 6 carton types
    mixed_load = [{'id': cartons[name]['id'], 'quantity': 5} for name in available_cartons]
    test_scenarios.append((mixed_load, f"Mixed Carton Types ({len(mixed_load) * 5} cartons total)"))
    
    # Test 5: Edge case - very large quantities
    if 'Toaster' in cartons:  # Small items in large quantities
        edge_load = [
            {'id': cartons['Toaster']['id'], 'quantity': 100}
        ]
        test_scenarios.append((edge_load, "Edge Case - Very Large Quantities (100 small items)"))
    
    # Test 6: Heavy items scenario
    if 'Refrigerator Double Door' in cartons:
        heavy_load = [
            {'id': cartons['Refrigerator Double Door']['id'], 'quantity': 10}
        ]
        test_scenarios.append((heavy_load, "Heavy Items Scenario (10 large refrigerators)"))
    
    # Run all test scenarios
    all_results = []
    for carton_data, scenario_name in test_scenarios:
        results = test_truck_recommendations(carton_data, scenario_name)
        all_results.append((scenario_name, results))
        time.sleep(1)  # Small delay between tests
    
    # Final analysis
    print(f"\n{'='*60}")
    print("📊 FINAL ANALYSIS")
    print(f"{'='*60}")
    
    total_tests = len(all_results)
    successful_tests = sum(1 for _, results in all_results if results)
    diverse_tests = sum(1 for _, results in all_results if len(set(r['truck_type'] for r in results)) > 1)
    
    print(f"Total test scenarios: {total_tests}")
    print(f"Successful tests: {successful_tests}")
    print(f"Tests with diverse recommendations: {diverse_tests}")
    
    # Check if Tata Ace bias is eliminated
    tata_ace_dominant = 0
    for scenario_name, results in all_results:
        if results:
            first_recommendation = results[0]['truck_type'] if results else ""
            if first_recommendation == "Tata Ace (Chhota Hathi)":
                tata_ace_dominant += 1
    
    if tata_ace_dominant == successful_tests and successful_tests > 1:
        print("⚠️  WARNING: Tata Ace still dominates ALL recommendations")
    elif tata_ace_dominant > successful_tests * 0.7:
        print(f"⚠️  WARNING: Tata Ace dominates {tata_ace_dominant}/{successful_tests} recommendations")
    else:
        print("✅ Tata Ace bias appears to be resolved")
    
    print(f"\n🎯 Diversity Score: {diverse_tests}/{successful_tests} ({(diverse_tests/successful_tests*100):.1f}%)")
    
    if diverse_tests >= successful_tests * 0.6:
        print("✅ OVERALL RESULT: Algorithm provides good diversity in recommendations")
    else:
        print("❌ OVERALL RESULT: Algorithm still lacks sufficient diversity")

if __name__ == "__main__":
    try:
        run_comprehensive_tests()
    except KeyboardInterrupt:
        print("\n⏹️  Testing interrupted by user")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)