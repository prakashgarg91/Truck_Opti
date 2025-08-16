import os
import sys
import tempfile
import pytest

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from app.config.settings import Config

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