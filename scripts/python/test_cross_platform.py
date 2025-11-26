#!/usr/bin/env python3
"""
Cross-Platform 3D Bin Packing Test Suite

Tests the improved cross-platform 3D bin packing algorithms across different
scenarios and verifies platform independence.
"""

import sys
import os

# Add TruckOpti_Microsoft to path
current_dir = os.path.dirname(os.path.abspath(__file__))
truck_opti_dir = os.path.join(current_dir, '..', '..', 'apps', 'desktop', 'TruckOpti_Microsoft')
sys.path.insert(0, truck_opti_dir)

import logging
from typing import List, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Simple table formatter for output
def format_table(data: List[List], headers: List[str]) -> str:
    """Format data as a simple ASCII table."""
    if not data:
        return "No data"
    
    # Calculate column widths
    col_widths = [len(h) for h in headers]
    for row in data:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(cell)))
    
    # Create separator
    separator = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"
    
    # Create header
    header = "|" + "|".join(f" {headers[i]:<{col_widths[i]}} " for i in range(len(headers))) + "|"
    
    # Create rows
    rows = []
    for row in data:
        row_str = "|" + "|".join(f" {str(row[i]):<{col_widths[i]}} " for i in range(len(row))) + "|"
        rows.append(row_str)
    
    # Combine
    return "\n".join([separator, header, separator] + rows + [separator])


def test_platform_detection():
    """Test platform detection functionality."""
    print("\n" + "="*80)
    print("Testing Platform Detection")
    print("="*80)
    
    try:
        from core.utils.platform_detector import (
            get_platform_detector,
            get_platform_type,
            get_platform_capabilities,
            get_optimal_worker_count
        )
        
        detector = get_platform_detector()
        platform_type = get_platform_type()
        capabilities = get_platform_capabilities()
        worker_count = get_optimal_worker_count()
        
        print(f"\n✓ Platform Detection: SUCCESS")
        print(f"  Platform: {capabilities.platform_name} {capabilities.platform_version}")
        print(f"  Type: {platform_type.value}")
        print(f"  CPU Cores: {capabilities.cpu_count} logical, {capabilities.cpu_count_physical} physical")
        print(f"  Memory: {capabilities.total_memory_gb:.1f} GB total, {capabilities.available_memory_gb:.1f} GB available")
        print(f"  Optimal Workers: {worker_count}")
        print(f"  Process Priority Support: {capabilities.supports_process_priority}")
        print(f"  Memory Optimization Support: {capabilities.supports_memory_optimization}")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Platform Detection: FAILED - {e}")
        return False


def test_system_optimizer():
    """Test cross-platform system optimizer."""
    print("\n" + "="*80)
    print("Testing System Optimizer")
    print("="*80)
    
    try:
        from core.system_optimizer import create_system_optimizer
        
        optimizer = create_system_optimizer()
        print(f"\n✓ System Optimizer Created: {optimizer.__class__.__name__}")
        
        # Get system info
        sys_info = optimizer.get_system_info()
        print(f"  Platform: {sys_info['platform']}")
        print(f"  CPU Usage: {sys_info.get('cpu_percent', 0):.1f}%")
        print(f"  Memory: {sys_info['total_memory_gb']:.1f} GB total")
        
        # Try optimization (will gracefully handle platform differences)
        print("\n  Testing optimizations...")
        results = optimizer.optimize_for_truck_optimization()
        print(f"  Success: {results['success']}")
        print(f"  Optimizations applied: {', '.join(results.get('optimizations', [])) or 'None'}")
        
        # Cleanup
        optimizer.cleanup_optimizations()
        print("  ✓ Cleanup completed")
        
        return True
        
    except Exception as e:
        print(f"\n✗ System Optimizer: FAILED - {e}")
        import traceback
        traceback.print_exc()
        return False


