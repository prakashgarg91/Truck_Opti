"""
TruckOpti Microsoft - Advanced LAFF (Largest Area Fit First) Algorithm

This module implements the Advanced LAFF algorithm with RANSAC optimization
for 3D bin packing. This is a consolidation of the multiple LAFF implementations
found across the original codebase.

The LAFF algorithm prioritizes placing cartons with the largest base area first,
using advanced optimization techniques for multi-pass refinement.
"""

from typing import List, Dict, Any, Optional, Tuple
import random
import time
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

from .base_algorithm import BasePackingAlgorithm
from ..models.truck import Truck
from ..models.carton import Carton
from ..models.packed_carton import PackedCarton
from ..models.coordinates import Coordinates3D

try:
    from ..config.scenario_config import ScenarioConfig
except ImportError:
    ScenarioConfig = None

try:
    from ..utils.platform_detector import get_optimal_worker_count
except ImportError:
    # Fallback if platform_detector not available
    def get_optimal_worker_count():
        import multiprocessing
        return max(1, multiprocessing.cpu_count() // 2)


class LAFFAlgorithm(BasePackingAlgorithm):
    """
    Advanced LAFF Algorithm with RANSAC optimization.
    
    This algorithm implements the Largest Area Fit First strategy with
    multi-pass optimization and RANSAC-based sampling for enhanced performance.
    """
    
    def __init__(self, config: Optional['ScenarioConfig'] = None):
        """Initialize the Advanced LAFF Algorithm."""
        super().__init__(
            name="Advanced LAFF",
            description="Largest Area Fit First with RANSAC optimization and multi-pass refinement",
            config=config
        )
        
        # Use scenario config if available, otherwise use defaults
        if config:
            self.ransac_iterations = config.algorithm_params.ransac_iterations
            self.optimization_passes = config.algorithm_params.optimization_passes
            self.parallel_workers = config.algorithm_params.parallel_workers or get_optimal_worker_count()
        else:
            self.ransac_iterations = 100
            self.optimization_passes = 3
            self.parallel_workers = get_optimal_worker_count()
        
        self.logger.info(
            f"LAFF initialized: {self.ransac_iterations} RANSAC iterations, "
            f"{self.optimization_passes} passes, {self.parallel_workers} workers"
        )
        
    def pack_cartons(self, cartons: List[Carton], truck: Truck, 
                    max_iterations: int = 1000) -> Tuple[List[PackedCarton], Dict[str, Any]]:
        """
        Pack cartons using Advanced LAFF algorithm with RANSAC optimization.
        
        Args:
            cartons: List of cartons to pack
            truck: Target truck for packing
            max_iterations: Maximum algorithm iterations
            
        Returns:
            Tuple[List[PackedCarton], Dict[str, Any]]: Packed cartons and optimization results
        """
        self.log_execution_start()
        
        try:
            # Pre-process cartons
            processed_cartons = self._preprocess_cartons(cartons)
            
            # Multi-pass optimization with RANSAC
            best_result = None
            best_score = -1
            
            for pass_num in range(self.optimization_passes):
                # RANSAC sampling for this pass
                sample_size = min(self.ransac_iterations, 2 ** len(processed_cartons))
                
                with ThreadPoolExecutor(max_workers=self.parallel_workers) as executor:
                    futures = []
                    
                    for _ in range(sample_size):
                        # Sample subset for RANSAC
                        sample_cartons = self._ransac_sample(processed_cartons)
                        future = executor.submit(self._pack_sample, sample_cartons, truck, pass_num)
                        futures.append(future)
                    
                    # Collect results
                    pass_results = []
                    for future in as_completed(futures):
                        try:
                            result = future.result(timeout=30)  # 30 second timeout per sample
                            pass_results.append(result)
                            
                            # Track best result
                            if result['score'] > best_score:
                                best_score = result['score']
                                best_result = result
                                
                        except Exception as e:
                            self.logger.warning(f"RANSAC sample failed: {e}")
                            continue
            
            # If no successful RANSAC samples, fall back to basic LAFF
            if best_result is None:
                best_result = self._basic_laff_pack(processed_cartons, truck)
            
            # Post-process results
            final_result = self._postprocess_results(best_result, truck)
            
            self.log_execution_end(True, f"Packed {len(final_result['packed_cartons'])} cartons")
            return final_result['packed_cartons'], final_result['metrics']
            
        except Exception as e:
            self.logger.error(f"LAFF algorithm failed: {e}")
            self.log_execution_end(False, f"Error: {str(e)}")
            raise
    
    def _preprocess_cartons(self, cartons: List[Carton]) -> List[Carton]:
        """
        Preprocess cartons for optimal LAFF packing.
        
        Args:
            cartons: Original carton list
            
        Returns:
            List[Carton]: Preprocessed cartons
        """
        # Sort by base area (length * width) descending, then by volume, then by priority
        sorted_cartons = sorted(cartons, key=lambda c: (
            -(c.length * c.width),  # Largest base area first
            -c.volume,              # Then by volume
            -c.priority,            # Then by priority
            c.id                    # Finally by ID for stability
        ))
        
        return sorted_cartons
    
    def _ransac_sample(self, cartons: List[Carton]) -> List[Carton]:
        """
        Create a RANSAC sample from cartons.
        
        Args:
            cartons: Full carton list
            
        Returns:
            List[Carton]: Random sample of cartons
        """
        if len(cartons) <= 10:
            return cartons.copy()
        
        # Sample size based on problem complexity
        sample_size = min(len(cartons), max(5, len(cartons) // 3))
        return random.sample(cartons, sample_size)
    
    def _pack_sample(self, sample_cartons: List[Carton], truck: Truck, 
                    pass_num: int) -> Dict[str, Any]:
        """
        Pack a sample of cartons using LAFF strategy.
        
        Args:
            sample_cartons: Sample cartons to pack
            truck: Target truck
            pass_num: Current optimization pass number
            
        Returns:
            Dict[str, Any]: Packing results
        """
        packed_cartons = []
        failed_cartons = []
        
        for carton in sample_cartons:
            # Find best position for this carton
            position = self._find_best_position_laff(carton, truck, packed_cartons)
            
            if position:
                # Create packed carton
                packed_carton = self.create_packed_carton(carton, position)
                
                # Calculate stability and fit quality
                self._calculate_carton_metrics(packed_carton, packed_cartons, truck)
                
                packed_cartons.append(packed_carton)
            else:
                failed_cartons.append(carton)
        
        # Calculate overall score
        score = self._calculate_pack_score(packed_cartons, failed_cartons, truck)
        
        return {
            'packed_cartons': packed_cartons,
            'failed_cartons': failed_cartons,
            'score': score,
            'pass_number': pass_num
        }
    
    def _find_best_position_laff(self, carton: Carton, truck: Truck, 
                               existing_cartons: List[PackedCarton]) -> Optional[Coordinates3D]:
        """
        Find the best position for a carton using LAFF strategy.
        
        Args:
            carton: Carton to position
            truck: Target truck
            existing_cartons: Already packed cartons
            
        Returns:
            Optional[Coordinates3D]: Best position or None
        """
        best_position = None
        best_score = -1
        
        # Generate candidate positions
        candidate_positions = self._generate_candidate_positions(carton, truck, existing_cartons)
        
        for position in candidate_positions:
            # Create test packed carton
            test_carton = self.create_packed_carton(carton, position)
            
            # Check if position is valid
            if not self._is_valid_position(test_carton, truck, existing_cartons):
                continue
            
            # Calculate position score
            score = self._calculate_position_score(test_carton, existing_cartons, truck)
            
            if score > best_score:
                best_score = score
                best_position = position
        
        return best_position
    
    def _generate_candidate_positions(self, carton: Carton, truck: Truck, 
                                    existing_cartons: List[PackedCarton]) -> List[Coordinates3D]:
        """
        Generate candidate positions for carton placement.
        
        Args:
            carton: Carton to place
            truck: Target truck
            existing_cartons: Already packed cartons
            
        Returns:
            List[Coordinates3D]: Candidate positions
        """
        positions = []
        
        # Strategy 1: Bottom-left-front positioning
        positions.append(Coordinates3D(0, 0, 0))
        
        # Strategy 2: Position on top of existing cartons
        for existing in existing_cartons:
            # Top position
            top_position = Coordinates3D(
                existing.position.x,
                existing.position.y,
                existing.bounding_box.max_corner.z
            )
            positions.append(top_position)
            
            # Adjacent positions
            adjacent_positions = [
                Coordinates3D(existing.bounding_box.max_corner.x, existing.position.y, existing.position.z),
                Coordinates3D(existing.position.x, existing.bounding_box.max_corner.y, existing.position.z),
            ]
            positions.extend(adjacent_positions)
        
        # Strategy 3: Grid-based search for remaining space
        grid_positions = self._generate_grid_positions(carton, truck, existing_cartons)
        positions.extend(grid_positions)
        
        # Remove duplicates and filter valid positions
        unique_positions = []
        seen = set()
        for pos in positions:
            pos_key = (round(pos.x, 1), round(pos.y, 1), round(pos.z, 1))
            if pos_key not in seen:
                seen.add(pos_key)
                unique_positions.append(pos)
        
        return unique_positions[:50]  # Limit to top 50 candidates
    
    def _generate_grid_positions(self, carton: Carton, truck: Truck, 
                               existing_cartons: List[PackedCarton]) -> List[Coordinates3D]:
        """
        Generate grid-based candidate positions.
        
        Args:
            carton: Carton to place
            truck: Target truck
            existing_cartons: Already packed cartons
            
        Returns:
            List[Coordinates3D]: Grid positions
        """
        positions = []
        grid_size = max(1.0, min(carton.length, carton.width, carton.height) / 4)
        
        max_x = truck.constraints.max_length - carton.length
        max_y = truck.constraints.max_width - carton.width
        max_z = truck.constraints.max_height - carton.height
        
        x = 0.0
        while x <= max_x:
            y = 0.0
            while y <= max_y:
                z = 0.0
                while z <= max_z:
                    positions.append(Coordinates3D(x, y, z))
                    z += grid_size
                y += grid_size
            x += grid_size
        
        return positions
    
    def _is_valid_position(self, packed_carton: PackedCarton, truck: Truck, 
                          existing_cartons: List[PackedCarton]) -> bool:
        """
        Check if a position is valid for carton placement.
        
        Args:
            packed_carton: Test packed carton
            truck: Target truck
            existing_cartons: Already packed cartons
            
        Returns:
            bool: True if position is valid
        """
        # Check truck bounds
        if not packed_carton.is_within_truck_bounds(
            truck.constraints.max_length,
            truck.constraints.max_width,
            truck.constraints.max_height
        ):
            return False
        
        # Check collisions
        if self.check_collision(packed_carton, existing_cartons):
            return False
        
        return True
    
    def _calculate_position_score(self, packed_carton: PackedCarton, 
                                existing_cartons: List[PackedCarton], truck: Truck) -> float:
        """
        Calculate score for a potential position.
        
        Args:
            packed_carton: Test packed carton
            existing_cartons: Already packed cartons
            truck: Target truck
            
        Returns:
            float: Position score (higher is better)
        """
        score = 0.0
        
        # Prefer positions closer to origin (bottom-left-front)
        distance_from_origin = packed_carton.position.distance_to(Coordinates3D(0, 0, 0))
        score += max(0, 100 - distance_from_origin)
        
        # Prefer positions that minimize wasted space
        waste_space = self._calculate_waste_space(packed_carton, existing_cartons)
        score += max(0, 50 - waste_space)
        
        # Prefer positions that provide good stability
        if existing_cartons:
            support_cartons = self._find_support_cartons(packed_carton, existing_cartons)
            stability = packed_carton.calculate_stability(support_cartons)
            score += stability
        
        # Prefer positions that don't block access to other cartons
        access_score = self._calculate_access_score(packed_carton, existing_cartons)
        score += access_score
        
        return score
    
    def _calculate_waste_space(self, packed_carton: PackedCarton, 
                             existing_cartons: List[PackedCarton]) -> float:
        """
        Calculate wasted space around a packed carton.
        
        Args:
            packed_carton: Packed carton to analyze
            existing_cartons: Other packed cartons
            
        Returns:
            float: Waste space metric
        """
        # Simplified waste space calculation
        # In a full implementation, this would calculate actual unused space
        
        waste = 0.0
        
        # Check gaps with neighboring cartons
        for existing in existing_cartons:
            # Calculate gap in each dimension
            gap_x = max(0, min(
                packed_carton.bounding_box.max_corner.x,
                existing.bounding_box.max_corner.x
            ) - max(packed_carton.position.x, existing.position.x))
            
            gap_y = max(0, min(
                packed_carton.bounding_box.max_corner.y,
                existing.bounding_box.max_corner.y
            ) - max(packed_carton.position.y, existing.position.y))
            
            gap_z = max(0, min(
                packed_carton.bounding_box.max_corner.z,
                existing.bounding_box.max_corner.z
            ) - max(packed_carton.position.z, existing.position.z))
            
            # If cartons are adjacent, there's no gap
            if gap_x > 0 and gap_y > 0 and gap_z > 0:
                waste += gap_x * gap_y * gap_z
        
        return waste
    
    def _find_support_cartons(self, packed_carton: PackedCarton, 
                            existing_cartons: List[PackedCarton]) -> List[PackedCarton]:
        """
        Find cartons that provide support for a packed carton.
        
        Args:
            packed_carton: Carton to find support for
            existing_cartons: All packed cartons
            
        Returns:
            List[PackedCarton]: Cartons providing support
        """
        support_cartons = []
        
        for existing in existing_cartons:
            # Check if existing carton is below the packed carton
            if (existing.bounding_box.max_corner.z <= packed_carton.position.z and
                existing.bounding_box.max_corner.x > packed_carton.position.x and
                existing.position.x < packed_carton.bounding_box.max_corner.x and
                existing.bounding_box.max_corner.y > packed_carton.position.y and
                existing.position.y < packed_carton.bounding_box.max_corner.y):
                support_cartons.append(existing)
        
        return support_cartons
    
    def _calculate_access_score(self, packed_carton: PackedCarton, 
                              existing_cartons: List[PackedCarton]) -> float:
        """
        Calculate access score for a packed carton.
        
        Args:
            packed_carton: Packed carton to analyze
            existing_cartons: Other packed cartons
            
        Returns:
            float: Access score (higher is better)
        """
        # Prefer cartons that are accessible (not completely surrounded)
        # This is a simplified implementation
        
        if not existing_cartons:
            return 50.0  # Good access when no other cartons
        
        # Check if carton is blocked in any direction
        blocked_directions = 0
        
        for existing in existing_cartons:
            # Check if existing carton blocks access
            if (abs(existing.position.x - packed_carton.position.x) < 0.1 and
                existing.bounding_box.max_corner.y > packed_carton.position.y and
                existing.position.y < packed_carton.bounding_box.max_corner.y and
                existing.bounding_box.max_corner.z > packed_carton.position.z and
                existing.position.z < packed_carton.bounding_box.max_corner.z):
                blocked_directions += 1
        
        return max(0, 50 - blocked_directions * 10)
    
    def _calculate_carton_metrics(self, packed_carton: PackedCarton, 
                                existing_cartons: List[PackedCarton], truck: Truck) -> None:
        """
        Calculate metrics for a packed carton.
        
        Args:
            packed_carton: Packed carton to analyze
            existing_cartons: Other packed cartons
            truck: Target truck
        """
        # Calculate stability
        support_cartons = self._find_support_cartons(packed_carton, existing_cartons)
        packed_carton.stability_score = packed_carton.calculate_stability(support_cartons)
        
        # Calculate fit quality
        waste_space = self._calculate_waste_space(packed_carton, existing_cartons)
        total_space = packed_carton.volume + waste_space
        packed_carton.fit_quality = max(0, 100 - (waste_space / total_space * 100)) if total_space > 0 else 0
        
        # Calculate handling difficulty
        packed_carton.handling_difficulty = self._calculate_handling_difficulty(packed_carton, existing_cartons)
        
        # Set access priority
        packed_carton.access_priority = self._calculate_access_priority(packed_carton, existing_cartons)
    
    def _calculate_handling_difficulty(self, packed_carton: PackedCarton, 
                                     existing_cartons: List[PackedCarton]) -> float:
        """
        Calculate handling difficulty for a packed carton.
        
        Args:
            packed_carton: Packed carton to analyze
            existing_cartons: Other packed cartons
            
        Returns:
            float: Handling difficulty (0-100, lower is easier)
        """
        difficulty = 0.0
        
        # Cartons on top are harder to access
        if packed_carton.position.z > 0:
            difficulty += 20
        
        # Cartons surrounded by others are harder to access
        nearby_cartons = 0
        for existing in existing_cartons:
            distance = packed_carton.position.distance_to(existing.position)
            if distance < max(packed_carton.actual_length, packed_carton.actual_width) * 1.5:
                nearby_cartons += 1
        
        difficulty += nearby_cartons * 5
        
        # Fragile items are harder to handle
        if packed_carton.carton.is_fragile:
            difficulty += 15
        
        return min(100, difficulty)
    
    def _calculate_access_priority(self, packed_carton: PackedCarton, 
                                 existing_cartons: List[PackedCarton]) -> int:
        """
        Calculate access priority for a packed carton.
        
        Args:
            packed_carton: Packed carton to analyze
            existing_cartons: Other packed cartons
            
        Returns:
            int: Access priority (0-100, higher is more important to access)
        """
        priority = 50  # Base priority
        
        # Higher priority for fragile items
        if packed_carton.carton.is_fragile:
            priority += 20
        
        # Higher priority for items that are hard to access
        if packed_carton.handling_difficulty > 70:
            priority += 15
        
        # Higher priority for items that support other items
        supported_items = 0
        for other in existing_cartons:
            if other.position.z > packed_carton.bounding_box.max_corner.z - 0.1:
                if (other.position.x >= packed_carton.position.x and
                    other.position.x < packed_carton.bounding_box.max_corner.x and
                    other.position.y >= packed_carton.position.y and
                    other.position.y < packed_carton.bounding_box.max_corner.y):
                    supported_items += 1
        
        priority += supported_items * 5
        
        return min(100, priority)
    
    def _calculate_pack_score(self, packed_cartons: List[PackedCarton], 
                            failed_cartons: List[Carton], truck: Truck) -> float:
        """
        Calculate overall score for a packing solution.
        
        Args:
            packed_cartons: Successfully packed cartons
            failed_cartons: Cartons that couldn't be packed
            truck: Target truck
            
        Returns:
            float: Overall packing score
        """
        if not packed_cartons:
            return 0.0
        
        # Base score from utilization
        total_weight = sum(pc.carton.weight for pc in packed_cartons)
        total_volume = sum(pc.volume for pc in packed_cartons)
        
        weight_utilization = (total_weight / truck.constraints.max_weight) * 100
        volume_utilization = (total_volume / truck.constraints.max_volume) * 100
        
        base_score = (weight_utilization + volume_utilization) / 2
        
        # Bonus for stability
        avg_stability = sum(pc.stability_score for pc in packed_cartons) / len(packed_cartons)
        stability_bonus = avg_stability * 0.3
        
        # Penalty for failed cartons
        failure_penalty = len(failed_cartons) * 10
        
        # Bonus for fit quality
        avg_fit_quality = sum(pc.fit_quality for pc in packed_cartons) / len(packed_cartons)
        fit_bonus = avg_fit_quality * 0.2
        
        final_score = base_score + stability_bonus + fit_bonus - failure_penalty
        
        return max(0, final_score)
    
    def _basic_laff_pack(self, cartons: List[Carton], truck: Truck) -> Dict[str, Any]:
        """
        Fallback basic LAFF packing when RANSAC fails.
        
        Args:
            cartons: Cartons to pack
            truck: Target truck
            
        Returns:
            Dict[str, Any]: Basic packing results
        """
        packed_cartons = []
        failed_cartons = []
        
        for carton in cartons:
            position = self._find_best_position_laff(carton, truck, packed_cartons)
            
            if position:
                packed_carton = self.create_packed_carton(carton, position)
                self._calculate_carton_metrics(packed_carton, packed_cartons, truck)
                packed_cartons.append(packed_carton)
            else:
                failed_cartons.append(carton)
        
        score = self._calculate_pack_score(packed_cartons, failed_cartons, truck)
        
        return {
            'packed_cartons': packed_cartons,
            'failed_cartons': failed_cartons,
            'score': score,
            'pass_number': 0
        }
    
    def _postprocess_results(self, result: Dict[str, Any], truck: Truck) -> Dict[str, Any]:
        """
        Post-process packing results.
        
        Args:
            result: Raw packing result
            truck: Target truck
            
        Returns:
            Dict[str, Any]: Processed results with metrics
        """
        packed_cartons = result['packed_cartons']
        
        # Calculate final metrics
        metrics = self.calculate_packing_metrics(packed_cartons, truck)
        
        # Add algorithm-specific metrics
        metrics.update({
            'algorithm_name': self.name,
            'ransac_iterations': self.ransac_iterations,
            'optimization_passes': self.optimization_passes,
            'parallel_workers': self.parallel_workers,
            'failed_cartons_count': len(result['failed_cartons']),
            'pack_score': result['score'],
            'algorithm_info': self.get_algorithm_info()
        })
        
        return {
            'packed_cartons': packed_cartons,
            'metrics': metrics
        }