# Truck_Opti Test Suite
Professional modular test organization

## Directory Structure

```
tests/
├── README.md                  # This file
├── conftest.py                # Shared pytest fixtures and configuration
├── __init__.py                # Package initialization
│
├── unit/                      # Unit tests (fast, isolated)
│   ├── __init__.py
│   ├── domain/                # Domain layer tests
│   ├── application/           # Application layer tests
│   └── infrastructure/        # Infrastructure layer tests
│
├── integration/               # Integration tests (with database, external services)
│   ├── __init__.py
│   ├── test_bulk_cartons.py
│   ├── test_bulk_upload_functionality.py
│   ├── test_error_handling.py
│   ├── test_recommendation_api.py
│   └── test_report_generation.py
│
├── e2e/                       # End-to-end tests (full user flows)
│   └── __init__.py
│
├── performance/               # Performance and load tests
│   ├── __init__.py
│   └── test_ui_performance.py
│
├── analysis/                  # Analysis and diagnostic tools
│   ├── __init__.py
│   └── 3d_truck_loading_analysis.py
│
└── fixtures/                  # Test data and fixtures
    └── __init__.py
```

## Running Tests

### Run all tests
```bash
pytest
```

### Run specific test categories
```bash
# Unit tests only
pytest -m unit

# Integration tests
pytest -m integration

# E2E tests
pytest -m e2e

# Performance tests
pytest -m performance

# Exclude slow tests
pytest -m "not slow"
```

### Run tests in specific directory
```bash
# All integration tests
pytest tests/integration/

# Specific test file
pytest tests/integration/test_bulk_cartons.py

# Specific test function
pytest tests/integration/test_bulk_cartons.py::test_bulk_upload_cartons
```

### Run with coverage
```bash
# Generate coverage report
pytest --cov=app --cov-report=html

# View coverage report
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
start htmlcov/index.html  # Windows
```

### Run with different verbosity
```bash
# Verbose output
pytest -v

# Very verbose (show all test output)
pytest -vv

# Quiet mode (only show test summary)
pytest -q
```

## Test Markers

Tests can be marked with custom markers for organization:

```python
import pytest

@pytest.mark.unit
def test_truck_entity():
    """Fast unit test"""
    pass

@pytest.mark.integration
def test_truck_repository():
    """Integration test with database"""
    pass

@pytest.mark.e2e
def test_complete_booking_flow():
    """Full end-to-end test"""
    pass

@pytest.mark.slow
def test_performance_benchmark():
    """Slow running test"""
    pass

@pytest.mark.performance
def test_load_handling():
    """Performance test"""
    pass
```

## Available Fixtures

### Application Fixtures
- `app` - Flask application instance (session scope)
- `client` / `test_client` - Flask test client (function scope)
- `db_session` - Database session with rollback (function scope)

### Data Fixtures
- `sample_truck_type` - Sample truck for testing
- `sample_carton_type` - Sample carton for testing
- `sample_customer` - Sample customer for testing
- `sample_route` - Sample route for testing
- `sample_shipment` - Sample shipment for testing

### Utility Fixtures
- `auth_headers` - Authentication headers for API tests
- `base_url` - Base URL for API testing

## Writing New Tests

### Unit Test Example
```python
# tests/unit/domain/test_truck.py
import pytest
from app.domain.entities import TruckEntity
from app.domain.value_objects import Dimensions

@pytest.mark.unit
def test_truck_volume_calculation():
    """Test truck volume is calculated correctly"""
    dimensions = Dimensions(length=20.0, width=8.0, height=8.0)
    truck = TruckEntity(
        id=1,
        name="Test Truck",
        dimensions=dimensions
    )

    assert truck.volume == 1280.0  # 20 * 8 * 8
```

### Integration Test Example
```python
# tests/integration/test_truck_api.py
import pytest
from app.models import TruckType

@pytest.mark.integration
def test_create_truck_api(client, auth_headers):
    """Test truck creation via API"""
    data = {
        "name": "New Truck",
        "length": 20.0,
        "width": 8.0,
        "height": 8.0,
        "max_weight": 25000.0
    }

    response = client.post('/api/v1/trucks', json=data, headers=auth_headers)

    assert response.status_code == 201
    assert response.json['name'] == "New Truck"
```

