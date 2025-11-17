"""
Pytest Configuration and Shared Fixtures
Professional modular test organization for Truck_Opti
"""

import os
import sys
import tempfile
import pytest
from datetime import datetime, timedelta

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db


@pytest.fixture(scope='session')
def app():
    """Create a test application"""
    app = create_app('testing')

    # Use a temporary directory for test database
    temp_dir = tempfile.mkdtemp()
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(temp_dir, "test.db")}'

    # Establish application context
    with app.app_context():
        # Create all database tables
        db.create_all()

        yield app

        # Clean up: drop all tables and close session
        db.session.remove()
        db.drop_all()


@pytest.fixture(scope='function')
def test_client(app):
    """Create a test client for making requests"""
    return app.test_client()


@pytest.fixture(scope='function')
def client(app):
    """Alias for test_client for consistency"""
    return app.test_client()


@pytest.fixture(scope='function')
def db_session(app):
    """Create a database session for each test function"""
    connection = db.engine.connect()
    transaction = connection.begin()

    # Use this session for the test
    session = db.create_scoped_session()

    try:
        yield session
    finally:
        # Roll back the transaction
        transaction.rollback()
        connection.close()
        session.remove()


@pytest.fixture(scope="function")
def sample_truck_type(app):
    """Create a sample truck type for testing"""
    from app.models import TruckType

    with app.app_context():
        truck = TruckType(
            name="Test Truck",
            length=20.0,
            width=8.0,
            height=8.0,
            max_weight=25000.0,
            cost_per_km=15.0,
            fuel_efficiency=6.0,
            driver_cost_per_day=2000.0,
            maintenance_cost_per_km=2.0,
            truck_category="Heavy",
            availability=True
        )
        db.session.add(truck)
        db.session.commit()
        yield truck
        # Cleanup
        db.session.delete(truck)
        db.session.commit()


@pytest.fixture(scope="function")
def sample_carton_type(app):
    """Create a sample carton type for testing"""
    from app.models import CartonType

    with app.app_context():
        carton = CartonType(
            name="Test Carton",
            length=1.0,
            width=1.0,
            height=1.0,
            weight=10.0,
            can_rotate=True,
            fragile=False,
            stackable=True,
            max_stack_height=5,
            priority=3
        )
        db.session.add(carton)
        db.session.commit()
        yield carton
        # Cleanup
        db.session.delete(carton)
        db.session.commit()


@pytest.fixture(scope="function")
def sample_customer(app):
    """Create a sample customer for testing"""
    from app.models import Customer

    with app.app_context():
        customer = Customer(
            name="Test Customer",
            email="test@example.com",
            phone="1234567890",
            address="123 Test St",
            city="Test City",
            state="TS",
            zip_code="12345"
        )
        db.session.add(customer)
        db.session.commit()
        yield customer
        db.session.delete(customer)
        db.session.commit()


@pytest.fixture(scope="function")
def sample_route(app):
    """Create a sample route for testing"""
    from app.models import Route

    with app.app_context():
        route = Route(
            origin="Test Origin",
            destination="Test Destination",
            distance=100.0,
            estimated_time=2.0,
            toll_cost=50.0,
            fuel_cost=600.0
        )
        db.session.add(route)
        db.session.commit()
        yield route
        db.session.delete(route)
        db.session.commit()


@pytest.fixture(scope="function")
def sample_shipment(app, sample_customer, sample_route):
    """Create a sample shipment for testing"""
    from app.models import Shipment

    with app.app_context():
        shipment = Shipment(
            shipment_number="TEST-SHIP-001",
            customer_id=sample_customer.id,
            route_id=sample_route.id,
            priority=3,
            delivery_date=datetime.now() + timedelta(days=7),
            status="pending",
            total_value=10000.0
        )
        db.session.add(shipment)
        db.session.commit()
        yield shipment
        db.session.delete(shipment)
        db.session.commit()


@pytest.fixture(scope="function")
def auth_headers():
    """Create authentication headers for API testing"""
    # TODO: Implement JWT token generation when auth is complete
    return {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }


@pytest.fixture(scope="session")
def base_url():
    """Base URL for API testing"""
    return "http://localhost:5000"


# Configure pytest markers
def pytest_configure(config):
    """Configure custom pytest markers"""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "e2e: mark test as an end-to-end test"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as a performance test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "analysis: mark test as analysis/diagnostic test"
    )