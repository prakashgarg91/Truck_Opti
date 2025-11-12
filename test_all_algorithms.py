#!/usr/bin/env python3
"""
Comprehensive 3D Bin Packing Algorithm Testing Suite
Tests all 11 algorithms with various scenarios and generates detailed comparison report
"""

import sys
import os
import time
import json
from typing import List, Dict

# Try to import tabulate, use fallback if not available
try:
    from tabulate import tabulate
except ImportError:
    def tabulate(data, headers, tablefmt="grid"):
        """Simple fallback tabulate implementation"""
        if not data:
            return ""

        # Calculate column widths
        col_widths = [len(str(h)) for h in headers]
        for row in data:
            for i, cell in enumerate(row):
                col_widths[i] = max(col_widths[i], len(str(cell)))

        # Build table
        lines = []
        separator = "+" + "+".join(["-" * (w + 2) for w in col_widths]) + "+"

        # Header
        lines.append(separator)
        header_line = "|" + "|".join([f" {str(h):<{col_widths[i]}} " for i, h in enumerate(headers)]) + "|"
        lines.append(header_line)
        lines.append(separator)

        # Rows
        for row in data:
            row_line = "|" + "|".join([f" {str(cell):<{col_widths[i]}} " for i, cell in enumerate(row)]) + "|"
            lines.append(row_line)

        lines.append(separator)
        return "\n".join(lines)

# Add TruckOptimum to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'TruckOptimum'))

try:
    from advanced_3d_algorithms import (
        Advanced3DPackingEngine, Algorithm3DType,
        Carton3D, Truck3D, PlacedCarton
    )
    print("SUCCESS: Advanced algorithms imported successfully")
except ImportError as e:
    print(f"ERROR: Could not import advanced algorithms: {e}")
    sys.exit(1)


