"""
Base Repository Implementation
Enterprise repository pattern with caching and performance optimization
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, TypeVar, Generic, Type, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
from functools import wraps
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, text
from sqlalchemy.exc import SQLAlchemyError

from ..exceptions.domain import DomainValidationError, EntityNotFoundError
from ..core.logging import performance_logger

T = TypeVar('T')  # Domain entity type
M = TypeVar('M')  # SQLAlchemy model type


@dataclass
class RepositoryResult(Generic[T]):
    """Standardized repository operation result"""
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def success_result(cls, data: T, metadata: Dict[str, Any] = None) -> 'RepositoryResult[T]':
        """Create successful result"""
        return cls(success=True, data=data, metadata=metadata or {})
    
    @classmethod
    def error_result(cls, error: str, metadata: Dict[str, Any] = None) -> 'RepositoryResult[None]':
        """Create error result"""
        return cls(success=False, error=error, metadata=metadata or {})


@dataclass
class QueryFilter:
    """Query filter specification"""
    field: str
    operator: str  # eq, ne, gt, gte, lt, lte, like, in, between
    value: Any
    
    def apply_to_query(self, query, model_class):
        """Apply filter to SQLAlchemy query"""
        column = getattr(model_class, self.field, None)
        if not column:
            return query
        
        if self.operator == 'eq':
            return query.filter(column == self.value)
        elif self.operator == 'ne':
            return query.filter(column != self.value)
        elif self.operator == 'gt':
            return query.filter(column > self.value)
        elif self.operator == 'gte':
            return query.filter(column >= self.value)
        elif self.operator == 'lt':
            return query.filter(column < self.value)
        elif self.operator == 'lte':
            return query.filter(column <= self.value)
        elif self.operator == 'like':
            return query.filter(column.like(f'%{self.value}%'))
        elif self.operator == 'in':
            return query.filter(column.in_(self.value))
        elif self.operator == 'between':
            return query.filter(column.between(self.value[0], self.value[1]))
        else:
            return query


@dataclass
class QuerySpec:
    """Query specification with filters, sorting, and pagination"""
    filters: List[QueryFilter] = field(default_factory=list)
    sort_field: str = 'id'
    sort_direction: str = 'asc'  # asc, desc
    page: int = 1
    per_page: int = 20
    include_total: bool = True
    
    def __post_init__(self):
        if self.page < 1:
            self.page = 1
        if self.per_page < 1 or self.per_page > 1000:
            self.per_page = 20
        if self.sort_direction not in ['asc', 'desc']:
            self.sort_direction = 'asc'
    
    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page
    
    def add_filter(self, field: str, operator: str, value: Any) -> 'QuerySpec':
        """Add filter to specification"""
        self.filters.append(QueryFilter(field, operator, value))
        return self
    
    def apply_to_query(self, query, model_class):
        """Apply specification to SQLAlchemy query"""
        # Apply filters
        for filter_spec in self.filters:
            query = filter_spec.apply_to_query(query, model_class)
        
        # Apply sorting
        sort_column = getattr(model_class, self.sort_field, None)
        if sort_column:
            if self.sort_direction == 'desc':
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())
        
        return query


@dataclass
class PagedResult(Generic[T]):
    """Paginated query result"""
    items: List[T]
    total: int
    page: int
    per_page: int
    pages: int
    has_prev: bool
    has_next: bool
    
    @classmethod
    def create(cls, items: List[T], total: int, page: int, per_page: int) -> 'PagedResult[T]':
        """Create paged result"""
        pages = (total + per_page - 1) // per_page
        return cls(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            pages=pages,
            has_prev=page > 1,
            has_next=page < pages
        )


def with_performance_monitoring(operation_name: str = None):
    """Decorator for monitoring repository operation performance"""
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            op_name = operation_name or f"{self.__class__.__name__}.{func.__name__}"
            start_time = datetime.utcnow()
            
            try:
                result = func(self, *args, **kwargs)
                duration = (datetime.utcnow() - start_time).total_seconds()
                
                performance_logger.log_operation(
                    operation=op_name,
                    duration=duration,
                    success=True,
                    details={'args_count': len(args), 'kwargs_count': len(kwargs)}
                )
                
                return result
            except Exception as e:
                duration = (datetime.utcnow() - start_time).total_seconds()
                performance_logger.log_operation(
                    operation=op_name,
                    duration=duration,
                    success=False,
                    details={'error': str(e), 'args_count': len(args), 'kwargs_count': len(kwargs)}
                )
                raise
        return wrapper
    return decorator


class BaseRepository(ABC, Generic[T, M]):
    """
    Base repository with common CRUD operations and enterprise patterns
    """
    
    def __init__(self, db: Session, model_class: Type[M], entity_mapper: callable = None):
        self.db = db
        self.model_class = model_class
        self.entity_mapper = entity_mapper or self._default_entity_mapper
        self.logger = logging.getLogger(self.__class__.__name__)
        self._cache = {}
        self._cache_timeout = timedelta(minutes=5)
    
    def _default_entity_mapper(self, model: M) -> T:
        """Default mapper from model to entity (override in subclasses)"""
        return model
    
    def _get_cache_key(self, operation: str, **params) -> str:
        """Generate cache key"""
        param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        return f"{self.__class__.__name__}:{operation}:{param_str}"
    
    def _get_from_cache(self, key: str) -> Optional[Any]:
        """Get from cache if not expired"""
        if key in self._cache:
            data, timestamp = self._cache[key]
            if datetime.utcnow() - timestamp < self._cache_timeout:
                return data
            else:
                del self._cache[key]
        return None
    
    def _set_cache(self, key: str, data: Any) -> None:
        """Set cache with timestamp"""
        self._cache[key] = (data, datetime.utcnow())
        
        # Simple cache cleanup
        if len(self._cache) > 1000:
            # Remove oldest 10% of entries
            oldest_keys = sorted(self._cache.keys(), 
                               key=lambda k: self._cache[k][1])[:100]
            for key in oldest_keys:
                del self._cache[key]
    
    def _invalidate_cache(self, pattern: str = None) -> None:
        """Invalidate cache entries"""
        if pattern:
            keys_to_remove = [k for k in self._cache.keys() if pattern in k]
            for key in keys_to_remove:
                del self._cache[key]
        else:
            self._cache.clear()
    
    @with_performance_monitoring()
    def get_by_id(self, entity_id: int) -> RepositoryResult[T]:
        """Get entity by ID with caching"""
        try:
            cache_key = self._get_cache_key("get_by_id", id=entity_id)
            cached_result = self._get_from_cache(cache_key)
            if cached_result:
                return RepositoryResult.success_result(cached_result, {"from_cache": True})
            
            model = self.db.query(self.model_class).filter(
                self.model_class.id == entity_id
            ).first()
            
            if not model:
                return RepositoryResult.error_result(f"Entity with ID {entity_id} not found")
            
            entity = self.entity_mapper(model)
            self._set_cache(cache_key, entity)
            
            return RepositoryResult.success_result(entity)
            
        except SQLAlchemyError as e:
            self.logger.error(f"Database error in get_by_id: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.logger.error(f"Unexpected error in get_by_id: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    @with_performance_monitoring()
    def get_all(self, spec: QuerySpec = None) -> RepositoryResult[PagedResult[T]]:
        """Get all entities with filtering, sorting, and pagination"""
        try:
            spec = spec or QuerySpec()
            
            cache_key = self._get_cache_key("get_all", **{
                'page': spec.page,
                'per_page': spec.per_page,
                'sort_field': spec.sort_field,
                'sort_direction': spec.sort_direction,
                'filters': len(spec.filters)
            })
            
            cached_result = self._get_from_cache(cache_key)
            if cached_result:
                return RepositoryResult.success_result(cached_result, {"from_cache": True})
            
            query = self.db.query(self.model_class)
            query = spec.apply_to_query(query, self.model_class)
            
            # Get total count if needed
            total = 0
            if spec.include_total:
                total = query.count()
            
            # Apply pagination
            items_query = query.offset(spec.offset).limit(spec.per_page)
            models = items_query.all()
            
            entities = [self.entity_mapper(model) for model in models]
            paged_result = PagedResult.create(entities, total, spec.page, spec.per_page)
            
            self._set_cache(cache_key, paged_result)
            
            return RepositoryResult.success_result(paged_result)
            
        except SQLAlchemyError as e:
            self.logger.error(f"Database error in get_all: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.logger.error(f"Unexpected error in get_all: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    @with_performance_monitoring()
    def create(self, entity_data: Dict[str, Any]) -> RepositoryResult[T]:
        """Create new entity"""
        try:
            model = self.model_class(**entity_data)
            self.db.add(model)
            self.db.flush()  # Get ID without committing
            
            entity = self.entity_mapper(model)
            self._invalidate_cache()  # Clear cache after modification
            
            return RepositoryResult.success_result(entity)
            
        except SQLAlchemyError as e:
            self.db.rollback()
            self.logger.error(f"Database error in create: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Unexpected error in create: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    @with_performance_monitoring()
    def update(self, entity_id: int, update_data: Dict[str, Any]) -> RepositoryResult[T]:
        """Update existing entity"""
        try:
            model = self.db.query(self.model_class).filter(
                self.model_class.id == entity_id
            ).first()
            
            if not model:
                return RepositoryResult.error_result(f"Entity with ID {entity_id} not found")
            
            for key, value in update_data.items():
                if hasattr(model, key):
                    setattr(model, key, value)
            
            self.db.flush()
            
            entity = self.entity_mapper(model)
            self._invalidate_cache()  # Clear cache after modification
            
            return RepositoryResult.success_result(entity)
            
        except SQLAlchemyError as e:
            self.db.rollback()
            self.logger.error(f"Database error in update: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Unexpected error in update: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    @with_performance_monitoring()
    def delete(self, entity_id: int) -> RepositoryResult[bool]:
        """Delete entity by ID"""
        try:
            model = self.db.query(self.model_class).filter(
                self.model_class.id == entity_id
            ).first()
            
            if not model:
                return RepositoryResult.error_result(f"Entity with ID {entity_id} not found")
            
            self.db.delete(model)
            self.db.flush()
            
            self._invalidate_cache()  # Clear cache after modification
            
            return RepositoryResult.success_result(True)
            
        except SQLAlchemyError as e:
            self.db.rollback()
            self.logger.error(f"Database error in delete: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Unexpected error in delete: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    @with_performance_monitoring()
    def bulk_create(self, entities_data: List[Dict[str, Any]]) -> RepositoryResult[List[T]]:
        """Bulk create entities"""
        try:
            models = [self.model_class(**data) for data in entities_data]
            self.db.bulk_save_objects(models, return_defaults=True)
            self.db.flush()
            
            entities = [self.entity_mapper(model) for model in models]
            self._invalidate_cache()
            
            return RepositoryResult.success_result(entities)
            
        except SQLAlchemyError as e:
            self.db.rollback()
            self.logger.error(f"Database error in bulk_create: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Unexpected error in bulk_create: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    @with_performance_monitoring()
    def exists(self, entity_id: int) -> RepositoryResult[bool]:
        """Check if entity exists"""
        try:
            exists = self.db.query(self.model_class).filter(
                self.model_class.id == entity_id
            ).first() is not None
            
            return RepositoryResult.success_result(exists)
            
        except SQLAlchemyError as e:
            self.logger.error(f"Database error in exists: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.logger.error(f"Unexpected error in exists: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    @with_performance_monitoring()
    def count(self, filters: List[QueryFilter] = None) -> RepositoryResult[int]:
        """Count entities with optional filters"""
        try:
            query = self.db.query(func.count(self.model_class.id))
            
            if filters:
                for filter_spec in filters:
                    query = filter_spec.apply_to_query(query, self.model_class)
            
            count = query.scalar()
            return RepositoryResult.success_result(count)
            
        except SQLAlchemyError as e:
            self.logger.error(f"Database error in count: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.logger.error(f"Unexpected error in count: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")
    
    def execute_raw_query(self, query: str, params: Dict[str, Any] = None) -> RepositoryResult[List[Dict]]:
        """Execute raw SQL query (use with caution)"""
        try:
            result = self.db.execute(text(query), params or {})
            rows = [dict(row) for row in result.fetchall()]
            return RepositoryResult.success_result(rows)
            
        except SQLAlchemyError as e:
            self.logger.error(f"Database error in execute_raw_query: {str(e)}")
            return RepositoryResult.error_result(f"Database error: {str(e)}")
        except Exception as e:
            self.logger.error(f"Unexpected error in execute_raw_query: {str(e)}")
            return RepositoryResult.error_result(f"Unexpected error: {str(e)}")


class IRepository(ABC, Generic[T]):
    """Repository interface for dependency injection"""
    
    @abstractmethod
    def get_by_id(self, entity_id: int) -> RepositoryResult[T]:
        """Get entity by ID"""
        pass
    
    @abstractmethod
    def get_all(self, spec: QuerySpec = None) -> RepositoryResult[PagedResult[T]]:
        """Get all entities with specification"""
        pass
    
    @abstractmethod
    def create(self, entity_data: Dict[str, Any]) -> RepositoryResult[T]:
        """Create new entity"""
        pass
    
    @abstractmethod
    def update(self, entity_id: int, update_data: Dict[str, Any]) -> RepositoryResult[T]:
        """Update existing entity"""
        pass
    
    @abstractmethod
    def delete(self, entity_id: int) -> RepositoryResult[bool]:
        """Delete entity"""
        pass