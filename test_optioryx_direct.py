#!/usr/bin/env python3
"""
Direct Test Script for Optioryx-Inspired Algorithms
===================================================

This script tests the new algorithms directly without Flask dependencies.

Author: TruckOpti Enhanced Algorithm Team
Date: 2025-11-15
"""

import sys
import os
import time
import json

# Direct imports without Flask app
sys.path.insert(0, os.path.dirname(__file__))

from app.optioryx_advanced_algorithms import (
    ExtremePointsPackerFFD,
    ExtremePointsPackerBFD,
    ShelfAlgorithmPacker,
    PackingAlgorithm
)

from app.guillotine_cut_algorithm import (
    GuillotineCutPacker,
    PartitionStrategy
)


def create_test_truck():
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


def create_test_cartons():
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
    print(f"Algorithm:             {result.algorithm_used}")
    print(f"Volume Utilization:    {result.volume_utilization:.2f}%")
    print(f"Weight Utilization:    {result.weight_utilization:.2f}%")
    print(f"Efficiency Score:      {result.efficiency_score:.2f}")
    print(f"Processing Time:       {result.processing_time:.3f}s")
    print(f"Packed Items:          {len(result.placements)}/{len(result.placements) + len(result.unpacked_items)}")

    if hasattr(result, 'extreme_points_used'):
        print(f"Extreme Points Used:   {result.extreme_points_used}")
    if hasattr(result, 'shelves_created'):
        print(f"Shelves Created:       {result.shelves_created}")
    if hasattr(result, 'guillotine_compliance'):
        print(f"Guillotine Compliance: {result.guillotine_compliance:.2f}%")

    print_separator()
    print()


