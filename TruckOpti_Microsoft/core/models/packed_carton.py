"""
TruckOpti Microsoft - Packed Carton Model

This module defines the PackedCarton data model for representing cartons
that have been placed/positioned within a truck during optimization.
"""

from dataclasses import dataclass
from typing import Optional, Tuple, List
from .carton import Carton
from .coordinates import Coordinates3D, BoundingBox3D


@dataclass
class PackedCarton:
    """
    Represents a carton that has been positioned within a truck.
    
    This class extends the basic Carton with spatial positioning information,
    rotation data, and load stability metrics.
    """
    # Base carton information
    carton: Carton
    
    # Positioning information
    position: Coordinates3D  # Bottom-left-front corner
    
    # Rotation information (in degrees)
    rotation_x: float = 0.0  # Rotation around X-axis
    rotation_y: float = 0.0  # Rotation around Y-axis
    rotation_z: float = 0.0  # Rotation around Z-axis
    
    # Spatial representation after rotation
    actual_length: float = 0.0
    actual_width: float = 0.0
    actual_height: float = 0.0
    
    # Load stability metrics
    stability_score: float = 0.0  # 0-100 stability rating
    support_contact_area: float = 0.0  # Area in contact with support
    overhang_percentage: float = 0.0  # Percentage of carton hanging over support
    
    # Optimization metrics
    fit_quality: float = 0.0  # How well the carton fits in available space
    waste_space: float = 0.0  # Unused space around the carton
    neighbor_interaction_score: float = 0.0  # Interaction with nearby cartons
    
    # Safety and handling metrics
    handling_difficulty: float = 0.0  # How difficult to handle/remove
    access_priority: int = 0  # Priority for access (0=lowest, 100=highest)
    
    def __post_init__(self):
        """Initialize actual dimensions and validate positioning."""
        if self.actual_length == 0.0:
            self.actual_length = self.carton.length
        if self.actual_width == 0.0:
            self.actual_width = self.carton.width
        if self.actual_height == 0.0:
            self.actual_height = self.carton.height
    
    @property
    def bounding_box(self) -> BoundingBox3D:
        """
        Get the bounding box of this packed carton.
        
        Returns:
            BoundingBox3D: Spatial bounds of the packed carton
        """
        return BoundingBox3D(
            self.position,
            Coordinates3D(
                self.position.x + self.actual_length,
                self.position.y + self.actual_width,
                self.position.z + self.actual_height
            )
        )
    
    @property
    def volume(self) -> float:
        """
        Get the actual volume occupied by this carton.
        
        Returns:
            float: Volume of the positioned carton
        """
        return self.actual_length * self.actual_width * self.actual_height
    
    @property
    def weight_distribution(self) -> Tuple[float, float, float]:
        """
        Get weight distribution across three axes.
        
        Returns:
            Tuple[float, float, float]: Weight distribution (x, y, z)
        """
        # Simplified weight distribution calculation
        total_weight = self.carton.weight
        # Assume uniform distribution with some adjustments for rotation
        distribution_factor = 0.9 if self.carton.is_fragile else 1.0
        
        return (total_weight * distribution_factor / 3,
                total_weight * distribution_factor / 3,
                total_weight * distribution_factor / 3)
    
    def is_colliding_with(self, other: 'PackedCarton') -> bool:
        """
        Check if this carton collides with another packed carton.
        
        Args:
            other: Other packed carton to check
            
        Returns:
            bool: True if cartons collide
        """
        return self.bounding_box.intersects(other.bounding_box)
    
    def is_within_truck_bounds(self, truck_max_x: float, truck_max_y: float, 
                              truck_max_z: float) -> bool:
        """
        Check if carton is within truck physical boundaries.
        
        Args:
            truck_max_x: Maximum x-coordinate of truck
            truck_max_y: Maximum y-coordinate of truck
            truck_max_z: Maximum z-coordinate of truck
            
        Returns:
            bool: True if carton is within bounds
        """
        return self.bounding_box.max_corner.is_within_bounds(
            truck_max_x, truck_max_y, truck_max_z
        )
    
    def calculate_stability(self, support_cartons: List['PackedCarton']) -> float:
        """
        Calculate stability score based on support and positioning.
        
        Args:
            support_cartons: Cartons providing support below this carton
            
        Returns:
            float: Stability score (0-100)
        """
        if not support_cartons:
            # No support - low stability unless at truck floor
            if self.position.z == 0:
                return 80.0  # Good stability on floor
            else:
                return 20.0  # Poor stability without support
        
        # Calculate support area and coverage
        support_area = 0.0
        my_bottom_area = self.actual_length * self.actual_width
        
        for support in support_cartons:
            # Calculate overlap area
            overlap_x = min(
                self.bounding_box.max_corner.x, 
                support.bounding_box.max_corner.x
            ) - max(self.position.x, support.position.x)
            
            overlap_y = min(
                self.bounding_box.max_corner.y,
                support.bounding_box.max_corner.y
            ) - max(self.position.y, support.position.y)
            
            if overlap_x > 0 and overlap_y > 0:
                support_area += overlap_x * overlap_y
        
        # Calculate stability based on support coverage
        if my_bottom_area == 0:
            return 0.0
        
        support_percentage = min(100, (support_area / my_bottom_area) * 100)
        
        # Base stability on support percentage
        base_stability = support_percentage * 0.8
        
        # Adjust for weight (heavier items need more support)
        weight_factor = min(1.2, 0.8 + (self.carton.weight / 100))
        
        # Adjust for fragility
        fragility_factor = 0.7 if self.carton.is_fragile else 1.0
        
        self.stability_score = min(100, base_stability * weight_factor * fragility_factor)
        return self.stability_score
    
    def update_metrics(self, optimization_results: dict) -> None:
        """
        Update optimization metrics based on algorithm results.
        
        Args:
            optimization_results: Dictionary with optimization metrics
        """
        self.fit_quality = optimization_results.get('fit_quality', 0.0)
        self.waste_space = optimization_results.get('waste_space', 0.0)
        self.neighbor_interaction_score = optimization_results.get('neighbor_score', 0.0)
        self.handling_difficulty = optimization_results.get('handling_difficulty', 0.0)
        self.access_priority = optimization_results.get('access_priority', 0)
    
    def get_position_info(self) -> dict:
        """
        Get comprehensive positioning information.
        
        Returns:
            dict: Complete positioning and spatial information
        """
        return {
            'carton_id': self.carton.id,
            'carton_name': self.carton.name or self.carton.id,
            'position': {
                'x': self.position.x,
                'y': self.position.y,
                'z': self.position.z
            },
            'rotation': {
                'x': self.rotation_x,
                'y': self.rotation_y,
                'z': self.rotation_z
            },
            'actual_dimensions': {
                'length': self.actual_length,
                'width': self.actual_width,
                'height': self.actual_height
            },
            'bounding_box': {
                'min': {
                    'x': self.bounding_box.min_corner.x,
                    'y': self.bounding_box.min_corner.y,
                    'z': self.bounding_box.min_corner.z
                },
                'max': {
                    'x': self.bounding_box.max_corner.x,
                    'y': self.bounding_box.max_corner.y,
                    'z': self.bounding_box.max_corner.z
                }
            },
            'volume': self.volume,
            'weight': self.carton.weight,
            'stability_score': self.stability_score,
            'fit_quality': self.fit_quality,
            'waste_space': self.waste_space,
            'is_fragile': self.carton.is_fragile,
            'is_stackable': self.carton.is_stackable
        }
    
    def __repr__(self) -> str:
        """String representation."""
        return f"PackedCarton(id='{self.carton.id}', " \
               f"position=({self.position.x:.1f}, {self.position.y:.1f}, {self.position.z:.1f}), " \
               f"stability={self.stability_score:.1f}%)"