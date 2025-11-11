# Truck_Opti - Professional Modular Architecture Design
## Version 5.0 - Production-Grade Architecture

---

## 🎯 Architecture Vision

**Transform Truck_Opti into a maintainable, scalable, and professional logistics optimization platform using Clean Architecture principles with Domain-Driven Design.**

---

## 📐 Architecture Layers

### Layer 1: Domain Layer (Core Business Logic)
**Location**: `/app/domain/`
**Responsibility**: Pure business logic, framework-independent
**Dependencies**: None (zero external dependencies)

```
domain/
├── entities/           # Rich domain objects with business behavior
│   ├── __init__.py
│   ├── truck.py       # Truck entity with capacity calculations
│   ├── carton.py      # Carton entity with packing rules
│   ├── shipment.py    # Shipment entity with logistics logic
│   ├── packing_job.py # Packing job orchestration
│   └── customer.py    # Customer entity
├── value_objects/     # Immutable value types
│   ├── __init__.py
│   ├── dimensions.py  # 3D dimensions (length, width, height)
│   ├── weight.py      # Weight with units
│   ├── volume.py      # Volume calculations
│   ├── money.py       # Currency handling
│   ├── position.py    # 3D coordinates
│   ├── address.py     # Address value object
│   └── date_range.py  # Date range handling
├── services/          # Domain services (business operations)
│   ├── __init__.py
│   ├── packing_service.py          # Core packing logic
│   ├── cost_calculation_service.py # Cost algorithms
│   ├── route_optimization_service.py # Route planning
│   └── recommendation_service.py   # Smart recommendations
├── repositories/      # Repository interfaces (contracts only)
│   ├── __init__.py
│   ├── truck_repository.py
│   ├── carton_repository.py
│   ├── shipment_repository.py
│   └── analytics_repository.py
├── events/           # Domain events
│   ├── __init__.py
│   ├── shipment_events.py
│   ├── packing_events.py
│   └── optimization_events.py
└── exceptions/       # Business rule violations
    ├── __init__.py
    ├── domain_exceptions.py
    └── validation_exceptions.py
```

**Key Principles**:
- No Flask imports
- No SQLAlchemy imports
- Pure Python business logic
- Testable without infrastructure

---

### Layer 2: Application Layer (Use Cases)
**Location**: `/app/application/`
**Responsibility**: Application workflows and orchestration
**Dependencies**: Domain layer only

```
application/
├── use_cases/        # Application use cases
│   ├── __init__.py
│   ├── truck/
│   │   ├── create_truck.py
│   │   ├── update_truck.py
│   │   ├── delete_truck.py
│   │   └── list_trucks.py
│   ├── carton/
│   │   ├── create_carton.py
│   │   ├── bulk_upload_cartons.py
│   │   └── list_cartons.py
│   ├── optimization/
│   │   ├── recommend_trucks.py
│   │   ├── pack_shipment.py
│   │   ├── optimize_fleet.py
│   │   └── run_packing_job.py
│   ├── shipment/
│   │   ├── create_shipment.py
│   │   ├── process_sale_order.py
│   │   └── track_shipment.py
│   └── analytics/
│       ├── generate_dashboard.py
│       ├── calculate_utilization.py
│       └── cost_analysis.py
├── services/         # Application services
│   ├── __init__.py
│   ├── notification_service.py
│   ├── export_service.py
│   ├── import_service.py
│   └── report_service.py
├── dto/             # Data Transfer Objects
│   ├── __init__.py
│   ├── truck_dto.py
│   ├── carton_dto.py
│   ├── optimization_dto.py
│   └── response_dto.py
└── interfaces/      # Port definitions
    ├── __init__.py
    ├── cache_interface.py
    ├── queue_interface.py
    └── notification_interface.py
```

**Key Principles**:
- Single Responsibility per use case
- Clear input/output contracts (DTOs)
- Orchestrates domain services
- Coordinates transactions

---

### Layer 3: Infrastructure Layer (Technical Implementation)
**Location**: `/app/infrastructure/`
**Responsibility**: External integrations, database, caching, etc.
**Dependencies**: Application layer, external frameworks

