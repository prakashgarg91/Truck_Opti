#!/usr/bin/env python3
"""
Comprehensive Test Suite for Sale Order Truck Selection Feature
Tests the updated carton-based processing, single truck optimization, and enhanced UI
"""

import time
import json
import requests
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SaleOrderTruckSelectionTester:
    def __init__(self, base_url="http://127.0.0.1:5001"):
        self.base_url = base_url
        self.driver = None
        self.test_results = {
            'upload_success': False,
            'orders_processed': 0,
            'expected_orders': 6,
            'truck_recommendations': [],
            'ui_improvements': {
                'single_truck_focus': False,
                'space_utilization_displayed': False,
                'perfect_fit_badges': False,
                'prominent_best_truck': False
            },
            'cost_optimization': {
                'single_truck_prioritized': False,
                'overflow_warnings': False,
                'space_efficiency_highlighted': False
            },
            'detailed_results': []
        }
        
    def setup_driver(self):
        """Setup Chrome driver for testing"""
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        
        try:
            self.driver = webdriver.Chrome(options=chrome_options)
            logger.info("Chrome driver initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Chrome driver: {e}")
            return False
    
    def test_server_accessibility(self):
        """Test if the Flask server is accessible"""
        try:
            response = requests.get(self.base_url, timeout=10)
            if response.status_code == 200:
                logger.info("Flask server is accessible")
                return True
            else:
                logger.error(f"Server returned status code: {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to connect to server: {e}")
            return False
    
    def navigate_to_sale_orders_page(self):
        """Navigate to the sale orders page"""
        try:
            logger.info("Navigating to sale orders page")
            self.driver.get(f"{self.base_url}/sale-orders")
            
            # Wait for page to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "h1"))
            )
            
            page_title = self.driver.find_element(By.TAG_NAME, "h1").text
            logger.info(f"Page loaded successfully: {page_title}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to navigate to sale orders page: {e}")
            return False
    
    def test_file_upload(self):
        """Test CSV file upload functionality"""
        try:
            logger.info("Testing CSV file upload")
            
            # Find file input element
            file_input = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='file']"))
            )
            
            # Upload the sample CSV file
            csv_path = "/workspaces/Truck_Opti/sample_sale_orders.csv"
            file_input.send_keys(csv_path)
            
            # Find and click upload button
            upload_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit'], input[type='submit']")
            upload_button.click()
            
            # Wait for processing to complete
            time.sleep(5)
            
            # Check for success indicators
            success_indicators = [
                "processed successfully",
                "upload successful", 
                "orders processed",
                "recommendations generated"
            ]
            
            page_source = self.driver.page_source.lower()
            upload_success = any(indicator in page_source for indicator in success_indicators)
            
            if upload_success:
                logger.info("File upload successful")
                self.test_results['upload_success'] = True
            else:
                logger.warning("Upload success unclear from page content")
            
            return upload_success
            
        except Exception as e:
            logger.error(f"File upload test failed: {e}")
            return False
    
    def analyze_truck_recommendations(self):
        """Analyze the quality and structure of truck recommendations"""
        try:
            logger.info("Analyzing truck recommendations")
            
            # Wait for results to appear
            time.sleep(3)
            
            # Look for sale order results
            order_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                ".sale-order-result, .order-result, .recommendation-card, .card")
            
            self.test_results['orders_processed'] = len(order_elements)
            logger.info(f"Found {len(order_elements)} order result elements")
            
            # Analyze each order's recommendations
            for i, order_element in enumerate(order_elements):
                try:
                    order_analysis = self.analyze_single_order_recommendation(order_element, i+1)
                    self.test_results['detailed_results'].append(order_analysis)
                except Exception as e:
                    logger.error(f"Failed to analyze order {i+1}: {e}")
            
            # Check UI improvements
            self.check_ui_improvements()
            
            # Check cost optimization features
            self.check_cost_optimization_features()
            
            return len(order_elements) > 0
            
        except Exception as e:
            logger.error(f"Failed to analyze truck recommendations: {e}")
            return False
    
    def analyze_single_order_recommendation(self, order_element, order_num):
        """Analyze a single order's truck recommendation"""
        order_analysis = {
            'order_number': f"Order {order_num}",
            'recommended_truck': None,
            'space_utilization': None,
            'is_single_truck': False,
            'has_perfect_fit': False,
            'has_overflow_warning': False,
            'cost_efficiency': None
        }
        
        try:
            # Extract order text content
            order_text = order_element.text
            
            # Look for truck recommendation
            truck_indicators = ["truck", "vehicle", "recommended", "optimal"]
            if any(indicator in order_text.lower() for indicator in truck_indicators):
                lines = order_text.split('\n')
                for line in lines:
                    if any(indicator in line.lower() for indicator in truck_indicators):
                        order_analysis['recommended_truck'] = line.strip()
                        break
            
            # Look for space utilization
            if '%' in order_text:
                import re
                percentages = re.findall(r'(\d+(?:\.\d+)?)\s*%', order_text)
                if percentages:
                    order_analysis['space_utilization'] = f"{percentages[0]}%"
            
            # Check for single truck solution
            single_truck_indicators = ["single truck", "one truck", "optimal single", "complete solution"]
            order_analysis['is_single_truck'] = any(indicator in order_text.lower() 
                                                  for indicator in single_truck_indicators)
            
            # Check for perfect fit badge
            perfect_fit_indicators = ["perfect fit", "complete fit", "exact fit", "100%"]
            order_analysis['has_perfect_fit'] = any(indicator in order_text.lower() 
                                                  for indicator in perfect_fit_indicators)
            
            # Check for overflow warnings
            overflow_indicators = ["overflow", "exceeds capacity", "additional truck", "incomplete"]
            order_analysis['has_overflow_warning'] = any(indicator in order_text.lower() 
                                                       for indicator in overflow_indicators)
            
            logger.info(f"Analyzed {order_analysis['order_number']}: "
                       f"Truck={order_analysis['recommended_truck']}, "
                       f"Utilization={order_analysis['space_utilization']}")
            
        except Exception as e:
            logger.error(f"Error analyzing order {order_num}: {e}")
        
        return order_analysis
    
    def check_ui_improvements(self):
        """Check for enhanced UI features"""
        try:
            page_source = self.driver.page_source.lower()
            
            # Check for single truck focus in UI
            single_truck_ui = ["optimal single truck", "single truck solution", "recommended truck"]
            self.test_results['ui_improvements']['single_truck_focus'] = any(
                phrase in page_source for phrase in single_truck_ui
            )
            
            # Check for space utilization display
            space_ui = ["space utilization", "utilization", "progress-bar", "percentage"]
            self.test_results['ui_improvements']['space_utilization_displayed'] = any(
                phrase in page_source for phrase in space_ui
            )
            
            # Check for perfect fit badges
            perfect_fit_ui = ["perfect fit", "badge", "complete solution", "optimal"]
            self.test_results['ui_improvements']['perfect_fit_badges'] = any(
                phrase in page_source for phrase in perfect_fit_ui
            )
            
            # Check for prominent best truck display
            prominent_ui = ["large card", "best truck", "recommended", "primary"]
            self.test_results['ui_improvements']['prominent_best_truck'] = any(
                phrase in page_source for phrase in prominent_ui
            )
            
            logger.info("UI improvements analysis completed")
            
        except Exception as e:
            logger.error(f"Failed to check UI improvements: {e}")
    
    def check_cost_optimization_features(self):
        """Check for cost optimization focus"""
        try:
            page_source = self.driver.page_source.lower()
            
            # Check for single truck prioritization
            priority_indicators = ["single truck", "cost efficient", "optimal", "prioritized"]
            self.test_results['cost_optimization']['single_truck_prioritized'] = any(
                phrase in page_source for phrase in priority_indicators
            )
            
            # Check for overflow warnings
            overflow_indicators = ["overflow", "warning", "additional truck needed", "exceeds"]
            self.test_results['cost_optimization']['overflow_warnings'] = any(
                phrase in page_source for phrase in overflow_indicators
            )
            
            # Check for space efficiency highlighting
            efficiency_indicators = ["space utilization", "efficiency", "cost savings", "optimized"]
            self.test_results['cost_optimization']['space_efficiency_highlighted'] = any(
                phrase in page_source for phrase in efficiency_indicators
            )
            
            logger.info("Cost optimization features analysis completed")
            
        except Exception as e:
            logger.error(f"Failed to check cost optimization features: {e}")
    
    def take_screenshot(self, filename):
        """Take a screenshot for debugging"""
        try:
            screenshot_path = f"/workspaces/Truck_Opti/test_screenshots_{filename}.png"
            self.driver.save_screenshot(screenshot_path)
            logger.info(f"Screenshot saved: {screenshot_path}")
        except Exception as e:
            logger.error(f"Failed to take screenshot: {e}")
    
    def run_comprehensive_test(self):
        """Run the complete test suite"""
        logger.info("Starting comprehensive Sale Order Truck Selection test")
        
        # Test 1: Server accessibility
        if not self.test_server_accessibility():
            logger.error("Server accessibility test failed")
            return self.test_results
        
        # Test 2: Setup browser
        if not self.setup_driver():
            logger.error("Browser setup failed")
            return self.test_results
        
        try:
            # Test 3: Navigate to sale orders page
            if not self.navigate_to_sale_orders_page():
                logger.error("Navigation test failed")
                return self.test_results
            
            # Take initial screenshot
            self.take_screenshot("initial_page")
            
            # Test 4: File upload
            if not self.test_file_upload():
                logger.error("File upload test failed")
                return self.test_results
            
            # Take post-upload screenshot
            self.take_screenshot("after_upload")
            
            # Test 5: Analyze recommendations
            if not self.analyze_truck_recommendations():
                logger.error("Recommendation analysis failed")
                return self.test_results
            
            # Take final screenshot
            self.take_screenshot("final_results")
            
            logger.info("All tests completed successfully")
            
        finally:
            if self.driver:
                self.driver.quit()
        
        return self.test_results
    
    def generate_report(self):
        """Generate a comprehensive test report"""
        results = self.test_results
        
        print("\n" + "="*80)
        print("SALE ORDER TRUCK SELECTION FEATURE TEST REPORT")
        print("="*80)
        
        # Upload Results
        print(f"\n📤 UPLOAD TEST:")
        print(f"   Upload Success: {'✅ PASS' if results['upload_success'] else '❌ FAIL'}")
        
        # Processing Results
        print(f"\n🔄 PROCESSING TEST:")
        print(f"   Orders Expected: {results['expected_orders']}")
        print(f"   Orders Processed: {results['orders_processed']}")
        processing_success = results['orders_processed'] == results['expected_orders']
        print(f"   Processing Status: {'✅ PASS' if processing_success else '❌ FAIL'}")
        
        # UI Improvements
        print(f"\n🎨 UI IMPROVEMENTS TEST:")
        ui = results['ui_improvements']
        for feature, status in ui.items():
            feature_name = feature.replace('_', ' ').title()
            print(f"   {feature_name}: {'✅ PASS' if status else '❌ FAIL'}")
        
        # Cost Optimization
        print(f"\n💰 COST OPTIMIZATION TEST:")
        cost = results['cost_optimization']
        for feature, status in cost.items():
            feature_name = feature.replace('_', ' ').title()
            print(f"   {feature_name}: {'✅ PASS' if status else '❌ FAIL'}")
        
        # Detailed Results
        print(f"\n📊 DETAILED ORDER ANALYSIS:")
        if results['detailed_results']:
            for order in results['detailed_results']:
                print(f"\n   {order['order_number']}:")
                print(f"     Recommended Truck: {order['recommended_truck'] or 'Not detected'}")
                print(f"     Space Utilization: {order['space_utilization'] or 'Not detected'}")
                print(f"     Single Truck Solution: {'✅' if order['is_single_truck'] else '❌'}")
                print(f"     Perfect Fit Badge: {'✅' if order['has_perfect_fit'] else '❌'}")
                print(f"     Overflow Warning: {'⚠️' if order['has_overflow_warning'] else 'None'}")
        else:
            print("   No detailed results available")
        
        # Overall Assessment
        print(f"\n🎯 OVERALL ASSESSMENT:")
        total_checks = sum([
            results['upload_success'],
            processing_success,
            sum(ui.values()),
            sum(cost.values())
        ])
        max_checks = 1 + 1 + len(ui) + len(cost)  # upload + processing + UI + cost features
        success_rate = (total_checks / max_checks) * 100
        
        print(f"   Success Rate: {success_rate:.1f}% ({total_checks}/{max_checks} checks passed)")
        
        if success_rate >= 80:
            print("   Status: 🟢 EXCELLENT - Feature working as expected")
        elif success_rate >= 60:
            print("   Status: 🟡 GOOD - Minor issues detected")
        else:
            print("   Status: 🔴 NEEDS ATTENTION - Multiple issues found")
        
        # Recommendations
        print(f"\n💡 RECOMMENDATIONS:")
        if not results['upload_success']:
            print("   • Fix file upload functionality")
        if results['orders_processed'] != results['expected_orders']:
            print("   • Verify CSV processing logic")
        if not ui['single_truck_focus']:
            print("   • Emphasize single truck solutions in UI")
        if not ui['space_utilization_displayed']:
            print("   • Add clear space utilization indicators")
        if not cost['single_truck_prioritized']:
            print("   • Ensure cost optimization prioritizes single trucks")
        
        print("\n" + "="*80)
        
        return results

def main():
    """Main test execution"""
    print("Starting Sale Order Truck Selection Feature Test...")
    
    tester = SaleOrderTruckSelectionTester()
    test_results = tester.run_comprehensive_test()
    
    # Generate and display report
    tester.generate_report()
    
    # Save results to JSON file
    results_file = "/workspaces/Truck_Opti/sale_order_test_results.json"
    with open(results_file, 'w') as f:
        json.dump(test_results, f, indent=2)
    print(f"\nDetailed results saved to: {results_file}")

if __name__ == "__main__":
    main()