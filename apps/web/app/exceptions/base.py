"""
Base Exception Classes
Enterprise-level exception hierarchy with structured error handling
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum
import traceback
import uuid
from datetime import datetime


class ErrorCode(Enum):
    """Standardized error codes"""
    # General errors
    VALIDATION_ERROR = "VALIDATION_ERROR"
    BUSINESS_LOGIC_ERROR = "BUSINESS_LOGIC_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    
    # Authentication & Authorization
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    AUTHORIZATION_DENIED = "AUTHORIZATION_DENIED"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    
    # Domain-specific errors
    PACKING_FAILED = "PACKING_FAILED"
    OPTIMIZATION_FAILED = "OPTIMIZATION_FAILED"
    TRUCK_CAPACITY_EXCEEDED = "TRUCK_CAPACITY_EXCEEDED"
    INVALID_CARTON = "INVALID_CARTON"
    ROUTE_OPTIMIZATION_FAILED = "ROUTE_OPTIMIZATION_FAILED"
    
    # Database errors
    DATABASE_CONNECTION_ERROR = "DATABASE_CONNECTION_ERROR"
    DATABASE_CONSTRAINT_VIOLATION = "DATABASE_CONSTRAINT_VIOLATION"
    
    # External service errors
    API_RATE_LIMIT_EXCEEDED = "API_RATE_LIMIT_EXCEEDED"
    EXTERNAL_API_TIMEOUT = "EXTERNAL_API_TIMEOUT"
    EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR"


@dataclass
class ErrorContext:
    """Context information for errors"""
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    operation: Optional[str] = None
    resource_id: Optional[str] = None
    additional_data: Optional[Dict[str, Any]] = None


class TruckOptiException(Exception):
    """
    Base exception class for TruckOpti application
    Provides structured error information for enterprise logging and monitoring
    """
    
    def __init__(
        self,
        message: str,
        error_code: ErrorCode,
        context: Optional[ErrorContext] = None,
        details: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(message)
        
        self.message = message
        self.error_code = error_code
        self.context = context or ErrorContext()
        self.details = details or {}
        self.cause = cause
        self.timestamp = datetime.utcnow()
        self.trace_id = str(uuid.uuid4())
        self.stack_trace = traceback.format_exc() if cause else None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for logging/serialization"""
        return {
            "trace_id": self.trace_id,
            "timestamp": self.timestamp.isoformat(),
            "error_code": self.error_code.value,
            "message": self.message,
            "context": {
                "user_id": self.context.user_id,
                "session_id": self.context.session_id,
                "request_id": self.context.request_id,
                "operation": self.context.operation,
                "resource_id": self.context.resource_id,
                "additional_data": self.context.additional_data
            },
            "details": self.details,
            "stack_trace": self.stack_trace,
            "cause": str(self.cause) if self.cause else None
        }
    
    def __str__(self) -> str:
        return f"{self.error_code.value}: {self.message} (Trace ID: {self.trace_id})"


class ValidationError(TruckOptiException):
    """Exception for validation errors"""
    
    def __init__(
        self,
        message: str,
        field_errors: Optional[Dict[str, List[str]]] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        self.field_errors = field_errors or {}
        details = {"field_errors": self.field_errors}
        super().__init__(
            message=message,
            error_code=ErrorCode.VALIDATION_ERROR,
            context=context,
            details=details,
            cause=cause
        )


class BusinessLogicError(TruckOptiException):
    """Exception for business logic violations"""
    
    def __init__(
        self,
        message: str,
        rule: str,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        self.rule = rule
        details = {"violated_rule": rule}
        super().__init__(
            message=message,
            error_code=ErrorCode.BUSINESS_LOGIC_ERROR,
            context=context,
            details=details,
            cause=cause
        )


class ExternalServiceError(TruckOptiException):
    """Exception for external service errors"""
    
    def __init__(
        self,
        message: str,
        service_name: str,
        status_code: Optional[int] = None,
        response_body: Optional[str] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        self.service_name = service_name
        self.status_code = status_code
        self.response_body = response_body
        
        details = {
            "service_name": service_name,
            "status_code": status_code,
            "response_body": response_body
        }
        
        super().__init__(
            message=message,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            context=context,
            details=details,
            cause=cause
        )


class AuthenticationError(TruckOptiException):
    """Exception for authentication failures"""
    
    def __init__(
        self,
        message: str = "Authentication failed",
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.AUTHENTICATION_FAILED,
            context=context,
            cause=cause
        )


class AuthorizationError(TruckOptiException):
    """Exception for authorization failures"""
    
    def __init__(
        self,
        message: str = "Access denied",
        required_permission: Optional[str] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        details = {"required_permission": required_permission} if required_permission else {}
        super().__init__(
            message=message,
            error_code=ErrorCode.AUTHORIZATION_DENIED,
            context=context,
            details=details,
            cause=cause
        )


class DatabaseError(TruckOptiException):
    """Exception for database-related errors"""
    
    def __init__(
        self,
        message: str,
        operation: str,
        table: Optional[str] = None,
        constraint: Optional[str] = None,
        context: Optional[ErrorContext] = None,
        cause: Optional[Exception] = None
    ):
        self.operation = operation
        self.table = table
        self.constraint = constraint
        
        details = {
            "operation": operation,
            "table": table,
            "constraint": constraint
        }
        
        error_code = (ErrorCode.DATABASE_CONSTRAINT_VIOLATION 
                     if constraint 
                     else ErrorCode.DATABASE_CONNECTION_ERROR)
        
        super().__init__(
            message=message,
            error_code=error_code,
            context=context,
            details=details,
            cause=cause
        )