class AlgorithmTester:
    """Comprehensive algorithm testing and comparison"""

    def __init__(self):
        self.engine = Advanced3DPackingEngine()
        self.results = {}

    def create_test_scenario_1(self) -> tuple:
        """Small Mixed Load - Typical delivery scenario"""
        truck = Truck3D(
            id=1,
            name="Standard 20ft Truck",
            length=600,  # 6 meters
            width=240,   # 2.4 meters
            height=240,  # 2.4 meters
            max_weight=5000,  # 5 tons
            cost_per_km=2.5
        )

        cartons = [
            Carton3D(1, "Large Box", 100, 80, 60, 50, quantity=5, priority=2, fragile=False, stackable=True),
            Carton3D(2, "Medium Box", 60, 50, 40, 25, quantity=10, priority=1, fragile=False, stackable=True),
            Carton3D(3, "Small Box", 40, 30, 30, 10, quantity=15, priority=1, fragile=False, stackable=True),
            Carton3D(4, "Fragile Item", 50, 50, 50, 15, quantity=3, priority=3, fragile=True, stackable=False),
            Carton3D(5, "Heavy Item", 80, 80, 100, 200, quantity=2, priority=2, fragile=False, stackable=True),
        ]

        return truck, cartons, "Small Mixed Load (35 items)"

    def create_test_scenario_2(self) -> tuple:
        """Large Uniform Load - Warehouse scenario"""
        truck = Truck3D(
            id=2,
            name="Large 40ft Container",
            length=1200,  # 12 meters
            width=240,    # 2.4 meters
            height=260,   # 2.6 meters
            max_weight=20000,  # 20 tons
            cost_per_km=4.0
        )

        cartons = [
            Carton3D(1, "Standard Pallet", 120, 100, 80, 100, quantity=50, priority=1, fragile=False, stackable=True),
            Carton3D(2, "Half Pallet", 120, 50, 80, 50, quantity=30, priority=1, fragile=False, stackable=True),
        ]

        return truck, cartons, "Large Uniform Load (80 items)"

    def create_test_scenario_3(self) -> tuple:
        """Complex Mixed Load - E-commerce fulfillment"""
        truck = Truck3D(
            id=3,
            name="Medium Delivery Van",
            length=400,
            width=200,
            height=200,
            max_weight=2000,
            cost_per_km=1.8
        )

        cartons = [
            Carton3D(1, "Electronics Box", 50, 40, 30, 20, quantity=8, priority=3, fragile=True, stackable=False),
            Carton3D(2, "Clothing Box", 60, 40, 40, 15, quantity=12, priority=1, fragile=False, stackable=True),
            Carton3D(3, "Books Box", 40, 30, 25, 35, priority=1, quantity=10, fragile=False, stackable=True),
            Carton3D(4, "Large Appliance", 100, 80, 80, 150, quantity=2, priority=2, fragile=True, stackable=False),
            Carton3D(5, "Small Parts", 30, 20, 20, 5, quantity=20, priority=1, fragile=False, stackable=True),
            Carton3D(6, "Odd Shape", 70, 50, 90, 40, quantity=4, priority=2, fragile=False, stackable=True),
        ]

        return truck, cartons, "Complex Mixed Load (56 items)"

    def run_single_algorithm(self, algorithm_type: Algorithm3DType, truck: Truck3D,
                            cartons: List[Carton3D], scenario_name: str) -> Dict:
        """Run a single algorithm and capture results"""
        print(f"  Testing {algorithm_type.value}...", end=" ")

        try:
            start_time = time.time()
            result = self.engine.pack_with_algorithm(truck, cartons, algorithm_type)
            execution_time = time.time() - start_time

            # Add execution time to result
            result['execution_time'] = execution_time
            result['scenario'] = scenario_name
            result['algorithm_type'] = algorithm_type.value

            # Calculate total items
            total_items = sum(c.quantity for c in cartons)
            result['total_items'] = total_items
            result['packing_rate'] = (result['total_packed'] / total_items * 100) if total_items > 0 else 0

            print(f"DONE ({execution_time:.3f}s, {result['total_packed']}/{total_items} items)")
            return result

        except Exception as e:
            print(f"FAILED: {str(e)}")
            return {
                'algorithm': algorithm_type.value,
                'error': str(e),
                'execution_time': 0,
                'scenario': scenario_name,
                'total_packed': 0,
                'total_unpacked': sum(c.quantity for c in cartons),
                'volume_utilization': 0,
                'efficiency_score': 0
            }

    def run_all_algorithms(self, truck: Truck3D, cartons: List[Carton3D],
                          scenario_name: str) -> Dict[str, Dict]:
        """Run all algorithms on a scenario"""
        print(f"\n{'='*70}")
        print(f"Scenario: {scenario_name}")
        print(f"Truck: {truck.name} ({truck.length}x{truck.width}x{truck.height}cm, {truck.max_weight}kg)")
        print(f"Cartons: {sum(c.quantity for c in cartons)} items, {len(cartons)} types")
        print(f"{'='*70}")

        algorithms = [
            Algorithm3DType.SKYLINE_BL,
            Algorithm3DType.SKYLINE_SPATIAL,
            Algorithm3DType.GENETIC_ALGORITHM,
            Algorithm3DType.EXTREME_POINTS,
            Algorithm3DType.SIMULATED_ANNEALING,
            Algorithm3DType.BRANCH_AND_BOUND,
            Algorithm3DType.TABU_SEARCH,
            Algorithm3DType.ANT_COLONY,
            Algorithm3DType.PARTICLE_SWARM,
            Algorithm3DType.HYBRID_GENETIC,
            Algorithm3DType.DEEP_REINFORCEMENT
        ]

        results = {}
        for algo in algorithms:
            result = self.run_single_algorithm(algo, truck, cartons, scenario_name)
            results[algo.value] = result

        return results

    def generate_comparison_table(self, results: Dict[str, Dict]) -> str:
        """Generate formatted comparison table"""
        headers = [
            "Algorithm",
            "Packed",
            "Unpacked",
            "Pack%",
            "Vol%",
            "Weight%",
            "Balance",
            "Stability",
            "Fragile",
            "Time(s)"
        ]

        rows = []
        for algo_name, result in sorted(results.items(),
                                       key=lambda x: x[1].get('efficiency_score', 0),
                                       reverse=True):
            if 'error' in result:
                rows.append([
                    algo_name[:20],
                    "ERROR",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    f"{result['execution_time']:.3f}"
                ])
            else:
                rows.append([
                    algo_name[:20],
                    result.get('total_packed', 0),
                    result.get('total_unpacked', 0),
                    f"{result.get('packing_rate', 0):.1f}%",
                    f"{result.get('volume_utilization', 0):.1f}%",
                    f"{result.get('weight_utilization', 0):.1f}%",
                    f"{result.get('load_balance_score', 0):.1f}",
                    f"{result.get('stability_score', 100):.1f}",
                    f"{result.get('fragile_protection_score', 100):.1f}",
                    f"{result.get('execution_time', 0):.3f}"
                ])

        return tabulate(rows, headers=headers, tablefmt="grid")

    def find_best_algorithm(self, results: Dict[str, Dict]) -> tuple:
        """Find best performing algorithm"""
        best_by_efficiency = max(
            [(k, v) for k, v in results.items() if 'error' not in v],
            key=lambda x: x[1].get('efficiency_score', 0),
            default=(None, None)
        )

        best_by_speed = min(
            [(k, v) for k, v in results.items() if 'error' not in v],
            key=lambda x: x[1].get('execution_time', 999),
            default=(None, None)
        )

        best_by_volume = max(
            [(k, v) for k, v in results.items() if 'error' not in v],
            key=lambda x: x[1].get('volume_utilization', 0),
            default=(None, None)
        )

        return best_by_efficiency, best_by_speed, best_by_volume

    def generate_summary_report(self, all_results: Dict[str, Dict[str, Dict]]) -> str:
        """Generate comprehensive summary report"""
        report = []
        report.append("\n" + "="*80)
        report.append("COMPREHENSIVE ALGORITHM TEST REPORT")
        report.append("="*80)

        for scenario_name, results in all_results.items():
            report.append(f"\n{scenario_name}")
            report.append("-"*80)

            # Comparison table
            report.append(self.generate_comparison_table(results))

            # Best algorithms
            best_eff, best_speed, best_vol = self.find_best_algorithm(results)

            report.append("\nBest Performers:")
            if best_eff[0]:
                report.append(f"  Efficiency: {best_eff[0]} ({best_eff[1].get('efficiency_score', 0):.1f}%)")
            if best_speed[0]:
                report.append(f"  Speed:      {best_speed[0]} ({best_speed[1].get('execution_time', 0):.3f}s)")
            if best_vol[0]:
                report.append(f"  Volume:     {best_vol[0]} ({best_vol[1].get('volume_utilization', 0):.1f}%)")

        # Overall statistics
        report.append("\n" + "="*80)
        report.append("OVERALL STATISTICS")
        report.append("="*80)

        # Calculate average performance by algorithm across scenarios
        algo_stats = {}
        for scenario_name, results in all_results.items():
            for algo_name, result in results.items():
                if 'error' not in result:
                    if algo_name not in algo_stats:
                        algo_stats[algo_name] = {
                            'efficiency': [],
                            'volume': [],
                            'time': [],
                            'packed': []
                        }
                    algo_stats[algo_name]['efficiency'].append(result.get('efficiency_score', 0))
                    algo_stats[algo_name]['volume'].append(result.get('volume_utilization', 0))
                    algo_stats[algo_name]['time'].append(result.get('execution_time', 0))
                    algo_stats[algo_name]['packed'].append(result.get('packing_rate', 0))

        # Generate average performance table
        avg_headers = ["Algorithm", "Avg Efficiency", "Avg Volume", "Avg Pack%", "Avg Time"]
        avg_rows = []

        for algo_name, stats in sorted(algo_stats.items(),
                                       key=lambda x: sum(x[1]['efficiency'])/len(x[1]['efficiency']) if x[1]['efficiency'] else 0,
                                       reverse=True):
            if stats['efficiency']:
                avg_rows.append([
                    algo_name[:25],
                    f"{sum(stats['efficiency'])/len(stats['efficiency']):.1f}%",
                    f"{sum(stats['volume'])/len(stats['volume']):.1f}%",
                    f"{sum(stats['packed'])/len(stats['packed']):.1f}%",
                    f"{sum(stats['time'])/len(stats['time']):.3f}s"
                ])

        report.append(tabulate(avg_rows, headers=avg_headers, tablefmt="grid"))

        # Final recommendations
        report.append("\n" + "="*80)
        report.append("RECOMMENDATIONS")
        report.append("="*80)

        if avg_rows:
            best_overall = avg_rows[0][0]
            report.append(f"\nBest Overall Algorithm: {best_overall}")
            report.append(f"  - Highest average efficiency across all scenarios")
            report.append(f"  - Recommended for production use")

            fastest = min(avg_rows, key=lambda x: float(x[4].replace('s', '')))
            report.append(f"\nFastest Algorithm: {fastest[0]}")
            report.append(f"  - Average execution time: {fastest[4]}")
            report.append(f"  - Recommended for real-time operations")

        report.append("\n" + "="*80)

        return "\n".join(report)

    def save_results_json(self, all_results: Dict, filename: str = "algorithm_test_results.json"):
        """Save detailed results to JSON file"""
        # Convert PlacedCarton objects to dictionaries for JSON serialization
        serializable_results = {}

        for scenario_name, results in all_results.items():
            serializable_results[scenario_name] = {}
            for algo_name, result in results.items():
                serializable_result = {}
                for key, value in result.items():
                    if key in ['packed_cartons', 'unpacked_cartons']:
                        # Skip complex objects for now
                        serializable_result[key] = f"{len(value)} items"
                    elif key == 'center_of_mass' and isinstance(value, dict):
                        serializable_result[key] = value
                    elif key == 'center_of_mass' and isinstance(value, tuple):
                        serializable_result[key] = {
                            'x': value[0],
                            'y': value[1],
                            'z': value[2]
                        }
                    elif isinstance(value, (int, float, str, bool, type(None))):
                        serializable_result[key] = value
                    else:
                        serializable_result[key] = str(value)

                serializable_results[scenario_name][algo_name] = serializable_result

        with open(filename, 'w') as f:
            json.dump(serializable_results, f, indent=2)

        print(f"\nDetailed results saved to: {filename}")