def test_extreme_points_ffd():
    """Test Extreme Points FFD algorithm"""
    print("\n" + "=" * 80)
    print("  TEST 1: EXTREME POINTS FFD (First Fit Decreasing)")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    print(f"Test Setup:")
    print(f"  Truck: {truck['name']} ({truck['length']}x{truck['width']}x{truck['height']} mm)")
    print(f"  Cartons: {len(cartons)} items")
    print()

    try:
        packer = ExtremePointsPackerFFD()
        result = packer.pack(truck, cartons)
        print_result_summary(result, "Extreme Points FFD Result")

        # Validate results
        assert result.volume_utilization >= 0, "Volume utilization should be non-negative"
        assert result.processing_time > 0, "Processing time should be recorded"
        assert len(result.placements) > 0, "Should have packed at least some items"

        print("✓ TEST PASSED: Extreme Points FFD working correctly\n")
        return True

    except Exception as e:
        print(f"✗ TEST FAILED: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_extreme_points_bfd():
    """Test Extreme Points BFD algorithm"""
    print("\n" + "=" * 80)
    print("  TEST 2: EXTREME POINTS BFD (Best Fit Decreasing)")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    print(f"Test Setup:")
    print(f"  Truck: {truck['name']}")
    print(f"  Cartons: {len(cartons)} items")
    print()

    try:
        packer = ExtremePointsPackerBFD()
        result = packer.pack(truck, cartons)
        print_result_summary(result, "Extreme Points BFD Result")

        # Validate results
        assert result.volume_utilization >= 0, "Volume utilization should be non-negative"
        assert result.processing_time > 0, "Processing time should be recorded"
        assert len(result.placements) > 0, "Should have packed at least some items"

        print("✓ TEST PASSED: Extreme Points BFD working correctly\n")
        return True

    except Exception as e:
        print(f"✗ TEST FAILED: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_shelf_algorithm():
    """Test Shelf/Level-Based algorithm"""
    print("\n" + "=" * 80)
    print("  TEST 3: SHELF ALGORITHM (Level-Based Packing)")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    print(f"Test Setup:")
    print(f"  Truck: {truck['name']}")
    print(f"  Cartons: {len(cartons)} items")
    print()

    try:
        packer = ShelfAlgorithmPacker()
        result = packer.pack(truck, cartons)
        print_result_summary(result, "Shelf Algorithm Result")

        # Validate results
        assert result.volume_utilization >= 0, "Volume utilization should be non-negative"
        assert result.processing_time > 0, "Processing time should be recorded"
        assert len(result.placements) > 0, "Should have packed at least some items"
        assert result.shelves_created > 0, "Should have created at least one shelf"

        print("✓ TEST PASSED: Shelf Algorithm working correctly\n")
        return True

    except Exception as e:
        print(f"✗ TEST FAILED: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_guillotine_cut():
    """Test Guillotine Cut algorithm"""
    print("\n" + "=" * 80)
    print("  TEST 4: GUILLOTINE CUT ALGORITHM")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    print(f"Test Setup:")
    print(f"  Truck: {truck['name']}")
    print(f"  Cartons: {len(cartons)} items")
    print()

    try:
        packer = GuillotineCutPacker(strategy=PartitionStrategy.MINIMIZE_AREA)
        result = packer.pack(truck, cartons)
        print_result_summary(result, "Guillotine Cut Result")

        # Validate results
        assert result.volume_utilization >= 0, "Volume utilization should be non-negative"
        assert result.processing_time > 0, "Processing time should be recorded"
        assert len(result.placements) > 0, "Should have packed at least some items"
        assert result.guillotine_compliance == 100.0, "All items should be guillotine compliant"

        print("✓ TEST PASSED: Guillotine Cut Algorithm working correctly\n")
        return True

    except Exception as e:
        print(f"✗ TEST FAILED: {e}\n")
        import traceback
        traceback.print_exc()
        return False


def test_algorithm_comparison():
    """Compare all algorithms"""
    print("\n" + "=" * 80)
    print("  TEST 5: ALGORITHM COMPARISON")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    cartons = create_test_cartons()

    results = {}

    # Test all algorithms
    algorithms = [
        ("EP-FFD", ExtremePointsPackerFFD),
        ("EP-BFD", ExtremePointsPackerBFD),
        ("Shelf", ShelfAlgorithmPacker),
        ("Guillotine", GuillotineCutPacker),
    ]

    print("Running all algorithms for comparison...\n")

    for name, algo_class in algorithms:
        try:
            if name == "Guillotine":
                packer = algo_class(strategy=PartitionStrategy.MINIMIZE_AREA)
            else:
                packer = algo_class()

            result = packer.pack(truck, cartons)
            results[name] = result

        except Exception as e:
            print(f"✗ {name} failed: {e}")

    # Print comparison table
    print("\n  ALGORITHM COMPARISON TABLE")
    print_separator()
    print(f"{'Algorithm':<20} {'Vol%':<10} {'Eff%':<10} {'Packed':<10} {'Time(s)':<10}")
    print_separator()

    for name, result in results.items():
        packed_count = len(result.placements)
        total_count = packed_count + len(result.unpacked_items)

        print(f"{name:<20} {result.volume_utilization:>8.2f}  "
              f"{result.efficiency_score:>8.2f}  "
              f"{packed_count}/{total_count:<7} "
              f"{result.processing_time:>8.3f}")

    print_separator()

    # Find best performer
    if results:
        best_name = max(results.keys(), key=lambda k: results[k].efficiency_score)
        best_result = results[best_name]

        print(f"\n✓ BEST PERFORMER: {best_name}")
        print(f"  Volume Utilization: {best_result.volume_utilization:.2f}%")
        print(f"  Efficiency Score: {best_result.efficiency_score:.2f}")
        print()

    return len(results) == len(algorithms)


def test_different_scenarios():
    """Test with different carton configurations"""
    print("\n" + "=" * 80)
    print("  TEST 6: DIFFERENT PACKING SCENARIOS")
    print("=" * 80 + "\n")

    truck = create_test_truck()

    scenarios = [
        ("Few Large Items", [
            {'id': i, 'name': f'Large {i}', 'length': 1500, 'width': 1000,
             'height': 1000, 'weight': 200, 'can_rotate': True}
            for i in range(5)
        ]),
        ("Many Small Items", [
            {'id': i, 'name': f'Small {i}', 'length': 300, 'width': 200,
             'height': 200, 'weight': 10, 'can_rotate': True}
            for i in range(50)
        ]),
        ("Mixed Sizes", [
            {'id': 1, 'name': 'XL', 'length': 2000, 'width': 1200, 'height': 1200, 'weight': 300, 'can_rotate': True},
            {'id': 2, 'name': 'L', 'length': 1000, 'width': 800, 'height': 800, 'weight': 150, 'can_rotate': True},
            {'id': 3, 'name': 'M', 'length': 600, 'width': 400, 'height': 400, 'weight': 50, 'can_rotate': True},
            {'id': 4, 'name': 'S', 'length': 300, 'width': 200, 'height': 200, 'weight': 15, 'can_rotate': True},
        ] * 5),
    ]

    all_passed = True

    for scenario_name, cartons in scenarios:
        print(f"\nScenario: {scenario_name} ({len(cartons)} items)")
        print("-" * 80)

        try:
            # Test with EP-FFD (fastest)
            packer = ExtremePointsPackerFFD()
            result = packer.pack(truck, cartons)

            print(f"  Volume Utilization: {result.volume_utilization:.2f}%")
            print(f"  Packed: {len(result.placements)}/{len(result.placements) + len(result.unpacked_items)}")
            print(f"  Processing Time: {result.processing_time:.3f}s")
            print(f"  ✓ Scenario passed")

        except Exception as e:
            print(f"  ✗ Scenario failed: {e}")
            all_passed = False

    print()
    return all_passed


def test_edge_cases():
    """Test edge cases and error handling"""
    print("\n" + "=" * 80)
    print("  TEST 7: EDGE CASES AND ERROR HANDLING")
    print("=" * 80 + "\n")

    truck = create_test_truck()
    all_passed = True

    # Test 1: Empty carton list
    print("Test 7.1: Empty carton list")
    try:
        packer = ExtremePointsPackerFFD()
        result = packer.pack(truck, [])
        assert len(result.placements) == 0, "Should have no placements for empty input"
        print("  ✓ Handles empty input correctly\n")
    except Exception as e:
        print(f"  ✗ Failed: {e}\n")
        all_passed = False

    # Test 2: Single item that fits
    print("Test 7.2: Single item that fits")
    try:
        packer = ExtremePointsPackerFFD()
        cartons = [{'id': 1, 'name': 'Box', 'length': 1000, 'width': 800,
                   'height': 800, 'weight': 100, 'can_rotate': True}]
        result = packer.pack(truck, cartons)
        assert len(result.placements) == 1, "Should pack the single item"
        print("  ✓ Handles single item correctly\n")
    except Exception as e:
        print(f"  ✗ Failed: {e}\n")
        all_passed = False

    # Test 3: Item too large for truck
    print("Test 7.3: Item too large for truck")
    try:
        packer = ExtremePointsPackerFFD()
        cartons = [{'id': 1, 'name': 'Huge', 'length': 10000, 'width': 10000,
                   'height': 10000, 'weight': 1000, 'can_rotate': True}]
        result = packer.pack(truck, cartons)
        assert len(result.placements) == 0, "Should not pack oversized item"
        assert len(result.unpacked_items) == 1, "Should mark item as unpacked"
        print("  ✓ Handles oversized items correctly\n")
    except Exception as e:
        print(f"  ✗ Failed: {e}\n")
        all_passed = False

    # Test 4: Items without rotation allowed
    print("Test 7.4: Items without rotation")
    try:
        packer = ExtremePointsPackerFFD()
        cartons = [{'id': i, 'name': f'NoRotate{i}', 'length': 800, 'width': 600,
                   'height': 600, 'weight': 80, 'can_rotate': False}
                  for i in range(5)]
        result = packer.pack(truck, cartons)
        assert len(result.placements) > 0, "Should pack some items without rotation"
        print(f"  ✓ Handles rotation constraints correctly (packed {len(result.placements)}/5)\n")
    except Exception as e:
        print(f"  ✗ Failed: {e}\n")
        all_passed = False

    return all_passed


def run_all_tests():
    """Run all test suites"""
    print("\n")
    print("=" * 80)
    print("  OPTIORYX ALGORITHM COMPREHENSIVE TEST SUITE")
    print("  TruckOpti Enhanced 3D Bin Packing - Direct Testing")
    print("=" * 80)

    test_results = []

    # Run all tests
    test_results.append(("Extreme Points FFD", test_extreme_points_ffd()))
    test_results.append(("Extreme Points BFD", test_extreme_points_bfd()))
    test_results.append(("Shelf Algorithm", test_shelf_algorithm()))
    test_results.append(("Guillotine Cut", test_guillotine_cut()))
    test_results.append(("Algorithm Comparison", test_algorithm_comparison()))
    test_results.append(("Different Scenarios", test_different_scenarios()))
    test_results.append(("Edge Cases", test_edge_cases()))

    # Summary
    print("\n" + "=" * 80)
    print("  TEST SUMMARY")
    print("=" * 80)

    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)

    for test_name, result in test_results:
        status = "✓ PASSED" if result else "✗ FAILED"
        print(f"{test_name:<30} {status}")

    print("=" * 80)
    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n✓ ALL TESTS PASSED SUCCESSFULLY! 🎉")
        print("\nOptioryx-inspired algorithms are production ready!")
        return True
    else:
        print(f"\n✗ {total - passed} test(s) failed")
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
