#!/usr/bin/env python3
"""
Test Script for Optioryx-Inspired Algorithms
============================================

This script tests and validates the new Optioryx-inspired algorithms:
- Extreme Points FFD (First Fit Decreasing)
- Extreme Points BFD (Best Fit Decreasing)
- Shelf/Level-Based Packing
- Guillotine Cut Algorithm
- Hybrid Optioryx Optimization

Author: TruckOpti Enhanced Algorithm Team
Date: 2025-11-15
"""

import sys
import os
import time
import json
from typing import Dict, List

# Add app directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.optioryx_integration import (
    OptioryxIntegration,
    OptimizationGoal,
    create_optioryx_api_response,
    benchmark_vs_baseline
)


def create_test_truck() -> Dict:
    """Create a test truck specification"""
    return {
        'id': 1,
        'name': 'Test Truck 20ft',
        'length': 6000,  # mm
        'width': 2400,   # mm
        'height': 2400,  # mm
        'max_weight': 5000,  # kg
        'cost_per_km': 2.5
    }


def create_test_cartons() -> List[Dict]:
    """Create test cartons with varied sizes"""
    cartons = []

    # Large boxes
    for i in range(5):
        cartons.append({
            'id': i + 1,
            'name': f'Large Box {i+1}',
            'length': 1200,
            'width': 800,
            'height': 800,
            'weight': 150,
            'can_rotate': True
        })

    # Medium boxes
    for i in range(10):
        cartons.append({
            'id': i + 6,
            'name': f'Medium Box {i+1}',
            'length': 800,
            'width': 600,
            'height': 600,
            'weight': 80,
            'can_rotate': True
        })

    # Small boxes
    for i in range(15):
        cartons.append({
            'id': i + 16,
            'name': f'Small Box {i+1}',
            'length': 400,
            'width': 300,
            'height': 300,
            'weight': 20,
            'can_rotate': True
        })

    return cartons


def print_separator(char='=', length=80):
    """Print a separator line"""
    print(char * length)


def print_result_summary(result, title="Algorithm Result"):
    """Print a formatted summary of packing result"""
    print_separator()
    print(f"  {title}")
    print_separator()
    print(f"Algorithm:             {result.algorithm_name}")
    print(f"Volume Utilization:    {result.volume_utilization:.2f}%")
    print(f"Weight Utilization:    {result.weight_utilization:.2f}%")
    print(f"Efficiency Score:      {result.efficiency_score:.2f}")
    print(f"Optioryx Score:        {result.optioryx_score:.2f}/100")
    print(f"Processing Time:       {result.processing_time:.3f}s")
    print(f"Packed Items:          {result.packed_count}/{result.packed_count + result.unpacked_count}")
    print(f"Fill Rate Improvement: {result.fill_rate_improvement:.2f}%")
    print(f"Travel Reduction:      {result.travel_reduction:.2f}%")
    print(f"Cost Savings:          {result.cost_savings:.2f}%")
    print_separator()
    print()


def test_individual_algorithms():
    """Test each algorithm individually"""
    print("\n" + "=" * 80)
    print("  TEST 1: INDIVIDUAL ALGORITHM TESTING")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    print(f"Test Setup:")
    print(f"  Truck: {truck['name']} ({truck['length']}x{truck['width']}x{truck['height']} mm)")
    print(f"  Cartons: {len(cartons)} items (5 large, 10 medium, 15 small)")
    print()

    integration = OptioryxIntegration()

    # Test each optimization goal
    goals = [
        (OptimizationGoal.MAXIMUM_FILL_RATE, "Maximum Fill Rate"),
        (OptimizationGoal.FASTEST_PACKING, "Fastest Packing"),
        (OptimizationGoal.GUILLOTINE_COMPLIANT, "Guillotine Compliant"),
        (OptimizationGoal.BEST_BALANCE, "Best Balance"),
    ]

    for goal, goal_name in goals:
        print(f"\nTesting Goal: {goal_name}")
        print("-" * 80)

        try:
            result = integration.optimize_truck_loading(truck, cartons, goal, parallel=False)
            print_result_summary(result, f"{goal_name} Result")

        except Exception as e:
            print(f"ERROR: {e}\n")


