"""
Dependency Injection Container
Enterprise IoC container for clean architecture dependency management
"""

from typing import Dict, Any, TypeVar, Type, Optional, Callable
from dataclasses import dataclass, field
import logging
from functools import lru_cache
from threading import Lock

from ..repositories import (
    ITruckRepository, TruckRepository,
    ICartonRepository, CartonRepository, 
    IPackingJobRepository, PackingJobRepository,
    IShipmentRepository, ShipmentRepository,
    IAnalyticsRepository, AnalyticsRepository
)
from ..application.services import TruckOptimizationService
from ..domain.services import PackingDomainService, CostCalculationService
from ..core.logging import get_logger

T = TypeVar('T')


@dataclass
class ServiceRegistration:
    """Service registration information"""
    service_type: Type
    implementation_type: Type
    singleton: bool = True
    factory: Optional[Callable] = None
    dependencies: list = field(default_factory=list)


class ServiceLifetime:
    """Service lifetime constants"""
    SINGLETON = "singleton"
    TRANSIENT = "transient"
    SCOPED = "scoped"


class DIContainer:
    """
    Dependency Injection Container with automatic dependency resolution
    """
    
    def __init__(self):
        self._services: Dict[Type, ServiceRegistration] = {}
        self._instances: Dict[Type, Any] = {}
        self._lock = Lock()
        self.logger = get_logger(self.__class__.__name__)
        
        # Register core services
        self._register_core_services()
    
    def register_singleton(self, service_type: Type[T], implementation_type: Type[T] = None,
                          factory: Callable = None) -> 'DIContainer':
        """Register singleton service"""
        return self._register(service_type, implementation_type, True, factory)
    
    def register_transient(self, service_type: Type[T], implementation_type: Type[T] = None,
                          factory: Callable = None) -> 'DIContainer':
        """Register transient service"""
        return self._register(service_type, implementation_type, False, factory)
    
    def register_scoped(self, service_type: Type[T], implementation_type: Type[T] = None,
                       factory: Callable = None) -> 'DIContainer':
        """Register scoped service (same as singleton for now)"""
        return self._register(service_type, implementation_type, True, factory)
    
    def _register(self, service_type: Type[T], implementation_type: Type[T] = None,
                  singleton: bool = True, factory: Callable = None) -> 'DIContainer':
        """Internal registration method"""
        impl_type = implementation_type or service_type
        
        self._services[service_type] = ServiceRegistration(
            service_type=service_type,
            implementation_type=impl_type,
            singleton=singleton,
            factory=factory
        )
        
        self.logger.debug(f"Registered {service_type.__name__} -> {impl_type.__name__} "
                         f"(singleton: {singleton})")
        return self
    
    def get(self, service_type: Type[T]) -> T:
        """Get service instance with dependency injection"""
        with self._lock:
            return self._get_service(service_type)
    
    def _get_service(self, service_type: Type[T]) -> T:
        """Internal get service with dependency resolution"""
        # Check if already instantiated (singleton)
        if service_type in self._instances:
            return self._instances[service_type]
        
        # Get registration
        registration = self._services.get(service_type)
        if not registration:
            raise ValueError(f"Service {service_type.__name__} is not registered")
        
        # Create instance
        instance = self._create_instance(registration)
        
        # Store if singleton
        if registration.singleton:
            self._instances[service_type] = instance
        
        return instance
    
    def _create_instance(self, registration: ServiceRegistration) -> Any:
        """Create service instance with dependency injection"""
        try:
            # Use factory if provided
            if registration.factory:
                return registration.factory(self)
            
            # Get constructor parameters
            impl_type = registration.implementation_type
            init_method = getattr(impl_type, '__init__', None)
            
            if not init_method:
                return impl_type()
            
            # Get type hints for dependency injection
            import inspect
            signature = inspect.signature(init_method)
            dependencies = {}
            
            for param_name, param in signature.parameters.items():
                if param_name == 'self':
                    continue
                
                # Skip parameters with default values for now
                if param.default != inspect.Parameter.empty:
                    continue
                
                param_type = param.annotation
                if param_type != inspect.Parameter.empty:
                    try:
                        dependencies[param_name] = self._get_service(param_type)
                    except ValueError:
                        # If dependency not found, try to auto-register if it's a concrete class
                        if hasattr(param_type, '__init__'):
                            self.register_transient(param_type)
                            dependencies[param_name] = self._get_service(param_type)
                        else:
                            self.logger.warning(f"Could not resolve dependency {param_type} for {impl_type.__name__}")
            
            return impl_type(**dependencies)
            
        except Exception as e:
            self.logger.error(f"Error creating instance of {registration.implementation_type.__name__}: {str(e)}")
            raise
    
    def _register_core_services(self):
        """Register core application services"""
        try:
            from .. import db
            from ..domain.services import PackingDomainService, CostCalculationService
            
            # Register repositories with factory methods
            self.register_singleton(
                ITruckRepository,
                TruckRepository,
                factory=lambda container: TruckRepository(db.session)
            )
            
            self.register_singleton(
                ICartonRepository, 
                CartonRepository,
                factory=lambda container: CartonRepository(db.session)
            )
            
            self.register_singleton(
                IPackingJobRepository,
                PackingJobRepository, 
                factory=lambda container: PackingJobRepository(db.session)
            )
            
            self.register_singleton(
                IShipmentRepository,
                ShipmentRepository,
                factory=lambda container: ShipmentRepository(db.session)
            )
            
            self.register_singleton(
                IAnalyticsRepository,
                AnalyticsRepository,
                factory=lambda container: AnalyticsRepository(db.session)
            )
            
            # Register domain services
            self.register_singleton(PackingDomainService)
            self.register_singleton(CostCalculationService)
            
            # Register application services
            self.register_singleton(
                TruckOptimizationService,
                factory=lambda container: TruckOptimizationService(
                    truck_repository=container.get(ITruckRepository),
                    carton_repository=container.get(ICartonRepository),
                    packing_job_repository=container.get(IPackingJobRepository),
                    packing_domain_service=container.get(PackingDomainService),
                    cost_calculation_service=container.get(CostCalculationService),
                    db=db
                )
            )
            
        except ImportError as e:
            self.logger.warning(f"Some services could not be registered: {e}")
        except Exception as e:
            self.logger.error(f"Error registering core services: {e}")
    
    def register_configuration(self, config: Dict[str, Any]):
        """Register configuration objects"""
        for key, value in config.items():
            self.register_singleton(type(value), factory=lambda _: value)
    
    def health_check(self) -> Dict[str, Any]:
        """Perform health check on registered services"""
        health_status = {
            'status': 'healthy',
            'services': {},
            'errors': []
        }
        
        for service_type, registration in self._services.items():
            try:
                # Try to instantiate the service
                if not registration.singleton or service_type not in self._instances:
                    self._get_service(service_type)
                
                health_status['services'][service_type.__name__] = 'healthy'
                
            except Exception as e:
                health_status['services'][service_type.__name__] = 'unhealthy'
                health_status['errors'].append(f"{service_type.__name__}: {str(e)}")
                health_status['status'] = 'unhealthy'
        
        return health_status
    
    def get_service_info(self) -> Dict[str, Any]:
        """Get information about registered services"""
        info = {
            'total_services': len(self._services),
            'instantiated_singletons': len(self._instances),
            'services': []
        }
        
        for service_type, registration in self._services.items():
            info['services'].append({
                'service_type': service_type.__name__,
                'implementation_type': registration.implementation_type.__name__,
                'singleton': registration.singleton,
                'instantiated': service_type in self._instances,
                'has_factory': registration.factory is not None
            })
        
        return info
    
    def clear(self):
        """Clear all services and instances"""
        with self._lock:
            self._services.clear()
            self._instances.clear()
            self.logger.info("Container cleared")
    
    def dispose(self):
        """Dispose container and cleanup resources"""
        with self._lock:
            # Call dispose on disposable services
            for instance in self._instances.values():
                if hasattr(instance, 'dispose'):
                    try:
                        instance.dispose()
                    except Exception as e:
                        self.logger.error(f"Error disposing {type(instance).__name__}: {str(e)}")
            
            self.clear()
            self.logger.info("Container disposed")