```
infrastructure/
├── database/
│   ├── __init__.py
│   ├── models.py               # SQLAlchemy models
│   ├── session.py              # Database session management
│   ├── migrations/             # Alembic migrations
│   └── repositories/           # Repository implementations
│       ├── __init__.py
│       ├── truck_repository_impl.py
│       ├── carton_repository_impl.py
│       ├── shipment_repository_impl.py
│       └── analytics_repository_impl.py
├── algorithms/                 # Packing algorithms
│   ├── __init__.py
│   ├── base_algorithm.py       # Abstract base
│   ├── laff_algorithm.py       # Largest Area Fit First
│   ├── skyline_algorithm.py    # Skyline Bottom-Left
│   ├── advanced_3d_packer.py   # Advanced 3D packing
│   └── ml_optimizer.py         # ML-based optimization
├── cache/
│   ├── __init__.py
│   ├── redis_cache.py          # Redis implementation
│   └── memory_cache.py         # In-memory fallback
├── queue/
│   ├── __init__.py
│   ├── celery_queue.py         # Celery task queue
│   └── sync_queue.py           # Synchronous fallback
├── file_storage/
│   ├── __init__.py
│   ├── local_storage.py        # Local file system
│   └── s3_storage.py           # AWS S3 storage
├── external_services/
│   ├── __init__.py
│   ├── maps_service.py         # Google Maps integration
│   └── weather_service.py      # Weather API
└── monitoring/
    ├── __init__.py
    ├── prometheus.py           # Metrics collection
    ├── sentry.py               # Error tracking
    └── logger.py               # Logging configuration
```

**Key Principles**:
- Implements interfaces from application layer
- Contains all framework-specific code
- Database models separate from domain entities
- Interchangeable implementations

---

### Layer 4: Interface Layer (API & UI)
**Location**: `/app/interfaces/`
**Responsibility**: HTTP handling, request/response, UI rendering
**Dependencies**: Application layer

```
interfaces/
├── api/              # REST API
│   ├── v1/
│   │   ├── __init__.py
│   │   ├── trucks.py
│   │   ├── cartons.py
│   │   ├── optimization.py
│   │   ├── shipments.py
│   │   ├── analytics.py
│   │   └── auth.py
│   └── schemas/      # Request/Response schemas
│       ├── __init__.py
│       ├── truck_schemas.py
│       ├── carton_schemas.py
│       └── optimization_schemas.py
├── web/              # Web UI (if separate from API)
│   ├── __init__.py
│   ├── controllers/
│   │   ├── dashboard_controller.py
│   │   ├── truck_controller.py
│   │   └── optimization_controller.py
│   ├── templates/    # Jinja2 templates
│   └── static/       # CSS, JS, images
├── cli/              # Command-line interface
│   ├── __init__.py
│   ├── commands.py
│   └── benchmark.py
└── websocket/        # Real-time communication
    ├── __init__.py
    └── handlers.py
```

**Key Principles**:
- Thin layer, delegates to use cases
- Input validation and sanitization
- Request/response transformation
- Framework-specific (Flask, Click, etc.)

---

### Layer 5: Cross-Cutting Concerns
**Location**: `/app/core/`
**Responsibility**: Shared utilities and middleware
**Dependencies**: Minimal

```
core/
├── middleware/
│   ├── __init__.py
│   ├── authentication.py       # JWT authentication
│   ├── authorization.py        # Role-based access
│   ├── validation.py           # Request validation
│   ├── rate_limiting.py        # API rate limiting
│   ├── error_handling.py       # Global error handler
│   ├── logging_middleware.py   # Request/response logging
│   └── cors.py                 # CORS configuration
├── security/
│   ├── __init__.py
│   ├── password.py             # Password hashing
│   ├── token.py                # JWT token management
│   └── encryption.py           # Data encryption
├── validation/
│   ├── __init__.py
│   ├── validators.py           # Reusable validators
│   └── sanitizers.py           # Input sanitization
├── utils/
│   ├── __init__.py
│   ├── datetime_utils.py
│   ├── file_utils.py
│   ├── math_utils.py
│   └── string_utils.py
├── config/
│   ├── __init__.py
│   ├── settings.py             # Configuration classes
│   └── environment.py          # Environment detection
├── di/               # Dependency Injection
│   ├── __init__.py
│   ├── container.py            # DI container
│   └── providers.py            # Service providers
└── constants/
    ├── __init__.py
    ├── status_codes.py
    ├── error_codes.py
    └── defaults.py
```

---

