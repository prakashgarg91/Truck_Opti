"""
Domain-Specific Exceptions
Business domain exceptions for truck optimization
"""

from typing import Optional, Dict, Any, List
from .base import TruckOptiException, ErrorCode, ErrorContext


class PackingError(TruckOptiException):
    """Exception for packing-related errors"""
    
    def __init__(
        self,
        message: str,
        cartons_count: Optional[int] = None,
        truck_capacity: Optional[float] = None,
        utilization: Optional[float] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {
            "cartons_count": cartons_count,
            "truck_capacity": truck_capacity,
            "utilization": utilization
        }
        super().__init__(
            message=message,
            error_code=ErrorCode.PACKING_FAILED,
            context=context,
            details=details,
            cause=cause
        )


class OptimizationError(TruckOptiException):
    """Exception for optimization algorithm failures"""
    
    def __init__(
        self,
        message: str,
        algorithm: Optional[str] = None,
        iteration_count: Optional[int] = None,
        best_score: Optional[float] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {
            "algorithm": algorithm,
            "iteration_count": iteration_count,
            "best_score": best_score
        }
        super().__init__(
            message=message,
            error_code=ErrorCode.OPTIMIZATION_FAILED,
            context=context,
            details=details,
            cause=cause
        )


class TruckCapacityError(TruckOptiException):
    """Exception for truck capacity violations"""
    
    def __init__(
        self,
        message: str,
        truck_id: Optional[str] = None,
        max_capacity: Optional[float] = None,
        attempted_load: Optional[float] = None,
        capacity_type: str = "volume",  # volume, weight, etc.
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {
            "truck_id": truck_id,
            "max_capacity": max_capacity,
            "attempted_load": attempted_load,
            "capacity_type": capacity_type,
            "excess": attempted_load - max_capacity if (attempted_load and max_capacity) else None
        }
        super().__init__(
            message=message,
            error_code=ErrorCode.TRUCK_CAPACITY_EXCEEDED,
            context=context,
            details=details,
            cause=cause
        )


class InvalidCartonError(TruckOptiException):
    """Exception for invalid carton specifications"""
    
    def __init__(
        self,
        message: str,
        carton_id: Optional[str] = None,
        validation_failures: Optional[List[str]] = None,
        carton_dimensions: Optional[Dict[str, float]] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {
            "carton_id": carton_id,
            "validation_failures": validation_failures or [],
            "carton_dimensions": carton_dimensions
        }
        super().__init__(
            message=message,
            error_code=ErrorCode.INVALID_CARTON,
            context=context,
            details=details,
            cause=cause
        )


class RouteOptimizationError(TruckOptiException):
    """Exception for route optimization failures"""
    
    def __init__(
        self,
        message: str,
        waypoints_count: Optional[int] = None,
        optimization_method: Optional[str] = None,
        constraints_violated: Optional[List[str]] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {
            "waypoints_count": waypoints_count,
            "optimization_method": optimization_method,
            "constraints_violated": constraints_violated or []
        }
        super().__init__(
            message=message,
            error_code=ErrorCode.ROUTE_OPTIMIZATION_FAILED,
            context=context,
            details=details,
            cause=cause
        )


class CostCalculationError(TruckOptiException):
    """Exception for cost calculation errors"""
    
    def __init__(
        self,
        message: str,
        calculation_type: Optional[str] = None,
        missing_parameters: Optional[List[str]] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {
            "calculation_type": calculation_type,
            "missing_parameters": missing_parameters or []
        }
        super().__init__(
            message=message,
            error_code=ErrorCode.BUSINESS_LOGIC_ERROR,
            context=context,
            details=details,
            cause=cause
        )


class DataIntegrityError(TruckOptiException):
    """Exception for data integrity violations"""
    
    def __init__(
        self,
        message: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        integrity_check: Optional[str] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "integrity_check": integrity_check
        }
        super().__init__(
            message=message,
            error_code=ErrorCode.BUSINESS_LOGIC_ERROR,
            context=context,
            details=details,
            cause=cause
        )