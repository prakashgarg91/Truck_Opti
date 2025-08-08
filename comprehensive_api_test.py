#!/usr/bin/env python3
"""
TruckOpti Comprehensive API and Feature Testing Script

This script systematically tests all features of the TruckOpti application
using direct HTTP requests and API calls.
"""

import requests
import time
import json
from datetime import datetime
import csv
import io

BASE_URL = "http://127.0.0.1:5000"

class TruckOptiTester:
    def __init__(self):
        self.session = requests.Session()
        self.results = {
            'homepage': {},
            'truck_management': {},
            'carton_management': {},
            'optimization': {},
            'analytics': {},
            'api_tests': {},
            'performance': {},
            'issues': []
        }
        self.test_data = {
            'trucks_created': [],
            'cartons_created': [],
            'jobs_created': []
        }
    
    def log(self, message, test_type="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {test_type}: {message}")
    
    def test_endpoint(self, endpoint, method="GET", data=None, expected_status=200):
        """Test a single endpoint and return response details"""
        try:
            start_time = time.time()
            
            if method == "GET":
                response = self.session.get(f"{BASE_URL}{endpoint}")
            elif method == "POST":
                response = self.session.post(f"{BASE_URL}{endpoint}", data=data)
            elif method == "PUT":
                response = self.session.put(f"{BASE_URL}{endpoint}", data=data)
            elif method == "DELETE":
                response = self.session.delete(f"{BASE_URL}{endpoint}")
            
            end_time = time.time()
            response_time = (end_time - start_time) * 1000  # in ms
            
            result = {
                'status_code': response.status_code,
                'response_time_ms': round(response_time, 2),
                'content_length': len(response.content),
                'success': response.status_code == expected_status,
                'url': f"{BASE_URL}{endpoint}"
            }
            
            if response.headers.get('content-type', '').startswith('application/json'):
                try:
                    result['json_data'] = response.json()
                except:
                    result['json_data'] = None
            
            return result, response
            
        except Exception as e:
            self.results['issues'].append(f"Error testing {endpoint}: {str(e)}")
            return {'success': False, 'error': str(e)}, None

    def test_homepage_and_dashboard(self):
        """Test 1: Homepage and Dashboard functionality"""
        self.log("=== TESTING HOMEPAGE AND DASHBOARD ===", "TEST")
        
        # Test main dashboard
        result, response = self.test_endpoint("/")
        self.results['homepage']['dashboard'] = result
        
        if result['success']:
            content = response.text
            # Check for key dashboard elements
            dashboard_elements = {
                'has_title': 'TruckOpti' in content,
                'has_navigation': 'nav-link' in content or 'sidebar' in content,
                'has_kpi_cards': 'Total Trucks' in content,
                'has_charts': 'Chart' in content or 'canvas' in content,
                'has_bootstrap': 'bootstrap' in content,
                'has_quick_actions': 'Quick Actions' in content,
                'responsive_meta': 'viewport' in content
            }
            self.results['homepage']['elements'] = dashboard_elements
            
            self.log(f"✅ Homepage loaded successfully in {result['response_time_ms']}ms")
            self.log(f"📊 Dashboard elements: {sum(dashboard_elements.values())}/7 found")
        else:
            self.log("❌ Homepage failed to load", "ERROR")
        
        # Test static assets
        static_assets = ['/static/style.css', '/static/main.js']
        for asset in static_assets:
            asset_result, _ = self.test_endpoint(asset)
            self.results['homepage'][f'asset_{asset.split("/")[-1]}'] = asset_result
            if asset_result['success']:
                self.log(f"✅ Static asset {asset} loaded")
            else:
                self.log(f"❌ Static asset {asset} failed", "ERROR")

    def test_truck_management(self):
        """Test 2: Truck Management functionality"""
        self.log("=== TESTING TRUCK MANAGEMENT ===", "TEST")
        
        # Test truck listing
        result, response = self.test_endpoint("/truck-types")
        self.results['truck_management']['listing'] = result
        
        if result['success']:
            content = response.text
            # Count existing trucks
            truck_count = content.count('<tr>') - 1 if '<tr>' in content else 0  # -1 for header
            self.results['truck_management']['existing_trucks'] = truck_count
            self.log(f"✅ Truck listing page loaded, found ~{truck_count} trucks")
        
        # Test add truck form
        add_form_result, _ = self.test_endpoint("/add-truck-type")
        self.results['truck_management']['add_form'] = add_form_result
        
        # Test creating a new truck
        test_truck_data = {
            'name': 'Test Truck API',
            'length': '10',
            'width': '6', 
            'height': '8',
            'max_weight': '15000',
            'cost_per_km': '25.50'
        }
        
        create_result, create_response = self.test_endpoint("/add-truck-type", "POST", test_truck_data, 302)
        self.results['truck_management']['create'] = create_result
        
        if create_result['success']:
            self.log("✅ Truck creation successful")
            self.test_data['trucks_created'].append(test_truck_data['name'])
        else:
            self.log("❌ Truck creation failed", "ERROR")

    def test_carton_management(self):
        """Test 3: Carton Management functionality"""
        self.log("=== TESTING CARTON MANAGEMENT ===", "TEST")
        
        # Test carton listing
        result, response = self.test_endpoint("/carton-types")
        self.results['carton_management']['listing'] = result
        
        if result['success']:
            content = response.text
            carton_count = content.count('<tr>') - 1 if '<tr>' in content else 0
            self.results['carton_management']['existing_cartons'] = carton_count
            self.log(f"✅ Carton listing page loaded, found ~{carton_count} cartons")
        
        # Test add carton form
        add_form_result, _ = self.test_endpoint("/add-carton-type")
        self.results['carton_management']['add_form'] = add_form_result
        
        # Test creating a new carton
        test_carton_data = {
            'name': 'Test Carton API',
            'length': '30',
            'width': '20',
            'height': '15',
            'weight': '5'
        }
        
        create_result, create_response = self.test_endpoint("/add-carton-type", "POST", test_carton_data, 302)
        self.results['carton_management']['create'] = create_result
        
        if create_result['success']:
            self.log("✅ Carton creation successful")
            self.test_data['cartons_created'].append(test_carton_data['name'])

    def test_optimization_features(self):
        """Test 4: 3D Bin Packing and Optimization"""
        self.log("=== TESTING OPTIMIZATION FEATURES ===", "TEST")
        
        # Test truck recommendation page
        recommend_result, _ = self.test_endpoint("/recommend-truck")
        self.results['optimization']['recommend_page'] = recommend_result
        
        # Test fit cartons page  
        fit_result, _ = self.test_endpoint("/fit-cartons")
        self.results['optimization']['fit_page'] = fit_result
        
        # Test fleet optimization page
        fleet_result, _ = self.test_endpoint("/fleet-optimization")
        self.results['optimization']['fleet_page'] = fleet_result
        
        # Test calculator page
        calc_result, _ = self.test_endpoint("/calculate-truck-requirements")
        self.results['optimization']['calculator_page'] = calc_result
        
        successful_pages = sum(1 for r in [recommend_result, fit_result, fleet_result, calc_result] if r['success'])
        self.log(f"✅ Optimization pages: {successful_pages}/4 loaded successfully")

    def test_analytics_dashboard(self):
        """Test 5: Analytics Dashboard"""
        self.log("=== TESTING ANALYTICS DASHBOARD ===", "TEST")
        
        result, response = self.test_endpoint("/analytics")
        self.results['analytics']['main_page'] = result
        
        if result['success']:
            content = response.text
            analytics_features = {
                'has_charts': 'chart' in content.lower() or 'Chart' in content,
                'has_kpis': 'kpi' in content.lower() or 'metric' in content.lower(),
                'has_export': 'export' in content.lower(),
                'has_tables': '<table' in content
            }
            self.results['analytics']['features'] = analytics_features
            self.log(f"✅ Analytics dashboard loaded with {sum(analytics_features.values())}/4 features")
        else:
            self.log("❌ Analytics dashboard failed to load", "ERROR")

    def test_batch_processing(self):
        """Test 6: CSV Import/Export and Batch Processing"""
        self.log("=== TESTING BATCH PROCESSING ===", "TEST")
        
        result, response = self.test_endpoint("/batch-processing")
        self.results['batch_processing'] = {'main_page': result}
        
        if result['success']:
            content = response.text
            batch_features = {
                'has_upload_form': 'file' in content and 'upload' in content.lower(),
                'has_csv_support': 'csv' in content.lower(),
                'has_export_options': 'export' in content.lower() or 'download' in content.lower()
            }
            self.results['batch_processing']['features'] = batch_features
            self.log(f"✅ Batch processing page loaded with {sum(batch_features.values())}/3 features")

    def test_api_endpoints(self):
        """Test API endpoints directly"""
        self.log("=== TESTING API ENDPOINTS ===", "TEST")
        
        # Test if there are any REST API endpoints
        api_endpoints = [
            "/api/trucks", "/api/cartons", "/api/jobs", 
            "/api/optimize", "/api/analytics"
        ]
        
        api_results = {}
        for endpoint in api_endpoints:
            result, _ = self.test_endpoint(endpoint, expected_status=404)  # Many might not exist
            api_results[endpoint] = result
            if result['status_code'] != 404:
                self.log(f"📡 Found API endpoint: {endpoint} (Status: {result['status_code']})")
        
        self.results['api_tests'] = api_results

    def test_error_handling(self):
        """Test error handling and edge cases"""
        self.log("=== TESTING ERROR HANDLING ===", "TEST")
        
        # Test non-existent pages
        error_tests = [
            "/non-existent-page",
            "/truck-types/999999",
            "/carton-types/invalid-id"
        ]
        
        error_results = {}
        for endpoint in error_tests:
            result, _ = self.test_endpoint(endpoint, expected_status=404)
            error_results[endpoint] = result
            if result['status_code'] == 404:
                self.log(f"✅ Proper 404 handling for {endpoint}")
            else:
                self.log(f"⚠️ Unexpected status {result['status_code']} for {endpoint}")
        
        self.results['error_handling'] = error_results

    def performance_analysis(self):
        """Analyze overall performance metrics"""
        self.log("=== PERFORMANCE ANALYSIS ===", "TEST")
        
        all_response_times = []
        successful_requests = 0
        failed_requests = 0
        
        def extract_times(data, path=""):
            nonlocal all_response_times, successful_requests, failed_requests
            
            if isinstance(data, dict):
                if 'response_time_ms' in data:
                    all_response_times.append(data['response_time_ms'])
                    if data.get('success'):
                        successful_requests += 1
                    else:
                        failed_requests += 1
                
                for key, value in data.items():
                    extract_times(value, f"{path}.{key}" if path else key)
            elif isinstance(data, list):
                for item in data:
                    extract_times(item, path)
        
        extract_times(self.results)
        
        if all_response_times:
            avg_response_time = sum(all_response_times) / len(all_response_times)
            max_response_time = max(all_response_times)
            min_response_time = min(all_response_times)
            
            self.results['performance']['summary'] = {
                'total_requests': len(all_response_times),
                'successful_requests': successful_requests,
                'failed_requests': failed_requests,
                'success_rate': (successful_requests / len(all_response_times)) * 100,
                'avg_response_time_ms': round(avg_response_time, 2),
                'max_response_time_ms': round(max_response_time, 2),
                'min_response_time_ms': round(min_response_time, 2)
            }
            
            self.log(f"📊 Performance Summary:")
            self.log(f"   Total Requests: {len(all_response_times)}")
            self.log(f"   Success Rate: {((successful_requests / len(all_response_times)) * 100):.1f}%")
            self.log(f"   Avg Response Time: {avg_response_time:.2f}ms")
            self.log(f"   Max Response Time: {max_response_time:.2f}ms")

    def generate_report(self):
        """Generate comprehensive test report"""
        self.log("=== GENERATING COMPREHENSIVE REPORT ===", "TEST")
        
        report = f"""
TruckOpti Comprehensive Test Report
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
{'='*80}

EXECUTIVE SUMMARY:
- Application Status: {'🟢 OPERATIONAL' if self.results['homepage'].get('dashboard', {}).get('success') else '🔴 DOWN'}
- Total Issues Found: {len(self.results['issues'])}
- Performance: {self.results['performance']['summary']['success_rate']:.1f}% success rate
- Average Response Time: {self.results['performance']['summary']['avg_response_time_ms']:.2f}ms

TEST RESULTS BY FEATURE:

1. HOMEPAGE & DASHBOARD:
   Status: {'✅ PASS' if self.results['homepage'].get('dashboard', {}).get('success') else '❌ FAIL'}
   Load Time: {self.results['homepage'].get('dashboard', {}).get('response_time_ms', 'N/A')}ms
   Elements Found: {sum(self.results['homepage'].get('elements', {}).values()) if 'elements' in self.results['homepage'] else 'N/A'}/7

2. TRUCK MANAGEMENT:
   Status: {'✅ PASS' if self.results['truck_management'].get('listing', {}).get('success') else '❌ FAIL'}
   Existing Trucks: {self.results['truck_management'].get('existing_trucks', 'N/A')}
   CRUD Operations: {'✅ Working' if self.results['truck_management'].get('create', {}).get('success') else '⚠️ Issues'}

3. CARTON MANAGEMENT:
   Status: {'✅ PASS' if self.results['carton_management'].get('listing', {}).get('success') else '❌ FAIL'}
   Existing Cartons: {self.results['carton_management'].get('existing_cartons', 'N/A')}

4. OPTIMIZATION FEATURES:
   Pages Available: {sum(1 for k, v in self.results['optimization'].items() if v.get('success', False))}/4
   Status: {'✅ PASS' if sum(1 for k, v in self.results['optimization'].items() if v.get('success', False)) >= 3 else '⚠️ PARTIAL'}

5. ANALYTICS DASHBOARD:
   Status: {'✅ PASS' if self.results['analytics'].get('main_page', {}).get('success') else '❌ FAIL'}
   Features: {sum(self.results['analytics'].get('features', {}).values()) if 'features' in self.results['analytics'] else 'N/A'}/4

PERFORMANCE METRICS:
- Total Requests: {self.results['performance']['summary']['total_requests']}
- Success Rate: {self.results['performance']['summary']['success_rate']:.1f}%
- Average Response: {self.results['performance']['summary']['avg_response_time_ms']}ms
- Fastest Response: {self.results['performance']['summary']['min_response_time_ms']}ms
- Slowest Response: {self.results['performance']['summary']['max_response_time_ms']}ms

ISSUES IDENTIFIED:
"""
        if self.results['issues']:
            for i, issue in enumerate(self.results['issues'], 1):
                report += f"{i}. {issue}\n"
        else:
            report += "No critical issues identified.\n"

        report += f"""

RECOMMENDATIONS:
1. {'✅' if self.results['performance']['summary']['avg_response_time_ms'] < 100 else '⚠️'} Response Times: {'Excellent' if self.results['performance']['summary']['avg_response_time_ms'] < 100 else 'Acceptable' if self.results['performance']['summary']['avg_response_time_ms'] < 500 else 'Needs Optimization'}
2. {'✅' if self.results['performance']['summary']['success_rate'] > 95 else '⚠️'} Reliability: {'Excellent' if self.results['performance']['summary']['success_rate'] > 95 else 'Good' if self.results['performance']['summary']['success_rate'] > 85 else 'Needs Improvement'}
3. {'✅' if len(self.results['issues']) == 0 else '⚠️'} Error Handling: {'Excellent' if len(self.results['issues']) == 0 else 'Needs Review'}

TEST DATA CREATED:
- Trucks: {len(self.test_data['trucks_created'])}
- Cartons: {len(self.test_data['cartons_created'])}

OVERALL GRADE: {self.calculate_grade()}
"""
        
        # Save report to file
        with open('/workspaces/Truck_Opti/COMPREHENSIVE_TEST_REPORT.md', 'w') as f:
            f.write(report)
        
        print(report)
        return report

    def calculate_grade(self):
        """Calculate overall grade based on test results"""
        score = 0
        max_score = 100
        
        # Homepage (20 points)
        if self.results['homepage'].get('dashboard', {}).get('success'):
            score += 15
            if self.results['homepage'].get('dashboard', {}).get('response_time_ms', 1000) < 200:
                score += 5
        
        # Truck Management (20 points)  
        if self.results['truck_management'].get('listing', {}).get('success'):
            score += 10
        if self.results['truck_management'].get('create', {}).get('success'):
            score += 10
        
        # Carton Management (20 points)
        if self.results['carton_management'].get('listing', {}).get('success'):
            score += 10
        if self.results['carton_management'].get('create', {}).get('success'):
            score += 10
        
        # Optimization (20 points)
        opt_score = sum(1 for k, v in self.results['optimization'].items() if v.get('success', False))
        score += (opt_score / 4) * 20
        
        # Analytics (10 points)
        if self.results['analytics'].get('main_page', {}).get('success'):
            score += 10
        
        # Performance (10 points)
        if self.results['performance']['summary']['success_rate'] > 95:
            score += 5
        if self.results['performance']['summary']['avg_response_time_ms'] < 200:
            score += 5
        
        # Deduct for issues
        score -= min(len(self.results['issues']) * 5, 20)
        
        percentage = max(0, score)
        
        if percentage >= 90:
            return f"A ({percentage:.1f}/100) - Excellent"
        elif percentage >= 80:
            return f"B ({percentage:.1f}/100) - Good"
        elif percentage >= 70:
            return f"C ({percentage:.1f}/100) - Satisfactory"
        elif percentage >= 60:
            return f"D ({percentage:.1f}/100) - Needs Improvement"
        else:
            return f"F ({percentage:.1f}/100) - Poor"

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚛 TruckOpti Comprehensive Testing Starting...")
        print("="*80)
        
        start_time = time.time()
        
        try:
            self.test_homepage_and_dashboard()
            self.test_truck_management()
            self.test_carton_management()
            self.test_optimization_features()
            self.test_analytics_dashboard()
            self.test_batch_processing()
            self.test_api_endpoints()
            self.test_error_handling()
            self.performance_analysis()
            
        except Exception as e:
            self.log(f"Critical error during testing: {str(e)}", "ERROR")
            self.results['issues'].append(f"Critical test failure: {str(e)}")
        
        end_time = time.time()
        total_time = end_time - start_time
        
        self.log(f"🎉 Testing completed in {total_time:.2f} seconds")
        
        return self.generate_report()


if __name__ == "__main__":
    tester = TruckOptiTester()
    tester.run_all_tests()