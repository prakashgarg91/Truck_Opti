"""
Domain Layer - Core Business Logic
Enterprise-grade domain-driven design implementation
"""

from .entities import TruckEntity, CartonEntity, PackingJobEntity, ShipmentEntity
from .value_objects import (
    Dimensions,
    Weight,
    Volume,
    Money,
    OptimizationStrategy,
    PackingPosition,
    CostBreakdown,
)
from .services import (
    PackingDomainService,
    CostCalculationService,
    OptimizationService,
)

__all__ = [
    # Core entities
    'TruckEntity', 'CartonEntity', 'PackingJobEntity', 'ShipmentEntity',
    
    # Value objects
    'Dimensions', 'Weight', 'Volume', 'Money', 'OptimizationStrategy',
    'PackingPosition', 'CostBreakdown',
    
    # Domain services
    'PackingDomainService', 'CostCalculationService', 'OptimizationService',
    
]