def main():
    """Main test execution"""
    print("\n" + "="*80)
    print("3D BIN PACKING ALGORITHM COMPREHENSIVE TEST SUITE")
    print("Testing all 11 algorithms across multiple scenarios")
    print("="*80)

    tester = AlgorithmTester()
    all_results = {}

    # Test Scenario 1: Small Mixed Load
    truck1, cartons1, name1 = tester.create_test_scenario_1()
    all_results[name1] = tester.run_all_algorithms(truck1, cartons1, name1)

    # Test Scenario 2: Large Uniform Load
    truck2, cartons2, name2 = tester.create_test_scenario_2()
    all_results[name2] = tester.run_all_algorithms(truck2, cartons2, name2)

    # Test Scenario 3: Complex Mixed Load
    truck3, cartons3, name3 = tester.create_test_scenario_3()
    all_results[name3] = tester.run_all_algorithms(truck3, cartons3, name3)

    # Generate and display summary report
    summary = tester.generate_summary_report(all_results)
    print(summary)

    # Save detailed results
    tester.save_results_json(all_results)

    # Save summary report to file
    report_file = "algorithm_test_report.txt"
    with open(report_file, 'w') as f:
        f.write(summary)
    print(f"Summary report saved to: {report_file}")

    print("\n" + "="*80)
    print("TEST SUITE COMPLETED SUCCESSFULLY")
    print("="*80)


if __name__ == "__main__":
    main()
