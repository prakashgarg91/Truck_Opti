"""
TruckOpti Microsoft - 3D Coordinates Model

This module provides the core 3D coordinate system used throughout the truck
optimization system for spatial representation and calculations.
"""

from dataclasses import dataclass
from typing import Tuple, Optional


@dataclass(frozen=True)
class Coordinates3D:
    """
    Immutable 3D coordinate representation for spatial operations.
    
    This class provides fundamental 3D spatial operations for the truck
    optimization system, including collision detection, distance calculations,
    and spatial comparisons.
    """
    x: float
    y: float
    z: float
    
    def __post_init__(self):
        """Validate coordinates after initialization."""
        if self.x < 0 or self.y < 0 or self.z < 0:
            raise ValueError(f"Coordinates cannot be negative: ({self.x}, {self.y}, {self.z})")
    
    def distance_to(self, other: 'Coordinates3D') -> float:
        """
        Calculate Euclidean distance to another coordinate.
        
        Args:
            other: Target coordinate for distance calculation
            
        Returns:
            float: Euclidean distance between coordinates
        """
        return ((self.x - other.x) ** 2 + 
                (self.y - other.y) ** 2 + 
                (self.z - other.z) ** 2) ** 0.5
    
    def manhattan_distance_to(self, other: 'Coordinates3D') -> float:
        """
        Calculate Manhattan distance to another coordinate.
        
        Args:
            other: Target coordinate for distance calculation
            
        Returns:
            float: Manhattan distance between coordinates
        """
        return abs(self.x - other.x) + abs(self.y - other.y) + abs(self.z - other.z)
    
    def is_within_bounds(self, max_x: float, max_y: float, max_z: float) -> bool:
        """
        Check if coordinate is within specified bounds.
        
        Args:
            max_x: Maximum x-coordinate boundary
            max_y: Maximum y-coordinate boundary
            max_z: Maximum z-coordinate boundary
            
        Returns:
            bool: True if coordinate is within bounds
        """
        return 0 <= self.x <= max_x and 0 <= self.y <= max_y and 0 <= self.z <= max_z
    
    def to_tuple(self) -> Tuple[float, float, float]:
        """
        Convert to tuple representation.
        
        Returns:
            Tuple[float, float, float]: Coordinate as tuple
        """
        return (self.x, self.y, self.z)
    
    def scale(self, factor: float) -> 'Coordinates3D':
        """
        Scale coordinates by a factor.
        
        Args:
            factor: Scaling factor
            
        Returns:
            Coordinates3D: Scaled coordinates
        """
        return Coordinates3D(self.x * factor, self.y * factor, self.z * factor)
    
    def __add__(self, other: 'Coordinates3D') -> 'Coordinates3D':
        """Add two coordinates element-wise."""
        return Coordinates3D(self.x + other.x, self.y + other.y, self.z + other.z)
    
    def __sub__(self, other: 'Coordinates3D') -> 'Coordinates3D':
        """Subtract two coordinates element-wise."""
        return Coordinates3D(self.x - other.x, self.y - other.y, self.z - other.z)
    
    def __repr__(self) -> str:
        """String representation."""
        return f"Coordinates3D(x={self.x}, y={self.y}, z={self.z})"
    
    def __str__(self) -> str:
        """Human-readable string representation."""
        return f"({self.x}, {self.y}, {self.z})"


