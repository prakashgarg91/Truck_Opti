"""
TruckOpti Microsoft - Base Packing Algorithm

This module defines the base class for all 3D bin packing algorithms.
It provides common functionality and interface for algorithm implementations.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import logging
import time

from ..models.truck import Truck
from ..models.carton import Carton
from ..models.packed_carton import PackedCarton
from ..models.coordinates import Coordinates3D


class BasePackingAlgorithm(ABC):
    """
    Abstract base class for all 3D bin packing algorithms.
    
    This class defines the common interface and shared functionality
    for all packing algorithms in the TruckOpti system.
    """
    
    def __init__(self, name: str, description: str):
        """
        Initialize the base algorithm.
        
        Args:
            name: Algorithm name
            description: Algorithm description
        """
        self.name = name
        self.description = description
        self.logger = logging.getLogger(f"TruckOpti.{self.__class__.__name__}")
        self.execution_stats = {}
        self.start_time = None
        self.end_time = None
    
    @abstractmethod
    def pack_cartons(self, cartons: List[Carton], truck: Truck, 
                    max_iterations: int = 1000) -> Tuple[List[PackedCarton], Dict[str, Any]]:
        """
        Pack cartons into the truck using this algorithm.
        
        Args:
            cartons: List of cartons to pack
            truck: Target truck for packing
            max_iterations: Maximum algorithm iterations
            
        Returns:
            Tuple[List[PackedCarton], Dict[str, Any]]: Packed cartons and optimization results
        """
        pass
    
    def optimize_cartons_order(self, cartons: List[Carton]) -> List[Carton]:
        """
        Sort cartons for optimal packing order.
        
        This method can be overridden by specific algorithms
        to provide custom sorting strategies.
        
        Args:
            cartons: List of cartons to sort
            
        Returns:
            List[Carton]: Sorted cartons
        """
        # Default: sort by volume (descending), then by weight (descending), then by priority (descending)
        return sorted(cartons, key=lambda c: (
            -c.volume,  # Larger first
            -c.weight,  # Heavier first
            -c.priority  # Higher priority first
        ))
    
    def create_packed_carton(self, carton: Carton, position: Coordinates3D,
                           rotation_x: float = 0.0, rotation_y: float = 0.0, 
                           rotation_z: float = 0.0) -> PackedCarton:
        """
        Create a PackedCarton from a Carton and position.
        
        Args:
            carton: Base carton
            position: Position coordinates
            rotation_x: Rotation around X-axis
            rotation_y: Rotation around Y-axis  
            rotation_z: Rotation around Z-axis
            
        Returns:
            PackedCarton: Created packed carton
        """
        # Calculate actual dimensions after rotation (simplified)
        actual_length = carton.length
        actual_width = carton.width
        actual_height = carton.height
        
        # If rotation is allowed and beneficial, try different orientations
        if carton.allow_rotation and (rotation_x != 0 or rotation_y != 0 or rotation_z != 0):
            # Simplified rotation - in real implementation, this would be more complex
            if rotation_x == 90:
                actual_length, actual_height = carton.height, carton.length
            elif rotation_y == 90:
                actual_length, actual_width = carton.width, carton.length
            elif rotation_z == 90:
                actual_width, actual_height = carton.height, carton.width
        
        packed_carton = PackedCarton(
            carton=carton,
            position=position,
            rotation_x=rotation_x,
            rotation_y=rotation_y,
            rotation_z=rotation_z,
            actual_length=actual_length,
            actual_width=actual_width,
            actual_height=actual_height
        )
        
        return packed_carton
    
    def check_collision(self, new_carton: PackedCarton, 
                       existing_cartons: List[PackedCarton]) -> bool:
        """
        Check if a new carton collides with existing packed cartons.
        
        Args:
            new_carton: Carton to check
            existing_cartons: Already packed cartons
            
        Returns:
            bool: True if collision detected
        """
        for existing in existing_cartons:
            if new_carton.is_colliding_with(existing):
                return True
        return False
    
    def find_valid_position(self, carton: Carton, truck: Truck, 
                          existing_cartons: List[PackedCarton],
                          search_grid_size: float = 1.0) -> Optional[Coordinates3D]:
        """
        Find a valid position for a carton in the truck.
        
        This method implements a simple grid-based search for valid positions.
        
        Args:
            carton: Carton to position
            truck: Target truck
            existing_cartons: Already packed cartons
            search_grid_size: Grid size for search (smaller = more precise, slower)
            
        Returns:
            Optional[Coordinates3D]: Valid position or None if no position found
        """
        max_x = truck.constraints.max_length - carton.length
        max_y = truck.constraints.max_width - carton.width
        max_z = truck.constraints.max_height - carton.height
        
        if max_x < 0 or max_y < 0 or max_z < 0:
            return None
        
        # Grid-based search
        x = 0.0
        while x <= max_x:
            y = 0.0
            while y <= max_y:
                z = 0.0
                while z <= max_z:
                    # Try current position
                    test_position = Coordinates3D(x, y, z)
                    test_carton = self.create_packed_carton(carton, test_position)
                    
                    # Check bounds
                    if not test_carton.is_within_truck_bounds(
                        truck.constraints.max_length,
                        truck.constraints.max_width, 
                        truck.constraints.max_height
                    ):
                        z += search_grid_size
                        continue
                    
                    # Check collisions
                    if not self.check_collision(test_carton, existing_cartons):
                        return test_position
                    
                    z += search_grid_size
                y += search_grid_size
            x += search_grid_size
        
        return None
    
    def calculate_packing_metrics(self, packed_cartons: List[PackedCarton], 
                                truck: Truck) -> Dict[str, Any]:
        """
        Calculate comprehensive packing metrics.
        
        Args:
            packed_cartons: List of packed cartons
            truck: Target truck
            
        Returns:
            Dict[str, Any]: Packing metrics
        """
        if not packed_cartons:
            return {
                "total_cartons": 0,
                "total_weight": 0.0,
                "total_volume": 0.0,
                "weight_utilization": 0.0,
                "volume_utilization": 0.0,
                "average_stability": 0.0,
                "algorithm_efficiency": 0.0
            }
        
        # Basic metrics
        total_cartons = len(packed_cartons)
        total_weight = sum(pc.carton.weight for pc in packed_cartons)
        total_volume = sum(pc.volume for pc in packed_cartons)
        
        # Utilization metrics
        weight_utilization = (total_weight / truck.constraints.max_weight) * 100
        volume_utilization = (total_volume / truck.constraints.max_volume) * 100
        
        # Quality metrics
        stability_scores = [pc.stability_score for pc in packed_cartons if pc.stability_score > 0]
        average_stability = sum(stability_scores) / len(stability_scores) if stability_scores else 0.0
        
        # Algorithm efficiency (simple metric)
        algorithm_efficiency = min(100, (volume_utilization + weight_utilization) / 2)
        
        return {
            "total_cartons": total_cartons,
            "total_weight": total_weight,
            "total_volume": total_volume,
            "weight_utilization": weight_utilization,
            "volume_utilization": volume_utilization,
            "average_stability": average_stability,
            "algorithm_efficiency": algorithm_efficiency,
            "remaining_weight_capacity": truck.constraints.max_weight - total_weight,
            "remaining_volume_capacity": truck.constraints.max_volume - total_volume,
            "execution_time": self.get_execution_time()
        }
    
    def start_timing(self) -> None:
        """Start algorithm execution timing."""
        self.start_time = time.time()
        self.end_time = None
    
    def end_timing(self) -> None:
        """End algorithm execution timing."""
        self.end_time = time.time()
    
    def get_execution_time(self) -> float:
        """
        Get algorithm execution time.
        
        Returns:
            float: Execution time in seconds
        """
        if self.start_time is None:
            return 0.0
        if self.end_time is None:
            return time.time() - self.start_time
        return self.end_time - self.start_time
    
    def get_algorithm_info(self) -> Dict[str, Any]:
        """
        Get algorithm information and statistics.
        
        Returns:
            Dict[str, Any]: Algorithm information
        """
        return {
            "name": self.name,
            "description": self.description,
            "class_name": self.__class__.__name__,
            "execution_time": self.get_execution_time(),
            "start_time": datetime.fromtimestamp(self.start_time).isoformat() if self.start_time else None,
            "end_time": datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
            "execution_stats": self.execution_stats
        }
    
    def log_execution_start(self) -> None:
        """Log algorithm execution start."""
        self.logger.info(f"Starting {self.name} algorithm execution")
        self.start_timing()
    
    def log_execution_end(self, success: bool, details: str = "") -> None:
        """Log algorithm execution end."""
        execution_time = self.get_execution_time()
        status = "SUCCESS" if success else "FAILED"
        self.logger.info(f"{self.name} algorithm {status} - Time: {execution_time:.3f}s {details}")
        self.end_timing()
    
    def __str__(self) -> str:
        """String representation."""
        return f"{self.name} (Base Algorithm)"
    
    def __repr__(self) -> str:
        """Detailed string representation."""
        return f"{self.__class__.__name__}(name='{self.name}', description='{self.description}')"