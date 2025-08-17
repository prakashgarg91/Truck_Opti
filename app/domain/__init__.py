"""
Domain Layer - Core Business Logic
Enterprise-grade domain-driven design implementation
"""

from .entities import *
from .value_objects import *
from .services import *
from .specifications import *

__all__ = [
    # Core entities
    'TruckEntity', 'CartonEntity', 'PackingJobEntity', 'ShipmentEntity',
    
    # Value objects
    'Dimensions', 'Weight', 'Volume', 'Money', 'OptimizationStrategy',
    'PackingPosition', 'CostBreakdown',
    
    # Domain services
    'PackingDomainService', 'CostCalculationService', 'OptimizationService',
    
    # Specifications
    'TruckCapacitySpecification', 'CartonFitSpecification', 'WeightLimitSpecification'
]