@dataclass(frozen=True)
class BoundingBox3D:
    """
    3D bounding box for collision detection and spatial calculations.
    
    This class provides essential bounding box operations for 3D collision
    detection, overlap detection, and spatial partitioning.
    """
    min_corner: Coordinates3D
    max_corner: Coordinates3D
    
    def __post_init__(self):
        """Validate bounding box after initialization."""
        if (self.min_corner.x > self.max_corner.x or 
            self.min_corner.y > self.max_corner.y or 
            self.min_corner.z > self.max_corner.z):
            raise ValueError(f"Invalid bounding box: min {self.min_corner} > max {self.max_corner}")
    
    @property
    def width(self) -> float:
        """Width of the bounding box (x-axis)."""
        return self.max_corner.x - self.min_corner.x
    
    @property
    def height(self) -> float:
        """Height of the bounding box (y-axis)."""
        return self.max_corner.y - self.min_corner.y
    
    @property
    def depth(self) -> float:
        """Depth of the bounding box (z-axis)."""
        return self.max_corner.z - self.min_corner.z
    
    @property
    def volume(self) -> float:
        """Volume of the bounding box."""
        return self.width * self.height * self.depth
    
    @property
    def center(self) -> Coordinates3D:
        """Center point of the bounding box."""
        return Coordinates3D(
            (self.min_corner.x + self.max_corner.x) / 2,
            (self.min_corner.y + self.max_corner.y) / 2,
            (self.min_corner.z + self.max_corner.z) / 2
        )
    
    def contains_point(self, point: Coordinates3D) -> bool:
        """
        Check if a point is contained within the bounding box.
        
        Args:
            point: Point to check
            
        Returns:
            bool: True if point is within bounds
        """
        return (self.min_corner.x <= point.x <= self.max_corner.x and
                self.min_corner.y <= point.y <= self.max_corner.y and
                self.min_corner.z <= point.z <= self.max_corner.z)
    
    def intersects(self, other: 'BoundingBox3D') -> bool:
        """
        Check if this bounding box intersects with another.
        
        Args:
            other: Other bounding box to check
            
        Returns:
            bool: True if boxes intersect
        """
        return not (self.max_corner.x < other.min_corner.x or
                   self.min_corner.x > other.max_corner.x or
                   self.max_corner.y < other.min_corner.y or
                   self.min_corner.y > other.max_corner.y or
                   self.max_corner.z < other.min_corner.z or
                   self.min_corner.z > other.max_corner.z)
    
    def contains_box(self, other: 'BoundingBox3D') -> bool:
        """
        Check if this bounding box completely contains another.
        
        Args:
            other: Other bounding box to check
            
        Returns:
            bool: True if this box contains the other
        """
        return (self.min_corner.x <= other.min_corner.x and
                self.min_corner.y <= other.min_corner.y and
                self.min_corner.z <= other.min_corner.z and
                self.max_corner.x >= other.max_corner.x and
                self.max_corner.y >= other.max_corner.y and
                self.max_corner.z >= other.max_corner.z)
    
    def expanded(self, padding: float) -> 'BoundingBox3D':
        """
        Create an expanded version of this bounding box.
        
        Args:
            padding: Padding amount to add to all sides
            
        Returns:
            BoundingBox3D: Expanded bounding box
        """
        return BoundingBox3D(
            Coordinates3D(self.min_corner.x - padding, 
                         self.min_corner.y - padding, 
                         self.min_corner.z - padding),
            Coordinates3D(self.max_corner.x + padding, 
                         self.max_corner.y + padding, 
                         self.max_corner.z + padding)
        )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"BoundingBox3D(min={self.min_corner}, max={self.max_corner})"


def create_bounding_box_from_corners(corner1: Coordinates3D, corner2: Coordinates3D) -> BoundingBox3D:
    """
    Create a bounding box from two opposite corners.
    
    Args:
        corner1: First corner of the bounding box
        corner2: Opposite corner of the bounding box
        
    Returns:
        BoundingBox3D: Normalized bounding box
    """
    min_corner = Coordinates3D(
        min(corner1.x, corner2.x),
        min(corner1.y, corner2.y),
        min(corner1.z, corner2.z)
    )
    max_corner = Coordinates3D(
        max(corner1.x, corner2.x),
        max(corner1.y, corner2.y),
        max(corner1.z, corner2.z)
    )
    return BoundingBox3D(min_corner, max_corner)


def create_bounding_box_from_size(origin: Coordinates3D, width: float, 
                                height: float, depth: float) -> BoundingBox3D:
    """
    Create a bounding box from origin and size.
    
    Args:
        origin: Origin corner of the bounding box
        width: Width (x-axis)
        height: Height (y-axis)
        depth: Depth (z-axis)
        
    Returns:
        BoundingBox3D: Bounding box with specified dimensions
    """
    return BoundingBox3D(
        origin,
        Coordinates3D(origin.x + width, origin.y + height, origin.z + depth)
    )