## 🔄 Dependency Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Interface Layer                          │
│            (API, Web UI, CLI, WebSocket)                     │
│                Flask Routes & Controllers                     │
└────────────────────────┬────────────────────────────────────┘
                         │ depends on
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│           (Use Cases, Application Services)                  │
│              Orchestrates Business Logic                     │
└────────────────────────┬────────────────────────────────────┘
                         │ depends on
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Domain Layer                             │
│    (Entities, Value Objects, Domain Services, Interfaces)   │
│                 Pure Business Logic                          │
└─────────────────────────────────────────────────────────────┘
                         ▲
                         │ implements
                         │
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                        │
│    (Database, Algorithms, Cache, Queue, External APIs)      │
│               Technical Implementation                        │
└─────────────────────────────────────────────────────────────┘

Cross-Cutting Concerns (Core) used by all layers
```

**Rules**:
1. **Domain Layer**: No dependencies on other layers
2. **Application Layer**: Depends only on Domain
3. **Infrastructure Layer**: Implements Domain interfaces
4. **Interface Layer**: Depends on Application layer
5. **Dependency Inversion**: High-level modules don't depend on low-level modules

---

## 🎨 Design Patterns

### 1. Repository Pattern
**Purpose**: Abstract data access
**Location**: Domain interfaces, Infrastructure implementations

```python
# Domain interface
class TruckRepository(ABC):
    @abstractmethod
    def get_by_id(self, truck_id: int) -> Optional[Truck]:
        pass

    @abstractmethod
    def save(self, truck: Truck) -> Truck:
        pass

# Infrastructure implementation
class SQLAlchemyTruckRepository(TruckRepository):
    def get_by_id(self, truck_id: int) -> Optional[Truck]:
        # SQLAlchemy implementation
        pass
```

### 2. Factory Pattern
**Purpose**: Create complex objects
**Location**: Infrastructure/algorithms

```python
class PackingAlgorithmFactory:
    @staticmethod
    def create(algorithm_type: str) -> PackingAlgorithm:
        if algorithm_type == "LAFF":
            return LAFFAlgorithm()
        elif algorithm_type == "SKYLINE":
            return SkylineAlgorithm()
        # ...
```

### 3. Strategy Pattern
**Purpose**: Interchangeable algorithms
**Location**: Infrastructure/algorithms

```python
class PackingStrategy(ABC):
    @abstractmethod
    def pack(self, truck: Truck, cartons: List[Carton]) -> PackingResult:
        pass

class LAFFStrategy(PackingStrategy):
    def pack(self, truck: Truck, cartons: List[Carton]) -> PackingResult:
        # LAFF implementation
        pass
```

### 4. Dependency Injection
**Purpose**: Loose coupling
**Location**: Core/di

```python
# Container configuration
container.register(TruckRepository, SQLAlchemyTruckRepository)
container.register(CacheService, RedisCache)

# Usage in use case
class CreateTruckUseCase:
    def __init__(self, truck_repo: TruckRepository):
        self.truck_repo = truck_repo
```

### 5. Command Pattern
**Purpose**: Encapsulate requests
**Location**: Application/use_cases

```python
class CreateTruckCommand:
    def __init__(self, name: str, dimensions: Dimensions, capacity: Weight):
        self.name = name
        self.dimensions = dimensions
        self.capacity = capacity

class CreateTruckUseCase:
    def execute(self, command: CreateTruckCommand) -> TruckDTO:
        # Execute command
        pass
```

### 6. Observer Pattern
**Purpose**: Event-driven architecture
**Location**: Domain/events

```python
class ShipmentCreatedEvent:
    def __init__(self, shipment_id: int):
        self.shipment_id = shipment_id

# Event handlers
event_bus.subscribe(ShipmentCreatedEvent, NotificationHandler)
event_bus.subscribe(ShipmentCreatedEvent, AnalyticsHandler)
```

---

## 📦 Module Organization

### Module Structure
Each module follows consistent structure:

```
module_name/
├── __init__.py          # Public API
├── entities.py          # Domain entities
├── value_objects.py     # Value objects
├── services.py          # Domain services
├── repository.py        # Repository interface
├── use_cases.py         # Application use cases
├── dto.py              # Data Transfer Objects
├── schemas.py          # API schemas
├── exceptions.py        # Module-specific exceptions
└── tests/              # Module tests
    ├── test_entities.py
    ├── test_services.py
    └── test_use_cases.py
