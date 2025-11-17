"""
TruckOpti Microsoft - Carton Model

This module defines the Carton data model for representing individual cartons
in the truck optimization system. Cartons represent packages to be loaded
into trucks.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
from .coordinates import Coordinates3D, BoundingBox3D


@dataclass
class Carton:
    """
    Represents a carton/package to be loaded into a truck.
    
    This class encapsulates all properties and behaviors of a carton,
    including dimensions, weight, fragility, and rotation capabilities.
    """
    # Unique identifier
    id: str
    
    # Physical dimensions
    length: float
    width: float
    height: float
    
    # Weight properties
    weight: float
    
    # Priority (higher numbers = higher priority)
    priority: int = 1
    
    # Special properties
    is_fragile: bool = False
    is_stackable: bool = True
    is_refrigerated: bool = False
    
    # Rotation capabilities
    allow_rotation: bool = True
    
    # Label/description
    name: Optional[str] = None
    
    def __post_init__(self):
        """Validate carton properties after initialization."""
        if self.length <= 0 or self.width <= 0 or self.height <= 0:
            raise ValueError(f"C

[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]