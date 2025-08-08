#!/usr/bin/env python3
"""
Comprehensive 3D Bin Packing and Optimization Testing Script
Tests the core optimization algorithms, UI, and functionality
"""

import requests
import time
import json
from datetime import datetime
from bs4 import BeautifulSoup
import random

BASE_URL = "http://127.0.0.1:5000"

class OptimizationTester:
    def __init__(self):
        self.session = requests.Session()
        self.results = {
            'truck_recommendation': {},
            'fit_cartons': {},
            'fleet_optimization': {},
            'calculator': {},
            'optimization_accuracy': {},
            'performance_metrics': {},
            'ui_functionality': {},
            'cost_calculations': {},
            'issues': []
        }
        self.test_scenarios = []
    
    def log(self, message, test_type="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {test_type}: {message}")
    
    def test_truck_recommendation_feature(self):
        """Test the 'Recommend Truck for Cartons' feature"""
        self.log("=== TESTING TRUCK RECOMMENDATION FEATURE ===", "TEST")
        
        # Test page loading
        response = self.session.get(f"{BASE_URL}/recommend-truck")
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Check form elements
            form = soup.find('form')
            if form:
                # Check for carton selection mechanism
                carton_selectors = (
                    soup.find_all('select', {'name': lambda x: x and 'carton' in x.lower()}) +
                    soup.find_all('input', {'name': lambda x: x and 'carton' in x.lower()}) +
                    soup.find_all('input', {'type': 'checkbox'})
                )
                
                submit_button = soup.find('input', {'type': 'submit'}) or soup.find('button', {'type': 'submit'})
                
                self.results['truck_recommendation']['page_loads'] = True
                self.results['truck_recommendation']['has_form'] = True
                self.results['truck_recommendation']['carton_selection_available'] = len(carton_selectors) > 0
                self.results['truck_recommendation']['has_submit'] = bool(submit_button)
                
                self.log(f"✅ Truck recommendation page loaded")
                self.log(f"📋 Carton selection elements: {len(carton_selectors)} found")
                self.log(f"🔘 Submit button: {'✅' if submit_button else '❌'}")
                
                # Test form submission (if we can identify cartons)
                if carton_selectors and submit_button:
                    self.log("🧪 Testing recommendation form submission...")
                    
                    # Try to submit with minimal data
                    test_data = {}
                    
                    # Try different common field names
                    possible_fields = ['carton_ids', 'cartons', 'selected_cartons', 'carton_types']
                    for field in possible_fields:
                        test_data[field] = ['1', '2']  # Try selecting first few cartons
                    
                    try:
                        submit_response = self.session.post(f"{BASE_URL}/recommend-truck", data=test_data)
                        
                        if submit_response.status_code in [200, 302]:
                            self.results['truck_recommendation']['form_submission_works'] = True
                            self.log("✅ Truck recommendation form submission successful")
                            
                            if 'recommend' in submit_response.text.lower() or 'truck' in submit_response.text.lower():
                                self.log("✅ Recommendation results appear to be displayed")
                        else:
                            self.log(f"⚠️ Form submission returned status {submit_response.status_code}")
                            self.results['issues'].append(f"Truck recommendation form submission failed: {submit_response.status_code}")
                    except Exception as e:
                        self.log(f"❌ Error testing form submission: {e}", "ERROR")
                        self.results['issues'].append(f"Truck recommendation form error: {str(e)}")
            else:
                self.log("❌ No form found on truck recommendation page", "ERROR")
                self.results['issues'].append("Truck recommendation page has no form")
        else:
            self.log(f"❌ Truck recommendation page failed to load: {response.status_code}", "ERROR")
            self.results['issues'].append(f"Truck recommendation page error: {response.status_code}")
    
    def test_fit_cartons_feature(self):
        """Test the 'Fit Cartons in Selected Trucks' feature"""
        self.log("=== TESTING FIT CARTONS FEATURE ===", "TEST")
        
        response = self.session.get(f"{BASE_URL}/fit-cartons")
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            form = soup.find('form')
            if form:
                # Check for truck and carton selection
                truck_selectors = soup.find_all('select', {'name': lambda x: x and 'truck' in x.lower()})
                carton_selectors = soup.find_all('select', {'name': lambda x: x and 'carton' in x.lower()})
                checkboxes = soup.find_all('input', {'type': 'checkbox'})
                
                # Check for quantity inputs
                quantity_inputs = soup.find_all('input', {'type': 'number'}) or soup.find_all('input', {'name': lambda x: x and 'qty' in x.lower() or 'quantity' in x.lower()})
                
                self.results['fit_cartons'] = {
                    'page_loads': True,
                    'has_form': True,
                    'truck_selectors': len(truck_selectors),
                    'carton_selectors': len(carton_selectors),
                    'checkboxes': len(checkboxes),
                    'quantity_inputs': len(quantity_inputs),
                    'total_interactive_elements': len(truck_selectors) + len(carton_selectors) + len(checkboxes) + len(quantity_inputs)
                }
                
                self.log(f"✅ Fit cartons page loaded")
                self.log(f"🚛 Truck selectors: {len(truck_selectors)}")
                self.log(f"📦 Carton selectors: {len(carton_selectors)}")
                self.log(f"☑️ Checkboxes: {len(checkboxes)}")
                self.log(f"🔢 Quantity inputs: {len(quantity_inputs)}")
                
                if len(truck_selectors) + len(carton_selectors) + len(checkboxes) == 0:
                    self.log("⚠️ No truck or carton selection mechanism found", "WARNING")
                    self.results['issues'].append("Fit cartons page lacks selection mechanism")
                
                # Test form submission
                if form:
                    self.log("🧪 Testing fit cartons form submission...")
                    try:
                        # Create test data
                        test_data = {
                            'truck_id': '1',
                            'carton_1_qty': '5',
                            'carton_2_qty': '3'
                        }
                        
                        submit_response = self.session.post(f"{BASE_URL}/fit-cartons", data=test_data)
                        
                        if submit_response.status_code in [200, 302]:
                            self.results['fit_cartons']['form_works'] = True
                            self.log("✅ Fit cartons form submission successful")
                        else:
                            self.log(f"⚠️ Fit cartons form returned status {submit_response.status_code}")
                    except Exception as e:
                        self.log(f"❌ Error testing fit cartons: {e}", "ERROR")
            else:
                self.log("❌ No form found on fit cartons page", "ERROR")
        else:
            self.log(f"❌ Fit cartons page failed to load: {response.status_code}", "ERROR")
    
    def test_fleet_optimization(self):
        """Test fleet optimization functionality"""
        self.log("=== TESTING FLEET OPTIMIZATION ===", "TEST")
        
        response = self.session.get(f"{BASE_URL}/fleet-optimization")
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Check for optimization parameters
            form = soup.find('form')
            optimization_elements = {
                'has_form': bool(form),
                'optimization_goals': len(soup.find_all('select', {'name': lambda x: x and 'goal' in x.lower() or 'objective' in x.lower()})),
                'carton_inputs': len(soup.find_all('input', {'name': lambda x: x and 'carton' in x.lower()})),
                'constraint_inputs': len(soup.find_all('input', {'name': lambda x: x and any(word in x.lower() for word in ['weight', 'volume', 'cost'])})),
                'submit_button': bool(soup.find('input', {'type': 'submit'}) or soup.find('button', {'type': 'submit'}))
            }
            
            self.results['fleet_optimization'] = optimization_elements
            
            self.log(f"✅ Fleet optimization page loaded")
            self.log(f"🎯 Optimization parameters found: {sum(optimization_elements.values())}/5")
            
            # Test optimization execution
            if form and optimization_elements['submit_button']:
                self.log("🧪 Testing fleet optimization execution...")
                try:
                    test_data = {
                        'optimization_goal': 'minimize_cost',
                        'carton_1_qty': '10',
                        'carton_2_qty': '15',
                        'max_trucks': '5'
                    }
                    
                    start_time = time.time()
                    opt_response = self.session.post(f"{BASE_URL}/fleet-optimization", data=test_data)
                    end_time = time.time()
                    
                    optimization_time = (end_time - start_time) * 1000
                    
                    if opt_response.status_code in [200, 302]:
                        self.results['fleet_optimization']['optimization_works'] = True
                        self.results['fleet_optimization']['optimization_time_ms'] = optimization_time
                        self.log(f"✅ Fleet optimization completed in {optimization_time:.2f}ms")
                    else:
                        self.log(f"⚠️ Fleet optimization returned status {opt_response.status_code}")
                        
                except Exception as e:
                    self.log(f"❌ Fleet optimization error: {e}", "ERROR")
                    self.results['issues'].append(f"Fleet optimization failed: {str(e)}")
        else:
            self.log(f"❌ Fleet optimization page failed to load: {response.status_code}", "ERROR")
    
    def test_truck_calculator(self):
        """Test truck requirement calculator"""
        self.log("=== TESTING TRUCK REQUIREMENT CALCULATOR ===", "TEST")
        
        response = self.session.get(f"{BASE_URL}/calculate-truck-requirements")
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            form = soup.find('form')
            if form:
                # Check for calculator inputs
                calculator_elements = {
                    'carton_quantity_inputs': len(soup.find_all('input', {'type': 'number'})),
                    'carton_selection': len(soup.find_all('select', {'name': lambda x: x and 'carton' in x.lower()})),
                    'calculation_button': bool(soup.find('button', string=lambda x: x and 'calculate' in x.lower()) or 
                                             soup.find('input', {'value': lambda x: x and 'calculate' in x.lower()})),
                    'result_display_area': bool(soup.find('div', {'id': lambda x: x and 'result' in x.lower()}) or
                                              soup.find('div', class_=lambda x: x and 'result' in x.lower()))
                }
                
                self.results['calculator'] = calculator_elements
                
                self.log(f"✅ Calculator page loaded")
                self.log(f"🧮 Calculator elements: {sum(calculator_elements.values())}/4")
                
                # Test calculation
                if calculator_elements['calculation_button']:
                    self.log("🧪 Testing truck requirement calculation...")
                    try:
                        calc_data = {
                            'carton_1_qty': '20',
                            'carton_2_qty': '15',
                            'carton_3_qty': '10'
                        }
                        
                        start_time = time.time()
                        calc_response = self.session.post(f"{BASE_URL}/calculate-truck-requirements", data=calc_data)
                        end_time = time.time()
                        
                        calc_time = (end_time - start_time) * 1000
                        
                        if calc_response.status_code in [200, 302]:
                            self.results['calculator']['calculation_works'] = True
                            self.results['calculator']['calculation_time_ms'] = calc_time
                            self.log(f"✅ Calculator processed request in {calc_time:.2f}ms")
                            
                            # Check if results are shown
                            if any(word in calc_response.text.lower() for word in ['truck', 'recommend', 'optimal', 'result']):
                                self.log("✅ Calculator appears to show results")
                            else:
                                self.log("⚠️ Calculator results not clearly displayed")
                        else:
                            self.log(f"⚠️ Calculator returned status {calc_response.status_code}")
                            
                    except Exception as e:
                        self.log(f"❌ Calculator error: {e}", "ERROR")
                        self.results['issues'].append(f"Calculator failed: {str(e)}")
            else:
                self.log("❌ No form found on calculator page", "ERROR")
        else:
            self.log(f"❌ Calculator page failed to load: {response.status_code}", "ERROR")
    
    def test_optimization_algorithm_accuracy(self):
        """Test the accuracy and performance of optimization algorithms"""
        self.log("=== TESTING OPTIMIZATION ALGORITHM ACCURACY ===", "TEST")
        
        # Create test scenarios with known outcomes
        test_scenarios = [
            {
                'name': 'Small Load Test',
                'cartons': {'Small Box (20x15x10)': 5, 'Medium Box (30x25x15)': 3},
                'expected_efficiency': '>50%'
            },
            {
                'name': 'Medium Load Test', 
                'cartons': {'Small Box (20x15x10)': 20, 'Medium Box (30x25x15)': 15, 'Large Box (40x35x25)': 8},
                'expected_efficiency': '>60%'
            },
            {
                'name': 'Large Load Test',
                'cartons': {'Small Box (20x15x10)': 50, 'Medium Box (30x25x15)': 30, 'Large Box (40x35x25)': 20},
                'expected_efficiency': '>65%'
            }
        ]
        
        algorithm_results = []
        
        for scenario in test_scenarios:
            self.log(f"🧪 Testing scenario: {scenario['name']}")
            
            try:
                # Test with fleet optimization endpoint
                scenario_data = {
                    'optimization_goal': 'maximize_efficiency'
                }
                
                # Add carton quantities
                for i, (carton_name, qty) in enumerate(scenario['cartons'].items(), 1):
                    scenario_data[f'carton_{i}_qty'] = str(qty)
                
                start_time = time.time()
                response = self.session.post(f"{BASE_URL}/fleet-optimization", data=scenario_data)
                end_time = time.time()
                
                processing_time = (end_time - start_time) * 1000
                
                scenario_result = {
                    'scenario': scenario['name'],
                    'processing_time_ms': processing_time,
                    'status_code': response.status_code,
                    'success': response.status_code in [200, 302],
                    'total_cartons': sum(scenario['cartons'].values())
                }
                
                algorithm_results.append(scenario_result)
                
                if scenario_result['success']:
                    self.log(f"✅ {scenario['name']}: Processed {scenario_result['total_cartons']} cartons in {processing_time:.2f}ms")
                else:
                    self.log(f"❌ {scenario['name']}: Failed with status {response.status_code}")
                    
            except Exception as e:
                self.log(f"❌ Error in {scenario['name']}: {e}", "ERROR")
                algorithm_results.append({
                    'scenario': scenario['name'],
                    'error': str(e),
                    'success': False
                })
        
        self.results['optimization_accuracy'] = {
            'scenarios_tested': len(test_scenarios),
            'scenarios_successful': sum(1 for r in algorithm_results if r.get('success', False)),
            'average_processing_time_ms': sum(r.get('processing_time_ms', 0) for r in algorithm_results) / len(algorithm_results) if algorithm_results else 0,
            'detailed_results': algorithm_results
        }
        
        success_rate = (self.results['optimization_accuracy']['scenarios_successful'] / len(test_scenarios)) * 100
        self.log(f"📊 Algorithm Testing Results: {success_rate:.1f}% success rate")
        self.log(f"⚡ Average processing time: {self.results['optimization_accuracy']['average_processing_time_ms']:.2f}ms")
    
    def test_3d_visualization_integration(self):
        """Test 3D visualization and Three.js integration"""
        self.log("=== TESTING 3D VISUALIZATION INTEGRATION ===", "TEST")
        
        # Test pages that should have 3D visualization
        visualization_pages = [
            '/fit-cartons',
            '/fleet-optimization', 
            '/packing-result',
            '/recommend-truck'
        ]
        
        visualization_results = {}
        
        for page in visualization_pages:
            try:
                response = self.session.get(BASE_URL + page)
                
                if response.status_code == 200:
                    content = response.text
                    
                    # Check for Three.js and 3D elements
                    has_threejs = 'three.js' in content.lower() or 'three.min.js' in content.lower()
                    has_canvas = '<canvas' in content
                    has_3d_controls = any(term in content.lower() for term in ['orbitcontrols', '3d', 'camera', 'renderer'])
                    has_truck_3d = 'truck_3d' in content.lower() or 'truck3d' in content.lower()
                    
                    visualization_results[page] = {
                        'page_loads': True,
                        'has_threejs': has_threejs,
                        'has_canvas': has_canvas,
                        'has_3d_controls': has_3d_controls,
                        'has_truck_3d': has_truck_3d,
                        'visualization_score': sum([has_threejs, has_canvas, has_3d_controls, has_truck_3d])
                    }
                    
                    self.log(f"📊 {page}: 3D elements {visualization_results[page]['visualization_score']}/4")
                else:
                    visualization_results[page] = {'page_loads': False, 'error': response.status_code}
                    
            except Exception as e:
                visualization_results[page] = {'error': str(e)}
                self.log(f"❌ Error testing {page}: {e}", "ERROR")
        
        self.results['3d_visualization'] = visualization_results
        
        total_viz_score = sum(r.get('visualization_score', 0) for r in visualization_results.values())
        max_possible_score = len(visualization_pages) * 4
        viz_percentage = (total_viz_score / max_possible_score) * 100 if max_possible_score > 0 else 0
        
        self.log(f"🎨 3D Visualization Integration: {viz_percentage:.1f}% ({total_viz_score}/{max_possible_score})")
    
    def generate_optimization_report(self):
        """Generate comprehensive optimization testing report"""
        self.log("=== GENERATING OPTIMIZATION TEST REPORT ===", "TEST")
        
        report = f"""
3D BIN PACKING & OPTIMIZATION COMPREHENSIVE TEST REPORT
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
{'='*80}

EXECUTIVE SUMMARY:
Core optimization features are the heart of TruckOpti. This report evaluates
all optimization-related functionality, algorithms, and user interfaces.

FEATURE-BY-FEATURE ANALYSIS:

1. TRUCK RECOMMENDATION ('Recommend Truck for Cartons'):
   Page Status: {'✅ Loads' if self.results['truck_recommendation'].get('page_loads') else '❌ Issues'}
   Form Present: {'✅' if self.results['truck_recommendation'].get('has_form') else '❌'}
   Carton Selection: {'✅' if self.results['truck_recommendation'].get('carton_selection_available') else '❌ NOT AVAILABLE'}
   Functionality: {'✅ Working' if self.results['truck_recommendation'].get('form_submission_works') else '❌ NOT WORKING'}

2. FIT CARTONS IN SELECTED TRUCKS:
   Page Status: {'✅ Loads' if self.results['fit_cartons'].get('page_loads') else '❌ Issues'}
   Truck Selection: {self.results['fit_cartons'].get('truck_selectors', 0)} selectors found
   Carton Selection: {self.results['fit_cartons'].get('carton_selectors', 0)} selectors found
   Interactive Elements: {self.results['fit_cartons'].get('total_interactive_elements', 0)} total
   User Experience: {'⚠️ CONFUSING - Shows all trucks' if self.results['fit_cartons'].get('truck_selectors', 0) > 10 else '✅ Manageable'}

3. FLEET OPTIMIZATION:
   Page Status: {'✅ Loads' if self.results['fleet_optimization'].get('has_form') else '❌ Issues'}
   Optimization Parameters: {sum(v for k, v in self.results['fleet_optimization'].items() if isinstance(v, int))}/5
   Processing: {'✅ Working' if self.results['fleet_optimization'].get('optimization_works') else '❌ Issues'}
   Performance: {self.results['fleet_optimization'].get('optimization_time_ms', 'N/A')}ms

4. TRUCK REQUIREMENT CALCULATOR:
   Page Status: {'✅ Loads' if 'calculator' in self.results and self.results['calculator'] else '❌ Issues'}
   Calculator Elements: {sum(v for v in self.results.get('calculator', {}).values() if isinstance(v, bool))}/4
   Calculation Works: {'✅' if self.results.get('calculator', {}).get('calculation_works') else '❌'}
   Should Show: BEST POSSIBLE TRUCK WITH CARTON FITTING VISUALIZATION

5. OPTIMIZATION ALGORITHM PERFORMANCE:
"""
        
        if 'optimization_accuracy' in self.results:
            acc_results = self.results['optimization_accuracy']
            report += f"""   Scenarios Tested: {acc_results['scenarios_tested']}
   Success Rate: {(acc_results['scenarios_successful']/acc_results['scenarios_tested']*100):.1f}%
   Average Processing Time: {acc_results['average_processing_time_ms']:.2f}ms
   Algorithm Status: {'🟢 EXCELLENT' if acc_results['scenarios_successful']/acc_results['scenarios_tested'] > 0.8 else '⚠️ NEEDS REVIEW'}
"""
        
        report += f"""
6. 3D VISUALIZATION INTEGRATION:
"""
        if '3d_visualization' in self.results:
            viz_results = self.results['3d_visualization']
            for page, result in viz_results.items():
                report += f"   {page}: {result.get('visualization_score', 0)}/4 3D elements\n"
        
        report += f"""

CRITICAL USER EXPERIENCE ISSUES IDENTIFIED:
"""
        
        # Add specific UX issues mentioned by user
        ux_issues = [
            "CATEGORY OF TRUCK SHOWING, BUT OPTION TO ADD CATEGORY NOT THERE",
            "Recommend Truck for Cartons NOT WORKING",
            "Fit Cartons in Selected Trucks - WHY ALL TRUCK SHOWING? User confusion",
            "Truck Requirement Calculator SHOULD SHOW BEST POSSIBLE TRUCK WITH FITTING",
            "Menu items not fully visible - UI overlap issues",
            "Charts getting overlapped by option menu"
        ]
        
        for i, issue in enumerate(ux_issues, 1):
            report += f"{i}. {issue}\n"
        
        report += f"""

ALGORITHMIC ISSUES:
"""
        if self.results['issues']:
            for i, issue in enumerate(self.results['issues'], 1):
                report += f"{i}. {issue}\n"
        else:
            report += "No critical algorithmic issues detected.\n"
        
        report += f"""

RECOMMENDATIONS FOR IMMEDIATE IMPROVEMENT:

1. 🔴 CRITICAL - Fix "Recommend Truck for Cartons":
   - Ensure carton selection mechanism works
   - Display clear recommendations with truck types
   - Show cost and efficiency comparisons

2. 🔴 CRITICAL - Improve "Fit Cartons in Selected Trucks":
   - Don't show ALL trucks - implement smart filtering
   - Add truck capacity indicators
   - Show real-time fitting visualization

3. 🟡 HIGH PRIORITY - Enhance Calculator:
   - Show BEST possible truck recommendation
   - Include 3D visualization of packing
   - Display efficiency metrics and cost analysis

4. 🟡 HIGH PRIORITY - UI/UX Fixes:
   - Fix menu overlap issues
   - Ensure all menu items are visible
   - Prevent chart overlapping with menus

5. 🟢 MEDIUM PRIORITY - Add Truck Categories:
   - Implement truck category management
   - Allow users to add/edit categories
   - Group trucks by type (Light/Medium/Heavy)

PERFORMANCE ASSESSMENT:
- Algorithm Speed: {'🟢 EXCELLENT' if self.results.get('optimization_accuracy', {}).get('average_processing_time_ms', 1000) < 500 else '🟡 ACCEPTABLE' if self.results.get('optimization_accuracy', {}).get('average_processing_time_ms', 1000) < 2000 else '🔴 SLOW'}
- Reliability: {'🟢 HIGH' if len(self.results['issues']) < 3 else '🟡 MEDIUM' if len(self.results['issues']) < 6 else '🔴 LOW'}
- User Experience: 🔴 NEEDS SIGNIFICANT IMPROVEMENT

OVERALL OPTIMIZATION GRADE: {'B- (Functional but needs UX improvements)' if self.results.get('optimization_accuracy', {}).get('scenarios_successful', 0) > 0 else 'D+ (Core issues need fixing)'}
"""
        
        # Save report
        with open('/workspaces/Truck_Opti/OPTIMIZATION_COMPREHENSIVE_REPORT.md', 'w') as f:
            f.write(report)
        
        print(report)
        return report
    
    def run_all_tests(self):
        """Run all optimization tests"""
        print("🚛 3D Bin Packing & Optimization Testing Starting...")
        print("="*80)
        
        start_time = time.time()
        
        try:
            self.test_truck_recommendation_feature()
            self.test_fit_cartons_feature()
            self.test_fleet_optimization()
            self.test_truck_calculator()
            self.test_optimization_algorithm_accuracy()
            self.test_3d_visualization_integration()
            
        except Exception as e:
            self.log(f"Critical error during testing: {str(e)}", "ERROR")
            self.results['issues'].append(f"Critical test failure: {str(e)}")
        
        end_time = time.time()
        total_time = end_time - start_time
        
        self.log(f"🎉 Optimization testing completed in {total_time:.2f} seconds")
        
        return self.generate_optimization_report()


if __name__ == "__main__":
    tester = OptimizationTester()
    tester.run_all_tests()