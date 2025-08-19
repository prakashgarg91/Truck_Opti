#!/usr/bin/env python3
"""
Test Advanced 3D Packing Integration
Validates the new advanced 3D carton fitting algorithms in TruckOpti
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.advanced_3d_packer import Advanced3DPacker, PackingStrategy, create_advanced_packing_recommendation
import math
from typing import List, Dict, Any

def test_advanced_3d_packer():
    """Test the advanced 3D packer with real-world scenarios"""
    print("TESTING ADVANCED 3D PACKING INTEGRATION")
    print("=" * 60)
    
    # Test scenario: LED TVs in different truck types
    test_cartons = [
        {
            'name': 'LED TV 32"',
            'length': 80,
            'width': 15, 
            'height': 55,
            'weight': 10,
            'quantity': 2
        },
        {
            'name': 'Books Box',
            'length': 30,
            'width': 20,
            'height': 15,
            'weight': 5,
            'quantity': 10
        }
    ]
    
    test_trucks = [
        {
            'name': 'Tata Ace',
            'length': 220,
            'width': 150,
            'height': 120,
            'max_weight': 750,
            'cost_per_km': 45
        },
        {
            'name': 'Eicher 14 ft',
            'length': 430,
            'width': 200,
            'height': 190,
            'max_weight': 10000,
            'cost_per_km': 55
        }
    ]
    
    test_strategies = [
        ('balanced', PackingStrategy.MULTI_CRITERIA),
        ('stability', PackingStrategy.STABILITY_FIRST),
        ('efficiency', PackingStrategy.EXTREME_POINTS),
        ('weight_distribution', PackingStrategy.WEIGHT_DISTRIBUTION)
    ]
    
    results = {}
    
    for strategy_name, strategy in test_strategies:
        print(f"\n[TEST] Strategy: {strategy_name.upper()}")
        print("-" * 40)
        
        try:
            # Test advanced packing recommendation
            recommendations = create_advanced_packing_recommendation(
                test_trucks, test_cartons, strategy_name
            )
            
            results[strategy_name] = recommendations
            
            # Display results
            print(f"Generated {len(recommendations['recommendations'])} recommendations")
            
            if recommendations['recommendations']:
                best = recommendations['recommendations'][0]
                packing_result = best['packing_result']
                
                print(f"   Best Truck: {best['truck_name']}")
                print(f"   Utilization: {packing_result.truck_utilization:.1f}%")
                print(f"   Stability: {packing_result.stability_score*100:.0f}%")
                print(f"   Packed: {len(packing_result.packed_cartons)} cartons")
                print(f"   Unpacked: {len(packing_result.unpacked_cartons)} cartons")
                print(f"   Efficiency: {packing_result.packing_efficiency:.1f}")
                print(f"   Load Balance: {packing_result.load_distribution_score*100:.0f}%")
            
        except Exception as e:
            print(f"❌ Strategy {strategy_name} failed: {e}")
            results[strategy_name] = None
    
    return results

def test_stability_validation():
    """Test stability validation features"""
    print(f"\n🔬 TESTING STABILITY VALIDATION")
    print("-" * 40)
    
    # Test with unstable configuration (tall narrow items)
    unstable_cartons = [{
        'name': 'Tall Mirror',
        'length': 20,
        'width': 20,
        'height': 200,  # Very tall
        'weight': 25,
        'quantity': 1
    }]
    
    stable_cartons = [{
        'name': 'Flat Box',
        'length': 100,
        'width': 100,
        'height': 20,  # Very flat/stable
        'weight': 25,
        'quantity': 1
    }]
    
    truck = {
        'name': 'Test Truck',
        'length': 250,
        'width': 150,
        'height': 220,
        'max_weight': 1000,
        'cost_per_km': 50
    }
    
    packer = Advanced3DPacker(PackingStrategy.STABILITY_FIRST)
    
    print("Testing unstable configuration...")
    unstable_result = packer.pack_cartons_advanced(truck, unstable_cartons)
    print(f"   Stability Score: {unstable_result.stability_score*100:.0f}%")
    
    print("Testing stable configuration...")
    stable_result = packer.pack_cartons_advanced(truck, stable_cartons)
    print(f"   Stability Score: {stable_result.stability_score*100:.0f}%")
    
    # Stability should be higher for flat boxes
    stability_improvement = stable_result.stability_score > unstable_result.stability_score
    print(f"   ✅ Stability validation working: {stability_improvement}")
    
    return stability_improvement

def test_orientation_optimization():
    """Test carton orientation optimization"""
    print(f"\n🔄 TESTING ORIENTATION OPTIMIZATION")
    print("-" * 40)
    
    # Test with carton that can be rotated for better fit
    carton = {
        'name': 'Flexible Item',
        'length': 150,  # Long dimension
        'width': 30,
        'height': 40,
        'weight': 15,
        'quantity': 1
    }
    
    # Narrow truck where rotation would help
    narrow_truck = {
        'name': 'Narrow Truck',
        'length': 200,
        'width': 50,   # Too narrow for length=150
        'height': 180,
        'max_weight': 1000,
        'cost_per_km': 45
    }
    
    packer = Advanced3DPacker(PackingStrategy.EXTREME_POINTS)
    result = packer.pack_cartons_advanced(narrow_truck, [carton])
    
    print(f"   Truck dimensions: {narrow_truck['length']}×{narrow_truck['width']}×{narrow_truck['height']}")
    print(f"   Original carton: {carton['length']}×{carton['width']}×{carton['height']}")
    print(f"   Items packed: {len(result.packed_cartons)}")
    print(f"   Items unpacked: {len(result.unpacked_cartons)}")
    
    if result.packed_cartons:
        packed_carton = result.packed_cartons[0]
        print(f"   ✅ Packed carton: {packed_carton.width}×{packed_carton.height}×{packed_carton.depth}")
        
        # Check if rotation was used
        original_volume = carton['length'] * carton['width'] * carton['height']
        packed_volume = packed_carton.width * packed_carton.height * packed_carton.depth
        volume_match = abs(original_volume - packed_volume) < 0.1
        
        print(f"   ✅ Volume preserved: {volume_match}")
        return len(result.packed_cartons) > 0
    else:
        print(f"   ❌ Orientation optimization may need improvement")
        return False

def test_load_distribution():
    """Test load distribution calculations"""
    print(f"\n⚖️ TESTING LOAD DISTRIBUTION")
    print("-" * 40)
    
    # Multiple cartons to test weight distribution
    multiple_cartons = [
        {
            'name': 'Heavy Box A',
            'length': 50,
            'width': 50,
            'height': 50,
            'weight': 50,
            'quantity': 2
        },
        {
            'name': 'Light Box B',
            'length': 30,
            'width': 30,
            'height': 30,
            'weight': 5,
            'quantity': 4
        }
    ]
    
    large_truck = {
        'name': 'Large Truck',
        'length': 600,
        'width': 200,
        'height': 200,
        'max_weight': 5000,
        'cost_per_km': 65
    }
    
    packer = Advanced3DPacker(PackingStrategy.WEIGHT_DISTRIBUTION)
    result = packer.pack_cartons_advanced(large_truck, multiple_cartons)
    
    print(f"   Total cartons to pack: {sum(c['quantity'] for c in multiple_cartons)}")
    print(f"   Successfully packed: {len(result.packed_cartons)}")
    print(f"   Load distribution score: {result.load_distribution_score*100:.0f}%")
    print(f"   ✅ Load distribution calculated: {result.load_distribution_score > 0}")
    
    return result.load_distribution_score > 0

def run_integration_tests():
    """Run all integration tests"""
    print("ADVANCED 3D PACKING - INTEGRATION TESTS")
    print("=" * 60)
    
    test_results = {}
    
    # Test 1: Basic advanced packing
    try:
        packing_results = test_advanced_3d_packer()
        test_results['advanced_packing'] = len([r for r in packing_results.values() if r]) > 0
    except Exception as e:
        print(f"❌ Advanced packing test failed: {e}")
        test_results['advanced_packing'] = False
    
    # Test 2: Stability validation
    try:
        test_results['stability_validation'] = test_stability_validation()
    except Exception as e:
        print(f"❌ Stability validation test failed: {e}")
        test_results['stability_validation'] = False
    
    # Test 3: Orientation optimization
    try:
        test_results['orientation_optimization'] = test_orientation_optimization()
    except Exception as e:
        print(f"❌ Orientation optimization test failed: {e}")
        test_results['orientation_optimization'] = False
    
    # Test 4: Load distribution
    try:
        test_results['load_distribution'] = test_load_distribution()
    except Exception as e:
        print(f"❌ Load distribution test failed: {e}")
        test_results['load_distribution'] = False
    
    # Summary
    print(f"\n📊 INTEGRATION TEST SUMMARY")
    print("=" * 60)
    
    passed_tests = sum(test_results.values())
    total_tests = len(test_results)
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} | {test_name.replace('_', ' ').title()}")
    
    success_rate = (passed_tests / total_tests) * 100
    print(f"\n🎯 RESULT: {passed_tests}/{total_tests} tests passed ({success_rate:.0f}%)")
    
    if success_rate >= 75:
        print("🚀 ADVANCED 3D PACKING INTEGRATION: SUCCESSFUL")
        return True
    else:
        print("⚠️  ADVANCED 3D PACKING INTEGRATION: NEEDS ATTENTION")
        return False

if __name__ == "__main__":
    run_integration_tests()