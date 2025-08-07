#!/usr/bin/env python3
"""
Comprehensive Truck Management Testing Suite for TruckOpti
Tests all truck management functionality including CRUD operations, API endpoints, and validation.
"""

import requests
import json
import time
from datetime import datetime
import sys

class TruckManagementTester:
    def __init__(self, base_url="http://127.0.0.1:5001"):
        self.base_url = base_url
        self.session = requests.Session()
        self.test_results = []
        self.test_truck_id = None

    def log_test(self, test_name, status, message="", details=None):
        """Log test results"""
        result = {
            'test': test_name,
            'status': status,
            'message': message,
            'timestamp': datetime.now().isoformat(),
            'details': details
        }
        self.test_results.append(result)
        print(f"[{status}] {test_name}: {message}")
        if details and status == 'FAIL':
            print(f"    Details: {details}")

    def test_truck_types_page_accessibility(self):
        """Test 1: Navigate to /truck-types page and check accessibility"""
        try:
            response = self.session.get(f"{self.base_url}/truck-types")
            if response.status_code == 200:
                content = response.text
                # Check for key elements
                if "Fleet Management" in content and "trucksTable" in content:
                    self.log_test("Truck Types Page Access", "PASS", "Page loads successfully with correct content")
                    return True
                else:
                    self.log_test("Truck Types Page Access", "FAIL", "Page missing key elements")
                    return False
            else:
                self.log_test("Truck Types Page Access", "FAIL", f"HTTP {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Truck Types Page Access", "FAIL", f"Exception: {str(e)}")
            return False

    def test_truck_listing_api(self):
        """Test 2: Test the truck type listing/viewing functionality via API"""
        try:
            response = self.session.get(f"{self.base_url}/api/truck-types")
            if response.status_code == 200:
                trucks = response.json()
                if isinstance(trucks, list) and len(trucks) > 0:
                    # Verify truck data structure
                    truck = trucks[0]
                    required_fields = ['id', 'name', 'length', 'width', 'height']
                    missing_fields = [field for field in required_fields if field not in truck]
                    
                    if not missing_fields:
                        self.log_test("Truck Listing API", "PASS", f"Retrieved {len(trucks)} trucks with correct structure")
                        return trucks
                    else:
                        self.log_test("Truck Listing API", "FAIL", f"Missing fields: {missing_fields}")
                        return None
                else:
                    self.log_test("Truck Listing API", "FAIL", "No trucks returned or invalid format")
                    return None
            else:
                self.log_test("Truck Listing API", "FAIL", f"HTTP {response.status_code}")
                return None
        except Exception as e:
            self.log_test("Truck Listing API", "FAIL", f"Exception: {str(e)}")
            return None

    def test_add_new_truck_type_valid(self):
        """Test 3: Test adding a new truck type with valid data"""
        test_truck = {
            "name": f"Test Truck {int(time.time())}",
            "length": 500,
            "width": 200,
            "height": 200,
            "max_weight": 10000,
            "cost_per_km": 15.5,
            "fuel_efficiency": 8.5,
            "driver_cost_per_day": 1000,
            "maintenance_cost_per_km": 2.5,
            "truck_category": "Medium",
            "availability": True,
            "description": "Test truck for automated testing"
        }
        
        try:
            # Test via API
            response = self.session.post(
                f"{self.base_url}/api/truck-types",
                json=test_truck,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 201:
                result = response.json()
                if 'id' in result:
                    self.test_truck_id = result['id']
                    self.log_test("Add Truck Type (Valid)", "PASS", f"Created truck with ID {self.test_truck_id}")
                    return True
                else:
                    self.log_test("Add Truck Type (Valid)", "FAIL", "No ID returned in response")
                    return False
            else:
                self.log_test("Add Truck Type (Valid)", "FAIL", f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Add Truck Type (Valid)", "FAIL", f"Exception: {str(e)}")
            return False

    def test_add_truck_type_form_validation(self):
        """Test 6: Test form validation with invalid inputs"""
        invalid_tests = [
            {
                "name": "Invalid Length Test",
                "data": {"name": "Test", "length": -100, "width": 200, "height": 200},
                "expected_error": "negative dimensions"
            },
            {
                "name": "Missing Name Test",
                "data": {"length": 100, "width": 200, "height": 200},
                "expected_error": "missing name"
            },
            {
                "name": "Invalid Weight Test",
                "data": {"name": "Test", "length": 100, "width": 200, "height": 200, "max_weight": -500},
                "expected_error": "negative weight"
            }
        ]

        passed_tests = 0
        for test in invalid_tests:
            try:
                response = self.session.post(
                    f"{self.base_url}/api/truck-types",
                    json=test["data"],
                    headers={'Content-Type': 'application/json'}
                )
                
                if response.status_code == 400 or response.status_code == 422:
                    passed_tests += 1
                    self.log_test(f"Form Validation - {test['name']}", "PASS", "Correctly rejected invalid data")
                else:
                    self.log_test(f"Form Validation - {test['name']}", "FAIL", f"Expected error but got HTTP {response.status_code}")
            except Exception as e:
                self.log_test(f"Form Validation - {test['name']}", "FAIL", f"Exception: {str(e)}")

        if passed_tests >= len(invalid_tests) // 2:  # At least half should pass
            return True
        return False

    def test_edit_truck_type(self):
        """Test 4: Test editing an existing truck type"""
        if not self.test_truck_id:
            self.log_test("Edit Truck Type", "SKIP", "No test truck available")
            return False

        updated_data = {
            "name": f"Updated Test Truck {int(time.time())}",
            "length": 550,
            "width": 220,
            "height": 220,
            "max_weight": 12000,
            "truck_category": "Heavy"
        }

        try:
            response = self.session.put(
                f"{self.base_url}/api/truck-types/{self.test_truck_id}",
                json=updated_data,
                headers={'Content-Type': 'application/json'}
            )

            if response.status_code == 200:
                # Verify the update
                get_response = self.session.get(f"{self.base_url}/api/truck-types/{self.test_truck_id}")
                if get_response.status_code == 200:
                    truck = get_response.json()
                    if truck.get('name') == updated_data['name'] and truck.get('length') == updated_data['length']:
                        self.log_test("Edit Truck Type", "PASS", "Truck updated successfully")
                        return True
                    else:
                        self.log_test("Edit Truck Type", "FAIL", "Update not reflected in data")
                        return False
                else:
                    self.log_test("Edit Truck Type", "FAIL", "Could not verify update")
                    return False
            else:
                self.log_test("Edit Truck Type", "FAIL", f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Edit Truck Type", "FAIL", f"Exception: {str(e)}")
            return False

    def test_delete_truck_type(self):
        """Test 5: Test deleting a truck type"""
        if not self.test_truck_id:
            self.log_test("Delete Truck Type", "SKIP", "No test truck available")
            return False

        try:
            response = self.session.delete(f"{self.base_url}/api/truck-types/{self.test_truck_id}")
            
            if response.status_code == 200:
                # Verify deletion
                get_response = self.session.get(f"{self.base_url}/api/truck-types/{self.test_truck_id}")
                if get_response.status_code == 404:
                    self.log_test("Delete Truck Type", "PASS", "Truck deleted successfully")
                    self.test_truck_id = None
                    return True
                else:
                    self.log_test("Delete Truck Type", "FAIL", "Truck still exists after deletion")
                    return False
            else:
                self.log_test("Delete Truck Type", "FAIL", f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Delete Truck Type", "FAIL", f"Exception: {str(e)}")
            return False

    def test_datatable_functionality(self):
        """Test 7: Test DataTables functionality (sorting, filtering, pagination)"""
        try:
            response = self.session.get(f"{self.base_url}/truck-types")
            if response.status_code == 200:
                content = response.text
                datatable_features = [
                    ("DataTable initialization", "trucksTable" in content and "DataTable" in content),
                    ("Export buttons", "extend: 'copy'" in content),
                    ("Sorting", "order: [[0, 'asc']]" in content),
                    ("Search", '"search"' in content),
                    ("Pagination", '"paginate"' in content)
                ]
                
                passed = sum(1 for feature, check in datatable_features if check)
                total = len(datatable_features)
                
                if passed >= total * 0.8:  # 80% of features should be present
                    self.log_test("DataTable Functionality", "PASS", f"Found {passed}/{total} DataTable features")
                    return True
                else:
                    self.log_test("DataTable Functionality", "FAIL", f"Only found {passed}/{total} DataTable features")
                    return False
            else:
                self.log_test("DataTable Functionality", "FAIL", f"Could not load page: HTTP {response.status_code}")
                return False
        except Exception as e:
            self.log_test("DataTable Functionality", "FAIL", f"Exception: {str(e)}")
            return False

    def test_javascript_errors(self):
        """Test 8: Check for JavaScript errors during truck operations"""
        # Since we can't directly check for JS errors, we'll test if JS-dependent features work
        try:
            # Test if the API endpoints that would be called by JS work
            api_endpoints = [
                "/api/truck-types",
                "/api/analytics",
                "/api/performance-metrics"
            ]
            
            errors = []
            for endpoint in api_endpoints:
                response = self.session.get(f"{self.base_url}{endpoint}")
                if response.status_code >= 400:
                    errors.append(f"{endpoint}: HTTP {response.status_code}")
            
            if not errors:
                self.log_test("JavaScript API Support", "PASS", "All JS-dependent API endpoints working")
                return True
            else:
                self.log_test("JavaScript API Support", "FAIL", f"Errors: {', '.join(errors)}")
                return False
        except Exception as e:
            self.log_test("JavaScript API Support", "FAIL", f"Exception: {str(e)}")
            return False

    def test_export_functionality(self):
        """Test 9: Test the export functionality if available"""
        try:
            # Test different export formats through the truck types page
            response = self.session.get(f"{self.base_url}/truck-types")
            if response.status_code == 200:
                content = response.text
                export_formats = ["copy", "csv", "excel", "pdf", "print"]
                found_formats = [fmt for fmt in export_formats if f"extend: '{fmt}'" in content]
                
                if len(found_formats) >= 3:  # At least 3 export formats should be available
                    self.log_test("Export Functionality", "PASS", f"Found export formats: {', '.join(found_formats)}")
                    return True
                else:
                    self.log_test("Export Functionality", "FAIL", f"Limited export formats: {', '.join(found_formats)}")
                    return False
            else:
                self.log_test("Export Functionality", "FAIL", f"Could not access page: HTTP {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Export Functionality", "FAIL", f"Exception: {str(e)}")
            return False

    def test_ui_responsiveness(self):
        """Test 10: Verify the UI responsiveness during truck management operations"""
        try:
            # Test multiple concurrent requests to simulate UI interactions
            import concurrent.futures
            
            def make_request():
                return self.session.get(f"{self.base_url}/api/truck-types")
            
            start_time = time.time()
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(make_request) for _ in range(10)]
                responses = [future.result() for future in futures]
            
            end_time = time.time()
            total_time = end_time - start_time
            
            successful_requests = sum(1 for r in responses if r.status_code == 200)
            
            if successful_requests >= 8 and total_time < 5:  # At least 80% success in under 5 seconds
                self.log_test("UI Responsiveness", "PASS", f"{successful_requests}/10 requests successful in {total_time:.2f}s")
                return True
            else:
                self.log_test("UI Responsiveness", "FAIL", f"Only {successful_requests}/10 requests successful in {total_time:.2f}s")
                return False
        except Exception as e:
            self.log_test("UI Responsiveness", "FAIL", f"Exception: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all truck management tests"""
        print("="*80)
        print("TRUCKOPTI - COMPREHENSIVE TRUCK MANAGEMENT TEST SUITE")
        print("="*80)
        print(f"Testing against: {self.base_url}")
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("-"*80)

        tests = [
            ("Page Accessibility", self.test_truck_types_page_accessibility),
            ("Truck Listing API", self.test_truck_listing_api),
            ("Add Valid Truck", self.test_add_new_truck_type_valid),
            ("Edit Truck", self.test_edit_truck_type),
            ("Delete Truck", self.test_delete_truck_type),
            ("Form Validation", self.test_add_truck_type_form_validation),
            ("DataTable Features", self.test_datatable_functionality),
            ("JavaScript Support", self.test_javascript_errors),
            ("Export Features", self.test_export_functionality),
            ("UI Responsiveness", self.test_ui_responsiveness)
        ]

        passed = 0
        failed = 0
        skipped = 0

        for test_name, test_func in tests:
            try:
                result = test_func()
                if result is True:
                    passed += 1
                elif result is False:
                    failed += 1
                else:
                    skipped += 1
                time.sleep(0.5)  # Brief pause between tests
            except Exception as e:
                self.log_test(test_name, "ERROR", f"Test execution failed: {str(e)}")
                failed += 1

        print("-"*80)
        print("SUMMARY REPORT")
        print("-"*80)
        print(f"Total Tests: {len(tests)}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Skipped: {skipped}")
        print(f"Success Rate: {(passed/(len(tests)-skipped)*100):.1f}%" if (len(tests)-skipped) > 0 else "N/A")
        
        print("\nDETAILED FINDINGS:")
        print("-"*40)
        
        # Analyze current truck inventory
        trucks = self.test_truck_listing_api()
        if trucks:
            print(f"\nCURRENT TRUCK INVENTORY ({len(trucks)} trucks):")
            print("-"*40)
            categories = {}
            for truck in trucks:
                cat = truck.get('truck_category', 'Unknown')
                if cat not in categories:
                    categories[cat] = []
                categories[cat].append(truck)
            
            for category, truck_list in categories.items():
                print(f"{category}: {len(truck_list)} trucks")
                for truck in truck_list[:3]:  # Show first 3 in each category
                    print(f"  - {truck['name']}: {truck['length']}x{truck['width']}x{truck['height']}cm")
                if len(truck_list) > 3:
                    print(f"  ... and {len(truck_list)-3} more")

        print("\nRECOMMENDations:")
        print("-"*40)
        if failed == 0:
            print("✓ All truck management functionality is working properly")
            print("✓ System is ready for production use")
        else:
            print("⚠ Some issues were found:")
            for result in self.test_results:
                if result['status'] == 'FAIL':
                    print(f"  - {result['test']}: {result['message']}")

        print("-"*80)
        return passed, failed, skipped

def main():
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
    else:
        base_url = "http://127.0.0.1:5001"
    
    tester = TruckManagementTester(base_url)
    passed, failed, skipped = tester.run_all_tests()
    
    # Save detailed results to file
    with open('truck_management_test_results.json', 'w') as f:
        json.dump({
            'summary': {'passed': passed, 'failed': failed, 'skipped': skipped},
            'results': tester.test_results
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: truck_management_test_results.json")
    
    # Exit with non-zero code if tests failed
    sys.exit(1 if failed > 0 else 0)

if __name__ == "__main__":
    main()