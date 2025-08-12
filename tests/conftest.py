"""
Enterprise Testing Configuration
Comprehensive test fixtures and utilities for enterprise-grade testing
"""

import pytest
import os
import tempfile
from typing import Generator, Any
from unittest.mock import Mock, patch
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import create_app
from app.config.settings import Config, reload_config
from app.models import db as _db
from app.core.logging import setup_logging


@pytest.fixture(scope="session")
def test_config() -> Config:
    """Test configuration fixture"""
    os.environ["ENVIRONMENT"] = "testing"
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"
    os.environ["TESTING"] = "true"
    os.environ["SECRET_KEY"] = "test-secret-key"
    os.environ["JWT_SECRET"] = "test-jwt-secret"
    
    config = reload_config("testing")
    return config


@pytest.fixture(scope="session")
def app(test_config: Config) -> Generator[Flask, None, None]:
    """Flask application fixture"""
    _app = create_app(config=test_config)
    
    with _app.app_context():
        # Setup test database
        _db.create_all()
        
        yield _app
        
        # Cleanup
        _db.drop_all()
        _db.session.remove()


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    """Flask test client fixture"""
    return app.test_client()


@pytest.fixture
def db(app: Flask) -> Generator:
    """Database fixture with transaction rollback"""
    with app.app_context():
        connection = _db.engine.connect()
        transaction = connection.begin()
        
        # Configure session to use the connection
        _db.session.configure(bind=connection, binds={})
        
        yield _db
        
        # Rollback transaction
        transaction.rollback()
        connection.close()
        _db.session.remove()


@pytest.fixture
def session(db):
    """Database session fixture"""
    return db.session


@pytest.fixture
def test_user(session):
    """Test user fixture"""
    from app.models import User
    
    user = User(
        email="test@example.com",
        username="testuser",
        is_active=True,
        is_admin=False
    )
    user.set_password("testpassword")
    session.add(user)
    session.commit()
    
    return user


@pytest.fixture
def admin_user(session):
    """Admin user fixture"""
    from app.models import User
    
    user = User(
        email="admin@example.com",
        username="admin",
        is_active=True,
        is_admin=True
    )
    user.set_password("adminpassword")
    session.add(user)
    session.commit()
    
    return user


@pytest.fixture
def authenticated_client(client: FlaskClient, test_user) -> FlaskClient:
    """Authenticated client fixture"""
    # Login the user
    response = client.post('/api/v1/auth/login', json={
        'email': test_user.email,
        'password': 'testpassword'
    })
    
    assert response.status_code == 200
    token = response.get_json()['access_token']
    
    # Add authorization header to client
    client.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'
    
    return client


@pytest.fixture
def sample_truck_type(session):
    """Sample truck type fixture"""
    from app.models import TruckType
    
    truck_type = TruckType(
        name="Test Truck",
        length=600,
        width=250,
        height=250,
        max_weight=5000,
        cost_per_km=25.0,
        fuel_efficiency=10.0
    )
    session.add(truck_type)
    session.commit()
    
    return truck_type


@pytest.fixture
def sample_carton_type(session):
    """Sample carton type fixture"""
    from app.models import CartonType
    
    carton_type = CartonType(
        name="Test Carton",
        length=30,
        width=20,
        height=15,
        weight=2.0,
        value=100.0
    )
    session.add(carton_type)
    session.commit()
    
    return carton_type


@pytest.fixture
def sample_packing_job(session, test_user, sample_truck_type, sample_carton_type):
    """Sample packing job fixture"""
    from app.models import PackingJob
    
    job = PackingJob(
        name="Test Packing Job",
        user_id=test_user.id,
        status="pending",
        optimization_goal="cost"
    )
    session.add(job)
    session.commit()
    
    return job


@pytest.fixture
def mock_cache():
    """Mock cache fixture"""
    cache = Mock()
    cache.get.return_value = None
    cache.set.return_value = True
    cache.delete.return_value = True
    
    return cache


@pytest.fixture
def mock_redis():
    """Mock Redis fixture"""
    redis_mock = Mock()
    redis_mock.get.return_value = None
    redis_mock.set.return_value = True
    redis_mock.delete.return_value = True
    redis_mock.ping.return_value = True
    
    return redis_mock


@pytest.fixture
def temp_file():
    """Temporary file fixture"""
    with tempfile.NamedTemporaryFile(mode='w+', delete=False) as f:
        yield f.name
    
    # Cleanup
    if os.path.exists(f.name):
        os.unlink(f.name)


