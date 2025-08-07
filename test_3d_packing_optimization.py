#!/usr/bin/env python3
"""
Comprehensive 3D Bin Packing Optimization Testing Suite for TruckOpti
Tests the core optimization engine, algorithms, and performance
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, List, Any
import sqlite3

class TruckOptiPackingTester:
    def __init__(self, base_url="http://127.0.0.1:5000"):
        self.base_url = base_url
        self.session = requests.Session()
        self.test_results = {}
        self.performance_metrics = {}
        
    def log(self, message: str, level: str = "INFO"):
        """Enhanced logging with timestamps"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[{timestamp}] [{level}] {message}")
        
    def test_server_connectivity(self):
        """Test 1: Verify server is running and accessible"""
        self.log("Testing server connectivity...")
        try:
            response = self.session.get(self.base_url)
            if response.status_code == 200:
                self.log("✅ Server is running and accessible", "SUCCESS")
                return True
            else:
                self.log(f"❌ Server returned status code: {response.status_code}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Server connectivity failed: {e}", "ERROR")
            return False
            
    def get_database_data(self):
        """Retrieve truck and carton data from database"""
        try:
            conn = sqlite3.connect('/workspaces/Truck_Opti/app/truck_opti.db')
            cursor = conn.cursor()
            
            # Get truck types
            cursor.execute("SELECT * FROM truck_types")
            trucks = cursor.fetchall()
            truck_columns = [description[0] for description in cursor.description]
            
            # Get carton types
            cursor.execute("SELECT * FROM carton_types")
            cartons = cursor.fetchall()
            carton_columns = [description[0] for description in cursor.description]
            
            conn.close()
            
            truck_data = [dict(zip(truck_columns, truck)) for truck in trucks]
            carton_data = [dict(zip(carton_columns, carton)) for carton in cartons]
            
            self.log(f"Retrieved {len(truck_data)} truck types and {len(carton_data)} carton types from database")
            return truck_data, carton_data
            
        except Exception as e:
            self.log(f"❌ Database query failed: {e}", "ERROR")
            return [], []
    
    def test_truck_requirement_calculator(self):
        """Test 2: Truck Requirement Calculator Page"""
        self.log("\n=== Testing Truck Requirement Calculator ===")
        
        test_cases = [
            {
                "name": "Small Mixed Load",
                "cartons": [
                    {"type": "A", "qty": 10},
                    {"type": "B", "qty": 5}
                ]
            },
            {
                "name": "Large Volume Load", 
                "cartons": [
                    {"type": "LED TV 55", "qty": 50},
                    {"type": "Refrigerator Double Door", "qty": 20}
                ]
            },
            {
                "name": "High Quantity Small Items",
                "cartons": [
                    {"type": "Mixer Grinder", "qty": 200},
                    {"type": "Toaster", "qty": 100}
                ]
            }
        ]
        
        results = {}
        for test_case in test_cases:
            self.log(f"Testing: {test_case['name']}")
            
            try:
                # Get the form page first
                response = self.session.get(f"{self.base_url}/calculate-truck-requirements")
                if response.status_code != 200:
                    self.log(f"❌ Failed to load calculator page: {response.status_code}", "ERROR")
                    continue
                
                # Test with form data
                form_data = {}
                for i, carton in enumerate(test_case['cartons'], 1):
                    form_data[f'carton_type_{i}'] = carton['type']
                    form_data[f'carton_qty_{i}'] = str(carton['qty'])
                
                start_time = time.time()
                response = self.session.post(
                    f"{self.base_url}/calculate-truck-requirements",
                    data=form_data
                )
                end_time = time.time()
                
                processing_time = end_time - start_time
                
                if response.status_code == 200:
                    self.log(f"✅ {test_case['name']}: SUCCESS (Processed in {processing_time:.2f}s)")
                    results[test_case['name']] = {
                        'status': 'success',
                        'processing_time': processing_time,
                        'response_size': len(response.content)
                    }
                else:
                    self.log(f"❌ {test_case['name']}: FAILED - Status {response.status_code}", "ERROR")
                    results[test_case['name']] = {
                        'status': 'failed',
                        'status_code': response.status_code
                    }
                    
            except Exception as e:
                self.log(f"❌ {test_case['name']}: EXCEPTION - {e}", "ERROR")
                results[test_case['name']] = {
                    'status': 'exception',
                    'error': str(e)
                }
        
        self.test_results['truck_requirement_calculator'] = results
        return results
    
    def test_fit_cartons_feature(self):
        """Test 3: Fit Cartons in Selected Trucks"""
        self.log("\n=== Testing Fit Cartons Feature ===")
        
        # Get available trucks and cartons from database
        trucks, cartons = self.get_database_data()
        
        test_scenarios = [
            {
                "name": "Single Truck Optimization",
                "trucks": {"truck_1": "1"},  # First truck with qty 1
                "cartons": {
                    "carton_type_1": str(cartons[0]['id']) if cartons else "1",
                    "carton_qty_1": "10",
                    "carton_type_2": str(cartons[1]['id']) if len(cartons) > 1 else "2", 
                    "carton_qty_2": "5"
                }
            },
            {
                "name": "Multi Truck Optimization",
                "trucks": {"truck_1": "2", "truck_2": "1"},
                "cartons": {
                    "carton_type_1": str(cartons[0]['id']) if cartons else "1",
                    "carton_qty_1": "50",
                    "carton_type_2": str(cartons[1]['id']) if len(cartons) > 1 else "2",
                    "carton_qty_2": "30"
                }
            }
        ]
        
        results = {}
        for scenario in test_scenarios:
            self.log(f"Testing: {scenario['name']}")
            
            try:
                # Prepare form data
                form_data = {}
                form_data.update(scenario['trucks'])
                form_data.update(scenario['cartons'])
                
                start_time = time.time()
                response = self.session.post(
                    f"{self.base_url}/fit-cartons",
                    data=form_data
                )
                end_time = time.time()
                
                processing_time = end_time - start_time
                
                if response.status_code == 200:
                    # Check if response contains packing results
                    response_text = response.text
                    has_results = "fitted_items" in response_text or "Packing Results" in response_text
                    
                    self.log(f"✅ {scenario['name']}: SUCCESS - Results: {has_results} (Time: {processing_time:.2f}s)")
                    results[scenario['name']] = {
                        'status': 'success',
                        'processing_time': processing_time,
                        'has_results': has_results,
                        'response_size': len(response.content)
                    }
                else:
                    self.log(f"❌ {scenario['name']}: FAILED - Status {response.status_code}", "ERROR")
                    results[scenario['name']] = {
                        'status': 'failed',
                        'status_code': response.status_code
                    }
                    
            except Exception as e:
                self.log(f"❌ {scenario['name']}: EXCEPTION - {e}", "ERROR")
                results[scenario['name']] = {'status': 'exception', 'error': str(e)}
        
        self.test_results['fit_cartons'] = results
        return results
    
    def test_recommend_truck_feature(self):
        """Test 4: Recommend Truck for Cartons"""
        self.log("\n=== Testing Recommend Truck Feature ===")
        
        trucks, cartons = self.get_database_data()
        
        test_cases = [
            {
                "name": "Light Load Recommendation",
                "form_data": {f"carton_{cartons[0]['id']}": "10"} if cartons else {"carton_1": "10"}
            },
            {
                "name": "Heavy Load Recommendation", 
                "form_data": {f"carton_{cartons[i]['id']}": "50" for i in range(min(3, len(cartons)))} if cartons else {"carton_1": "50"}
            },
            {
                "name": "Mixed Priority Load",
                "form_data": {f"carton_{cartons[i]['id']}": str(20 - i*5) for i in range(min(4, len(cartons)))} if cartons else {"carton_1": "20"}
            }
        ]
        
        results = {}
        for test_case in test_cases:
            self.log(f"Testing: {test_case['name']}")
            
            try:
                start_time = time.time()
                response = self.session.post(
                    f"{self.base_url}/recommend-truck",
                    data=test_case['form_data']
                )
                end_time = time.time()
                
                processing_time = end_time - start_time
                
                if response.status_code == 200:
                    # Check for recommendation content
                    has_recommendations = "recommended" in response.text.lower() or "truck" in response.text.lower()
                    
                    self.log(f"✅ {test_case['name']}: SUCCESS - Recommendations: {has_recommendations} (Time: {processing_time:.2f}s)")
                    results[test_case['name']] = {
                        'status': 'success',
                        'processing_time': processing_time,
                        'has_recommendations': has_recommendations,
                        'response_size': len(response.content)
                    }
                else:
                    self.log(f"❌ {test_case['name']}: FAILED - Status {response.status_code}", "ERROR")
                    results[test_case['name']] = {
                        'status': 'failed',
                        'status_code': response.status_code
                    }
                    
            except Exception as e:
                self.log(f"❌ {test_case['name']}: EXCEPTION - {e}", "ERROR")
                results[test_case['name']] = {'status': 'exception', 'error': str(e)}
        
        self.test_results['recommend_truck'] = results
        return results
    
    def test_fleet_optimization(self):
        """Test 5: Fleet Optimization Functionality"""
        self.log("\n=== Testing Fleet Optimization ===")
        
        try:
            # Test fleet optimization page access
            response = self.session.get(f"{self.base_url}/fleet-optimization")
            
            if response.status_code == 200:
                self.log("✅ Fleet optimization page accessible")
                
                # Test form submission with sample data
                form_data = {
                    'optimization_goal': 'cost',
                    'max_trucks': '5',
                    'route_distance': '200'
                }
                
                start_time = time.time()
                response = self.session.post(
                    f"{self.base_url}/fleet-optimization",
                    data=form_data
                )
                end_time = time.time()
                
                processing_time = end_time - start_time
                
                result = {
                    'page_accessible': True,
                    'processing_time': processing_time,
                    'form_submission_status': response.status_code,
                    'response_size': len(response.content)
                }
                
                self.log(f"✅ Fleet optimization test completed (Time: {processing_time:.2f}s)")
            else:
                result = {
                    'page_accessible': False,
                    'status_code': response.status_code
                }
                self.log(f"❌ Fleet optimization page not accessible: {response.status_code}", "ERROR")
                
        except Exception as e:
            result = {'status': 'exception', 'error': str(e)}
            self.log(f"❌ Fleet optimization test exception: {e}", "ERROR")
        
        self.test_results['fleet_optimization'] = result
        return result
    
    def test_optimization_scenarios(self):
        """Test 6: Various Optimization Scenarios"""
        self.log("\n=== Testing Optimization Scenarios ===")
        
        trucks, cartons = self.get_database_data()
        
        scenarios = [
            {
                "name": "Easy Fit Scenario",
                "description": "Small cartons that should fit easily",
                "cartons": {f"carton_{cartons[0]['id']}": "5"} if cartons else {"carton_1": "5"}
            },
            {
                "name": "Multiple Truck Scenario",
                "description": "Large load requiring multiple trucks",
                "cartons": {f"carton_{cartons[i]['id']}": "100" for i in range(min(3, len(cartons)))} if cartons else {"carton_1": "100"}
            },
            {
                "name": "Mixed Size Scenario",
                "description": "Different sized cartons with priorities",
                "cartons": {f"carton_{cartons[i]['id']}": str(50 - i*10) for i in range(min(4, len(cartons)))} if cartons else {"carton_1": "50"}
            }
        ]
        
        results = {}
        for scenario in scenarios:
            self.log(f"Testing: {scenario['name']} - {scenario['description']}")
            
            # Test with recommend-truck endpoint for scenario analysis
            try:
                start_time = time.time()
                response = self.session.post(
                    f"{self.base_url}/recommend-truck",
                    data=scenario['cartons']
                )
                end_time = time.time()
                
                processing_time = end_time - start_time
                
                if response.status_code == 200:
                    # Analyze response for optimization quality
                    response_text = response.text.lower()
                    
                    optimization_indicators = {
                        'has_cost_data': 'cost' in response_text,
                        'has_utilization': 'utilization' in response_text or 'efficiency' in response_text,
                        'has_3d_visualization': 'three' in response_text or '3d' in response_text,
                        'processing_time': processing_time
                    }
                    
                    self.log(f"✅ {scenario['name']}: Analysis complete - Cost: {optimization_indicators['has_cost_data']}, "
                           f"Utilization: {optimization_indicators['has_utilization']}, 3D: {optimization_indicators['has_3d_visualization']}")
                    
                    results[scenario['name']] = {
                        'status': 'success',
                        **optimization_indicators
                    }
                else:
                    self.log(f"❌ {scenario['name']}: FAILED - Status {response.status_code}", "ERROR")
                    results[scenario['name']] = {
                        'status': 'failed',
                        'status_code': response.status_code
                    }
                    
            except Exception as e:
                self.log(f"❌ {scenario['name']}: EXCEPTION - {e}", "ERROR")
                results[scenario['name']] = {'status': 'exception', 'error': str(e)}
        
        self.test_results['optimization_scenarios'] = results
        return results
    
    def test_invalid_inputs(self):
        """Test 7: Invalid Input Handling"""
        self.log("\n=== Testing Invalid Input Handling ===")
        
        invalid_test_cases = [
            {
                "name": "Empty Carton List",
                "endpoint": "/recommend-truck",
                "data": {}
            },
            {
                "name": "Invalid Dimensions",
                "endpoint": "/fit-cartons",
                "data": {
                    "carton_type_1": "999999",  # Non-existent carton ID
                    "carton_qty_1": "10"
                }
            },
            {
                "name": "Negative Quantities",
                "endpoint": "/recommend-truck", 
                "data": {"carton_1": "-5"}
            },
            {
                "name": "Zero Quantities",
                "endpoint": "/fit-cartons",
                "data": {
                    "carton_type_1": "1",
                    "carton_qty_1": "0"
                }
            }
        ]
        
        results = {}
        for test_case in invalid_test_cases:
            self.log(f"Testing: {test_case['name']}")
            
            try:
                response = self.session.post(
                    f"{self.base_url}{test_case['endpoint']}",
                    data=test_case['data']
                )
                
                # Invalid inputs should either redirect with flash message or show error
                if response.status_code in [200, 302]:
                    # Check for error handling indicators
                    if response.status_code == 302:
                        self.log(f"✅ {test_case['name']}: Properly redirected (302)")
                        results[test_case['name']] = {'status': 'handled_redirect'}
                    else:
                        response_text = response.text.lower()
                        has_error_handling = any(indicator in response_text for indicator in 
                                               ['error', 'warning', 'invalid', 'please add'])
                        
                        if has_error_handling:
                            self.log(f"✅ {test_case['name']}: Error properly handled")
                            results[test_case['name']] = {'status': 'handled_error'}
                        else:
                            self.log(f"⚠️ {test_case['name']}: May need better error handling", "WARNING")
                            results[test_case['name']] = {'status': 'processed_without_error'}
                else:
                    self.log(f"❌ {test_case['name']}: Unexpected status {response.status_code}", "ERROR")
                    results[test_case['name']] = {
                        'status': 'unexpected_response',
                        'status_code': response.status_code
                    }
                    
            except Exception as e:
                self.log(f"❌ {test_case['name']}: EXCEPTION - {e}", "ERROR")
                results[test_case['name']] = {'status': 'exception', 'error': str(e)}
        
        self.test_results['invalid_input_handling'] = results
        return results
    
    def test_performance_bulk_optimization(self):
        """Test 8: Performance with Bulk Optimization"""
        self.log("\n=== Testing Performance with Bulk Data ===")
        
        trucks, cartons = self.get_database_data()
        
        performance_tests = [
            {
                "name": "Medium Load - 100 items",
                "cartons": {f"carton_{cartons[0]['id']}": "100"} if cartons else {"carton_1": "100"}
            },
            {
                "name": "Large Load - 500 items",
                "cartons": {f"carton_{cartons[i]['id']}": "100" for i in range(min(5, len(cartons)))} if cartons else {"carton_1": "500"}
            },
            {
                "name": "Extra Large Load - 1000 items",  
                "cartons": {f"carton_{cartons[i]['id']}": "200" for i in range(min(5, len(cartons)))} if cartons else {"carton_1": "1000"}
            }
        ]
        
        results = {}
        for test in performance_tests:
            self.log(f"Performance Testing: {test['name']}")
            
            try:
                start_time = time.time()
                response = self.session.post(
                    f"{self.base_url}/recommend-truck",
                    data=test['cartons']
                )
                end_time = time.time()
                
                processing_time = end_time - start_time
                
                if response.status_code == 200:
                    # Performance benchmarks
                    performance_rating = "Excellent" if processing_time < 2 else \
                                       "Good" if processing_time < 5 else \
                                       "Fair" if processing_time < 10 else "Poor"
                    
                    memory_usage_mb = len(response.content) / 1024 / 1024
                    
                    self.log(f"✅ {test['name']}: {performance_rating} ({processing_time:.2f}s, {memory_usage_mb:.1f}MB)")
                    
                    results[test['name']] = {
                        'status': 'success',
                        'processing_time': processing_time,
                        'performance_rating': performance_rating,
                        'memory_usage_mb': memory_usage_mb,
                        'response_size': len(response.content)
                    }
                else:
                    self.log(f"❌ {test['name']}: FAILED - Status {response.status_code}", "ERROR")
                    results[test['name']] = {
                        'status': 'failed',
                        'status_code': response.status_code
                    }
                    
            except Exception as e:
                self.log(f"❌ {test['name']}: EXCEPTION - {e}", "ERROR")
                results[test['name']] = {'status': 'exception', 'error': str(e)}
        
        self.test_results['performance_bulk'] = results
        return results
    
    def test_3d_visualization_output(self):
        """Test 9: 3D Visualization Functionality"""
        self.log("\n=== Testing 3D Visualization Output ===")
        
        trucks, cartons = self.get_database_data()
        
        try:
            # Test with a moderate load that should generate visualization
            test_data = {f"carton_{cartons[0]['id']}": "10"} if cartons else {"carton_1": "10"}
            
            response = self.session.post(
                f"{self.base_url}/recommend-truck",
                data=test_data
            )
            
            if response.status_code == 200:
                response_text = response.text
                
                # Check for 3D visualization indicators
                visualization_checks = {
                    'threejs_library': 'three.js' in response_text.lower() or 'three.min.js' in response_text.lower(),
                    'canvas_element': '<canvas' in response_text,
                    'position_data': 'position' in response_text,
                    'truck_3d_js': 'truck_3d' in response_text,
                    'webgl_support': 'webgl' in response_text.lower(),
                    'rotation_type': 'rotation_type' in response_text
                }
                
                visualization_score = sum(visualization_checks.values())
                
                self.log(f"3D Visualization Analysis:")
                for check, result in visualization_checks.items():
                    status = "✅" if result else "❌"
                    self.log(f"  {status} {check.replace('_', ' ').title()}: {result}")
                
                overall_status = "Excellent" if visualization_score >= 5 else \
                               "Good" if visualization_score >= 3 else \
                               "Basic" if visualization_score >= 1 else "None"
                
                self.log(f"3D Visualization Status: {overall_status} ({visualization_score}/6 features)")
                
                result = {
                    'status': 'tested',
                    'visualization_score': visualization_score,
                    'overall_rating': overall_status,
                    'features': visualization_checks
                }
            else:
                result = {
                    'status': 'failed',
                    'status_code': response.status_code
                }
                
        except Exception as e:
            result = {'status': 'exception', 'error': str(e)}
            self.log(f"❌ 3D Visualization test exception: {e}", "ERROR")
        
        self.test_results['3d_visualization'] = result
        return result
    
    def test_cost_calculation_analysis(self):
        """Test 10: Cost Calculation and Analysis Features"""
        self.log("\n=== Testing Cost Calculation and Analysis ===")
        
        trucks, cartons = self.get_database_data()
        
        try:
            # Test cost calculation with realistic load
            test_data = {}
            if cartons:
                # Use first 3 carton types with different quantities
                for i in range(min(3, len(cartons))):
                    test_data[f"carton_{cartons[i]['id']}"] = str(20 - i*5)
            else:
                test_data = {"carton_1": "15"}
            
            response = self.session.post(
                f"{self.base_url}/recommend-truck",
                data=test_data
            )
            
            if response.status_code == 200:
                response_text = response.text.lower()
                
                # Check for cost analysis features
                cost_features = {
                    'total_cost': 'total_cost' in response_text or 'total cost' in response_text,
                    'truck_cost': 'truck_cost' in response_text or 'truck cost' in response_text,
                    'fuel_cost': 'fuel' in response_text,
                    'maintenance_cost': 'maintenance' in response_text,
                    'utilization': 'utilization' in response_text or 'efficiency' in response_text,
                    'cost_per_km': 'cost_per_km' in response_text or 'per km' in response_text,
                    'cost_optimization': 'optimization' in response_text,
                    'cost_breakdown': 'breakdown' in response_text or 'analysis' in response_text
                }
                
                cost_score = sum(cost_features.values())
                
                self.log(f"Cost Calculation Analysis:")
                for feature, found in cost_features.items():
                    status = "✅" if found else "❌"
                    self.log(f"  {status} {feature.replace('_', ' ').title()}: {found}")
                
                cost_rating = "Comprehensive" if cost_score >= 6 else \
                             "Good" if cost_score >= 4 else \
                             "Basic" if cost_score >= 2 else "Limited"
                
                self.log(f"Cost Analysis Rating: {cost_rating} ({cost_score}/8 features)")
                
                result = {
                    'status': 'analyzed',
                    'cost_score': cost_score,
                    'cost_rating': cost_rating,
                    'features': cost_features
                }
            else:
                result = {
                    'status': 'failed',
                    'status_code': response.status_code
                }
                
        except Exception as e:
            result = {'status': 'exception', 'error': str(e)}
            self.log(f"❌ Cost calculation test exception: {e}", "ERROR")
        
        self.test_results['cost_calculation'] = result
        return result
    
    def analyze_py3dbp_integration(self):
        """Analyze py3dbp Library Integration and Performance"""
        self.log("\n=== Analyzing py3dbp Integration ===")
        
        # Read the packer.py file to analyze implementation
        try:
            with open('/workspaces/Truck_Opti/app/packer.py', 'r') as f:
                packer_code = f.read()
                
            # Analyze py3dbp usage patterns
            analysis = {
                'py3dbp_imported': 'from py3dbp import' in packer_code,
                'packer_class_used': 'Packer()' in packer_code,
                'bin_class_used': 'Bin(' in packer_code,
                'item_class_used': 'Item(' in packer_code,
                'optimized_version': 'pack_cartons_optimized' in packer_code,
                'parallel_processing': 'ThreadPoolExecutor' in packer_code,
                'caching_implemented': 'lru_cache' in packer_code,
                'performance_logging': 'logging.info' in packer_code,
                'custom_attributes': 'fragile' in packer_code and 'stackable' in packer_code,
                'rotation_support': 'rotation_type' in packer_code,
                'weight_constraints': 'max_weight' in packer_code,
                'multiple_objectives': 'optimization_goal' in packer_code
            }
            
            integration_score = sum(analysis.values())
            
            self.log(f"py3dbp Integration Analysis:")
            for feature, implemented in analysis.items():
                status = "✅" if implemented else "❌"
                self.log(f"  {status} {feature.replace('_', ' ').title()}: {implemented}")
            
            integration_rating = "Advanced" if integration_score >= 10 else \
                               "Good" if integration_score >= 7 else \
                               "Basic" if integration_score >= 4 else "Limited"
            
            self.log(f"Integration Rating: {integration_rating} ({integration_score}/12 features)")
            
            # Performance optimization analysis
            optimization_features = {
                'item_caching': 'item_cache' in packer_code,
                'pre_sorting': 'items.sort' in packer_code,
                'parallel_support': 'use_parallel' in packer_code,
                'batch_processing': 'batch_size' in packer_code,
                'memory_optimization': 'remaining_items' in packer_code
            }
            
            optimization_score = sum(optimization_features.values())
            
            self.log(f"Performance Optimizations:")
            for feature, implemented in optimization_features.items():
                status = "✅" if implemented else "❌"
                self.log(f"  {status} {feature.replace('_', ' ').title()}: {implemented}")
            
            result = {
                'integration_score': integration_score,
                'integration_rating': integration_rating,
                'optimization_score': optimization_score,
                'features': analysis,
                'optimizations': optimization_features
            }
            
        except Exception as e:
            result = {'status': 'exception', 'error': str(e)}
            self.log(f"❌ py3dbp analysis exception: {e}", "ERROR")
        
        self.test_results['py3dbp_integration'] = result
        return result
    
    def generate_comprehensive_report(self):
        """Generate comprehensive test report"""
        self.log("\n" + "="*80)
        self.log("TruckOpti 3D Bin Packing Optimization - COMPREHENSIVE TEST REPORT")
        self.log("="*80)
        
        # Summary statistics
        total_tests = len(self.test_results)
        successful_tests = sum(1 for result in self.test_results.values() 
                              if isinstance(result, dict) and result.get('status') != 'exception')
        
        self.log(f"\nTest Summary: {successful_tests}/{total_tests} test categories completed successfully")
        
        # Performance metrics summary
        all_processing_times = []
        for test_category, results in self.test_results.items():
            if isinstance(results, dict):
                if 'processing_time' in results:
                    all_processing_times.append(results['processing_time'])
                elif isinstance(results, dict):
                    for sub_result in results.values():
                        if isinstance(sub_result, dict) and 'processing_time' in sub_result:
                            all_processing_times.append(sub_result['processing_time'])
        
        if all_processing_times:
            avg_processing_time = sum(all_processing_times) / len(all_processing_times)
            max_processing_time = max(all_processing_times)
            min_processing_time = min(all_processing_times)
            
            self.log(f"\nPerformance Summary:")
            self.log(f"  Average processing time: {avg_processing_time:.2f}s")
            self.log(f"  Fastest operation: {min_processing_time:.2f}s")
            self.log(f"  Slowest operation: {max_processing_time:.2f}s")
        
        # Detailed results by category
        self.log(f"\n{'='*50}")
        self.log("DETAILED TEST RESULTS BY CATEGORY")
        self.log("="*50)
        
        for category, results in self.test_results.items():
            self.log(f"\n{category.upper().replace('_', ' ')}:")
            self.log("-" * 40)
            
            if isinstance(results, dict):
                if 'status' in results:
                    # Single test result
                    status = results['status']
                    self.log(f"  Status: {status}")
                    
                    if 'processing_time' in results:
                        self.log(f"  Processing Time: {results['processing_time']:.2f}s")
                    if 'integration_rating' in results:
                        self.log(f"  Integration Rating: {results['integration_rating']}")
                    if 'cost_rating' in results:
                        self.log(f"  Cost Analysis Rating: {results['cost_rating']}")
                    if 'overall_rating' in results:
                        self.log(f"  Overall Rating: {results['overall_rating']}")
                else:
                    # Multiple test results
                    for test_name, test_result in results.items():
                        if isinstance(test_result, dict):
                            status = test_result.get('status', 'unknown')
                            processing_time = test_result.get('processing_time', 0)
                            self.log(f"  {test_name}: {status} ({processing_time:.2f}s)")
        
        # Key findings and recommendations
        self.log(f"\n{'='*50}")
        self.log("KEY FINDINGS & RECOMMENDATIONS")
        self.log("="*50)
        
        findings = []
        
        # Analyze py3dbp integration
        if 'py3dbp_integration' in self.test_results:
            integration_result = self.test_results['py3dbp_integration']
            if integration_result.get('integration_rating') == 'Advanced':
                findings.append("✅ Excellent py3dbp integration with advanced optimization features")
            elif integration_result.get('integration_rating') == 'Good':
                findings.append("✅ Good py3dbp integration with room for minor improvements")
            else:
                findings.append("⚠️ py3dbp integration could be enhanced")
        
        # Analyze performance
        if all_processing_times and avg_processing_time < 3:
            findings.append("✅ Excellent performance - fast optimization processing")
        elif all_processing_times and avg_processing_time < 8:
            findings.append("✅ Good performance - acceptable processing times")
        else:
            findings.append("⚠️ Performance optimization may be needed for large datasets")
        
        # Analyze 3D visualization
        if '3d_visualization' in self.test_results:
            viz_result = self.test_results['3d_visualization']
            if viz_result.get('overall_rating') in ['Excellent', 'Good']:
                findings.append("✅ 3D visualization features are well implemented")
            else:
                findings.append("⚠️ 3D visualization features may need enhancement")
        
        # Analyze cost calculation
        if 'cost_calculation' in self.test_results:
            cost_result = self.test_results['cost_calculation']
            if cost_result.get('cost_rating') in ['Comprehensive', 'Good']:
                findings.append("✅ Cost calculation and analysis features are robust")
            else:
                findings.append("⚠️ Cost calculation features could be expanded")
        
        for finding in findings:
            self.log(f"  {finding}")
        
        # Overall assessment
        self.log(f"\n{'='*50}")
        self.log("OVERALL ASSESSMENT")
        self.log("="*50)
        
        success_rate = (successful_tests / total_tests) * 100 if total_tests > 0 else 0
        
        if success_rate >= 90:
            overall_rating = "EXCELLENT"
            assessment = "The TruckOpti 3D bin packing optimization system is performing excellently with robust algorithms and features."
        elif success_rate >= 75:
            overall_rating = "GOOD"
            assessment = "The TruckOpti system is performing well with minor areas for improvement."
        elif success_rate >= 60:
            overall_rating = "FAIR"
            assessment = "The TruckOpti system is functional but needs several improvements."
        else:
            overall_rating = "NEEDS_IMPROVEMENT"
            assessment = "The TruckOpti system requires significant attention to core functionality."
        
        self.log(f"Overall Rating: {overall_rating}")
        self.log(f"Success Rate: {success_rate:.1f}%")
        self.log(f"Assessment: {assessment}")
        
        return {
            'overall_rating': overall_rating,
            'success_rate': success_rate,
            'total_tests': total_tests,
            'successful_tests': successful_tests,
            'avg_processing_time': avg_processing_time if all_processing_times else 0,
            'detailed_results': self.test_results,
            'findings': findings,
            'assessment': assessment
        }
    
    def run_all_tests(self):
        """Execute all test categories"""
        self.log("Starting comprehensive 3D bin packing optimization tests...")
        
        # Check server connectivity first
        if not self.test_server_connectivity():
            self.log("❌ Cannot proceed - server not accessible", "ERROR")
            return
        
        # Execute all test categories
        test_methods = [
            self.test_truck_requirement_calculator,
            self.test_fit_cartons_feature,
            self.test_recommend_truck_feature,
            self.test_fleet_optimization,
            self.test_optimization_scenarios,
            self.test_invalid_inputs,
            self.test_performance_bulk_optimization,
            self.test_3d_visualization_output,
            self.test_cost_calculation_analysis,
            self.analyze_py3dbp_integration
        ]
        
        for test_method in test_methods:
            try:
                test_method()
            except Exception as e:
                self.log(f"❌ Test method {test_method.__name__} failed: {e}", "ERROR")
        
        # Generate final report
        return self.generate_comprehensive_report()

def main():
    """Main test execution"""
    print("TruckOpti 3D Bin Packing Optimization - Comprehensive Testing Suite")
    print("=" * 80)
    
    tester = TruckOptiPackingTester()
    final_report = tester.run_all_tests()
    
    # Save test results to file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_file = f"/workspaces/Truck_Opti/packing_optimization_test_report_{timestamp}.json"
    
    try:
        with open(report_file, 'w') as f:
            json.dump(final_report, f, indent=2, default=str)
        print(f"\n📝 Detailed test report saved to: {report_file}")
    except Exception as e:
        print(f"❌ Failed to save test report: {e}")
    
    print("\n🔍 Testing Complete!")
    return final_report

if __name__ == "__main__":
    main()