def test_scenario_configurations():
    """Test scenario configuration system."""
    print("\n" + "="*80)
    print("Testing Scenario Configurations")
    print("="*80)
    
    try:
        from core.config.scenario_config import (
            ScenarioType,
            get_config_manager,
            get_scenario_config
        )
        
        config_manager = get_config_manager()
        presets = config_manager.get_all_presets()
        
        print(f"\n✓ Found {len(presets)} scenario presets:")
        
        table_data = []
        for scenario_name, config in presets.items():
            table_data.append([
                scenario_name,
                config.name,
                f"{config.weights.space_utilization:.1f}",
                f"{config.weights.stability:.1f}",
                f"{config.algorithm_params.ransac_iterations}",
                f"{config.algorithm_params.optimization_passes}"
            ])
        
        headers = ["Type", "Name", "Space Weight", "Stability Weight", "RANSAC Iter", "Opt Passes"]
        print("\n" + format_table(table_data, headers))
        
        # Test loading a specific scenario
        warehouse_config = get_scenario_config(ScenarioType.WAREHOUSE)
        print(f"\n✓ Loaded Warehouse scenario: {warehouse_config.name}")
        print(f"  Description: {warehouse_config.description}")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Scenario Configuration: FAILED - {e}")
        import traceback
        traceback.print_exc()
        return False


def test_algorithms_with_scenarios():
    """Test algorithms with different scenario configurations."""
    print("\n" + "="*80)
    print("Testing Algorithms with Scenario Configurations")
    print("="*80)
    
    try:
        from core.algorithms.algorithm_factory import get_algorithm_factory, create_algorithm_for_scenario
        from core.config.scenario_config import ScenarioType
        from core.models.truck import Truck, TruckConstraints
        from core.models.carton import Carton
        
        # Create test truck
        constraints = TruckConstraints(
            max_length=600.0,
            max_width=240.0,
            max_height=240.0,
            max_weight=20000.0,
            max_volume=600.0 * 240.0 * 240.0
        )
        truck = Truck(
            id=1,
            name="Test Truck",
            constraints=constraints
        )
        
        # Create test cartons
        cartons = [
            Carton(id=1, name="Box1", length=100, width=80, height=60, weight=500, priority=5),
            Carton(id=2, name="Box2", length=120, width=100, height=80, weight=800, priority=3),
            Carton(id=3, name="Box3", length=80, width=60, height=40, weight=300, priority=7),
        ]
        
        results_table = []
        
        # Test different scenarios
        scenarios = [
            ScenarioType.WAREHOUSE,
            ScenarioType.DELIVERY,
            ScenarioType.ECOMMERCE
        ]
        
        for scenario in scenarios:
            print(f"\n  Testing {scenario.value} scenario...")
            
            # Create algorithm for scenario
            algorithm = create_algorithm_for_scenario(scenario)
            
            # Pack cartons
            packed_cartons, metrics = algorithm.pack_cartons(cartons, truck)
            
            results_table.append([
                scenario.value,
                algorithm.name,
                len(packed_cartons),
                f"{metrics['volume_utilization']:.1f}%",
                f"{metrics['weight_utilization']:.1f}%",
                f"{metrics['execution_time']:.3f}s"
            ])
            
            print(f"    ✓ Packed {len(packed_cartons)}/{len(cartons)} cartons")
            print(f"    Execution time: {metrics['execution_time']:.3f}s")
        
        # Display results
        headers = ["Scenario", "Algorithm", "Packed", "Vol %", "Weight %", "Time"]
        print("\n" + format_table(results_table, headers))
        
        print("\n✓ Algorithm testing completed successfully")
        return True
        
    except Exception as e:
        print(f"\n✗ Algorithm Testing: FAILED - {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests."""
    print("\n" + "="*80)
    print(" Cross-Platform 3D Bin Packing Test Suite")
    print("="*80)
    
    tests = [
        ("Platform Detection", test_platform_detection),
        ("System Optimizer", test_system_optimizer),
        ("Scenario Configurations", test_scenario_configurations),
        ("Algorithms with Scenarios", test_algorithms_with_scenarios)
    ]
    
    results = {}
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            print(f"\n✗ {test_name}: EXCEPTION - {e}")
            results[test_name] = False
    
    # Summary
    print("\n" + "="*80)
    print(" Test Summary")
    print("="*80)
    
    passed = sum(1 for r in results.values() if r)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Cross-platform improvements verified.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