@pytest.fixture
def temp_directory():
    """Temporary directory fixture"""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir


@pytest.fixture
def mock_external_service():
    """Mock external service fixture"""
    service = Mock()
    service.get_fuel_prices.return_value = {"diesel": 85.0, "petrol": 90.0}
    service.get_traffic_data.return_value = {"status": "normal", "delay": 0}
    service.geocode_address.return_value = {"lat": 12.9716, "lng": 77.5946}
    
    return service


class TestDataFactory:
    """Factory for creating test data"""
    
    @staticmethod
    def create_truck_type(session, **kwargs):
        """Create truck type for testing"""
        from app.models import TruckType
        
        defaults = {
            "name": "Test Truck",
            "length": 600,
            "width": 250,
            "height": 250,
            "max_weight": 5000,
            "cost_per_km": 25.0,
            "fuel_efficiency": 10.0
        }
        defaults.update(kwargs)
        
        truck_type = TruckType(**defaults)
        session.add(truck_type)
        session.commit()
        
        return truck_type
    
    @staticmethod
    def create_carton_type(session, **kwargs):
        """Create carton type for testing"""
        from app.models import CartonType
        
        defaults = {
            "name": "Test Carton",
            "length": 30,
            "width": 20,
            "height": 15,
            "weight": 2.0,
            "value": 100.0
        }
        defaults.update(kwargs)
        
        carton_type = CartonType(**defaults)
        session.add(carton_type)
        session.commit()
        
        return carton_type
    
    @staticmethod
    def create_packing_job(session, user, **kwargs):
        """Create packing job for testing"""
        from app.models import PackingJob
        
        defaults = {
            "name": "Test Job",
            "user_id": user.id,
            "status": "pending",
            "optimization_goal": "cost"
        }
        defaults.update(kwargs)
        
        job = PackingJob(**defaults)
        session.add(job)
        session.commit()
        
        return job


@pytest.fixture
def data_factory():
    """Data factory fixture"""
    return TestDataFactory


class TestAssertions:
    """Custom assertion helpers"""
    
    @staticmethod
    def assert_valid_uuid(uuid_string):
        """Assert that string is a valid UUID"""
        import uuid
        try:
            uuid.UUID(uuid_string)
        except (ValueError, TypeError):
            pytest.fail(f"'{uuid_string}' is not a valid UUID")
    
    @staticmethod
    def assert_valid_timestamp(timestamp):
        """Assert that string is a valid ISO timestamp"""
        from datetime import datetime
        try:
            datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            pytest.fail(f"'{timestamp}' is not a valid ISO timestamp")
    
    @staticmethod
    def assert_json_response(response, status_code=200):
        """Assert JSON response with status code"""
        assert response.status_code == status_code
        assert response.content_type == 'application/json'
        return response.get_json()
    
    @staticmethod
    def assert_error_response(response, error_code, status_code=400):
        """Assert error response format"""
        assert response.status_code == status_code
        json_data = response.get_json()
        assert 'error' in json_data
        assert json_data['error']['code'] == error_code


@pytest.fixture
def assertions():
    """Test assertions fixture"""
    return TestAssertions


# Performance testing utilities
@pytest.fixture
def performance_monitor():
    """Performance monitoring fixture"""
    class PerformanceMonitor:
        def __init__(self):
            self.measurements = {}
        
        def measure(self, operation_name):
            import time
            start_time = time.time()
            
            def end_measurement():
                end_time = time.time()
                duration = end_time - start_time
                self.measurements[operation_name] = duration
                return duration
            
            return end_measurement
        
        def assert_performance(self, operation_name, max_duration):
            assert operation_name in self.measurements
            actual_duration = self.measurements[operation_name]
            assert actual_duration <= max_duration, f"Operation '{operation_name}' took {actual_duration:.3f}s, expected <= {max_duration:.3f}s"
    
    return PerformanceMonitor()


# Logging configuration for tests
def pytest_configure(config):
    """Configure pytest settings"""
    import logging
    # Disable logging during tests unless explicitly enabled
    if not config.getoption("--log-cli-level"):
        logging.getLogger().setLevel(logging.CRITICAL)


def pytest_collection_modifyitems(config, items):
    """Modify test items during collection"""
    # Mark slow tests
    slow_marker = pytest.mark.slow
    integration_marker = pytest.mark.integration
    
    for item in items:
        # Mark slow tests
        if "slow" in item.nodeid:
            item.add_marker(slow_marker)
        
        # Mark integration tests
        if "integration" in item.nodeid:
            item.add_marker(integration_marker)