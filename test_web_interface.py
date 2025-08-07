#!/usr/bin/env python3
"""
TruckOpti Web Interface Testing Suite
Tests the web-based optimization features
"""

import requests
import time
from bs4 import BeautifulSoup
import json

class TruckOptiWebTester:
    def __init__(self, base_url="http://127.0.0.1:5000"):
        self.base_url = base_url
        self.session = requests.Session()
        
    def log(self, message, level="INFO"):
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
        
    def test_server_connectivity(self):
        """Test server availability"""
        try:
            response = self.session.get(self.base_url)
            return response.status_code == 200
        except:
            return False
    
    def test_homepage(self):
        """Test homepage accessibility and content"""
        self.log("Testing homepage...")
        
        try:
            response = self.session.get(self.base_url)
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Check for key elements
                has_title = soup.find('title') is not None
                has_nav = soup.find('nav') is not None
                has_dashboard = 'dashboard' in response.text.lower()
                
                self.log(f"✅ Homepage: Title: {has_title}, Nav: {has_nav}, Dashboard: {has_dashboard}")
                return True
            else:
                self.log(f"❌ Homepage failed with status: {response.status_code}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Homepage exception: {e}", "ERROR")
            return False
    
    def test_truck_requirement_calculator(self):
        """Test truck requirement calculator"""
        self.log("Testing truck requirement calculator...")
        
        try:
            # Get the page
            response = self.session.get(f"{self.base_url}/calculate-truck-requirements")
            if response.status_code != 200:
                self.log(f"❌ Calculator page not accessible: {response.status_code}", "ERROR")
                return False
            
            # Test with sample data
            test_data = {
                'carton_type_1': 'LED TV 32',
                'carton_qty_1': '10',
                'carton_type_2': 'Microwave',
                'carton_qty_2': '5'
            }
            
            start_time = time.time()
            response = self.session.post(f"{self.base_url}/calculate-truck-requirements", data=test_data)
            end_time = time.time()
            
            processing_time = end_time - start_time
            
            if response.status_code == 200:
                has_results = 'result' in response.text.lower()
                has_3d = 'three.js' in response.text or '3d' in response.text.lower()
                
                self.log(f"✅ Calculator: Results: {has_results}, 3D: {has_3d}, Time: {processing_time:.2f}s")
                return True
            else:
                self.log(f"❌ Calculator failed with status: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Calculator exception: {e}", "ERROR")
            return False
    
    def test_fit_cartons(self):
        """Test fit cartons functionality"""
        self.log("Testing fit cartons...")
        
        try:
            # Get page first
            response = self.session.get(f"{self.base_url}/fit-cartons")
            if response.status_code != 200:
                self.log(f"❌ Fit cartons page not accessible: {response.status_code}", "ERROR")
                return False
            
            # Test with form data
            test_data = {
                'truck_1': '1',  # Select first truck
                'carton_type_1': '1',
                'carton_qty_1': '15',
                'carton_type_2': '2',
                'carton_qty_2': '8'
            }
            
            start_time = time.time()
            response = self.session.post(f"{self.base_url}/fit-cartons", data=test_data)
            end_time = time.time()
            
            processing_time = end_time - start_time
            
            if response.status_code == 200:
                response_text = response.text.lower()
                has_packing_results = 'packing' in response_text
                has_utilization = 'utilization' in response_text
                has_cost = 'cost' in response_text
                
                self.log(f"✅ Fit Cartons: Packing: {has_packing_results}, Util: {has_utilization}, Cost: {has_cost}, Time: {processing_time:.2f}s")
                return True
            else:
                self.log(f"❌ Fit cartons failed: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Fit cartons exception: {e}", "ERROR")
            return False
    
    def test_recommend_truck(self):
        """Test truck recommendation"""
        self.log("Testing truck recommendation...")
        
        try:
            # Get page
            response = self.session.get(f"{self.base_url}/recommend-truck")
            if response.status_code != 200:
                self.log(f"❌ Recommend truck page not accessible: {response.status_code}", "ERROR")
                return False
            
            # Test with carton data - using carton IDs that might exist
            test_data = {
                'carton_1': '20',  # Generic form field
                'carton_2': '15',
                'carton_3': '10'
            }
            
            start_time = time.time()
            response = self.session.post(f"{self.base_url}/recommend-truck", data=test_data)
            end_time = time.time()
            
            processing_time = end_time - start_time
            
            if response.status_code == 200:
                response_text = response.text.lower()
                has_recommendation = 'recommend' in response_text
                has_cost_analysis = 'cost' in response_text
                has_optimization = 'optimization' in response_text
                
                self.log(f"✅ Recommend Truck: Rec: {has_recommendation}, Cost: {has_cost_analysis}, Opt: {has_optimization}, Time: {processing_time:.2f}s")
                return True
            else:
                self.log(f"❌ Recommend truck failed: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Recommend truck exception: {e}", "ERROR")
            return False
    
    def test_fleet_optimization(self):
        """Test fleet optimization"""
        self.log("Testing fleet optimization...")
        
        try:
            response = self.session.get(f"{self.base_url}/fleet-optimization")
            if response.status_code == 200:
                response_text = response.text.lower()
                has_form = 'form' in response_text
                has_optimization = 'optimization' in response_text
                has_fleet = 'fleet' in response_text
                
                self.log(f"✅ Fleet Optimization: Form: {has_form}, Opt: {has_optimization}, Fleet: {has_fleet}")
                return True
            else:
                self.log(f"❌ Fleet optimization page failed: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Fleet optimization exception: {e}", "ERROR")
            return False
    
    def test_analytics_dashboard(self):
        """Test analytics dashboard"""
        self.log("Testing analytics dashboard...")
        
        try:
            response = self.session.get(f"{self.base_url}/analytics")
            if response.status_code == 200:
                response_text = response.text.lower()
                has_charts = 'chart' in response_text or 'analytics' in response_text
                has_dashboard = 'dashboard' in response_text
                has_metrics = 'metric' in response_text or 'kpi' in response_text
                
                self.log(f"✅ Analytics: Charts: {has_charts}, Dashboard: {has_dashboard}, Metrics: {has_metrics}")
                return True
            else:
                self.log(f"❌ Analytics page failed: {response.status_code}", "ERROR") 
                return False
                
        except Exception as e:
            self.log(f"❌ Analytics exception: {e}", "ERROR")
            return False
    
    def test_truck_management(self):
        """Test truck management"""
        self.log("Testing truck management...")
        
        try:
            response = self.session.get(f"{self.base_url}/truck-types")
            if response.status_code == 200:
                response_text = response.text.lower()
                has_table = 'table' in response_text
                has_truck_data = 'truck' in response_text
                has_management = 'add' in response_text or 'manage' in response_text
                
                self.log(f"✅ Truck Management: Table: {has_table}, Data: {has_truck_data}, Management: {has_management}")
                return True
            else:
                self.log(f"❌ Truck management failed: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Truck management exception: {e}", "ERROR")
            return False
    
    def test_carton_management(self):
        """Test carton management"""
        self.log("Testing carton management...")
        
        try:
            response = self.session.get(f"{self.base_url}/carton-types")
            if response.status_code == 200:
                response_text = response.text.lower()
                has_table = 'table' in response_text
                has_carton_data = 'carton' in response_text
                has_management = 'add' in response_text or 'manage' in response_text
                
                self.log(f"✅ Carton Management: Table: {has_table}, Data: {has_carton_data}, Management: {has_management}")
                return True
            else:
                self.log(f"❌ Carton management failed: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Carton management exception: {e}", "ERROR")
            return False
    
    def test_batch_processing(self):
        """Test batch processing"""
        self.log("Testing batch processing...")
        
        try:
            response = self.session.get(f"{self.base_url}/batch-processing")
            if response.status_code == 200:
                response_text = response.text.lower()
                has_upload = 'upload' in response_text or 'file' in response_text
                has_batch = 'batch' in response_text
                has_csv = 'csv' in response_text
                
                self.log(f"✅ Batch Processing: Upload: {has_upload}, Batch: {has_batch}, CSV: {has_csv}")
                return True
            else:
                self.log(f"❌ Batch processing failed: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Batch processing exception: {e}", "ERROR")
            return False
    
    def test_3d_visualization_assets(self):
        """Test 3D visualization assets"""
        self.log("Testing 3D visualization assets...")
        
        try:
            # Check for Three.js and related assets
            assets_to_check = [
                '/static/js/truck_3d.js',
                '/static/js/truck_3d_enhanced.js',
                '/static/main.js',
                '/static/style.css'
            ]
            
            asset_status = {}
            for asset in assets_to_check:
                try:
                    response = self.session.get(f"{self.base_url}{asset}")
                    asset_status[asset] = response.status_code == 200
                except:
                    asset_status[asset] = False
            
            available_assets = sum(asset_status.values())
            total_assets = len(asset_status)
            
            self.log(f"✅ 3D Assets: {available_assets}/{total_assets} assets available")
            
            for asset, available in asset_status.items():
                status = "✅" if available else "❌"
                self.log(f"  {status} {asset}")
            
            return available_assets > 0
            
        except Exception as e:
            self.log(f"❌ 3D assets check exception: {e}", "ERROR")
            return False
    
    def test_form_validation(self):
        """Test form validation and error handling"""
        self.log("Testing form validation...")
        
        try:
            # Test empty form submission
            response = self.session.post(f"{self.base_url}/recommend-truck", data={})
            
            if response.status_code in [200, 302]:  # 302 is redirect for validation
                response_text = response.text.lower()
                has_validation = any(keyword in response_text for keyword in 
                                   ['error', 'warning', 'required', 'please', 'invalid'])
                
                self.log(f"✅ Form Validation: Validation handling: {has_validation}")
                return True
            else:
                self.log(f"❌ Form validation test failed: {response.status_code}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Form validation exception: {e}", "ERROR")
            return False
    
    def run_all_web_tests(self):
        """Execute all web interface tests"""
        self.log("TruckOpti Web Interface Testing Suite")
        self.log("="*50)
        
        if not self.test_server_connectivity():
            self.log("❌ Server not accessible - cannot run tests", "ERROR")
            return
        
        tests = [
            ("Homepage", self.test_homepage),
            ("Truck Requirement Calculator", self.test_truck_requirement_calculator),
            ("Fit Cartons", self.test_fit_cartons), 
            ("Recommend Truck", self.test_recommend_truck),
            ("Fleet Optimization", self.test_fleet_optimization),
            ("Analytics Dashboard", self.test_analytics_dashboard),
            ("Truck Management", self.test_truck_management),
            ("Carton Management", self.test_carton_management),
            ("Batch Processing", self.test_batch_processing),
            ("3D Visualization Assets", self.test_3d_visualization_assets),
            ("Form Validation", self.test_form_validation)
        ]
        
        results = {}
        passed = 0
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                results[test_name] = "PASSED" if result else "FAILED"
                if result:
                    passed += 1
            except Exception as e:
                results[test_name] = f"EXCEPTION: {str(e)}"
                self.log(f"❌ {test_name} exception: {e}", "ERROR")
        
        self.log("\n" + "="*50)
        self.log("WEB INTERFACE TEST SUMMARY")
        self.log("="*50)
        self.log(f"Tests passed: {passed}/{len(tests)}")
        self.log(f"Success rate: {(passed/len(tests)*100):.1f}%")
        
        self.log("\nDetailed Results:")
        for test_name, result in results.items():
            status = "✅" if result == "PASSED" else "❌"
            self.log(f"  {status} {test_name}: {result}")
        
        return results

def main():
    tester = TruckOptiWebTester()
    return tester.run_all_web_tests()

if __name__ == "__main__":
    main()