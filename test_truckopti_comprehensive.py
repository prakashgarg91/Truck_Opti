#!/usr/bin/env python3
"""
Comprehensive TruckOpti Application Testing
Tests all major functionality without browser automation
"""

import requests
import json
import time
import sys
from datetime import datetime
from urllib.parse import urljoin
import sqlite3
import os

# Test configuration
BASE_URL = "http://127.0.0.1:5002"
DB_PATH = "/workspaces/Truck_Opti/app/truck_opti.db"

# Test results tracking
test_results = {
    'timestamp': datetime.now().isoformat(),
    'total_tests': 0,
    'passed_tests': 0,
    'failed_tests': 0,
    'errors': [],
    'recommendations': [],
    'detailed_results': {}
}

def log_test(test_name, status, details=''):
    """Log test result"""
    test_results['total_tests'] += 1
    if status == 'PASS':
        test_results['passed_tests'] += 1
        print(f"✅ [PASS] {test_name}: {details}")
    else:
        test_results['failed_tests'] += 1
        error_msg = f"{test_name}: {details}"
        test_results['errors'].append(error_msg)
        print(f"❌ [FAIL] {test_name}: {details}")
    
    test_results['detailed_results'][test_name] = {
        'status': status,
        'details': details
    }

def add_recommendation(priority, description):
    """Add recommendation to the report"""
    test_results['recommendations'].append({
        'priority': priority,
        'description': description
    })
    print(f"🔧 [{priority}] RECOMMENDATION: {description}")

def test_endpoint(url, method='GET', data=None, description=''):
    """Test HTTP endpoint"""
    try:
        if method == 'GET':
            response = requests.get(url, timeout=10)
        elif method == 'POST':
            response = requests.post(url, data=data, timeout=10)
        
        return {
            'status_code': response.status_code,
            'content': response.text,
            'headers': dict(response.headers),
            'success': 200 <= response.status_code < 300
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'status_code': None
        }

def check_database_schema():
    """Check database schema and data"""
    try:
        if not os.path.exists(DB_PATH):
            log_test("Database File Exists", "FAIL", f"Database file not found at {DB_PATH}")
            return False
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check for main tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        
        expected_tables = ['truck_type', 'carton_type', 'packing_result']
        missing_tables = [table for table in expected_tables if table not in tables]
        
        if missing_tables:
            log_test("Database Schema", "FAIL", f"Missing tables: {missing_tables}")
            add_recommendation("CRITICAL", f"Create missing database tables: {missing_tables}")
        else:
            log_test("Database Schema", "PASS", f"All required tables exist: {tables}")
        
        # Check truck data diversity
        cursor.execute("SELECT DISTINCT name FROM truck_type LIMIT 10;")
        trucks = [row[0] for row in cursor.fetchall()]
        
        if len(trucks) <= 1:
            log_test("Truck Data Diversity", "FAIL", f"Only {len(trucks)} truck types found")
            add_recommendation("HIGH", "Add more truck types to provide better recommendations")
        else:
            log_test("Truck Data Diversity", "PASS", f"Found {len(trucks)} truck types: {trucks[:5]}...")
        
        conn.close()
        return True
        
    except Exception as e:
        log_test("Database Connection", "FAIL", f"Error: {str(e)}")
        return False

def test_homepage_functionality():
    """Test homepage and basic functionality"""
    print("\n🏠 === TESTING HOMEPAGE FUNCTIONALITY ===")
    
    # Test homepage loading
    result = test_endpoint(BASE_URL)
    if result['success']:
        log_test("Homepage Loading", "PASS", f"Status: {result['status_code']}")
        
        # Check for key elements in HTML
        content = result['content'].lower()
        
        key_elements = {
            'navigation': any(keyword in content for keyword in ['nav', 'menu', 'sidebar']),
            'truck_section': any(keyword in content for keyword in ['truck', 'vehicle']),
            'carton_section': any(keyword in content for keyword in ['carton', 'box', 'package']),
            'optimize_button': any(keyword in content for keyword in ['optimize', 'pack', 'calculate']),
            'dashboard': any(keyword in content for keyword in ['dashboard', 'analytics', 'chart'])
        }
        
        for element, found in key_elements.items():
            log_test(f"Homepage - {element.replace('_', ' ').title()}", 
                    "PASS" if found else "FAIL", 
                    "Found" if found else "Missing from homepage")
                    
    else:
        log_test("Homepage Loading", "FAIL", f"Error: {result.get('error', 'HTTP Error')}")
        add_recommendation("CRITICAL", "Homepage not loading - application may be down")