### E2E Test Example
```python
# tests/e2e/test_optimization_flow.py
import pytest

@pytest.mark.e2e
def test_complete_optimization_workflow(client, sample_truck_type, sample_carton_type):
    """Test complete optimization workflow"""
    # Step 1: Get truck recommendations
    response = client.post('/api/v1/optimization/recommend', json={
        "cartons": [{"type_id": sample_carton_type.id, "quantity": 10}]
    })
    assert response.status_code == 200

    # Step 2: Execute packing
    recommended_truck = response.json['recommendations'][0]['truck_id']
    response = client.post('/api/v1/optimization/pack', json={
        "truck_id": recommended_truck,
        "cartons": [{"type_id": sample_carton_type.id, "quantity": 10}]
    })
    assert response.status_code == 200

    # Step 3: Verify results
    assert response.json['utilization'] > 0
```

## Test Data Management

### Creating Test Fixtures
Place reusable test data in `tests/fixtures/`:

```python
# tests/fixtures/sample_data.py
SAMPLE_TRUCKS = [
    {"name": "Truck A", "length": 20.0, "width": 8.0, "height": 8.0},
    {"name": "Truck B", "length": 15.0, "width": 7.0, "height": 7.0},
]

SAMPLE_CARTONS = [
    {"name": "Box A", "length": 1.0, "width": 1.0, "height": 1.0},
    {"name": "Box B", "length": 2.0, "width": 2.0, "height": 2.0},
]
```

## Best Practices

### 1. Test Organization
- **Unit tests**: Test individual functions/classes in isolation
- **Integration tests**: Test interactions between components
- **E2E tests**: Test complete user workflows
- **Performance tests**: Benchmark critical operations

### 2. Test Naming
- Use descriptive names: `test_truck_creation_with_valid_data`
- Follow pattern: `test_<what>_<condition>_<expected_result>`

### 3. Test Independence
- Each test should be independent
- Use fixtures for setup/teardown
- Don't rely on test execution order
- Clean up after tests

### 4. Assertions
- One logical assertion per test (preferably)
- Use descriptive assertion messages
- Test both success and failure cases

### 5. Test Coverage
- Aim for >80% code coverage
- Focus on critical business logic
- Test edge cases and error conditions
- Don't test framework code

### 6. Performance
- Keep unit tests fast (<100ms each)
- Mark slow tests with `@pytest.mark.slow`
- Use fixtures to avoid repeated setup

### 7. Documentation
- Add docstrings to test functions
- Explain why, not just what
- Document complex test setups

## Continuous Integration

Tests are automatically run on:
- Every push to development branches
- Pull requests to main branch
- Scheduled nightly builds

### CI Pipeline
1. Install dependencies
2. Run linters (flake8, black, mypy)
3. Run unit tests
4. Run integration tests
5. Generate coverage report
6. Run E2E tests (if applicable)
7. Performance benchmarks (nightly)

## Troubleshooting

### Tests failing locally but passing in CI
- Check Python version compatibility
- Verify all dependencies are installed
- Check for environment-specific settings
- Review test isolation

### Slow test execution
- Use pytest-xdist for parallel execution: `pytest -n auto`
- Profile tests: `pytest --durations=10`
- Mark slow tests and exclude: `pytest -m "not slow"`

### Database errors in tests
- Check database migrations are up to date
- Verify test database is being created/destroyed properly
- Review fixture dependencies

### Import errors
- Ensure project root is in PYTHONPATH
- Check __init__.py files exist
- Verify relative imports are correct

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Testing Best Practices](https://docs.python-guide.org/writing/tests/)
- [Flask Testing](https://flask.palletsprojects.com/en/latest/testing/)

---

**Last Updated**: 2025-11-11
**Test Coverage Goal**: >80%
**Current Status**: Organized and Ready for Development
