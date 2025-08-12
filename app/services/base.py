"""
Base Service Classes
Enterprise service layer foundation with common patterns
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, TypeVar, Generic
from dataclasses import dataclass
import logging
from datetime import datetime

from app.exceptions import BusinessLogicError, ValidationError
from app.core.logging import business_logger, performance_logger

T = TypeVar('T')
K = TypeVar('K')


@dataclass
class ServiceResult(Generic[T]):
    """Standardized service operation result"""
    success: bool
    data: Optional[T] = None
    errors: List[str] = None
    warnings: List[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.warnings is None:
            self.warnings = []
        if self.metadata is None:
            self.metadata = {}


@dataclass
class PaginationParams:
    """Pagination parameters"""
    page: int = 1
    per_page: int = 20
    
    def __post_init__(self):
        if self.page < 1:
            self.page = 1
        if self.per_page < 1 or self.per_page > 100:
            self.per_page = 20
    
    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page


@dataclass
class SortParams:
    """Sorting parameters"""
    field: str = 'id'
    direction: str = 'asc'
    
    def __post_init__(self):
        if self.direction not in ['asc', 'desc']:
            self.direction = 'asc'


class BaseService(ABC):
    """
    Base service class with common enterprise patterns
    """
    
    def __init__(self, logger_name: str = None):
        self.logger = logging.getLogger(logger_name or self.__class__.__name__)
        self._start_time = None
    
    def _start_operation(self, operation_name: str) -> None:
        """Start timing an operation"""
        self._start_time = datetime.utcnow()
        self.logger.info(f"Starting operation: {operation_name}")
    
    def _end_operation(self, operation_name: str, success: bool = True, 
                      details: Dict[str, Any] = None) -> None:
        """End timing an operation and log performance"""
        if self._start_time:
            duration = (datetime.utcnow() - self._start_time).total_seconds()
            performance_logger.log_operation(
                operation=operation_name,
                duration=duration,
                success=success,
                details=details
            )
            self._start_time = None
    
    def _validate_required_fields(self, data: Dict[str, Any], 
                                 required_fields: List[str]) -> None:
        """Validate required fields in data"""
        missing_fields = [field for field in required_fields if field not in data or data[field] is None]
        
        if missing_fields:
            raise ValidationError(
                f"Missing required fields: {', '.join(missing_fields)}",
                field_errors={field: ["This field is required"] for field in missing_fields}
            )
    
    def _validate_business_rules(self, data: Dict[str, Any], rules: Dict[str, callable]) -> None:
        """Validate business rules"""
        for rule_name, rule_func in rules.items():
            try:
                if not rule_func(data):
                    raise BusinessLogicError(
                        f"Business rule violation: {rule_name}",
                        rule=rule_name
                    )
            except Exception as e:
                if isinstance(e, BusinessLogicError):
                    raise
                raise BusinessLogicError(
                    f"Error validating business rule {rule_name}: {str(e)}",
                    rule=rule_name,
                    cause=e
                )
    
    def _create_success_result(self, data: T, metadata: Dict[str, Any] = None) -> ServiceResult[T]:
        """Create successful service result"""
        return ServiceResult(
            success=True,
            data=data,
            metadata=metadata or {}
        )
    
    def _create_error_result(self, errors: List[str], 
                           warnings: List[str] = None) -> ServiceResult[None]:
        """Create error service result"""
        return ServiceResult(
            success=False,
            errors=errors,
            warnings=warnings or []
        )
    
    def _handle_exception(self, operation_name: str, exception: Exception) -> ServiceResult[None]:
        """Handle and log exceptions"""
        self.logger.error(f"Operation {operation_name} failed: {str(exception)}", exc_info=True)
        self._end_operation(operation_name, success=False)
        
        if isinstance(exception, (ValidationError, BusinessLogicError)):
            return self._create_error_result([str(exception)])
        
        return self._create_error_result([f"Internal error during {operation_name}"])


class CacheableService(BaseService):
    """
    Service with caching capabilities
    """
    
    def __init__(self, cache=None, logger_name: str = None):
        super().__init__(logger_name)
        self.cache = cache
    
    def _get_cache_key(self, operation: str, **params) -> str:
        """Generate cache key for operation and parameters"""
        param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        return f"{self.__class__.__name__}:{operation}:{param_str}"
    
    def _cache_get(self, key: str) -> Any:
        """Get value from cache"""
        if self.cache:
            try:
                return self.cache.get(key)
            except Exception as e:
                self.logger.warning(f"Cache get error: {e}")
        return None
    
    def _cache_set(self, key: str, value: Any, timeout: int = 300) -> None:
        """Set value in cache"""
        if self.cache:
            try:
                self.cache.set(key, value, timeout=timeout)
            except Exception as e:
                self.logger.warning(f"Cache set error: {e}")
    
    def _cache_delete(self, key: str) -> None:
        """Delete value from cache"""
        if self.cache:
            try:
                self.cache.delete(key)
            except Exception as e:
                self.logger.warning(f"Cache delete error: {e}")


class TransactionalService(BaseService):
    """
    Service with database transaction support
    """
    
    def __init__(self, db=None, logger_name: str = None):
        super().__init__(logger_name)
        self.db = db
    
    def _execute_in_transaction(self, operation: callable, *args, **kwargs) -> Any:
        """Execute operation within database transaction"""
        if not self.db:
            return operation(*args, **kwargs)
        
        try:
            result = operation(*args, **kwargs)
            self.db.session.commit()
            return result
        except Exception as e:
            self.db.session.rollback()
            self.logger.error(f"Transaction rolled back: {str(e)}")
            raise
    
    def _bulk_insert(self, model_class, data_list: List[Dict[str, Any]]) -> List[Any]:
        """Bulk insert with transaction support"""
        if not self.db or not data_list:
            return []
        
        try:
            objects = [model_class(**data) for data in data_list]
            self.db.session.bulk_save_objects(objects, return_defaults=True)
            self.db.session.commit()
            return objects
        except Exception as e:
            self.db.session.rollback()
            self.logger.error(f"Bulk insert failed: {str(e)}")
            raise


class AuditableService(BaseService):
    """
    Service with audit trail capabilities
    """
    
    def __init__(self, logger_name: str = None):
        super().__init__(logger_name)
    
    def _log_audit_event(self, event_type: str, entity_type: str, 
                        entity_id: str, user_id: str = None, 
                        changes: Dict[str, Any] = None) -> None:
        """Log audit event"""
        business_logger.logger.info(
            f"Audit event: {event_type}",
            extra={
                "event_type": "audit_event",
                "audit_event_type": event_type,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "user_id": user_id,
                "changes": changes or {}
            }
        )
    
    def _track_changes(self, old_data: Dict[str, Any], 
                      new_data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Track changes between old and new data"""
        changes = {}
        
        all_keys = set(old_data.keys()) | set(new_data.keys())
        
        for key in all_keys:
            old_value = old_data.get(key)
            new_value = new_data.get(key)
            
            if old_value != new_value:
                changes[key] = {
                    "old": old_value,
                    "new": new_value
                }
        
        return changes