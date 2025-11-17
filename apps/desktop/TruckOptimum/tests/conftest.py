"""
Pytest Configuration and Global Fixtures
Zero-Debugging Testing Framework for TruckOptimum
"""

import pytest
import tempfile
import os
import sqlite3
import json
import csv
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
import threading
import time
import requests
import socket

# Import the main application
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import TruckOptimum


@pytest.fixture(scope="session")
def test_database():
    """Create a temporary test database with sample data"""
    temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    temp_db_path = temp_db.name
    temp_db.close()
    
    # Initialize database with schema and test data
    with sqlite3.connect(temp_db_path) as conn:
        # Create tables
        conn.execute('''
            CREATE TABLE IF NOT EXISTS trucks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                length REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                max_weight REAL NOT NULL,
                cost_per_km REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS cartons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                length REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                weight REAL NOT NULL,
                quantity INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Insert test trucks
        test_trucks = [
            ("Small Truck", 4.0, 2.0, 2.0, 1000.0, 1.5),
            ("Medium Truck", 6.0, 2.5, 2.5, 3000.0, 2.0),
            ("Large Truck", 8.0, 3.0, 3.0, 5000.0, 2.5),
            ("Extra Large Truck", 10.0, 3.5, 3.5, 8000.0, 3.0),
        ]
        
        for truck in test_trucks:
            conn.execute(
                'INSERT INTO trucks (name, length, width, height, max_weight, cost_per_km) VALUES (?, ?, ?, ?, ?, ?)',
                truck
            )
        
        # Insert test cartons
        test_cartons = [
            ("Small Box", 0.5, 0.5, 0.5, 10.0, 100),
            ("Medium Box", 1.0, 1.0, 1.0, 25.0, 50),
            ("Large Box", 1.5, 1.5, 1.5, 50.0, 25),
            ("Heavy Package", 1.0, 0.8, 0.6, 75.0, 10),
            ("Light Package", 2.0, 1.0, 0.5, 5.0, 200),
        ]
        
        for carton in test_cartons:
            conn.execute(
                'INSERT INTO cartons (name, length, width, height, weight, quantity) VALUES (?, ?, ?, ?, ?, ?)',
                carton
            )
        
        conn.commit()
    
    yield temp_db_path
    
    # Cleanup
    os.unlink(temp_db_path)


@pytest.fixture(scope="session")
def app_instance(test_database):
    """Create TruckOptimum app instance with test database"""
    # Monkey patch the database path
    original_get_db_path = TruckOptimum.get_db_path
    
    def mock_get_db_path(self):
        return test_database
    
    TruckOptimum.get_db_path = mock_get_db_path
    
    app_instance = TruckOptimum()
    app_instance.db_path = test_database
    
    yield app_instance
    
    # Restore original method
    TruckOptimum.get_db_path = original_get_db_path


@pytest.fixture(scope="session")
def test_server(app_instance):
    """Start test server in background thread"""
    
    # Find available port
    sock = socket.socket()
    sock.bind(('', 0))
    port = sock.getsockname()[1]
    sock.close()
    
    # Start server in thread
    server_thread = threading.Thread(
        target=lambda: app_instance.app.run(
            host='127.0.0.1',
            port=port,
            debug=False,
            use_reloader=False,
            threaded=True
        )
    )
    server_thread.daemon = True
    server_thread.start()
    
    # Wait for server to be ready
    base_url = f"http://127.0.0.1:{port}"
    max_attempts = 30
    for attempt in range(max_attempts):
        try:
            response = requests.get(base_url, timeout=1)
            if response.status_code == 200:
                break
        except requests.RequestException:
            time.sleep(0.1)
    else:
        pytest.fail("Test server failed to start")
    
    yield base_url


@pytest.fixture(scope="session")
def browser():
    """Create Chrome browser instance for UI testing"""
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-plugins")
    chrome_options.add_argument("--disable-images")
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.implicitly_wait(10)
    
    yield driver
    
    driver.quit()


@pytest.fixture
def api_client(test_server):
    """HTTP client for API testing"""
    class APIClient:
        def __init__(self, base_url):
            self.base_url = base_url
            self.session = requests.Session()
        
        def get(self, endpoint, **kwargs):
            return self.session.get(f"{self.base_url}{endpoint}", **kwargs)
        
        def post(self, endpoint, **kwargs):
            return self.session.post(f"{self.base_url}{endpoint}", **kwargs)
        
        def put(self, endpoint, **kwargs):
            return self.session.put(f"{self.base_url}{endpoint}", **kwargs)
        
        def delete(self, endpoint, **kwargs):
            return self.session.delete(f"{self.base_url}{endpoint}", **kwargs)
    
    return APIClient(test_server)


@pytest.fixture
def test_csv_file():
    """Create temporary CSV file for carton testing"""
    temp_csv = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
    
    csv_data = [
        ["carton_name", "quantity"],
        ["Small Box", "25"],
        ["Medium Box", "15"],
        ["Large Box", "10"],
    ]
    
    writer = csv.writer(temp_csv)
    writer.writerows(csv_data)
    temp_csv.close()
    
    yield temp_csv.name
    
    os.unlink(temp_csv.name)


@pytest.fixture
def test_csv_truck_file():
    """Create temporary CSV file for truck testing"""
    temp_csv = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
    
    csv_data = [
        ["truck_name", "length", "width", "height", "max_weight", "cost_per_km"],
        ["Test Truck 1", "8.0", "2.5", "2.5", "3000.0", "2.0"],
        ["Test Truck 2", "10.0", "3.0", "3.0", "5000.0", "2.5"],
        ["Test Truck 3", "12.0", "3.5", "3.5", "8000.0", "3.0"],
    ]
    
    writer = csv.writer(temp_csv)
    writer.writerows(csv_data)
    temp_csv.close()
    
    yield temp_csv.name
    
    os.unlink(temp_csv.name)


@pytest.fixture
def invalid_csv_truck_file():
    """Create invalid CSV file for truck error testing"""
    temp_csv = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
    
    # Invalid CSV with missing data, wrong format
    csv_data = [
        ["wrong_header", "bad_data"],
        ["InvalidTruck", "not_a_number"],
        ["", "50"],  # Empty name
        ["ValidTruck"],  # Missing data
    ]
    
    writer = csv.writer(temp_csv)
    writer.writerows(csv_data)
    temp_csv.close()
    
    yield temp_csv.name
    
    os.unlink(temp_csv.name)


@pytest.fixture
def invalid_csv_file():
    """Create invalid CSV file for error testing"""
    temp_csv = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
    
    # Invalid CSV with missing data, wrong format
    csv_data = [
        ["wrong_header", "bad_data"],
        ["InvalidCarton", "not_a_number"],
        ["", "50"],  # Empty name
        ["ValidCarton"],  # Missing quantity
    ]
    
    writer = csv.writer(temp_csv)
    writer.writerows(csv_data)
    temp_csv.close()
    
    yield temp_csv.name
    
    os.unlink(temp_csv.name)


@pytest.fixture
def performance_monitor():
    """Monitor performance metrics during testing"""
    class PerformanceMonitor:
        def __init__(self):
            self.metrics = {}
            self.start_times = {}
        
        def start_timer(self, operation):
            self.start_times[operation] = time.time()
        
        def end_timer(self, operation):
            if operation in self.start_times:
                duration = time.time() - self.start_times[operation]
                self.metrics[operation] = duration
                return duration
            return None
        
        def get_metrics(self):
            return self.metrics.copy()
        
        def assert_performance(self, operation, max_duration):
            if operation in self.metrics:
                assert self.metrics[operation] <= max_duration, f"{operation} took {self.metrics[operation]:.3f}s, expected <= {max_duration}s"
    
    return PerformanceMonitor()


@pytest.fixture
def screenshot_helper(browser):
    """Helper for taking screenshots during tests"""
    class ScreenshotHelper:
        def __init__(self, driver):
            self.driver = driver
            self.screenshot_dir = Path("reports/screenshots")
            self.screenshot_dir.mkdir(parents=True, exist_ok=True)
        
        def take_screenshot(self, name):
            timestamp = int(time.time())
            filename = f"{name}_{timestamp}.png"
            filepath = self.screenshot_dir / filename
            self.driver.save_screenshot(str(filepath))
            return str(filepath)
        
        def take_element_screenshot(self, element, name):
            timestamp = int(time.time())
            filename = f"{name}_element_{timestamp}.png"
            filepath = self.screenshot_dir / filename
            element.screenshot(str(filepath))
            return str(filepath)
    
    return ScreenshotHelper(browser)


# Pytest Hooks for Enhanced Reporting
def pytest_runtest_makereport(item, call):
    """Add extra information to test reports"""
    if call.when == "call":
        if hasattr(item, "funcargs") and "performance_monitor" in item.funcargs:
            monitor = item.funcargs["performance_monitor"]
            if hasattr(call, "result"):
                call.result.performance_metrics = monitor.get_metrics()


def pytest_html_report_title(report):
    """Customize HTML report title"""
    report.title = "TruckOptimum - Zero-Debug Testing Report"


def pytest_configure(config):
    """Configure pytest with custom markers and settings"""
    # Ensure reports directory exists
    os.makedirs("reports", exist_ok=True)
    
    # Add custom markers
    config.addinivalue_line(
        "markers", "critical: Critical functionality that must always work"
    )
    config.addinivalue_line(
        "markers", "user_workflow: Complete user workflow tests"  
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add default markers"""
    for item in items:
        # Add markers based on test path
        if "unit" in str(item.fspath):
            item.add_marker(pytest.mark.unit)
        elif "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)
        elif "e2e" in str(item.fspath):
            item.add_marker(pytest.mark.e2e)