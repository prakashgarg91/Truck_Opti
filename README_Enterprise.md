# TruckOpti Enterprise - Advanced Truck Loading Optimization System

[![Version](https://img.shields.io/badge/version-2.0.0--enterprise-blue)](https://github.com/truckopti/enterprise)
[![License](https://img.shields.io/badge/license-Enterprise-green)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9+-brightgreen)](https://python.org)
[![Status](https://img.shields.io/badge/status-production--ready-success)](https://github.com/truckopti/enterprise)

## 🚀 Enterprise Overview

TruckOpti Enterprise is a production-ready, scalable truck loading optimization platform designed for enterprise logistics operations. Built with enterprise-grade architecture patterns, comprehensive security, monitoring, and robust error handling.

### 🏆 Enterprise Features

- **🏗️ Enterprise Architecture**: Clean architecture with DDD patterns, service layers, and repository patterns
- **🔐 Advanced Security**: Multi-layer security with authentication, authorization, rate limiting, and CSRF protection  
- **📊 Real-time Analytics**: Comprehensive analytics dashboard with performance metrics and business intelligence
- **⚡ High Performance**: Optimized algorithms with caching, connection pooling, and async operations
- **🔍 Monitoring & Observability**: Structured logging, metrics collection, health checks, and distributed tracing
- **🧪 Enterprise Testing**: Comprehensive test suite with unit, integration, and E2E tests
- **📦 Production Deployment**: Docker containers, Kubernetes support, CI/CD pipelines
- **🛡️ Compliance Ready**: Audit trails, data governance, and regulatory compliance features

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [🏗️ Architecture](#️-architecture)
- [⚙️ Configuration](#️-configuration)
- [🔧 Development](#-development)
- [🧪 Testing](#-testing)
- [🚀 Deployment](#-deployment)
- [📊 Monitoring](#-monitoring)
- [🔐 Security](#-security)
- [📚 API Documentation](#-api-documentation)
- [🤝 Contributing](#-contributing)

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 16+
- Redis (optional, for caching)
- PostgreSQL (optional, for production)

### Installation

```bash
# Clone repository
git clone https://github.com/truckopti/enterprise.git
cd truckopti-enterprise

# Install dependencies
pip install -r requirements-enterprise.txt
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Initialize database
python -c "from app import create_app, db; app = create_app(); app.app_context().push(); db.create_all()"

# Run application
python run.py
```

### Using Pre-built Executable

```bash
# Download latest release
wget https://github.com/truckopti/enterprise/releases/latest/TruckOpti_Enterprise.exe

# Run directly
./TruckOpti_Enterprise.exe
```

### Docker Deployment

```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.enterprise.yml up -d
```

## 🏗️ Architecture

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│   Web Servers   │────│   App Servers   │
│     (Nginx)     │    │     (Nginx)     │    │    (Gunicorn)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Cache       │────│    Database     │────│  Message Queue  │
│    (Redis)      │    │  (PostgreSQL)   │    │    (Celery)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                    ┌─────────────────┐
                    │   Monitoring    │
                    │ (Prometheus +   │
                    │    Grafana)     │
                    └─────────────────┘
```

### Application Layers

```
┌──────────────────────────────────────┐
│              Web Layer               │
│         (Flask Routes + API)         │
├──────────────────────────────────────┤
│            Service Layer             │
│      (Business Logic Services)      │
├──────────────────────────────────────┤
│           Repository Layer           │
│        (Data Access Objects)        │
├──────────────────────────────────────┤
│             Domain Layer             │
│         (Models + Entities)          │
├──────────────────────────────────────┤
│         Infrastructure Layer         │
│    (Database, Cache, External)      │
└──────────────────────────────────────┘
```

### Core Components

- **🎯 Packing Engine**: Advanced 3D bin packing algorithms with ML optimization
- **📊 Analytics Engine**: Real-time metrics and business intelligence
- **🔐 Security Framework**: Multi-layer security with enterprise features
- **⚡ Performance Framework**: Caching, connection pooling, async processing
- **📈 Monitoring Stack**: Metrics, logging, tracing, health checks
- **🔧 Configuration Management**: Environment-based config with validation

## ⚙️ Configuration

### Environment Variables

```bash
# Core Configuration
ENVIRONMENT=production              # development, testing, production
SECRET_KEY=your-secret-key         # Required in production
DATABASE_URL=postgresql://...      # Database connection string

# Security Settings
JWT_SECRET=jwt-secret-key          # JWT signing key
PASSWORD_HASH_ROUNDS=12            # Bcrypt rounds
MAX_LOGIN_ATTEMPTS=5               # Rate limiting
RATE_LIMIT=100/hour               # API rate limiting

# Performance Settings
REDIS_HOST=localhost               # Cache server
DB_POOL_SIZE=20                   # Connection pool size
ENABLE_REQUEST_CACHING=true       # Request caching

# Monitoring Settings
MONITORING_ENABLED=true            # Enable metrics
SENTRY_DSN=https://...            # Error tracking
LOG_LEVEL=INFO                    # Logging level
```

### Configuration Management

The enterprise system uses a hierarchical configuration system:

1. **Default Settings**: Built-in defaults for all environments
2. **Environment Files**: `.env.development`, `.env.production`
3. **Environment Variables**: Override any setting via env vars
4. **Runtime Configuration**: Dynamic config updates (where safe)

## 🔧 Development

### Development Setup

```bash
# Install development dependencies
pip install -r requirements-dev.txt
npm install

# Setup pre-commit hooks
pre-commit install

# Run in development mode
export ENVIRONMENT=development
python run.py
```

### Code Quality Tools

```bash
# Linting and formatting
black app/ --line-length=120
flake8 app/ --max-line-length=120
isort app/
mypy app/

# Security scanning
bandit -r app/
safety check

# Run all quality checks
make quality
```

### Database Migrations

```bash
# Create migration
alembic revision --autogenerate -m "Description"

# Apply migration
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

## 🧪 Testing

### Test Categories

- **Unit Tests**: Fast, isolated component tests
- **Integration Tests**: Service and database integration  
- **End-to-End Tests**: Full workflow testing with browser automation
- **Performance Tests**: Load testing and benchmarking
- **Security Tests**: Security vulnerability scanning

### Running Tests

```bash
# All tests
pytest

# Specific test categories
pytest -m unit                    # Unit tests only
pytest -m integration            # Integration tests
pytest -m "not slow"             # Exclude slow tests

# With coverage
pytest --cov=app --cov-report=html

# Performance tests
pytest -m performance --benchmark-only
```

### Test Configuration

```python
# conftest.py provides enterprise-grade test fixtures
@pytest.fixture
def authenticated_client(client, test_user):
    """Returns authenticated test client"""

@pytest.fixture  
def sample_data_factory():
    """Factory for creating test data"""

@pytest.fixture
def performance_monitor():
    """Performance measurement utilities"""
```

## 🚀 Deployment

### Production Deployment

#### Docker Deployment

```bash
# Build production image
docker build -f Dockerfile.enterprise -t truckopti:enterprise .

# Deploy with compose
docker-compose -f docker-compose.enterprise.yml up -d
```

#### Kubernetes Deployment

```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment
kubectl get pods -n truckopti
```

#### Traditional Server Deployment

```bash
# Install system dependencies
sudo apt-get install nginx postgresql redis

# Setup application
pip install -r requirements-enterprise.txt
python -m gunicorn --config gunicorn.conf.py

# Setup nginx
sudo cp nginx/truckopti.conf /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

### Environment-Specific Configurations

#### Development
- SQLite database
- Debug mode enabled
- Hot reload
- Detailed error messages

#### Testing  
- In-memory database
- Mock external services
- Comprehensive logging
- Test data fixtures

#### Production
- PostgreSQL database
- Redis caching
- Error tracking (Sentry)
- Performance monitoring
- Security headers
- Rate limiting

## 📊 Monitoring

### Metrics Collection

The enterprise system provides comprehensive monitoring:

```python
# Application Metrics
- Request duration and throughput
- Business operation performance  
- Database query performance
- Cache hit/miss rates
- Error rates and types

# Infrastructure Metrics  
- CPU, Memory, Disk usage
- Database connection pools
- Cache memory usage
- Network I/O

# Business Metrics
- Packing job success rates
- Optimization improvement rates
- User activity patterns
- Cost savings achieved
```

### Monitoring Stack

- **Prometheus**: Metrics collection and storage
- **Grafana**: Metrics visualization and dashboards  
- **ELK Stack**: Log aggregation and analysis
- **Sentry**: Error tracking and alerting
- **Health Checks**: Application health monitoring

### Dashboards

1. **Application Dashboard**: Request rates, response times, errors
2. **Business Dashboard**: Optimization metrics, user activity  
3. **Infrastructure Dashboard**: System resources, database performance
4. **Security Dashboard**: Authentication events, security violations

## 🔐 Security

### Security Framework

The enterprise system implements multiple security layers:

#### Authentication & Authorization
- JWT-based stateless authentication
- Role-based access control (RBAC)
- Session management with Redis
- Multi-factor authentication ready
- LDAP/AD integration support

#### Input Validation & Sanitization
- Request size limits
- Input validation schemas
- SQL injection prevention
- XSS protection
- CSRF protection

#### Security Headers
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY  
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: default-src 'self'
```

#### Audit & Compliance
- Comprehensive audit logging
- Security event monitoring
- Data governance controls
- Compliance reporting
- GDPR compliance ready

### Security Configuration

```bash
# Enable security features
ENABLE_CSRF_PROTECTION=true
ENABLE_RATE_LIMITING=true
ENABLE_SECURITY_HEADERS=true
ENABLE_AUDIT_LOGGING=true

# Authentication settings
JWT_EXPIRES_IN=3600
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=300

# Monitoring settings  
ENABLE_SECURITY_MONITORING=true
SECURITY_ALERT_EMAIL=security@company.com
```

## 📚 API Documentation

### API Overview

TruckOpti Enterprise provides a comprehensive REST API:

- **OpenAPI 3.0 Specification**: Complete API documentation
- **Interactive Documentation**: Swagger UI at `/api/docs`
- **Postman Collection**: Ready-to-use API collection
- **Rate Limiting**: Configurable rate limits per endpoint
- **Versioning**: API versioning with backward compatibility

### Core Endpoints

```bash
# Authentication
POST /api/v1/auth/login          # User login
POST /api/v1/auth/refresh        # Token refresh
POST /api/v1/auth/logout         # User logout

# Truck Management
GET    /api/v1/trucks            # List trucks
POST   /api/v1/trucks            # Create truck
PUT    /api/v1/trucks/{id}       # Update truck
DELETE /api/v1/trucks/{id}       # Delete truck

# Packing Operations
POST   /api/v1/packing/optimize  # Run optimization
GET    /api/v1/packing/jobs      # List jobs
GET    /api/v1/packing/results   # Get results

# Analytics
GET    /api/v1/analytics/metrics # Performance metrics
GET    /api/v1/analytics/reports # Business reports
```

### API Authentication

```bash
# Get access token
curl -X POST https://api.truckopti.com/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user@example.com", "password": "password"}'

# Use token in requests
curl -H "Authorization: Bearer <token>" \\
  https://api.truckopti.com/v1/trucks
```

## 🤝 Contributing

### Development Workflow

1. **Fork & Clone**: Fork the repository and clone locally
2. **Branch**: Create feature branch from `develop`
3. **Develop**: Make changes following coding standards
4. **Test**: Run comprehensive test suite
5. **Quality**: Pass all quality checks
6. **Pull Request**: Submit PR with detailed description

### Coding Standards

- **Python**: PEP 8 compliance, Black formatting
- **JavaScript**: ESLint with enterprise configuration  
- **Documentation**: Comprehensive docstrings and comments
- **Testing**: Minimum 80% code coverage
- **Security**: Security scanning with Bandit

### Code Review Process

1. **Automated Checks**: CI pipeline validation
2. **Security Review**: Security team approval for sensitive changes
3. **Architecture Review**: Technical leads review for architectural changes
4. **Business Review**: Product owner review for feature changes

---

## 📞 Enterprise Support

### Support Tiers

- **Community**: GitHub issues and discussions
- **Professional**: Email support with SLA
- **Enterprise**: Dedicated support team with 24/7 coverage

### Contact Information

- **General Inquiries**: info@truckopti.com
- **Technical Support**: support@truckopti.com  
- **Security Issues**: security@truckopti.com
- **Sales**: sales@truckopti.com

---

## 📄 License

TruckOpti Enterprise - Proprietary Enterprise License

Copyright (c) 2025 TruckOpti Enterprise Solutions

This software is licensed for enterprise use only. See [LICENSE](LICENSE) for full terms.

---

**🚛 TruckOpti Enterprise - Optimizing Logistics at Enterprise Scale**