def test_api_endpoints():
    """Test API endpoints"""
    print("\n🔌 === TESTING API ENDPOINTS ===")
    
    api_endpoints = [
        ('/api/trucks', 'GET', 'Truck List API'),
        ('/api/cartons', 'GET', 'Carton List API'),
        ('/api/optimize', 'POST', 'Optimization API'),
        ('/api/dashboard', 'GET', 'Dashboard API'),
        ('/trucks', 'GET', 'Truck Management Page'),
        ('/cartons', 'GET', 'Carton Management Page'),
        ('/optimize', 'GET', 'Optimization Page'),
        ('/dashboard', 'GET', 'Dashboard Page')
    ]
    
    for endpoint, method, description in api_endpoints:
        url = urljoin(BASE_URL, endpoint)
        result = test_endpoint(url, method)
        
        if result['success']:
            log_test(description, "PASS", f"Status: {result['status_code']}")
        else:
            error_msg = result.get('error', f'HTTP {result.get("status_code", "Unknown")}')
            log_test(description, "FAIL", f"Error: {error_msg}")
            if '404' in str(result.get('status_code', '')):
                add_recommendation("MEDIUM", f"Missing endpoint: {endpoint}")

def test_form_submissions():
    """Test form submissions"""
    print("\n📝 === TESTING FORM SUBMISSIONS ===")
    
    # Test truck creation
    truck_data = {
        'name': 'Test Truck XYZ',
        'length': 400,
        'width': 200,
        'height': 250,
        'max_weight': 1000,
        'cost_per_km': 15.50
    }
    
    result = test_endpoint(urljoin(BASE_URL, '/api/trucks'), 'POST', truck_data)
    if result['success']:
        log_test("Add Truck Form", "PASS", "Truck creation successful")
    else:
        log_test("Add Truck Form", "FAIL", f"Truck creation failed: {result.get('error', 'Unknown error')}")
        add_recommendation("HIGH", "Truck creation form not working properly")
    
    # Test carton creation
    carton_data = {
        'name': 'Test Carton ABC',
        'length': 30,
        'width': 20,
        'height': 15,
        'weight': 5,
        'quantity': 10
    }
    
    result = test_endpoint(urljoin(BASE_URL, '/api/cartons'), 'POST', carton_data)
    if result['success']:
        log_test("Add Carton Form", "PASS", "Carton creation successful")
    else:
        log_test("Add Carton Form", "FAIL", f"Carton creation failed: {result.get('error', 'Unknown error')}")
        add_recommendation("HIGH", "Carton creation form not working properly")

def test_recommendation_diversity():
    """Test truck recommendation diversity"""
    print("\n🚛 === TESTING TRUCK RECOMMENDATION DIVERSITY ===")
    
    # Test multiple optimization scenarios
    test_scenarios = [
        {
            'name': 'Small Items Scenario',
            'cartons': [{'length': 10, 'width': 10, 'height': 10, 'weight': 2, 'quantity': 5}]
        },
        {
            'name': 'Large Items Scenario', 
            'cartons': [{'length': 50, 'width': 40, 'height': 30, 'weight': 25, 'quantity': 3}]
        },
        {
            'name': 'Mixed Items Scenario',
            'cartons': [
                {'length': 15, 'width': 10, 'height': 8, 'weight': 3, 'quantity': 8},
                {'length': 35, 'width': 25, 'height': 20, 'weight': 15, 'quantity': 2}
            ]
        }
    ]
    
    recommendations = []
    
    for scenario in test_scenarios:
        optimize_data = {'cartons': scenario['cartons']}
        result = test_endpoint(urljoin(BASE_URL, '/api/optimize'), 'POST', optimize_data)
        
        if result['success']:
            log_test(f"Optimization - {scenario['name']}", "PASS", "Optimization successful")
            
            # Try to extract recommended truck from response
            try:
                content = result['content']
                if 'tata ace' in content.lower() or 'chhota hathi' in content.lower():
                    recommendations.append('Tata Ace (Chhota Hathi)')
                    log_test(f"Recommendation Extract - {scenario['name']}", "PASS", "Found Tata Ace recommendation")
                else:
                    recommendations.append('Other/Unknown')
                    log_test(f"Recommendation Extract - {scenario['name']}", "PASS", "Non-Tata Ace recommendation")
            except:
                recommendations.append('Parse Error')
                log_test(f"Recommendation Extract - {scenario['name']}", "FAIL", "Could not parse recommendation")
        else:
            log_test(f"Optimization - {scenario['name']}", "FAIL", f"Optimization failed: {result.get('error', 'Unknown')}")
            add_recommendation("HIGH", f"Optimization failing for {scenario['name']}")
    
    # Check recommendation diversity
    unique_recommendations = set(recommendations)
    if len(unique_recommendations) == 1 and 'Tata Ace (Chhota Hathi)' in unique_recommendations:
        log_test("Recommendation Diversity", "FAIL", "Always recommending Tata Ace - lacks diversity")
        add_recommendation("HIGH", "Recommendation system lacks diversity - always suggests same truck")
    elif len(unique_recommendations) > 1:
        log_test("Recommendation Diversity", "PASS", f"Found {len(unique_recommendations)} different recommendations")
    else:
        log_test("Recommendation Diversity", "UNKNOWN", "Could not determine diversity")

