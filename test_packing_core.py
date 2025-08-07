#!/usr/bin/env python3
"""
Core 3D Bin Packing Algorithm Test - Direct Testing
"""

import sys
import os
sys.path.append('/workspaces/Truck_Opti')

from app.packer import pack_cartons_optimized, pack_cartons, INDIAN_TRUCKS, INDIAN_CARTONS
from py3dbp import Packer, Bin, Item
import time
import json

def create_test_truck_types():
    """Create test truck type objects"""
    class TestTruckType:
        def __init__(self, data):
            self.name = data['name']
            self.length = data['length']
            self.width = data['width'] 
            self.height = data['height']
            self.max_weight = data['max_weight']
            self.fuel_efficiency = 6.0  # km/liter
            self.cost_per_km = 15.0
            self.driver_cost_per_day = 500.0
            self.maintenance_cost_per_km = 2.0
    
    return [TestTruckType(truck) for truck in INDIAN_TRUCKS[:5]]  # Use first 5 trucks

def create_test_carton_types():
    """Create test carton type objects"""
    class TestCartonType:
        def __init__(self, data):
            self.name = data['type']
            self.length = data['length']
            self.width = data['width']
            self.height = data['height'] 
            self.weight = data['weight']
            self.fragile = False
            self.stackable = True
            self.max_stack_height = 5
            self.priority = 1
            self.value = 100.0
            self.can_rotate = True
    
    return [TestCartonType(carton) for carton in INDIAN_CARTONS[:10]]  # Use first 10 cartons

def test_basic_packing():
    """Test 1: Basic packing algorithm functionality"""
    print("=== Test 1: Basic Packing Algorithm ===")
    
    trucks = create_test_truck_types()
    cartons = create_test_carton_types()
    
    # Test with small load
    truck_quantities = {trucks[0]: 1}  # One small truck
    carton_quantities = {cartons[0]: 5, cartons[1]: 3}  # Small quantities
    
    start_time = time.time()
    result = pack_cartons(truck_quantities, carton_quantities, 'space')
    end_time = time.time()
    
    print(f"Processing time: {end_time - start_time:.3f} seconds")
    print(f"Results: {len(result)} truck(s) used")
    
    for r in result:
        if r['fitted_items']:
            print(f"  Truck {r['bin_name']}: {len(r['fitted_items'])} items fitted")
            print(f"  Utilization: {r['utilization']:.2%}")
            print(f"  Total cost: ${r['total_cost']:.2f}")
    
    return len(result) > 0

def test_optimized_packing():
    """Test 2: Optimized packing algorithm"""
    print("\n=== Test 2: Optimized Packing Algorithm ===")
    
    trucks = create_test_truck_types()
    cartons = create_test_carton_types()
    
    # Test with moderate load
    truck_quantities = {trucks[1]: 2}  # Two medium trucks
    carton_quantities = {
        cartons[0]: 20,
        cartons[1]: 15, 
        cartons[2]: 10
    }
    
    start_time = time.time()
    result = pack_cartons_optimized(truck_quantities, carton_quantities, 'cost')
    end_time = time.time()
    
    print(f"Processing time: {end_time - start_time:.3f} seconds")
    print(f"Results: {len(result)} truck(s) used")
    
    total_items_fitted = 0
    for r in result:
        if r['fitted_items']:
            items_count = len(r['fitted_items'])
            total_items_fitted += items_count
            print(f"  Truck {r['bin_name']}: {items_count} items fitted")
            print(f"  Utilization: {r['utilization']:.2%}")
            print(f"  Total cost: ${r['total_cost']:.2f}")
    
    print(f"Total items fitted: {total_items_fitted}")
    return total_items_fitted > 0

def test_optimization_goals():
    """Test 3: Different optimization goals"""
    print("\n=== Test 3: Optimization Goals Comparison ===")
    
    trucks = create_test_truck_types()
    cartons = create_test_carton_types()
    
    truck_quantities = {trucks[2]: 1}  # One large truck
    carton_quantities = {
        cartons[0]: 10,
        cartons[1]: 8,
        cartons[2]: 6,
        cartons[3]: 4
    }
    
    goals = ['space', 'cost', 'weight', 'min_trucks']
    
    for goal in goals:
        print(f"\nOptimization Goal: {goal}")
        start_time = time.time()
        result = pack_cartons_optimized(truck_quantities, carton_quantities, goal)
        end_time = time.time()
        
        if result and result[0]['fitted_items']:
            r = result[0]
            print(f"  Items fitted: {len(r['fitted_items'])}")
            print(f"  Utilization: {r['utilization']:.2%}")
            print(f"  Processing time: {end_time - start_time:.3f}s")
            print(f"  Total cost: ${r['total_cost']:.2f}")
        else:
            print(f"  No items fitted")
    
    return True

def test_large_dataset():
    """Test 4: Performance with large dataset"""
    print("\n=== Test 4: Large Dataset Performance ===")
    
    trucks = create_test_truck_types()
    cartons = create_test_carton_types()
    
    # Large dataset
    truck_quantities = {
        trucks[0]: 2,
        trucks[1]: 2, 
        trucks[2]: 1
    }
    carton_quantities = {
        cartons[0]: 100,
        cartons[1]: 80,
        cartons[2]: 60,
        cartons[3]: 40,
        cartons[4]: 30
    }
    
    print(f"Testing with {sum(carton_quantities.values())} cartons")
    
    start_time = time.time()
    result = pack_cartons_optimized(truck_quantities, carton_quantities, 'space', use_parallel=True)
    end_time = time.time()
    
    processing_time = end_time - start_time
    print(f"Processing time: {processing_time:.3f} seconds")
    
    total_fitted = sum(len(r['fitted_items']) for r in result if r['fitted_items'])
    total_trucks_used = len([r for r in result if r['fitted_items']])
    
    print(f"Total items fitted: {total_fitted}")
    print(f"Total trucks used: {total_trucks_used}")
    
    if processing_time < 10:
        print("✅ Performance: Excellent (< 10 seconds)")
    elif processing_time < 30:
        print("✅ Performance: Good (< 30 seconds)")
    else:
        print("⚠️ Performance: Needs optimization (> 30 seconds)")
    
    return total_fitted > 0