# Global container instance
_container: Optional[DIContainer] = None
_container_lock = Lock()


def get_container() -> DIContainer:
    """Get global container instance (singleton)"""
    global _container
    
    if _container is None:
        with _container_lock:
            if _container is None:
                _container = DIContainer()
    
    return _container


def configure_container(config: Dict[str, Any] = None) -> DIContainer:
    """Configure the global container"""
    container = get_container()
    
    if config:
        container.register_configuration(config)
    
    return container


def resolve(service_type: Type[T]) -> T:
    """Resolve service from global container"""
    return get_container().get(service_type)


@lru_cache(maxsize=None)
def get_service(service_type: Type[T]) -> T:
    """Cached service resolution for frequently used services"""
    return resolve(service_type)


class ServiceLocator:
    """
    Service Locator pattern as alternative to dependency injection
    """
    
    _container = None
    
    @classmethod
    def set_container(cls, container: DIContainer):
        """Set the container for service location"""
        cls._container = container
    
    @classmethod
    def get_service(cls, service_type: Type[T]) -> T:
        """Get service from container"""
        if cls._container is None:
            cls._container = get_container()
        return cls._container.get(service_type)


# Decorator for automatic dependency injection
def inject(*dependencies):
    """
    Decorator for automatic dependency injection
    
    Example:
    @inject(ITruckRepository, ICartonRepository)
    def my_function(truck_repo, carton_repo, other_param):
        pass
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            container = get_container()
            injected_deps = [container.get(dep) for dep in dependencies]
            return func(*(injected_deps + list(args)), **kwargs)
        return wrapper
    return decorator


# Context manager for scoped services
class ServiceScope:
    """
    Context manager for scoped service lifetime
    """
    
    def __init__(self, container: DIContainer = None):
        self.container = container or get_container()
        self.scoped_instances = {}
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Dispose scoped instances
        for instance in self.scoped_instances.values():
            if hasattr(instance, 'dispose'):
                try:
                    instance.dispose()
                except Exception as e:
                    logging.error(f"Error disposing scoped service: {str(e)}")
    
    def get_service(self, service_type: Type[T]) -> T:
        """Get service within scope"""
        if service_type in self.scoped_instances:
            return self.scoped_instances[service_type]
        
        instance = self.container.get(service_type)
        self.scoped_instances[service_type] = instance
        return instance