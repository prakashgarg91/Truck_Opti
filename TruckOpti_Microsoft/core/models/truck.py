"""
TruckOpti Microsoft - Truck Model

This module defines the Truck data model for representing trucks in the
truck optimization system. Trucks have physical constraints and optimization
parameters.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from .carton import Carton
from .coordinates import Coordinates3D, BoundingBox3D


@dataclass
class TruckConstraints:
    """
    Physical and operational constraints for a truck.
    
    This class encapsulates all physical limitations and operational
    constraints that must be considered during optimization.
    """
    # Physical dimensions
    max_length: float
    max_width: float
    max_height: float
    
    # Weight capacity
    max_weight: float
    
    # Volume capacity
    max_volume: float
    
    # Environmental constraints
    has_refrigeration: bool = False
    max_refrigerated_volume: float = 0.0
    
    # Loading constraints
    max_floor_load: float = 0.0  # kg/sq meter
    axle_load_limits: List[float] = field(default_factory=list)
    
    # Special handling requirements
    requires_fragile_handling: bool = False
    requires_oversized_loading: bool = False
    
    @property
    def volume_capacity(self) -> float:
        """Calculate total volume capacity."""
        return self.max_length * self.max_width * self.max_height
    
    def can_accommodate_carton(self, carton: Carton) -> bool:
        """
        Check if a carton can potentially fit in this truck.
        
        Args:
            carton: Carton to check
            
        Returns:
            bool: True if carton can potentially fit
        """
        # Check physical dimensions
        dimensions_fit = (
            carton.length <= self.max_length and
            carton.width <= self.max_width and
            carton.height <= self.max_height
        )
        
        # Check weight capacity
        weight_fit = carton.weight <= self.max_weight
        
        # Check refrigeration requirements
        if carton.is_refrigerated and not self.has_refrigeration:
            return False
        
        return dimensions_fit and weight_fit
    
    def calculate_remaining_capacity(self, current_load_weight: float, 
                                   current_load_volume: float) -> Dict[str, float]:
        """
        Calculate remaining capacity.
        
        Args:
            current_load_weight: Current total weight in truck
            current_load_volume: Current total volume occupied
            
        Returns:
            Dict with remaining capacity metrics
        """
        return {
            "remaining_weight": max(0, self.max_weight - current_load_weight),
            "remaining_volume": max(0, self.max_volume - current_load_volume),
            "remaining_percentage_weight": (self.max_weight - current_load_weight) / self.max_weight * 100,
            "remaining_percentage_volume": (self.max_volume - current_load_volume) / self.max_volume * 100
        }


@dataclass
class Truck:
    """
    Represents a truck in the optimization system.
    
    This class encapsulates all properties and behaviors of a truck,
    including physical constraints, current load state, and optimization
    parameters.
    """
    # Unique identifier
    id: str
    
    # Physical specifications
    constraints: TruckConstraints
    
    # Truck metadata
    name: Optional[str] = None
    vehicle_type: str = "truck"  # truck, trailer, container, etc.
    
    # Current state
    current_load_weight: float = 0.0
    current_load_volume: float = 0.0
    loaded_cartons: List['PackedCarton'] = field(default_factory=list)
    
    # Optimization parameters
    priority: int = 1  # Higher numbers = higher priority
    cost_per_km: float = 0.0
    fixed_cost: float = 0.0
    operational_cost: float = 0.0
    
    # Tracking and monitoring
    distance_traveled: float = 0.0
    fuel_efficiency: float = 0.0  # km per liter
    co2_emissions: float = 0.0  # kg CO2 per km
    
    # Quality metrics
    utilization_score: float = 0.0  # 0-100 utilization percentage
    
    def __post_init__(self):
        """Validate truck properties after initialization."""
        if self.current_load_weight < 0 or self.current_load_volume < 0:
            raise ValueError("Load weight and volume cannot be negative")
        
        if self.current_load_weight > self.constraints.max_weight:
            raise ValueError("Current load weight exceeds maximum capacity")
        
        if self.current_load_volume > self.constraints.max_volume:
            raise ValueError("Current load volume exceeds maximum capacity")
    
    @property
    def weight_utilization(self) -> float:
        """
        Calculate current weight utilization percentage.
        
        Returns:
            float: Weight utilization percentage (0-100)
        """
        if self.constraints.max_weight == 0:
            return 0.0
        return (self.current_load_weight / self.constraints.max_weight) * 100
    
    @property
    def volume_utilization(self) -> float:
        """
        Calculate current volume utilization percentage.
        
        Returns:
            float: Volume utilization percentage (0-100)
        """
        if self.constraints.max_volume == 0:
            return 0.0
        return (self.current_load_volume / self.constraints.max_volume) * 100
    
    @property
    def overall_utilization(self) -> float:
        """
        Calculate overall utilization (average of weight and volume).
        
        Returns:
            float: Overall utilization percentage (0-100)
        """
        return (self.weight_utilization + self.volume_utilization) / 2
    
    @property
    def is_overloaded(self) -> bool:
        """
        Check if truck is overloaded.
        
        Returns:
            bool: True if weight or volume exceeds capacity
        """
        return (self.current_load_weight > self.constraints.max_weight or
                self.current_load_volume > self.constraints.max_volume)
    
    def can_add_carton(self, carton: Carton) -> bool:
        """
        Check if a carton can be added to this truck.
        
        Args:
            carton: Carton to potentially add
            
        Returns:
            bool: True if carton can be added
        """
        # Check capacity constraints
        new_weight = self.current_load_weight + carton.weight
        new_volume = self.current_load_volume + carton.volume
        
        if new_weight > self.constraints.max_weight:
            return False
        
        if new_volume > self.constraints.max_volume:
            return False
        
        # Check truck can accommodate the carton
        if not self.constraints.can_accommodate_carton(carton):
            return False
        
        return True
    
    def add_carton(self, packed_carton: 'PackedCarton') -> bool:
        """
        Add a packed carton to the truck.
        
        Args:
            packed_carton: Packed carton to add
            
        Returns:
            bool: True if carton was successfully added
        """
        if not self.can_add_carton(packed_carton.carton):
            return False
        
        self.loaded_cartons.append(packed_carton)
        self.current_load_weight += packed_carton.carton.weight
        self.current_load_volume += packed_carton.carton.volume
        
        return True
    
    def remove_carton(self, carton_id: str) -> bool:
        """
        Remove a carton from the truck.
        
        Args:
            carton_id: ID of carton to remove
            
        Returns:
            bool: True if carton was successfully removed
        """
        for i, packed_carton in enumerate(self.loaded_cartons):
            if packed_carton.carton.id == carton_id:
                self.current_load_weight -= packed_carton.carton.weight
                self.current_load_volume -= packed_carton.carton.volume
                self.loaded_cartons.pop(i)
                return True
        
        return False
    
    def get_remaining_capacity(self) -> Dict[str, float]:
        """
        Get remaining capacity metrics.
        
        Returns:
            Dict with remaining capacity information
        """
        return self.constraints.calculate_remaining_capacity(
            self.current_load_weight, 
            self.current_load_volume
        )
    
    def get_load_summary(self) -> Dict[str, Any]:
        """
        Get comprehensive load summary.
        
        Returns:
            Dict with complete load information
        """
        return {
            "truck_id": self.id,
            "truck_name": self.name or self.id,
            "current_weight": self.current_load_weight,
            "max_weight": self.constraints.max_weight,
            "weight_utilization": self.weight_utilization,
            "current_volume": self.current_load_volume,
            "max_volume": self.constraints.max_volume,
            "volume_utilization": self.volume_utilization,
            "overall_utilization": self.overall_utilization,
            "carton_count": len(self.loaded_cartons),
            "is_overloaded": self.is_overloaded,
            "priority": self.priority,
            "remaining_capacity": self.get_remaining_capacity()
        }
    
    def optimize_utilization(self) -> float:
        """
        Calculate and update utilization score.
        
        Returns:
            float: Updated utilization score
        """
        self.utilization_score = self.overall_utilization
        return self.utilization_score
    
    def __repr__(self) -> str:
        """String representation."""
        return f"Truck(id='{self.id}', name='{self.name or self.id}', " \
               f"weight_util={self.weight_utilization:.1f}%, " \
               f"volume_util={self.volume_utilization:.1f}%)"