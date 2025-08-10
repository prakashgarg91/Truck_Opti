#!/usr/bin/env python3
"""
Test the web interface truck recommendation system directly
"""

import requests
from urllib.parse import urlencode
import json

BASE_URL = "http://127.0.0.1:5000"

def test_web_recommendation(carton_data, scenario_name):
    """Test the web form recommendation endpoint"""
    print(f"\n{'='*50}")
    print(f"TESTING WEB INTERFACE: {scenario_name}")
    print(f"{'='*50}")
    
    # Prepare form data for the web interface
    form_data = {}
    for i, (carton_id, qty) in enumerate(carton_data.items(), 1):
        form_data[f'carton_type_{i}'] = str(carton_id)
        form_data[f'carton_qty_{i}'] = str(qty)
    
    try:
        response = requests.post(
            f"{BASE_URL}/recommend-truck",
            data=form_data,
            allow_redirects=False
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            # Check if we got HTML response with recommendations
            content = response.text
            if 'recommended' in content.lower() and 'truck' in content.lower():
                print("✅ Web interface returned recommendation page")
                
                # Count occurrences of different truck names in the response
                truck_names = [
                    "Tata Ace", "Mahindra Jeeto", "Ashok Leyland Dost", 
                    "Eicher 14 ft", "Tata 14 ft", "Eicher 17 ft",
                    "Ashok Leyland 17 ft", "BharatBenz 19 ft"
                ]
                
                found_trucks = []
                for truck in truck_names:
                    if truck in content:
                        found_trucks.append(truck)
                
                print(f"Trucks mentioned in response: {found_trucks}")
                
                if len(found_trucks) > 1:
                    print("✅ Multiple truck types found in recommendations")
                elif len(found_trucks) == 1:
                    print(f"⚠️  Only one truck type found: {found_trucks[0]}")
                else:
                    print("❌ No recognizable truck types found")
                    
                return found_trucks
            else:
                print("❌ Response doesn't seem to contain recommendations")
                return []
        else:
            print(f"❌ Unexpected status code: {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def main():
    """Main testing function"""
    print("🌐 Testing TruckOpti Web Interface Recommendations")
    
    # Get carton types first
    try:
        carton_response = requests.get(f"{BASE_URL}/api/carton-types")
        cartons = {c['name']: c['id'] for c in carton_response.json()}
    except Exception as e:
        print(f"❌ Could not fetch carton types: {e}")
        return
    
    # Test scenarios with carton IDs
    test_scenarios = []
    
    # Small load test
    if 'Microwave' in cartons and 'Toaster' in cartons:
        small_load = {
            cartons['Microwave']: 2,
            cartons['Toaster']: 3
        }
        test_scenarios.append((small_load, "Small Load (5 cartons)"))
    
    # Medium load test  
    if 'LED TV 32' in cartons and 'Microwave' in cartons:
        medium_load = {
            cartons['LED TV 32']: 8,
            cartons['Microwave']: 7
        }
        test_scenarios.append((medium_load, "Medium Load (15 cartons)"))
    
    # Large load test
    if 'LED TV 32' in cartons and 'LED TV 43' in cartons:
        large_load = {
            cartons['LED TV 32']: 25,
            cartons['LED TV 43']: 20
        }
        test_scenarios.append((large_load, "Large Load (45 cartons)"))
    
    # Heavy items test
    if 'Refrigerator Double Door' in cartons:
        heavy_load = {
            cartons['Refrigerator Double Door']: 5
        }
        test_scenarios.append((heavy_load, "Heavy Items (5 refrigerators)"))
    
    # Run all tests
    all_results = []
    for carton_data, scenario_name in test_scenarios:
        results = test_web_recommendation(carton_data, scenario_name)
        all_results.append((scenario_name, results))
    
    # Summary
    print(f"\n{'='*50}")
    print("📊 WEB INTERFACE TEST SUMMARY")
    print(f"{'='*50}")
    
    diverse_scenarios = sum(1 for _, trucks in all_results if len(trucks) > 1)
    total_scenarios = len(all_results)
    
    print(f"Total scenarios tested: {total_scenarios}")
    print(f"Scenarios with diverse recommendations: {diverse_scenarios}")
    
    if diverse_scenarios >= total_scenarios * 0.5:
        print("✅ Web interface shows good recommendation diversity")
    else:
        print("⚠️  Web interface may still have limited diversity")

if __name__ == "__main__":
    main()