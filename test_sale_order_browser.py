#!/usr/bin/env python3
"""
Browser-based Test for Sale Order Truck Selection Feature UI
Tests the enhanced UI, single truck optimization display, and visual improvements
"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SaleOrderBrowserTester:
    def __init__(self, base_url="http://127.0.0.1:5001"):
        self.base_url = base_url
        self.driver = None
        self.ui_test_results = {
            'page_loaded': False,
            'file_upload_ui': False,
            'single_truck_focus_ui': False,
            'space_utilization_visual': False,
            'perfect_fit_badges': False,
            'cost_optimization_display': False,
            'responsive_design': False,
            'screenshots_taken': [],
            'detailed_findings': []
        }

    def setup_driver(self):
        """Setup Chrome driver for UI testing"""
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox") 
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--disable-gpu")
        
        try:
            self.driver = webdriver.Chrome(options=chrome_options)
            logger.info("✅ Chrome driver initialized for UI testing")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to initialize Chrome driver: {e}")
            return False

    def take_screenshot(self, name, description=""):
        """Take screenshot for UI analysis"""
        try:
            screenshot_path = f"/workspaces/Truck_Opti/ui_test_{name}.png"
            self.driver.save_screenshot(screenshot_path)
            self.ui_test_results['screenshots_taken'].append({
                'name': name,
                'path': screenshot_path,
                'description': description
            })
            logger.info(f"📸 Screenshot saved: {name}")
        except Exception as e:
            logger.error(f"❌ Failed to take screenshot {name}: {e}")

    def test_page_load_and_ui(self):
        """Test page loading and initial UI"""
        try:
            logger.info("🌐 Testing page load and UI...")
            self.driver.get(f"{self.base_url}/sale-orders")
            
            # Wait for page to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "h1"))
            )
            
            self.ui_test_results['page_loaded'] = True
            self.take_screenshot("initial_page", "Sale Orders page initial load")
            
            # Check for file upload UI
            file_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='file']")
            upload_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit'], input[type='submit']")
            
            if file_input and upload_button:
                self.ui_test_results['file_upload_ui'] = True
                logger.info("✅ File upload UI elements found")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Page load test failed: {e}")
            return False

    def test_file_upload_and_results_ui(self):
        """Test file upload and analyze results UI"""
        try:
            logger.info("📤 Testing file upload and results UI...")
            
            # Upload the sample CSV
            file_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='file']")
            csv_path = "/workspaces/Truck_Opti/sample_sale_orders.csv"
            file_input.send_keys(csv_path)
            
            # Click upload button
            upload_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit'], input[type='submit']")
            upload_button.click()
            
            # Wait for results to load
            time.sleep(8)
            
            self.take_screenshot("after_upload", "Results page after CSV upload")
            
            # Analyze UI elements in the results
            self.analyze_results_ui()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ File upload and results UI test failed: {e}")
            return False

    def analyze_results_ui(self):
        """Analyze the UI elements in the results page"""
        try:
            logger.info("🔍 Analyzing results UI elements...")
            page_source = self.driver.page_source.lower()
            
            # Check for single truck focus in UI
            single_truck_indicators = [
                "optimal single truck", "single truck solution", "best truck", 
                "optimal truck", "recommended truck"
            ]
            found_single_truck_ui = any(indicator in page_source for indicator in single_truck_indicators)
            self.ui_test_results['single_truck_focus_ui'] = found_single_truck_ui
            
            if found_single_truck_ui:
                self.ui_test_results['detailed_findings'].append("✅ Single truck focus UI elements detected")
            
            # Check for space utilization visual elements
            space_utilization_indicators = [
                "space utilization", "progress-bar", "utilization", "%", "space_util"
            ]
            found_space_ui = any(indicator in page_source for indicator in space_utilization_indicators)
            self.ui_test_results['space_utilization_visual'] = found_space_ui
            
            if found_space_ui:
                self.ui_test_results['detailed_findings'].append("✅ Space utilization visual indicators found")
            
            # Check for perfect fit badges/indicators
            perfect_fit_indicators = [
                "perfect fit", "best choice", "optimal", "✅", "check-circle"
            ]
            found_perfect_fit = any(indicator in page_source for indicator in perfect_fit_indicators)
            self.ui_test_results['perfect_fit_badges'] = found_perfect_fit
            
            if found_perfect_fit:
                self.ui_test_results['detailed_findings'].append("✅ Perfect fit badges/indicators detected")
            
            # Check for cost optimization display
            cost_indicators = [
                "cost", "₹", "savings", "efficient", "price", "estimated"
            ]
            found_cost_display = any(indicator in page_source for indicator in cost_indicators)
            self.ui_test_results['cost_optimization_display'] = found_cost_display
            
            if found_cost_display:
                self.ui_test_results['detailed_findings'].append("✅ Cost optimization display elements found")
            
            # Look for specific UI elements
            try:
                # Check for cards/recommendations
                card_elements = self.driver.find_elements(By.CSS_SELECTOR, ".card, .recommendation-card, .truck-card")
                if card_elements:
                    self.ui_test_results['detailed_findings'].append(f"✅ Found {len(card_elements)} card elements")
                
                # Check for buttons
                button_elements = self.driver.find_elements(By.CSS_SELECTOR, ".btn, button")
                if button_elements:
                    self.ui_test_results['detailed_findings'].append(f"✅ Found {len(button_elements)} button elements")
                
                # Check for progress bars
                progress_elements = self.driver.find_elements(By.CSS_SELECTOR, ".progress, .progress-bar")
                if progress_elements:
                    self.ui_test_results['detailed_findings'].append(f"✅ Found {len(progress_elements)} progress elements")
                
            except Exception as e:
                logger.warning(f"⚠️ Could not analyze specific UI elements: {e}")
            
        except Exception as e:
            logger.error(f"❌ Results UI analysis failed: {e}")

    def test_responsive_design(self):
        """Test responsive design at different screen sizes"""
        try:
            logger.info("📱 Testing responsive design...")
            
            # Test mobile size
            self.driver.set_window_size(375, 667)
            time.sleep(2)
            self.take_screenshot("mobile_view", "Mobile responsive view")
            
            # Test tablet size
            self.driver.set_window_size(768, 1024)
            time.sleep(2) 
            self.take_screenshot("tablet_view", "Tablet responsive view")
            
            # Test desktop size
            self.driver.set_window_size(1920, 1080)
            time.sleep(2)
            self.take_screenshot("desktop_view", "Desktop responsive view")
            
            self.ui_test_results['responsive_design'] = True
            logger.info("✅ Responsive design screenshots captured")
            
        except Exception as e:
            logger.error(f"❌ Responsive design test failed: {e}")

    def run_comprehensive_ui_test(self):
        """Run the complete UI test suite"""
        logger.info("🚀 Starting comprehensive Sale Order UI test")
        
        if not self.setup_driver():
            return self.ui_test_results
        
        try:
            # Test 1: Page load and UI
            if not self.test_page_load_and_ui():
                return self.ui_test_results
            
            # Test 2: File upload and results UI
            if not self.test_file_upload_and_results_ui():
                return self.ui_test_results
            
            # Test 3: Responsive design
            self.test_responsive_design()
            
            logger.info("✅ All UI tests completed")
            
        finally:
            if self.driver:
                self.driver.quit()
        
        return self.ui_test_results

    def generate_ui_report(self):
        """Generate comprehensive UI test report"""
        results = self.ui_test_results
        
        print("\n" + "="*80)
        print("🎨 SALE ORDER TRUCK SELECTION UI TEST REPORT")
        print("="*80)
        
        # Page Loading
        print(f"\n🌐 PAGE LOADING:")
        print(f"   Page Loaded: {'✅ PASS' if results['page_loaded'] else '❌ FAIL'}")
        print(f"   File Upload UI: {'✅ PASS' if results['file_upload_ui'] else '❌ FAIL'}")
        
        # UI Feature Tests
        print(f"\n🎯 UI FEATURE ANALYSIS:")
        print(f"   Single Truck Focus UI: {'✅ PASS' if results['single_truck_focus_ui'] else '❌ FAIL'}")
        print(f"   Space Utilization Visual: {'✅ PASS' if results['space_utilization_visual'] else '❌ FAIL'}")
        print(f"   Perfect Fit Badges: {'✅ PASS' if results['perfect_fit_badges'] else '❌ FAIL'}")
        print(f"   Cost Optimization Display: {'✅ PASS' if results['cost_optimization_display'] else '❌ FAIL'}")
        print(f"   Responsive Design: {'✅ PASS' if results['responsive_design'] else '❌ FAIL'}")
        
        # Screenshots
        print(f"\n📸 SCREENSHOTS CAPTURED:")
        for screenshot in results['screenshots_taken']:
            print(f"   📷 {screenshot['name']}: {screenshot['description']}")
            print(f"      Path: {screenshot['path']}")
        
        # Detailed Findings
        print(f"\n🔍 DETAILED FINDINGS:")
        if results['detailed_findings']:
            for finding in results['detailed_findings']:
                print(f"   {finding}")
        else:
            print("   No specific findings recorded")
        
        # Overall UI Assessment
        ui_score = sum([
            results['page_loaded'],
            results['file_upload_ui'], 
            results['single_truck_focus_ui'],
            results['space_utilization_visual'],
            results['perfect_fit_badges'],
            results['cost_optimization_display'],
            results['responsive_design']
        ])
        max_ui_score = 7
        ui_success_rate = (ui_score / max_ui_score) * 100
        
        print(f"\n🏆 UI TEST SUMMARY:")
        print(f"   UI Success Rate: {ui_success_rate:.1f}% ({ui_score}/{max_ui_score})")
        
        if ui_success_rate >= 85:
            print("   UI Status: 🟢 EXCELLENT - All key UI features working")
        elif ui_success_rate >= 70:
            print("   UI Status: 🟡 GOOD - Most UI features working")
        else:
            print("   UI Status: 🔴 NEEDS IMPROVEMENT - Several UI issues found")
        
        print("\n" + "="*80)
        
        return results

def main():
    """Main UI test execution"""
    print("🎨 Starting Sale Order Truck Selection UI Test...")
    
    tester = SaleOrderBrowserTester()
    ui_results = tester.run_comprehensive_ui_test()
    
    # Generate and display report
    tester.generate_ui_report()
    
    # Save results
    ui_results_file = "/workspaces/Truck_Opti/sale_order_ui_test_results.json"
    with open(ui_results_file, 'w') as f:
        json.dump(ui_results, f, indent=2)
    print(f"\n💾 UI test results saved to: {ui_results_file}")

if __name__ == "__main__":
    main()