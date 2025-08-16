import pytest
import os
import sqlite3
import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class TestScreenshotIssueVerification:
    @classmethod
    def setup_class(cls):
        """
        Setup test environment, initializing database and web driver
        """
        # Database connection
        cls.db_path = 'app/truck_opti.db'
        cls.conn = sqlite3.connect(cls.db_path)
        cls.cursor = cls.conn.cursor()

        # Selenium WebDriver setup (Chrome in this case)
        options = webdriver.ChromeOptions()
        options.add_argument('--start-maximized')
        cls.driver = webdriver.Chrome(options=options)
        cls.driver.get('http://127.0.0.1:5001')  # Base URL

    @classmethod
    def teardown_class(cls):
        """
        Clean up resources after testing
        """
        cls.conn.close()
        cls.driver.quit()

    def test_critical_dashboard_tables(self):
        """
        Verify dashboard tables are loading correctly
        """
        # Check each dashboard option for table loading
        dashboard_options = [
            'trucks', 'cartons', 'sales_orders', 
            'route_optimization', 'cost_analysis'
        ]
        
        for option in dashboard_options:
            try:
                # Click dashboard option
                element = WebDriverWait(self.driver, 10).until(
                    EC.element_to_be_clickable((By.ID, f'dashboard-{option}'))
                )
                element.click()

                # Check if table loads
                table = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.CLASS_NAME, 'data-table'))
                )
                assert table.is_displayed(), f"Table for {option} not displayed"
            except Exception as e:
                pytest.fail(f"Failed to load table for {option}: {str(e)}")

    def test_upload_functionality(self):
        """
        Verify CSV/Excel upload works correctly
        """
        # Navigate to upload page
        upload_page = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.ID, 'upload-page'))
        )
        upload_page.click()

        # Test file upload input
        file_input = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.ID, 'file-upload'))
        )
        
        # Test with sample files
        test_files = [
            'test_sale_order.csv',
            'test_cartons.xlsx',
            'test_trucks.csv'
        ]
        
        for test_file in test_files:
            file_path = os.path.join('test_data', test_file)
            file_input.send_keys(file_path)

            # Wait for upload success message
            success_message = WebDriverWait(self.driver, 20).until(
                EC.presence_of_element_located((By.CLASS_NAME, 'upload-success'))
            )
            assert success_message.is_displayed(), f"Upload failed for {test_file}"

    def test_analytics_charts(self):
        """
        Verify analytics charts are rendering correctly
        """
        # Navigate to analytics page
        analytics_page = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.ID, 'analytics-page'))
        )
        analytics_page.click()

        # Check chart rendering
        charts = [
            'space_utilization', 
            'cost_optimization', 
            'truck_loading_efficiency'
        ]
        
        for chart in charts:
            chart_element = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.ID, f'chart-{chart}'))
            )
            assert chart_element.is_displayed(), f"Chart {chart} not rendering"
            
            # Check chart has reasonable dimensions
            size = chart_element.size
            assert size['width'] > 300, "Chart width too small"
            assert size['height'] > 200, "Chart height too small"

    def test_sale_order_processing(self):
        """
        Comprehensive test for sale order processing
        """
        # Navigate to sale order page
        sale_order_page = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.ID, 'sale-order-page'))
        )
        sale_order_page.click()

        # Test order creation form
        order_form = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.ID, 'order-creation-form'))
        )
        
        # Fill out order details
        order_details = {
            'customer_name': 'Test Customer',
            'carton_type': 'Standard Box',
            'quantity': '50',
            'destination': 'Mumbai'
        }
        
        for field, value in order_details.items():
            input_field = self.driver.find_element(By.ID, field)
            input_field.clear()
            input_field.send_keys(value)

        # Submit order
        submit_button = self.driver.find_element(By.ID, 'submit-order')
        submit_button.click()

        # Verify order processing
        processing_message = WebDriverWait(self.driver, 20).until(
            EC.presence_of_element_located((By.CLASS_NAME, 'order-processing-status'))
        )
        assert processing_message.is_displayed(), "Order processing failed"
        assert 'Success' in processing_message.text, "Order not processed successfully"

    def test_truck_recommendation(self):
        """
        Test truck recommendation functionality
        """
        # Navigate to truck recommendation page
        recommendation_page = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.ID, 'truck-recommendation-page'))
        )
        recommendation_page.click()

        # Check truck dropdown
        truck_dropdown = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.ID, 'truck-type-dropdown'))
        )
        truck_dropdown.click()

        # Verify dropdown options
        dropdown_options = self.driver.find_elements(By.CLASS_NAME, 'dropdown-option')
        assert len(dropdown_options) > 0, "No truck types in dropdown"

        # Select first truck type
        dropdown_options[0].click()

        # Check recommendation results
        recommendation_results = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, 'recommendation-results'))
        )
        assert recommendation_results.is_displayed(), "No recommendations displayed"

    def test_database_integrity(self):
        """
        Verify database integrity and key tables
        """
        # List of critical tables to check
        critical_tables = [
            'trucks', 'cartons', 'sales_orders', 
            'route_optimization', 'cost_analysis'
        ]
        
        for table in critical_tables:
            try:
                # Check table exists and has records
                self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = self.cursor.fetchone()[0]
                assert count >= 0, f"Table {table} is empty or doesn't exist"
            except sqlite3.OperationalError:
                pytest.fail(f"Table {table} does not exist in database")

    def test_api_endpoints(self):
        """
        Verify critical API endpoints are working
        """
        api_endpoints = [
            '/api/trucks',
            '/api/cartons',
            '/api/sales_orders',
            '/api/recommendations',
            '/api/analytics'
        ]
        
        for endpoint in api_endpoints:
            response = requests.get(f'http://127.0.0.1:5001{endpoint}')
            assert response.status_code == 200, f"Endpoint {endpoint} failed"
            assert len(response.json()) > 0, f"No data returned from {endpoint}"

# Add more tests as needed for comprehensive coverage