```

### Core Modules

#### 1. Truck Module
```
modules/truck/
├── domain/
│   ├── truck.py                # Truck entity
│   ├── truck_capacity.py       # Capacity value object
│   └── truck_service.py        # Domain service
├── application/
│   ├── create_truck.py
│   ├── update_truck.py
│   └── list_trucks.py
├── infrastructure/
│   └── truck_repository_impl.py
└── interfaces/
    └── truck_api.py
```

#### 2. Carton Module
```
modules/carton/
├── domain/
│   ├── carton.py
│   ├── packing_properties.py
│   └── carton_service.py
├── application/
│   ├── create_carton.py
│   └── bulk_upload.py
└── infrastructure/
    └── carton_repository_impl.py
```

#### 3. Optimization Module
```
modules/optimization/
├── domain/
│   ├── packing_job.py
│   ├── packing_result.py
│   └── optimization_service.py
├── application/
│   ├── recommend_trucks.py
│   ├── pack_shipment.py
│   └── optimize_fleet.py
└── infrastructure/
    ├── algorithms/
    │   ├── laff_algorithm.py
    │   └── skyline_algorithm.py
    └── packing_job_repository_impl.py
```

---

## 🔧 Configuration Management

### Unified Configuration System

```python
# /app/core/config/settings.py

from pydantic import BaseSettings
from typing import Optional

class DatabaseSettings(BaseSettings):
    url: str
    pool_size: int = 5
    echo: bool = False

    class Config:
        env_prefix = "DB_"

class RedisSettings(BaseSettings):
    host: str = "localhost"
    port: int = 6379
    db: int = 0

    class Config:
        env_prefix = "REDIS_"

class AppSettings(BaseSettings):
    name: str = "Truck_Opti"
    version: str = "5.0.0"
    debug: bool = False
    secret_key: str

    database: DatabaseSettings
    redis: RedisSettings

    class Config:
        env_file = ".env"

