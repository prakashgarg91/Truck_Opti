import os
import json
import pytest
import sqlite3
import requests
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

class TestScreenshotIssueVerification:
    @classmethod
    def setup_class(cls):
        """
        Setup test environment with multiple app URLs and comprehensive testing
        """
        # Applications to test
        cls.apps = {
            'enterprise': {'url': 'http://127.0.0.1:5000', 'name': 'TruckOpti Enterprise'},
            'simple': {'url': 'http://127.0.0.1:5002', 'name': 'SimpleTruckOpti'}
        }
        
        # Screenshot problem directory
        cls.issues_dir = r'D:\Github\Truck_Opti\screenshots_problems_in_exe'
        cls.output_dir = r'D:\Github\Truck_Opti\screenshot_test_results'
        os.makedirs(cls.output_dir, exist_ok=True)
        
        # Selenium WebDriver setup
        chrome_options = Options()
        chrome_options.add_argument('--start-maximized')
        chrome_options.add_argument('--headless')  # Run in background
        
        cls.drivers = {}
        for app_key, app_config in cls.apps.items():
            driver = webdriver.Chrome(options=chrome_options)
            driver.get(app_config['url'])
            cls.drivers[app_key] = driver
        
        # Issue tracking
        cls.app_issues = {app: [] for app in cls.apps.keys()}
    
    @classmethod
    def teardown_class(cls):
        """
        Clean up resources after testing
        """
        for driver in cls.drivers.values():
            driver.quit()
    
    def take_screenshot(self, driver, description):
        """
        Take a screenshot with a descriptive name
        
        Args:
            driver (WebDriver): Selenium WebDriver
            description (str): Description of the screenshot scenario
        
        Returns:
            str: Path to the saved screenshot
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        screenshot_path = os.path.join(
            self.output_dir, 
            f"{description}_{timestamp}.png"
        )
        driver.save_screenshot(screenshot_path)
        return screenshot_path
    
    def test_bulk_upload_functionality(self):
        """
        Test bulk upload functionality for both applications
        """
        for app_key, driver in self.drivers.items():
            try:
                # Navigate to upload page
                upload_link = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.ID, 'upload-page'))
                )
                upload_link.click()
                
                # Check bulk upload input
                bulk_upload_input = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, 'bulk-upload-input'))
                )
                assert bulk_upload_input.is_displayed(), f"Bulk upload input missing in {app_key}"
                
                # Take screenshot of upload page
                self.take_screenshot(driver, f"{app_key}_bulk_upload_page")
                
                # Check processing screen during upload
                test_files = [
                    'test_sale_orders.csv', 
                    'test_cartons.xlsx', 
                    'test_trucks.csv'
                ]
                
                for test_file in test_files:
                    file_path = os.path.join('test_data', test_file)
                    bulk_upload_input.send_keys(file_path)
                    
                    # Wait for processing screen
                    processing_screen = WebDriverWait(driver, 20).until(
                        EC.presence_of_element_located((By.CLASS_NAME, 'upload-processing'))
                    )
                    assert processing_screen.is_displayed(), f"No processing screen in {app_key}"
                    
                    # Take screenshot of processing
                    self.take_screenshot(driver, f"{app_key}_upload_processing_{test_file}")
            
            except Exception as e:
                self.app_issues[app_key].append(f"Bulk upload test failed: {str(e)}")
                pytest.fail(f"Bulk upload test failed for {app_key}: {str(e)}")
    
    def test_dashboard_functionality(self):
        """
        Test dashboard charts, drill-down, and professional UI
        """
        for app_key, driver in self.drivers.items():
            try:
                # Navigate to dashboard
                dashboard_link = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.ID, 'dashboard-page'))
                )
                dashboard_link.click()
                
                # Check charts exist
                charts = driver.find_elements(By.CLASS_NAME, 'dashboard-chart')
                assert len(charts) > 0, f"No charts found in {app_key} dashboard"
                
                # Take screenshot of dashboard
                self.take_screenshot(driver, f"{app_key}_dashboard")
                
                # Test drill-down functionality
                for chart in charts:
                    chart.click()
                    drill_down_table = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.CLASS_NAME, 'drill-down-table'))
                    )
                    assert drill_down_table.is_displayed(), f"Drill-down table not showing in {app_key}"
                    
                    # Take screenshot of drill-down
                    self.take_screenshot(driver, f"{app_key}_drill_down")
            
            except Exception as e:
                self.app_issues[app_key].append(f"Dashboard test failed: {str(e)}")
                pytest.fail(f"Dashboard test failed for {app_key}: {str(e)}")
    
    def test_ui_ux_professional_appearance(self):
        """
        Check UI/UX professional appearance across pages
        """
        for app_key, driver in self.drivers.items():
            try:
                # Test mobile responsiveness by changing window size
                driver.set_window_size(375, 812)  # iPhone X size
                self.take_screenshot(driver, f"{app_key}_mobile_view")
                
                # Test hover effects
                hover_elements = driver.find_elements(By.CLASS_NAME, 'hover-effect')
                for element in hover_elements:
                    # Simulate hover
                    hover = webdriver.ActionChains(driver).move_to_element(element)
                    hover.perform()
                    
                    # Take hover screenshot
                    self.take_screenshot(driver, f"{app_key}_hover_effect")
                
                # Check color scheme and professional look
                body = driver.find_element(By.TAG_NAME, 'body')
                background_color = body.value_of_css_property('background-color')
                assert background_color, f"No background color found in {app_key}"
            
            except Exception as e:
                self.app_issues[app_key].append(f"UI/UX test failed: {str(e)}")
                pytest.fail(f"UI/UX test failed for {app_key}: {str(e)}")
    
    def generate_comprehensive_report(self):
        """
        Generate a comprehensive test report
        
        Returns:
            dict: Detailed test report
        """
        report = {
            'timestamp': datetime.now().isoformat(),
            'apps': {}
        }
        
        for app_key, issues in self.app_issues.items():
            report['apps'][app_key] = {
                'total_issues': len(issues),
                'issues': issues,
                'status': 'PASS' if not issues else 'FAIL'
            }
        
        # Save report to file
        report_path = os.path.join(self.output_dir, 'comprehensive_test_report.json')
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        return report
    
    def test_comprehensive_screenshot_verification(self):
        """
        Run comprehensive tests to verify known screenshot issues
        """
        # Run all tests
        self.test_bulk_upload_functionality()
        self.test_dashboard_functionality()
        self.test_ui_ux_professional_appearance()
        
        # Generate final report
        report = self.generate_comprehensive_report()
        
        # Assert no critical issues
        for app, details in report['apps'].items():
            assert details['status'] == 'PASS', f"{app} has critical issues: {details['issues']}"

# Optional: Logging configuration if needed
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s: %(message)s',
    filename=os.path.join(os.path.dirname(__file__), 'screenshot_test.log')
)