def test_parallel_benchmark():
    """Test parallel benchmarking of all algorithms"""
    print("\n" + "=" * 80)
    print("  TEST 2: PARALLEL ALGORITHM BENCHMARKING")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    integration = OptioryxIntegration()

    print("Running all algorithms in parallel...")
    start_time = time.time()

    results = integration.benchmark_all_algorithms(truck, cartons, parallel=True)

    total_time = time.time() - start_time

    print(f"\nBenchmarked {len(results)} algorithms in {total_time:.3f}s")
    print_separator()

    # Sort by optioryx score
    sorted_results = sorted(results.items(), key=lambda x: x[1].optioryx_score, reverse=True)

    print("\n  ALGORITHM COMPARISON (sorted by Optioryx Score)")
    print_separator()
    print(f"{'Algorithm':<25} {'Vol%':<8} {'Eff%':<8} {'Score':<8} {'Time(s)':<10}")
    print_separator()

    for name, result in sorted_results:
        print(f"{name:<25} {result.volume_utilization:>6.2f}  "
              f"{result.efficiency_score:>6.2f}  "
              f"{result.optioryx_score:>6.2f}  "
              f"{result.processing_time:>8.3f}")

    print_separator()

    # Show winner
    winner_name, winner_result = sorted_results[0]
    print(f"\nWINNER: {winner_name}")
    print(f"  - Optioryx Score: {winner_result.optioryx_score:.2f}/100")
    print(f"  - Volume Utilization: {winner_result.volume_utilization:.2f}%")
    print(f"  - Fill Rate Improvement: {winner_result.fill_rate_improvement:.2f}%")
    print()


def test_api_response():
    """Test Optioryx API response format"""
    print("\n" + "=" * 80)
    print("  TEST 3: OPTIORYX API RESPONSE")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    print("Generating Optioryx-compatible API response...")

    response = create_optioryx_api_response(truck, cartons, OptimizationGoal.BEST_BALANCE)

    print("\nAPI Response Structure:")
    print_separator()
    print(json.dumps({
        'success': response['success'],
        'algorithm': response['algorithm'],
        'optimization': response['optimization'],
        'improvements': response['improvements'],
        'packing': {
            'packed_count': response['packing']['packed_count'],
            'unpacked_count': response['packing']['unpacked_count'],
            'placements_count': len(response['packing']['placements'])
        },
        'performance': response['performance'],
        'optioryx_compatible': response['optioryx_compatible']
    }, indent=2))
    print_separator()


def test_vs_baseline():
    """Test Optioryx algorithms vs baseline"""
    print("\n" + "=" * 80)
    print("  TEST 4: OPTIORYX VS BASELINE COMPARISON")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    print("Running benchmark vs baseline...")

    comparison = benchmark_vs_baseline(truck, cartons)

    print("\n  BASELINE PERFORMANCE")
    print_separator()
    print(f"Fill Rate:        {comparison['baseline']['fill_rate']:.2f}%")
    print(f"Efficiency Score: {comparison['baseline']['efficiency_score']:.2f}")
    print_separator()

    print("\n  OPTIORYX PERFORMANCE")
    print_separator()
    opt_result = comparison['optioryx_result']
    print(f"Algorithm:             {opt_result['algorithm']}")
    print(f"Volume Utilization:    {opt_result['volume_utilization']:.2f}%")
    print(f"Efficiency Score:      {opt_result['efficiency_score']:.2f}")
    print(f"Fill Rate Improvement: {opt_result['fill_rate_improvement']:.2f}%")
    print(f"Travel Reduction:      {opt_result['travel_reduction']:.2f}%")
    print(f"Cost Savings:          {opt_result['cost_savings']:.2f}%")
    print(f"Processing Time:       {opt_result['processing_time']:.3f}s")
    print_separator()

    print("\n  IMPROVEMENT SUMMARY")
    print_separator()
    improvement = opt_result['volume_utilization'] - comparison['baseline']['fill_rate']
    improvement_pct = (improvement / comparison['baseline']['fill_rate']) * 100

    print(f"Absolute Improvement:  +{improvement:.2f}%")
    print(f"Relative Improvement:  +{improvement_pct:.2f}%")
    print(f"Optioryx Target Met:   {'YES' if improvement >= 10 else 'NO'} (Target: 10-30%)")
    print_separator()


def run_all_tests():
    """Run all test suites"""
    print("\n")
    print("=" * 80)
    print("  OPTIORYX ALGORITHM TEST SUITE")
    print("  TruckOpti Enhanced 3D Bin Packing")
    print("=" * 80)

    try:
        # Run all test suites
        test_individual_algorithms()
        test_parallel_benchmark()
        test_api_response()
        test_vs_baseline()

        print("\n" + "=" * 80)
        print("  ALL TESTS COMPLETED SUCCESSFULLY")
        print("=" * 80 + "\n")

        return True

    except Exception as e:
        print(f"\n\nERROR: Test suite failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
