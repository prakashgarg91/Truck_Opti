"""
Enterprise Exception Hierarchy
Standardized error handling and exception management
"""

from .base import (
    TruckOptiException,
    ValidationError,
    BusinessLogicError,
    ExternalServiceError,
    AuthenticationError,
    AuthorizationError
)

from .domain import (
    PackingError,
    OptimizationError,
    TruckCapacityError,
    InvalidCartonError,
    RouteOptimizationError
)

from .handlers import (
    register_error_handlers,
    handle_validation_error,
    handle_business_logic_error,
    handle_external_service_error
)

__all__ = [
    # Base exceptions
    'TruckOptiException',
    'ValidationError',
    'BusinessLogicError',
    'ExternalServiceError',
    'AuthenticationError',
    'AuthorizationError',
    
    # Domain-specific exceptions
    'PackingError',
    'OptimizationError',
    'TruckCapacityError',
    'InvalidCartonError',
    'RouteOptimizationError',
    
    # Error handlers
    'register_error_handlers',
    'handle_validation_error',
    'handle_business_logic_error',
    'handle_external_service_error'
]