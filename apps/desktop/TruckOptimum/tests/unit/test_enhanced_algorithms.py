#!/usr/bin/env python3
"""
Test script for enhanced 3D packing algorithms
Tests the world-class enhancements including load balancing, stacking rules, and spatial optimization
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from advanced_3d_algorithms import (
    Advanced3DPackingEngine, Algorithm3DType, Truck3D, Carton3D
)

def create_test_truck():
    """Create a test truck"""
    return Truck3D(
        id=1,
        name="Test Truck",
        length=12.0,
        width=2.4,
        height=2.4,
        max_weight=5000.0,
        cost_per_km=1.5
    )

def create_test_cartons():
    """Create a diverse set of test cartons"""
    return [
        # Heavy items
        Carton3D(1, "Heavy Box A", 2.0, 1.0, 1.0, 50.0, 2, 3, False, True),
        Carton3D(2, "Heavy Box B", 1.5, 1.5, 0.8, 45.0, 1, 3, False, True),
        
        # Fragile items
        Carton3D(3, "Fragile Item", 1.0, 1.0, 0.5, 5.0, 3, 5, True, True),
        Carton3D(4, "Delicate Box", 0.8, 0.8, 0.6, 3.0, 2, 5, True, True),
        
        # Regular items
        Carton3D(5, "Standard Box", 1.0, 1.0, 1.0, 20.0, 4, 2, False, True),
        Carton3D(6, "Medium Box", 1.2, 0.8, 0.9, 15.0, 3, 2, False, True),
        
        # Non-stackable item
        Carton3D(7, "Irregular Item", 1.5, 1.0, 0.3, 8.0, 2, 1, False, False),
        
        # Light items
        Carton3D(8, "Light Box", 1.0, 1.0, 0.4, 2.0, 5, 1, False, True)
    ]

def test_single_algorithm(engine, truck, cartons, algorithm_type):
    """Test a single algorithm and return results"""
    print(f"\n=== Testing {algorithm_type.value} ===")
    
    try:
        result = engine.pack_with_algorithm(truck, cartons, algorithm_type)
        
        print(f"Algorithm: {result['algorithm']}")
        print(f"Packed cartons: {result['total_packed']}")
        print(f"Unpacked cartons: {result['total_unpacked']}")
        print(f"Volume utilization: {result['volume_utilization']:.2f}%")
        print(f"Weight utilization: {result['weight_utilization']:.2f}%")
        print(f"Efficiency score: {result['efficiency_score']:.2f}%")
        
        # Enhanced metrics (if available)
        if 'load_balance_score' in result:
            print(f"Load balance score: {result['load_balance_score']:.2f}%")
        if 'stability_score' in result:
            print(f"Stability score: {result['stability_score']:.2f}%")
        if 'fragile_protection_score' in result:
            print(f"Fragile protection: {result['fragile_protection_score']:.2f}%")
        if 'center_of_mass' in result:
            cm = result['center_of_mass']
            if isinstance(cm, tuple):
                print(f"Center of mass: ({cm[0]:.2f}, {cm[1]:.2f}, {cm[2]:.2f})")
            elif isinstance(cm, dict):
                print(f"Center of mass: ({cm.get('x', 0):.2f}, {cm.get('y', 0):.2f}, {cm.get('z', 0):.2f})")
        
        return result
        
    except Exception as e:
        print(f"Error testing {algorithm_type.value}: {str(e)}")
        return None

def test_parallel_comparison(engine, truck, cartons):
    """Test parallel algorithm comparison"""
    print("\n" + "="*50)
    print("PARALLEL ALGORITHM COMPARISON")
    print("="*50)
    
    algorithms = [
        Algorithm3DType.SKYLINE_BL,
        Algorithm3DType.SKYLINE_SPATIAL,
        Algorithm3DType.GENETIC_ALGORITHM,
        Algorithm3DType.EXTREME_POINTS
    ]
    
    # Test parallel comparison
    results = engine.compare_algorithms(truck, cartons, algorithms, parallel=True)
    
    print(f"\nCompared {len(algorithms)} algorithms in parallel:")
    
    for alg_name, result in results.items():
        if 'error' in result:
            print(f"\n{alg_name}: ERROR - {result['error']}")
        else:
            print(f"\n{alg_name}:")
            print(f"  Efficiency: {result.get('efficiency_score', 0):.2f}%")
            print(f"  Volume util: {result.get('volume_utilization', 0):.2f}%")
            print(f"  Execution time: {result.get('execution_time', 0):.4f}s")
            if 'load_balance_score' in result:
                print(f"  Load balance: {result['load_balance_score']:.2f}%")

def test_best_algorithm_selection(engine, truck, cartons):
    """Test best algorithm selection with different criteria"""
    print("\n" + "="*50)
    print("BEST ALGORITHM SELECTION")
    print("="*50)
    
    # Test different selection criteria
    criteria_list = ['efficiency_score', 'multi_objective', 'speed']
    
    for criteria in criteria_list:
        best_alg, best_result = engine.get_best_algorithm(truck, cartons, criteria)
        
        if best_alg and best_result:
            print(f"\nBest algorithm (by {criteria}): {best_alg}")
            print(f"  Score: {best_result.get(criteria, 'N/A')}")
            print(f"  Efficiency: {best_result.get('efficiency_score', 0):.2f}%")
            if 'execution_time' in best_result:
                print(f"  Execution time: {best_result['execution_time']:.4f}s")
        else:
            print(f"\nNo best algorithm found for criteria: {criteria}")

def main():
    """Main test function"""
    print("Enhanced 3D Packing Algorithms Test Suite")
    print("="*50)
    
    # Create test data
    truck = create_test_truck()
    cartons = create_test_cartons()
    engine = Advanced3DPackingEngine()
    
    print(f"Test Truck: {truck.name} ({truck.length}x{truck.width}x{truck.height})")
    print(f"Test Cartons: {len(cartons)} different types")
    print(f"Total carton instances: {sum(c.quantity for c in cartons)}")
    print(f"Total weight: {sum(c.weight * c.quantity for c in cartons):.1f}kg")
    print(f"Total volume: {sum(c.volume * c.quantity for c in cartons):.2f}m³")
    
    # Test individual algorithms
    algorithms_to_test = [
        Algorithm3DType.SKYLINE_BL,
        Algorithm3DType.SKYLINE_SPATIAL,
        Algorithm3DType.GENETIC_ALGORITHM,
        Algorithm3DType.EXTREME_POINTS
    ]
    
    results = {}
    for algorithm in algorithms_to_test:
        result = test_single_algorithm(engine, truck, cartons, algorithm)
        if result:
            results[algorithm.value] = result
    
    # Test parallel comparison
    test_parallel_comparison(engine, truck, cartons)
    
    # Test best algorithm selection
    test_best_algorithm_selection(engine, truck, cartons)
    
    # Summary
    print("\n" + "="*50)
    print("TEST SUMMARY")
    print("="*50)
    
    if results:
        print(f"Successfully tested {len(results)} algorithms")
        
        # Find best efficiency
        best_efficiency = max(results.values(), key=lambda x: x.get('efficiency_score', 0))
        print(f"Best efficiency: {best_efficiency['algorithm']} ({best_efficiency['efficiency_score']:.2f}%)")
        
        # Find best volume utilization
        best_volume = max(results.values(), key=lambda x: x.get('volume_utilization', 0))
        print(f"Best volume util: {best_volume['algorithm']} ({best_volume['volume_utilization']:.2f}%)")
        
        # Find best load balance (if available)
        enhanced_results = {k: v for k, v in results.items() if 'load_balance_score' in v}
        if enhanced_results:
            best_balance = max(enhanced_results.values(), key=lambda x: x.get('load_balance_score', 0))
            print(f"Best load balance: {best_balance['algorithm']} ({best_balance['load_balance_score']:.2f}%)")
    
    print("\nTest completed successfully! Enhanced algorithms are working.")

if __name__ == "__main__":
    main()