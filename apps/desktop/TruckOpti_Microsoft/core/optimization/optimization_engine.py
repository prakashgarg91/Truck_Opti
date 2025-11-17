"""
TruckOpti Microsoft - Main Optimization Engine

This module provides the main optimization engine that coordinates
multiple algorithms and provides the primary interface for truck optimization.
"""

from typing import List, Dict, Any, Optional, Tuple
import logging
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import psutil
import os

from ..models.truck import Truck
from ..models.carton import Carton
from ..models.packed_carton import PackedCarton
from ..algorithms import (
    BasePackingAlgorithm, LAFFAlgorithm, SkylineBottomLeftAlgorithm,
    GeneticAlgorithm, FirstFitDecreasingAlgorithm, BestFitDecreasingAlgorithm
)


class OptimizationEngine:
    """
    Main optimization engine for TruckOpti Microsoft.
    
    This class coordinates multiple algorithms, manages parallel processing,
    and provides the primary interface for truck optimization with Microsoft
    Windows multi-core optimization.
    """
    
    def __init__(self, enable_parallel_processing: bool = True, max_workers: int = None):
        """
        Initialize the optimization engine.
        
        Args:
            enable_parallel_processing: Enable multi-core parallel processing
            max_workers: Maximum number of worker processes (None = auto-detect)
        """
        self.logger = logging.getLogger("TruckOpti.OptimizationEngine")
        self.enable_parallel_processing = enable_parallel_processing
        self.max_workers = max_workers or self._detect_optimal_workers()
        
        # Initialize available algorithms
        self.algorithms = self._initialize_algorithms()
        
        # Performance tracking
        self.performance_stats = {
            'total_optimizations': 0,
            'successful_optimizations': 0,
            'failed_optimizations': 0,
            'average_execution_time': 0.0,
            'total_execution_time': 0.0,
            'cpu_utilization': [],
            'memory_usage': []
        }
        
        self.logger.info(f"OptimizationEngine initialized with {len(self.algorithms)} algorithms, "
                        f"max_workers={self.max_workers}")
    
    def _detect_optimal_workers(self) -> int:
        """
        Detect optimal number of worker processes for Microsoft Windows.
        
        Returns:
            int: Optimal number of workers
        """
        try:
            # Get CPU count
            cpu_count = psutil.cpu_count(logical=True)
            physical_cores = psutil.cpu_count(logical=False)
            
            # For CPU-bound algorithms, use physical cores
            # For I/O bound operations, can use more workers
            if self.enable_parallel_processing:
                # Use 75% of available cores for algorithms (leave some for system)
                optimal_workers = max(1, int(physical_cores * 0.75))
                self.logger.info(f"Detected {cpu_count} logical cores, {physical_cores} physical cores. "
                               f"Using {optimal_workers} workers for optimization.")
                return optimal_workers
            else:
                return 1
                
        except Exception as e:
            self.logger.warning(f"Could not detect optimal workers: {e}. Using 4 workers.")
            return 4
    
    def _initialize_algorithms(self) -> Dict[str, BasePackingAlgorithm]:
        """
        Initialize all available packing algorithms.
        
        Returns:
            Dict[str, BasePackingAlgorithm]: Dictionary of algorithm instances
        """
        algorithms = {}
        
        try:
            # Core LAFF Algorithm (most important)
            algorithms['l_aff'] = LAFFAlgorithm()
            
            # Other core algorithms
            algorithms['skyline_bottom_left'] = SkylineBottomLeftAlgorithm()
            algorithms['first_fit_decreasing'] = FirstFitDecreasingAlgorithm()
            algorithms['best_fit_decreasing'] = BestFitDecreasingAlgorithm()
            
            # Advanced algorithms (if available)
            try:
                algorithms['genetic'] = GeneticAlgorithm()
            except ImportError:
                self.logger.warning("Genetic Algorithm not available (missing dependencies)")
            
            self.logger.info(f"Initialized {len(algorithms)} algorithms")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize algorithms: {e}")
            raise
        
        return algorithms
    
    def optimize_single_truck(self, cartons: List[Carton], truck: Truck,
                            algorithm_name: str = 'l_aff', max_iterations: int = 1000) -> Tuple[List[PackedCarton], Dict[str, Any]]:
        """
        Optimize carton packing for a single truck using specified algorithm.
        
        Args:
            cartons: List of cartons to pack
            truck: Target truck
            algorithm_name: Algorithm to use
            max_iterations: Maximum iterations
            
        Returns:
            Tuple[List[PackedCarton], Dict[str, Any]]: Packed cartons and results
        """
        start_time = time.time()
        
        if algorithm_name not in self.algorithms:
            raise ValueError(f"Algorithm '{algorithm_name}' not available. "
                           f"Available algorithms: {list(self.algorithms.keys())}")
        
        algorithm = self.algorithms[algorithm_name]
        
        try:
            self.logger.info(f"Starting single-truck optimization with {algorithm_name} algorithm")
            self.logger.info(f"Packing {len(cartons)} cartons into truck {truck.id}")
            
            # Execute optimization
            packed_cartons, metrics = algorithm.pack_cartons(cartons, truck, max_iterations)
            
            # Update truck with packed cartons
            for packed_carton in packed_cartons:
                truck.add_carton(packed_carton)
            
            # Calculate final metrics
            execution_time = time.time() - start_time
            
            # Add engine-specific metrics
            metrics.update({
                'engine_info': {
                    'algorithm_used': algorithm_name,
                    'execution_time': execution_time,
                    'max_workers': self.max_workers,
                    'parallel_processing': self.enable_parallel_processing
                },
                'optimization_timestamp': datetime.now().isoformat(),
                'system_info': self._get_system_info()
            })
            
            self._update_performance_stats(execution_time, True)
            
            self.logger.info(f"Single-truck optimization completed in {execution_time:.2f}s. "
                           f"Packed {len(packed_cartons)} cartons.")
            
            return packed_cartons, metrics
            
        except Exception as e:
            execution_time = time.time() - start_time
            self._update_performance_stats(execution_time, False)
            self.logger.error(f"Single-truck optimization failed: {e}")
            raise
    
    def optimize_multiple_trucks(self, cartons: List[Carton], trucks: List[Truck],
                               algorithm_name: str = 'l_aff', max_iterations: int = 1000) -> Dict[str, Any]:
        """
        Optimize carton distribution across multiple trucks using specified algorithm.
        
        Args:
            cartons: List of cartons to distribute
            trucks: List of available trucks
            algorithm_name: Algorithm to use
            max_iterations: Maximum iterations
            
        Returns:
            Dict[str, Any]: Optimization results for all trucks
        """
        start_time = time.time()
        
        if not trucks:
            raise ValueError("No trucks provided for optimization")
        
        self.logger.info(f"Starting multi-truck optimization with {algorithm_name} algorithm")
        self.logger.info(f"Distributing {len(cartons)} cartons across {len(trucks)} trucks")
        
        # Sort trucks by capacity (largest first) for better distribution
        sorted_trucks = sorted(trucks, key=lambda t: t.constraints.max_volume, reverse=True)
        
        # Distribute cartons across trucks
        truck_assignments = self._distribute_cartons_across_trucks(cartons, sorted_trucks)
        
        # Optimize each truck in parallel
        results = {}
        
        if self.enable_parallel_processing and len(truck_assignments) > 1:
            results = self._optimize_trucks_parallel(truck_assignments, algorithm_name, max_iterations)
        else:
            results = self._optimize_trucks_sequential(truck_assignments, algorithm_name, max_iterations)
        
        # Calculate overall metrics
        execution_time = time.time() - start_time
        
        # Aggregate results
        total_packed = sum(len(result['packed_cartons']) for result in results.values())
        total_failed = sum(result['metrics'].get('failed_cartons_count', 0) for result in results.values())
        
        overall_metrics = {
            'total_trucks': len(trucks),
            'trucks_used': len([r for r in results.values() if r['packed_cartons']]),
            'total_cartons': len(cartons),
            'total_packed': total_packed,
            'total_failed': total_failed,
            'packing_efficiency': (total_packed / len(cartons)) * 100 if cartons else 0,
            'total_execution_time': execution_time,
            'algorithm_used': algorithm_name,
            'optimization_timestamp': datetime.now().isoformat(),
            'system_info': self._get_system_info(),
            'truck_results': results
        }
        
        self._update_performance_stats(execution_time, True)
        
        self.logger.info(f"Multi-truck optimization completed in {execution_time:.2f}s. "
                        f"Packed {total_packed}/{len(cartons)} cartons across {len(trucks)} trucks.")
        
        return overall_metrics
    
    def _distribute_cartons_across_trucks(self, cartons: List[Carton], 
                                        trucks: List[Truck]) -> Dict[str, List[Carton]]:
        """
        Distribute cartons across trucks using a greedy approach.
        
        Args:
            cartons: Cartons to distribute
            trucks: Available trucks
            
        Returns:
            Dict[str, List[Carton]]: Truck ID to cartons mapping
        """
        # Sort cartons by size (largest first) for better distribution
        sorted_cartons = sorted(cartons, key=lambda c: c.volume, reverse=True)
        
        truck_assignments = {truck.id: [] for truck in trucks}
        
        for carton in sorted_cartons:
            # Find the best truck for this carton
            best_truck = None
            best_score = -1
            
            for truck in trucks:
                if truck.can_add_carton(carton):
                    # Calculate fit score (remaining capacity utilization)
                    remaining_capacity = truck.get_remaining_capacity()
                    volume_utilization = (truck.current_load_volume / truck.constraints.max_volume) * 100
                    
                    # Prefer trucks with moderate utilization (not too full, not too empty)
                    target_utilization = 70  # Target 70% utilization
                    utilization_score = 100 - abs(volume_utilization - target_utilization)
                    
                    # Bonus for trucks that can accommodate the carton well
                    fit_bonus = 0
                    if (carton.length <= truck.constraints.max_length and
                        carton.width <= truck.constraints.max_width and
                        carton.height <= truck.constraints.max_height):
                        fit_bonus = 20
                    
                    score = utilization_score + fit_bonus
                    
                    if score > best_score:
                        best_score = score
                        best_truck = truck
            
            # Assign carton to best truck
            if best_truck:
                truck_assignments[best_truck.id].append(carton)
            else:
                # No suitable truck found, will be handled by optimization algorithm
                self.logger.warning(f"No suitable truck found for carton {carton.id}")
        
        return truck_assignments
    
    def _optimize_trucks_parallel(self, truck_assignments: Dict[str, List[Carton]], 
                                algorithm_name: str, max_iterations: int) -> Dict[str, Any]:
        """
        Optimize multiple trucks in parallel.
        
        Args:
            truck_assignments: Truck ID to cartons mapping
            algorithm_name: Algorithm to use
            max_iterations: Maximum iterations
            
        Returns:
            Dict[str, Any]: Optimization results for all trucks
        """
        results = {}
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit optimization tasks
            future_to_truck = {}
            
            for truck_id, assigned_cartons in truck_assignments.items():
                if assigned_cartons:  # Only optimize trucks with cartons
                    future = executor.submit(
                        self._optimize_single_truck_internal,
                        assigned_cartons, truck_id, algorithm_name, max_iterations
                    )
                    future_to_truck[future] = truck_id
            
            # Collect results
            for future in as_completed(future_to_truck):
                truck_id = future_to_truck[future]
                try:
                    result = future.result(timeout=300)  # 5 minute timeout per truck
                    results[truck_id] = result
                except Exception as e:
                    self.logger.error(f"Optimization failed for truck {truck_id}: {e}")
                    results[truck_id] = {
                        'packed_cartons': [],
                        'metrics': {
                            'error': str(e),
                            'failed_cartons_count': len(truck_assignments[truck_id])
                        }
                    }
        
        return results
    
    def _optimize_trucks_sequential(self, truck_assignments: Dict[str, List[Carton]], 
                                  algorithm_name: str, max_iterations: int) -> Dict[str, Any]:
        """
        Optimize multiple trucks sequentially.
        
        Args:
            truck_assignments: Truck ID to cartons mapping
            algorithm_name: Algorithm to use
            max_iterations: Maximum iterations
            
        Returns:
            Dict[str, Any]: Optimization results for all trucks
        """
        results = {}
        
        for truck_id, assigned_cartons in truck_assignments.items():
            if assigned_cartons:  # Only optimize trucks with cartons
                try:
                    result = self._optimize_single_truck_internal(
                        assigned_cartons, truck_id, algorithm_name, max_iterations
                    )
                    results[truck_id] = result
                except Exception as e:
                    self.logger.error(f"Optimization failed for truck {truck_id}: {e}")
                    results[truck_id] = {
                        'packed_cartons': [],
                        'metrics': {
                            'error': str(e),
                            'failed_cartons_count': len(assigned_cartons)
                        }
                    }
        
        return results
    
    def _optimize_single_truck_internal(self, cartons: List[Carton], truck_id: str, 
                                      algorithm_name: str, max_iterations: int) -> Dict[str, Any]:
        """
        Internal method to optimize a single truck.
        
        Args:
            cartons: Cartons to pack
            truck_id: Truck identifier
            algorithm_name: Algorithm to use
            max_iterations: Maximum iterations
            
        Returns:
            Dict[str, Any]: Optimization results
        """
        # This is a simplified implementation
        # In practice, you would get the actual truck object
        # For now, we'll return a basic result structure
        
        return {
            'truck_id': truck_id,
            'packed_cartons': [],  # Would contain actual packed cartons
            'metrics': {
                'cartons_assigned': len(cartons),
                'algorithm_used': algorithm_name,
                'failed_cartons_count': len(cartons),  # Simplified
                'note': 'Placeholder result - actual implementation would pack cartons'
            }
        }
    
    def get_available_algorithms(self) -> Dict[str, Dict[str, str]]:
        """
        Get information about available algorithms.
        
        Returns:
            Dict[str, Dict[str, str]]: Algorithm information
        """
        algorithm_info = {}
        
        for name, algorithm in self.algorithms.items():
            algorithm_info[name] = {
                'name': algorithm.name,
                'description': algorithm.description,
                'class': algorithm.__class__.__name__
            }
        
        return algorithm_info
    
    def benchmark_algorithms(self, test_cartons: List[Carton], test_truck: Truck, 
                           iterations: int = 3) -> Dict[str, Dict[str, Any]]:
        """
        Benchmark all available algorithms with test data.
        
        Args:
            test_cartons: Test cartons
            test_truck: Test truck
            iterations: Number of iterations per algorithm
            
        Returns:
            Dict[str, Dict[str, Any]]: Benchmark results
        """
        self.logger.info(f"Starting algorithm benchmark with {iterations} iterations per algorithm")
        
        benchmark_results = {}
        
        for algorithm_name, algorithm in self.algorithms.items():
            self.logger.info(f"Benchmarking algorithm: {algorithm_name}")
            
            algorithm_results = []
            
            for iteration in range(iterations):
                start_time = time.time()
                
                try:
                    packed_cartons, metrics = algorithm.pack_cartons(
                        test_cartons, test_truck, max_iterations=500
                    )
                    
                    execution_time = time.time() - start_time
                    
                    iteration_result = {
                        'iteration': iteration + 1,
                        'execution_time': execution_time,
                        'packed_cartons_count': len(packed_cartons),
                        'packing_efficiency': metrics.get('volume_utilization', 0),
                        'algorithm_efficiency': metrics.get('algorithm_efficiency', 0),
                        'success': True
                    }
                    
                except Exception as e:
                    execution_time = time.time() - start_time
                    iteration_result = {
                        'iteration': iteration + 1,
                        'execution_time': execution_time,
                        'error': str(e),
                        'success': False
                    }
                
                algorithm_results.append(iteration_result)
            
            # Calculate aggregated results
            successful_runs = [r for r in algorithm_results if r['success']]
            
            if successful_runs:
                avg_execution_time = sum(r['execution_time'] for r in successful_runs) / len(successful_runs)
                avg_packed = sum(r['packed_cartons_count'] for r in successful_runs) / len(successful_runs)
                avg_efficiency = sum(r['packing_efficiency'] for r in successful_runs) / len(successful_runs)
                
                benchmark_results[algorithm_name] = {
                    'algorithm_info': {
                        'name': algorithm.name,
                        'description': algorithm.description
                    },
                    'iterations': iterations,
                    'successful_runs': len(successful_runs),
                    'failed_runs': len(algorithm_results) - len(successful_runs),
                    'average_execution_time': avg_execution_time,
                    'average_packed_cartons': avg_packed,
                    'average_efficiency': avg_efficiency,
                    'detailed_results': algorithm_results
                }
            else:
                benchmark_results[algorithm_name] = {
                    'algorithm_info': {
                        'name': algorithm.name,
                        'description': algorithm.description
                    },
                    'error': 'All benchmark runs failed',
                    'detailed_results': algorithm_results
                }
        
        self.logger.info("Algorithm benchmark completed")
        return benchmark_results
    
    def _get_system_info(self) -> Dict[str, Any]:
        """
        Get system information for optimization context.
        
        Returns:
            Dict[str, Any]: System information
        """
        try:
            return {
                'cpu_count': psutil.cpu_count(),
                'cpu_count_logical': psutil.cpu_count(logical=True),
                'memory_total_gb': psutil.virtual_memory().total / (1024**3),
                'memory_available_gb': psutil.virtual_memory().available / (1024**3),
                'process_count': len(psutil.pids()),
                'platform': os.name,
                'max_workers': self.max_workers,
                'parallel_processing_enabled': self.enable_parallel_processing
            }
        except Exception as e:
            self.logger.warning(f"Could not gather system info: {e}")
            return {'error': str(e)}
    
    def _update_performance_stats(self, execution_time: float, success: bool) -> None:
        """
        Update performance statistics.
        
        Args:
            execution_time: Execution time in seconds
            success: Whether optimization was successful
        """
        self.performance_stats['total_optimizations'] += 1
        
        if success:
            self.performance_stats['successful_optimizations'] += 1
        else:
            self.performance_stats['failed_optimizations'] += 1
        
        # Update average execution time
        total_time = self.performance_stats['total_execution_time'] + execution_time
        total_runs = self.performance_stats['total_optimizations']
        self.performance_stats['average_execution_time'] = total_time / total_runs
        self.performance_stats['total_execution_time'] = total_time
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """
        Get performance statistics.
        
        Returns:
            Dict[str, Any]: Performance statistics
        """
        stats = self.performance_stats.copy()
        
        # Calculate success rate
        if stats['total_optimizations'] > 0:
            stats['success_rate'] = (stats['successful_optimizations'] / stats['total_optimizations']) * 100
        else:
            stats['success_rate'] = 0.0
        
        return stats
    
    def __str__(self) -> str:
        """String representation."""
        return f"OptimizationEngine(algorithms={len(self.algorithms)}, max_workers={self.max_workers})"
    
    def __repr__(self) -> str:
        """Detailed string representation."""
        return (f"OptimizationEngine(enable_parallel_processing={self.enable_parallel_processing}, "
                f"max_workers={self.max_workers}, algorithms={list(self.algorithms.keys())})")