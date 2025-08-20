"""
Comprehensive Executable Testing Framework
Tests ALL functionality in actual .exe environment to prevent claiming "success" when issues persist.
This addresses the user's core frustration with the disconnect between development and executable behavior.
"""

import subprocess
import time
import requests
import os
import sys
import json
import csv
import io
from pathlib import Path
import signal
import logging
from datetime import datetime

class ExecutableTester:
    def __init__(self, exe_path):
        self.exe_path = exe_path
        self.base_url = None
        self.process = None
        self.test_results = []
        
        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('executable_test_results.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    def start_executable(self):
        """Start the executable and wait for it to be ready"""
        try:
            self.logger.info(f"Starting executable: {self.exe_path}")
            
            # Start the executable process
            self.process = subprocess.Popen(
                [self.exe_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
            )
            
            # Wait for the server to start and find the port
            port_found = False
            for port in range(5000, 5010):
                time.sleep(2)  # Give it time to start
                try:
                    response = requests.get(f'http://127.0.0.1:{port}/api/health', timeout=5)
                    if response.status_code == 200:
                        self.base_url = f'http://127.0.0.1:{port}'
                        self.logger.info(f"Executable started successfully on port {port}")
                        port_found = True
                        break
                except requests.exceptions.RequestException:
                    continue
            
            if not port_found:
                raise Exception("Failed to connect to executable after 10 port attempts")
                
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to start executable: {e}")
            return False
    
    def stop_executable(self):
        """Stop the executable process"""
        if self.process:
            try:
                if sys.platform == 'win32':
                    self.process.terminate()
                else:
                    self.process.send_signal(signal.SIGTERM)
                
                self.process.wait(timeout=10)
                self.logger.info("Executable stopped successfully")
            except Exception as e:
                self.logger.error(f"Error stopping executable: {e}")
                if sys.platform == 'win32':
                    self.process.kill()
                else:
                    self.process.send_signal(signal.SIGKILL)
    
    def test_health_check(self):
        """Test basic health check endpoint"""
        try:
            response = requests.get(f'{self.base_url}/api/health', timeout=10)
            success = response.status_code == 200
            
            result = {
                'test': 'Health Check',
                'success': success,
                'response_code': response.status_code,
                'details': response.json() if success else str(response.text)
            }
            
            self.test_results.append(result)
            self.logger.info(f"Health Check: {'PASS' if success else 'FAIL'}")
            return success
            
        except Exception as e:
            result = {
                'test': 'Health Check',
                'success': False,
                'error': str(e)
            }
            self.test_results.append(result)
            self.logger.error(f"Health Check: FAIL - {e}")
            return False
    
    def test_main_pages(self):
        """Test main page loading"""
        pages_to_test = [
            ('/', 'Dashboard'),
            ('/recommend-truck', 'Truck Recommendations'),
            ('/truck-types', 'Truck Types'),
            ('/carton-types', 'Carton Types'),
            ('/analytics', 'Analytics')
        ]
        
        success_count = 0
        
        for url, name in pages_to_test:
            try:
                response = requests.get(f'{self.base_url}{url}', timeout=10)
                success = response.status_code == 200 and 'html' in response.headers.get('content-type', '')
                
                result = {
                    'test': f'Page Load - {name}',
                    'success': success,
                    'url': url,
                    'response_code': response.status_code,
                    'content_type': response.headers.get('content-type'),
                    'content_length': len(response.text)
                }
                
                self.test_results.append(result)
                self.logger.info(f"Page {name}: {'PASS' if success else 'FAIL'}")
                
                if success:
                    success_count += 1
                    
            except Exception as e:
                result = {
                    'test': f'Page Load - {name}',
                    'success': False,
                    'url': url,
                    'error': str(e)
                }
                self.test_results.append(result)
                self.logger.error(f"Page {name}: FAIL - {e}")
        
        return success_count == len(pages_to_test)
    
    def test_api_endpoints(self):
        """Test critical API endpoints"""
        api_tests = [
            ('/api/analytics', 'Analytics API'),
            ('/api/drill-down/trucks', 'Drill-down API'),
        ]
        
        success_count = 0
        
        for endpoint, name in api_tests:
            try:
                response = requests.get(f'{self.base_url}{endpoint}', timeout=10)
                success = response.status_code == 200
                
                # Try to parse JSON
                json_valid = False
                try:
                    json_data = response.json()
                    json_valid = True
                except:
                    pass
                
                result = {
                    'test': f'API - {name}',
                    'success': success and json_valid,
                    'endpoint': endpoint,
                    'response_code': response.status_code,
                    'json_valid': json_valid,
                    'response_size': len(response.text)
                }
                
                self.test_results.append(result)
                self.logger.info(f"API {name}: {'PASS' if success and json_valid else 'FAIL'}")
                
                if success and json_valid:
                    success_count += 1
                    
            except Exception as e:
                result = {
                    'test': f'API - {name}',
                    'success': False,
                    'endpoint': endpoint,
                    'error': str(e)
                }
                self.test_results.append(result)
                self.logger.error(f"API {name}: FAIL - {e}")
        
        return success_count == len(api_tests)
    
    def test_truck_recommendation(self):
        """Test the critical truck recommendation functionality"""
        try:
            # First, get available carton types
            response = requests.get(f'{self.base_url}/carton-types', timeout=10)
            if response.status_code != 200:
                raise Exception("Cannot access carton types page")
            
            # Test POST to recommendation endpoint
            form_data = {
                'carton_type_1': '1',  # Assume carton type ID 1 exists
                'carton_qty_1': '10',
                'optimization_goal': 'balanced'
            }
            
            response = requests.post(f'{self.base_url}/recommend-truck', data=form_data, timeout=30)
            
            # Should return HTML, not JSON
            success = (response.status_code == 200 and 
                      'html' in response.headers.get('content-type', '').lower())
            
            # Check for recommendation content
            has_recommendations = 'recommendation' in response.text.lower()
            
            result = {
                'test': 'Truck Recommendation Workflow',
                'success': success and has_recommendations,
                'response_code': response.status_code,
                'content_type': response.headers.get('content-type'),
                'has_recommendations': has_recommendations,
                'response_length': len(response.text)
            }
            
            self.test_results.append(result)
            self.logger.info(f"Truck Recommendation: {'PASS' if success and has_recommendations else 'FAIL'}")
            return success and has_recommendations
            
        except Exception as e:
            result = {
                'test': 'Truck Recommendation Workflow',
                'success': False,
                'error': str(e)
            }
            self.test_results.append(result)
            self.logger.error(f"Truck Recommendation: FAIL - {e}")
            return False
    
    def test_database_functionality(self):
        """Test database operations through the web interface"""
        try:
            # Test truck types data
            response = requests.get(f'{self.base_url}/api/drill-down/trucks', timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                has_truck_data = len(data.get('data', [])) > 0
            else:
                has_truck_data = False
            
            result = {
                'test': 'Database Functionality',
                'success': has_truck_data,
                'response_code': response.status_code,
                'truck_count': len(data.get('data', [])) if response.status_code == 200 else 0
            }
            
            self.test_results.append(result)
            self.logger.info(f"Database Functionality: {'PASS' if has_truck_data else 'FAIL'}")
            return has_truck_data
            
        except Exception as e:
            result = {
                'test': 'Database Functionality',
                'success': False,
                'error': str(e)
            }
            self.test_results.append(result)
            self.logger.error(f"Database Functionality: FAIL - {e}")
            return False
    
    def test_static_files(self):
        """Test that static files are accessible"""
        static_files = [
            '/static/js/recommend_truck.js',
            '/static/style.css',
            '/static/ui_enhancements.css'
        ]
        
        success_count = 0
        
        for static_file in static_files:
            try:
                response = requests.get(f'{self.base_url}{static_file}', timeout=10)
                success = response.status_code == 200 and len(response.text) > 0
                
                result = {
                    'test': f'Static File - {os.path.basename(static_file)}',
                    'success': success,
                    'url': static_file,
                    'response_code': response.status_code,
                    'file_size': len(response.text)
                }
                
                self.test_results.append(result)
                self.logger.info(f"Static {os.path.basename(static_file)}: {'PASS' if success else 'FAIL'}")
                
                if success:
                    success_count += 1
                    
            except Exception as e:
                result = {
                    'test': f'Static File - {os.path.basename(static_file)}',
                    'success': False,
                    'url': static_file,
                    'error': str(e)
                }
                self.test_results.append(result)
                self.logger.error(f"Static {os.path.basename(static_file)}: FAIL - {e}")
        
        return success_count == len(static_files)
    
    def run_all_tests(self):
        """Run comprehensive test suite"""
        self.logger.info("=" * 60)
        self.logger.info("COMPREHENSIVE EXECUTABLE TESTING FRAMEWORK")
        self.logger.info("Testing ALL functionality to ensure executable actually works")
        self.logger.info("=" * 60)
        
        if not self.start_executable():
            self.logger.error("CRITICAL: Cannot start executable - all tests failed")
            return False
        
        try:
            # Wait a bit more for full initialization
            time.sleep(5)
            
            test_functions = [
                ('Health Check', self.test_health_check),
                ('Main Pages', self.test_main_pages),
                ('API Endpoints', self.test_api_endpoints),
                ('Database Functionality', self.test_database_functionality),
                ('Static Files', self.test_static_files),
                ('Truck Recommendation', self.test_truck_recommendation)
            ]
            
            passed_tests = 0
            total_tests = len(test_functions)
            
            for test_name, test_function in test_functions:
                self.logger.info(f"\n--- Running {test_name} Test ---")
                success = test_function()
                if success:
                    passed_tests += 1
                    
                time.sleep(1)  # Brief pause between tests
            
            # Generate final report
            self.generate_final_report(passed_tests, total_tests)
            
            return passed_tests == total_tests
            
        finally:
            self.stop_executable()
    
    def generate_final_report(self, passed_tests, total_tests):
        """Generate comprehensive test report"""
        report = {
            'test_summary': {
                'total_tests': total_tests,
                'passed_tests': passed_tests,
                'failed_tests': total_tests - passed_tests,
                'success_rate': f"{(passed_tests/total_tests)*100:.1f}%",
                'timestamp': datetime.now().isoformat()
            },
            'test_results': self.test_results
        }
        
        # Save JSON report
        with open('executable_test_report.json', 'w') as f:
            json.dump(report, f, indent=2)
        
        # Generate human-readable report
        with open('executable_test_report.txt', 'w') as f:
            f.write("TRUCKOPTI EXECUTABLE COMPREHENSIVE TEST REPORT\n")
            f.write("=" * 50 + "\n\n")
            f.write(f"Test Execution Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Executable Path: {self.exe_path}\n")
            f.write(f"Base URL: {self.base_url}\n\n")
            f.write(f"SUMMARY:\n")
            f.write(f"Total Tests: {total_tests}\n")
            f.write(f"Passed: {passed_tests}\n") 
            f.write(f"Failed: {total_tests - passed_tests}\n")
            f.write(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%\n\n")
            
            f.write("DETAILED RESULTS:\n")
            f.write("-" * 30 + "\n")
            for result in self.test_results:
                status = "PASS" if result['success'] else "FAIL"
                f.write(f"{result['test']}: {status}\n")
                if not result['success'] and 'error' in result:
                    f.write(f"  Error: {result['error']}\n")
                f.write("\n")
        
        # Log final summary
        self.logger.info("\n" + "=" * 60)
        self.logger.info("FINAL TEST RESULTS")
        self.logger.info("=" * 60)
        self.logger.info(f"Tests Passed: {passed_tests}/{total_tests}")
        self.logger.info(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if passed_tests == total_tests:
            self.logger.info("🎉 ALL TESTS PASSED - Executable is fully functional!")
        else:
            self.logger.error("❌ SOME TESTS FAILED - Review issues before claiming success!")
        
        self.logger.info("Detailed reports saved:")
        self.logger.info("- executable_test_report.json")
        self.logger.info("- executable_test_report.txt")
        self.logger.info("- executable_test_results.log")

def main():
    """Main test execution"""
    # Look for executable files in common locations
    exe_locations = [
        'dist/TruckOpti_Enterprise_VERIFIED_v3.6.5.exe',
        'dist/TruckOpti_Enterprise_WORKING_v3.6.4.exe',
        'dist/TruckOpti_Enterprise_Fixed_v3.6.2.exe',
        'dist/TruckOpti_Enterprise_Complete_v3.6.3.exe',
        'dist/TruckOpti_Enterprise_Full_v3.6.0.exe',
        'dist/TruckOpti_Enterprise_v3.6.0.exe',
        'dist/TruckOpti_Working_Minimal.exe',
        'TruckOpti_Enterprise_VERIFIED_v3.6.5.exe',
        'TruckOpti_Enterprise_WORKING_v3.6.4.exe',
        'TruckOpti_Enterprise_Fixed_v3.6.2.exe',
        'TruckOpti_Enterprise_Complete_v3.6.3.exe',
        'TruckOpti_Enterprise_Full_v3.6.0.exe',
        'TruckOpti_Enterprise_v3.6.0.exe',
        'TruckOpti_Working_Minimal.exe'
    ]
    
    exe_path = None
    for location in exe_locations:
        if os.path.exists(location):
            exe_path = location
            break
    
    if not exe_path:
        print("ERROR: No executable found in common locations:")
        for loc in exe_locations:
            print(f"  - {loc}")
        print("\nPlease build the executable first or specify the correct path.")
        return False
    
    print(f"Found executable: {exe_path}")
    
    tester = ExecutableTester(exe_path)
    return tester.run_all_tests()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)