def test_export_functionality():
    """Test export functionality"""
    print("\n📄 === TESTING EXPORT FUNCTIONALITY ===")
    
    export_endpoints = [
        ('/export/trucks/csv', 'Trucks CSV Export'),
        ('/export/cartons/csv', 'Cartons CSV Export'),
        ('/export/results/csv', 'Results CSV Export'),
        ('/export/trucks/excel', 'Trucks Excel Export'),
        ('/export/results/pdf', 'Results PDF Export')
    ]
    
    for endpoint, description in export_endpoints:
        result = test_endpoint(urljoin(BASE_URL, endpoint))
        if result['success']:
            log_test(description, "PASS", f"Export available - Status: {result['status_code']}")
        else:
            log_test(description, "FAIL", f"Export not available: {result.get('error', 'Unknown error')}")
            add_recommendation("MEDIUM", f"Missing export functionality: {description}")

def check_3d_visualization():
    """Check for 3D visualization elements"""
    print("\n🎨 === CHECKING 3D VISUALIZATION ===")
    
    # Check homepage for 3D elements
    result = test_endpoint(BASE_URL)
    if result['success']:
        content = result['content'].lower()
        
        # Look for 3D-related elements
        three_js_indicators = [
            'three.js', 'threejs', 'canvas', 'webgl', 
            'scene', 'renderer', 'geometry', 'mesh'
        ]
        
        found_3d = any(indicator in content for indicator in three_js_indicators)
        
        if found_3d:
            log_test("3D Visualization Elements", "PASS", "3D visualization components detected")
        else:
            log_test("3D Visualization Elements", "FAIL", "No 3D visualization components found")
            add_recommendation("HIGH", "3D visualization not loading - critical feature missing")
            
        # Check for specific 3D libraries
        if 'three.js' in content or 'threejs' in content:
            log_test("Three.js Library", "PASS", "Three.js detected")
        else:
            log_test("Three.js Library", "FAIL", "Three.js not detected")
            add_recommendation("HIGH", "Three.js library missing - required for 3D visualization")

def run_all_tests():
    """Run all tests and generate report"""
    print("🚚 === TruckOpti COMPREHENSIVE TEST SUITE ===")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Testing application at: {BASE_URL}")
    print("=" * 50)
    
    # Run all test categories
    test_functions = [
        check_database_schema,
        test_homepage_functionality,
        test_api_endpoints,
        test_form_submissions,
        test_recommendation_diversity,
        test_export_functionality,
        check_3d_visualization
    ]
    
    for test_func in test_functions:
        try:
            test_func()
        except Exception as e:
            log_test(f"Test Function {test_func.__name__}", "FAIL", f"Exception: {str(e)}")
    
    # Generate final report
    print("\n" + "="*60)
    print("🚚 === FINAL TEST REPORT ===")
    print(f"Timestamp: {test_results['timestamp']}")
    print(f"Total Tests: {test_results['total_tests']}")
    print(f"Passed: {test_results['passed_tests']}")
    print(f"Failed: {test_results['failed_tests']}")
    
    if test_results['total_tests'] > 0:
        success_rate = (test_results['passed_tests'] / test_results['total_tests']) * 100
        print(f"Success Rate: {success_rate:.1f}%")
    
    if test_results['errors']:
        print("\n❌ FAILED TESTS:")
        for error in test_results['errors']:
            print(f"  - {error}")
    
    if test_results['recommendations']:
        print("\n🔧 RECOMMENDATIONS:")
        priority_order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
        for priority in priority_order:
            recs = [r for r in test_results['recommendations'] if r['priority'] == priority]
            if recs:
                print(f"\n  {priority} PRIORITY:")
                for rec in recs:
                    print(f"    - {rec['description']}")
    
    # Save detailed report
    report_path = '/workspaces/Truck_Opti/test_results.json'
    with open(report_path, 'w') as f:
        json.dump(test_results, f, indent=2)
    
    print(f"\n📄 Detailed report saved to: {report_path}")
    
    # Overall assessment
    if test_results['failed_tests'] == 0:
        print("\n🎉 OVERALL STATUS: ALL TESTS PASSED!")
    elif test_results['failed_tests'] <= test_results['passed_tests']:
        print("\n⚠️  OVERALL STATUS: MOSTLY FUNCTIONAL - NEEDS ATTENTION")
    else:
        print("\n🚨 OVERALL STATUS: CRITICAL ISSUES FOUND - REQUIRES IMMEDIATE FIXES")
    
    return test_results

if __name__ == "__main__":
    try:
        results = run_all_tests()
        sys.exit(0 if results['failed_tests'] == 0 else 1)
    except KeyboardInterrupt:
        print("\n🛑 Testing interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Critical testing error: {str(e)}")
        sys.exit(1)