# Usage
settings = AppSettings()
```

---

## 🧪 Testing Strategy

### Test Organization

```
tests/
├── unit/                       # Fast, isolated tests
│   ├── domain/
│   │   ├── test_truck_entity.py
│   │   ├── test_dimensions.py
│   │   └── test_packing_service.py
│   ├── application/
│   │   └── test_create_truck_use_case.py
│   └── infrastructure/
│       └── test_laff_algorithm.py
├── integration/                # Tests with database
│   ├── test_truck_repository.py
│   ├── test_optimization_api.py
│   └── test_cache_integration.py
├── e2e/                        # End-to-end tests
│   ├── test_truck_management_flow.py
│   ├── test_optimization_flow.py
│   └── test_shipment_processing.py
├── performance/                # Performance tests
│   ├── test_algorithm_performance.py
│   └── test_api_performance.py
└── conftest.py                 # Shared fixtures
```

### Test Principles
1. **Unit tests**: 80% coverage minimum
2. **Integration tests**: Critical paths
3. **E2E tests**: User journeys
4. **Performance tests**: Algorithm benchmarks
5. **Test isolation**: Independent, repeatable
6. **Fast feedback**: Unit tests < 1s total

---

## 🚀 Migration Strategy

### Phase 1: Foundation (Week 1)
1. ✅ Create new directory structure
2. ✅ Set up dependency injection container
3. ✅ Implement configuration management
4. ✅ Create base classes and interfaces

### Phase 2: Domain Layer (Week 2)
1. ✅ Extract domain entities from models.py
2. ✅ Create value objects
3. ✅ Implement domain services
4. ✅ Define repository interfaces
5. ✅ Add domain exceptions

### Phase 3: Application Layer (Week 3)
1. ✅ Create use cases for core operations
2. ✅ Define DTOs
3. ✅ Implement application services
4. ✅ Add event system

### Phase 4: Infrastructure Layer (Week 3-4)
1. ✅ Implement repository classes
2. ✅ Extract algorithms to infrastructure
3. ✅ Set up caching
4. ✅ Configure queue system
5. ✅ Implement file storage

### Phase 5: Interface Layer (Week 4)
1. ✅ Refactor API endpoints
2. ✅ Update controllers
3. ✅ Add input validation
4. ✅ Implement authentication
5. ✅ Add API documentation

### Phase 6: Testing & Quality (Week 5)
1. ✅ Write unit tests
2. ✅ Add integration tests
3. ✅ Create E2E tests
4. ✅ Performance testing
5. ✅ Security audit

### Phase 7: Consolidation (Week 5-6)
1. ✅ Merge TruckOptimum functionality
2. ✅ Integrate Microsoft optimizations
3. ✅ Remove duplicate code
4. ✅ Update documentation

### Phase 8: Production (Week 6)
1. ✅ Build executables
2. ✅ Deploy to staging
3. ✅ Load testing
4. ✅ Production deployment
5. ✅ Monitoring setup

---

## 📊 Quality Metrics

### Code Quality
- **Type Coverage**: 100%
- **Unit Test Coverage**: >80%
- **Integration Test Coverage**: >70%
- **Cyclomatic Complexity**: <10 per function
- **Function Length**: <50 lines
- **Class Length**: <300 lines
- **File Length**: <500 lines

### Performance
- **API Response Time**: <200ms (p95)
- **Database Query Time**: <50ms (p95)
- **Packing Algorithm**: <5s for 1000 cartons
- **Memory Usage**: <512MB base

### Maintainability
- **Code Duplication**: <3%
- **Dependency Depth**: <4 levels
- **Module Coupling**: Low
- **Module Cohesion**: High

---

## 🔒 Security

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- API key authentication for services

### Data Protection
- Password hashing (bcrypt)
- Sensitive data encryption at rest
- HTTPS only in production
- CORS configuration

### Input Validation
- Schema validation (marshmallow/pydantic)
- SQL injection prevention (ORM)
- XSS prevention (template escaping)
- CSRF protection

---

## 📚 Documentation

### Code Documentation
- Docstrings for all public APIs
- Type hints everywhere
- README per module
- Architecture Decision Records (ADRs)

### API Documentation
- OpenAPI/Swagger specification
- Interactive API explorer
- Code examples
- Postman collection

### User Documentation
- Installation guide
- User manual
- API reference
- Troubleshooting guide

---

## 🎯 Success Criteria

### Technical
- ✅ All circular dependencies resolved
- ✅ 100% type hints coverage
- ✅ >80% test coverage
- ✅ All tests passing
- ✅ No code duplication
- ✅ Clear module boundaries
- ✅ API documentation complete

### Business
- ✅ Feature parity maintained
- ✅ Performance improved
- ✅ Bugs reduced by 90%
- ✅ Development velocity increased
- ✅ Onboarding time reduced

### Operational
- ✅ Automated deployments
- ✅ Monitoring in place
- ✅ Error tracking active
- ✅ Documentation complete
- ✅ Team trained

---

## 🏗️ Technology Decisions

### Core Stack
- **Language**: Python 3.11+
- **Web Framework**: Flask 3.0+
- **ORM**: SQLAlchemy 2.0+
- **Database**: PostgreSQL 16 (prod), SQLite (dev)
- **Cache**: Redis 7+
- **Queue**: Celery 5.3+
- **API Docs**: Flask-RESTX / Swagger

### Code Quality
- **Linting**: flake8, pylint
- **Formatting**: black
- **Type Checking**: mypy
- **Testing**: pytest
- **Coverage**: pytest-cov

### Production
- **Server**: Gunicorn + Gevent
- **Proxy**: Nginx
- **Container**: Docker
- **Monitoring**: Prometheus + Grafana
- **Errors**: Sentry
- **Logs**: ELK stack or similar

---

## 🎓 Best Practices

### Coding Standards
1. Follow PEP 8
2. Type hints mandatory
3. Docstrings for public APIs
4. Max line length: 120
5. Use descriptive names
6. Single Responsibility Principle
7. Don't Repeat Yourself (DRY)
8. Keep It Simple, Stupid (KISS)

### Git Workflow
1. Feature branches
2. Descriptive commit messages
3. Pull request reviews
4. Squash commits
5. Linear history

### Code Review Checklist
- [ ] Tests added/updated
- [ ] Type hints present
- [ ] Documentation updated
- [ ] No code duplication
- [ ] Performance considered
- [ ] Security reviewed
- [ ] Error handling adequate

---

## 📖 References

### Clean Architecture
- Robert C. Martin - Clean Architecture
- Hexagonal Architecture (Ports & Adapters)
- Domain-Driven Design (DDD)

### Python Best Practices
- PEP 8 - Style Guide
- PEP 484 - Type Hints
- Effective Python by Brett Slatkin
- Architecture Patterns with Python

---

**Document Version**: 5.0
**Last Updated**: 2025-11-11
**Status**: Active Development
**Owner**: Development Team