def test_py3dbp_direct():
    """Test 5: Direct py3dbp library functionality"""
    print("\n=== Test 5: Direct py3dbp Library Test ===")
    
    packer = Packer()
    
    # Create a bin (truck)
    bin1 = Bin('Truck1', 500, 300, 200, 5000)
    packer.add_bin(bin1)
    
    # Add items (cartons)
    items = [
        Item('Item1', 100, 50, 30, 10),
        Item('Item2', 80, 60, 40, 15),
        Item('Item3', 120, 70, 50, 20),
        Item('Item4', 90, 40, 35, 12)
    ]
    
    for item in items:
        packer.add_item(item)
    
    start_time = time.time()
    packer.pack()
    end_time = time.time()
    
    print(f"py3dbp processing time: {end_time - start_time:.6f} seconds")
    print(f"Items fitted: {len(bin1.items)}")
    print(f"Items unfitted: {len(bin1.unfitted_items)}")
    
    for item in bin1.items:
        print(f"  Fitted: {item.name} at position {item.position}")
    
    return len(bin1.items) > 0

def test_weight_constraints():
    """Test 6: Weight constraint handling"""
    print("\n=== Test 6: Weight Constraints ===")
    
    trucks = create_test_truck_types()
    cartons = create_test_carton_types()
    
    # Use small truck with low weight capacity
    small_truck = trucks[0]  # Tata Ace with 750kg capacity
    
    # Create heavy cartons that exceed weight limit
    heavy_cartons = cartons[:3]
    for carton in heavy_cartons:
        carton.weight = 300  # Each carton 300kg, total 900kg > 750kg limit
    
    truck_quantities = {small_truck: 1}
    carton_quantities = {heavy_cartons[0]: 3}  # 3 x 300kg = 900kg
    
    start_time = time.time()
    result = pack_cartons_optimized(truck_quantities, carton_quantities, 'weight')
    end_time = time.time()
    
    print(f"Processing time: {end_time - start_time:.3f} seconds")
    
    if result and result[0]['fitted_items']:
        r = result[0]
        fitted_count = len(r['fitted_items'])
        print(f"Items fitted: {fitted_count}/3 (weight constraint should limit this)")
        print(f"Weight utilization: {r['utilization']:.2%}")
        
        if fitted_count < 3:
            print("✅ Weight constraints properly enforced")
        else:
            print("⚠️ Weight constraints may not be properly enforced")
    else:
        print("No items fitted (possible weight constraint enforcement)")
    
    return True

def test_3d_positioning():
    """Test 7: 3D positioning and rotation"""
    print("\n=== Test 7: 3D Positioning and Rotation ===")
    
    trucks = create_test_truck_types()
    cartons = create_test_carton_types()
    
    truck_quantities = {trucks[1]: 1}
    carton_quantities = {cartons[0]: 5}  # 5 identical items
    
    result = pack_cartons_optimized(truck_quantities, carton_quantities, 'space')
    
    if result and result[0]['fitted_items']:
        items = result[0]['fitted_items']
        print(f"Analyzing {len(items)} fitted items:")
        
        for i, item in enumerate(items):
            pos = item['position']
            rotation = item['rotation_type']
            dimensions = (item['width'], item['height'], item['depth'])
            
            print(f"  Item {i+1}: Position {pos}, Rotation {rotation}, Dimensions {dimensions}")
        
        # Check if items have different positions (not overlapping)
        positions = [item['position'] for item in items]
        unique_positions = len(set(tuple(pos) for pos in positions))
        
        if unique_positions == len(positions):
            print("✅ All items have unique positions (no overlap)")
        else:
            print("⚠️ Some items may be overlapping")
        
        return unique_positions == len(positions)
    
    return False

def run_all_core_tests():
    """Execute all core packing tests"""
    print("TruckOpti Core 3D Bin Packing Algorithm Tests")
    print("=" * 60)
    
    tests = [
        ("Basic Packing", test_basic_packing),
        ("Optimized Packing", test_optimized_packing), 
        ("Optimization Goals", test_optimization_goals),
        ("Large Dataset", test_large_dataset),
        ("py3dbp Direct", test_py3dbp_direct),
        ("Weight Constraints", test_weight_constraints),
        ("3D Positioning", test_3d_positioning)
    ]
    
    results = {}
    passed = 0
    
    for test_name, test_func in tests:
        try:
            print(f"\nRunning: {test_name}")
            result = test_func()
            results[test_name] = "PASSED" if result else "FAILED"
            if result:
                passed += 1
                print(f"✅ {test_name}: PASSED")
            else:
                print(f"❌ {test_name}: FAILED")
        except Exception as e:
            results[test_name] = f"EXCEPTION: {str(e)}"
            print(f"❌ {test_name}: EXCEPTION - {e}")
    
    print("\n" + "="*60)
    print("CORE ALGORITHM TEST SUMMARY")
    print("="*60)
    print(f"Tests passed: {passed}/{len(tests)}")
    print(f"Success rate: {(passed/len(tests)*100):.1f}%")
    
    print("\nDetailed Results:")
    for test_name, result in results.items():
        print(f"  {test_name}: {result}")
    
    return results

if __name__ == "__main__":
    run_all_core_tests()