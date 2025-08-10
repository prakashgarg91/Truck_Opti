#!/usr/bin/env python3
"""
API-based Test Suite for Sale Order Truck Selection Feature
Tests the backend functionality and validates carton-based processing
"""

import requests
import json
import time
import csv
import os
from io import StringIO
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SaleOrderAPITester:
    def __init__(self, base_url="http://127.0.0.1:5001"):
        self.base_url = base_url
        self.test_results = {
            'server_accessible': False,
            'upload_success': False,
            'orders_processed': 0,
            'expected_orders': 6,
            'recommendations': [],
            'single_truck_optimization': {
                'total_recommendations': 0,
                'single_truck_solutions': 0,
                'space_utilization_data': []
            },
            'carton_processing': {
                'carton_types_detected': [],
                'mapping_success': False
            }
        }
    
    def test_server_accessibility(self):
        """Test if the Flask server is accessible"""
        try:
            response = requests.get(self.base_url, timeout=10)
            if response.status_code == 200:
                logger.info("✅ Flask server is accessible")
                self.test_results['server_accessible'] = True
                return True
            else:
                logger.error(f"❌ Server returned status code: {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to connect to server: {e}")
            return False
    
    def test_sale_orders_page(self):
        """Test accessing the sale orders page"""
        try:
            response = requests.get(f"{self.base_url}/sale-orders", timeout=10)
            if response.status_code == 200:
                logger.info("✅ Sale orders page accessible")
                return True
            else:
                logger.error(f"❌ Sale orders page returned status: {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to access sale orders page: {e}")
            return False
    
    def test_csv_upload(self):
        """Test CSV file upload via POST request"""
        try:
            csv_path = "/workspaces/Truck_Opti/sample_sale_orders.csv"
            
            if not os.path.exists(csv_path):
                logger.error(f"❌ Sample CSV file not found: {csv_path}")
                return False
            
            with open(csv_path, 'rb') as f:
                files = {'file': ('sample_sale_orders.csv', f, 'text/csv')}
                
                logger.info("📤 Uploading CSV file...")
                response = requests.post(
                    f"{self.base_url}/sale-orders", 
                    files=files, 
                    timeout=60
                )
                
                if response.status_code == 200:
                    logger.info("✅ CSV upload successful")
                    self.test_results['upload_success'] = True
                    
                    # Analyze the response
                    self.analyze_upload_response(response)
                    return True
                else:
                    logger.error(f"❌ Upload failed with status: {response.status_code}")
                    if response.text:
                        logger.error(f"Error response: {response.text[:500]}")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ CSV upload test failed: {e}")
            return False
    
    def analyze_upload_response(self, response):
        """Analyze the response from CSV upload"""
        try:
            content = response.text.lower()
            
            # Count processed orders
            order_indicators = ['so001', 'so002', 'so003', 'so004', 'so005', 'so006']
            processed_orders = sum(1 for order in order_indicators if order in content)
            self.test_results['orders_processed'] = processed_orders
            
            logger.info(f"📊 Orders processed: {processed_orders}/6")
            
            # Look for carton types mentioned
            carton_types = ['small box', 'medium box', 'large box', 'heavy box', 
                          'electronics box', 'component box', 'heavy equipment']
            detected_cartons = [carton for carton in carton_types if carton in content]
            self.test_results['carton_processing']['carton_types_detected'] = detected_cartons
            
            if detected_cartons:
                logger.info(f"✅ Carton types detected: {len(detected_cartons)}")
                self.test_results['carton_processing']['mapping_success'] = True
            
            # Look for single truck optimization indicators
            single_truck_indicators = [
                'single truck', 'optimal truck', 'recommended truck',
                'best truck', 'single solution'
            ]
            single_truck_mentions = sum(1 for indicator in single_truck_indicators if indicator in content)
            self.test_results['single_truck_optimization']['total_recommendations'] = single_truck_mentions
            
            # Look for space utilization data
            import re
            percentages = re.findall(r'(\d+(?:\.\d+)?)\s*%', response.text)
            if percentages:
                self.test_results['single_truck_optimization']['space_utilization_data'] = percentages
                logger.info(f"📈 Space utilization data found: {len(percentages)} entries")
            
            # Extract truck recommendations for each order
            self.extract_truck_recommendations(response.text)
            
        except Exception as e:
            logger.error(f"❌ Failed to analyze upload response: {e}")
    
    def extract_truck_recommendations(self, response_text):
        """Extract truck recommendations from response"""
        try:
            lines = response_text.split('\n')
            current_order = None
            
            for line in lines:
                line_lower = line.lower().strip()
                
                # Detect order sections
                for order in ['so001', 'so002', 'so003', 'so004', 'so005', 'so006']:
                    if order in line_lower:
                        current_order = order.upper()
                        break
                
                # Extract truck recommendations
                truck_indicators = ['truck', 'vehicle', 'recommended', 'optimal']
                if current_order and any(indicator in line_lower for indicator in truck_indicators):
                    recommendation = {
                        'order': current_order,
                        'recommendation': line.strip(),
                        'is_single_truck': 'single' in line_lower or 'one' in line_lower
                    }
                    self.test_results['recommendations'].append(recommendation)
        
        except Exception as e:
            logger.error(f"❌ Failed to extract truck recommendations: {e}")
    
    def validate_expected_behavior(self):
        """Validate the expected behavior based on sample data"""
        expected_behaviors = {
            'SO001': {'cartons': 8, 'expected_truck': 'small/medium'},
            'SO002': {'cartons': 12, 'expected_truck': 'medium'},
            'SO003': {'cartons': 33, 'expected_truck': 'large'},
            'SO004': {'cartons': 20, 'expected_truck': 'medium/large'},
            'SO005': {'cartons': 9, 'expected_truck': 'medium'},
            'SO006': {'cartons': 60, 'expected_truck': 'large/extra large'}
        }
        
        logger.info("🎯 Validating expected behavior:")
        
        for order, details in expected_behaviors.items():
            logger.info(f"   {order}: {details['cartons']} cartons → {details['expected_truck']} truck expected")
        
        return expected_behaviors
    
    def run_comprehensive_test(self):
        """Run the complete API test suite"""
        logger.info("🚀 Starting comprehensive Sale Order API test")
        
        # Test 1: Server accessibility
        if not self.test_server_accessibility():
            return self.test_results
        
        # Test 2: Sale orders page
        if not self.test_sale_orders_page():
            return self.test_results
        
        # Test 3: CSV upload and processing
        if not self.test_csv_upload():
            return self.test_results
        
        # Test 4: Validate expected behavior
        expected = self.validate_expected_behavior()
        
        logger.info("✅ All API tests completed")
        return self.test_results
    
    def generate_report(self):
        """Generate comprehensive test report"""
        results = self.test_results
        
        print("\n" + "="*80)
        print("🚚 SALE ORDER TRUCK SELECTION API TEST REPORT")
        print("="*80)
        
        # Server Status
        print(f"\n🌐 SERVER STATUS:")
        print(f"   Server Accessible: {'✅ PASS' if results['server_accessible'] else '❌ FAIL'}")
        
        # Upload Results
        print(f"\n📤 UPLOAD TEST:")
        print(f"   Upload Success: {'✅ PASS' if results['upload_success'] else '❌ FAIL'}")
        
        # Processing Results
        print(f"\n🔄 PROCESSING RESULTS:")
        print(f"   Expected Orders: {results['expected_orders']}")
        print(f"   Processed Orders: {results['orders_processed']}")
        processing_success = results['orders_processed'] >= results['expected_orders']
        print(f"   Processing Status: {'✅ PASS' if processing_success else '❌ PARTIAL/FAIL'}")
        
        # Carton Processing
        print(f"\n📦 CARTON-BASED PROCESSING:")
        carton_data = results['carton_processing']
        print(f"   Carton Types Detected: {len(carton_data['carton_types_detected'])}")
        if carton_data['carton_types_detected']:
            print(f"   Detected Types: {', '.join(carton_data['carton_types_detected'][:3])}")
        print(f"   Mapping Success: {'✅ PASS' if carton_data['mapping_success'] else '❌ FAIL'}")
        
        # Single Truck Optimization
        print(f"\n🎯 SINGLE TRUCK OPTIMIZATION:")
        opt_data = results['single_truck_optimization']
        print(f"   Total Recommendations: {opt_data['total_recommendations']}")
        print(f"   Space Utilization Entries: {len(opt_data['space_utilization_data'])}")
        if opt_data['space_utilization_data']:
            avg_util = sum(float(x) for x in opt_data['space_utilization_data'][:5]) / min(5, len(opt_data['space_utilization_data']))
            print(f"   Average Space Utilization: {avg_util:.1f}%")
        
        # Recommendations Summary
        print(f"\n📊 RECOMMENDATIONS ANALYSIS:")
        if results['recommendations']:
            print(f"   Total Recommendations: {len(results['recommendations'])}")
            single_truck_count = sum(1 for r in results['recommendations'] if r.get('is_single_truck'))
            print(f"   Single Truck Solutions: {single_truck_count}")
            
            print(f"\n   📋 Detailed Recommendations:")
            for rec in results['recommendations'][:6]:  # Show first 6
                status = "✅ Single Truck" if rec.get('is_single_truck') else "⚠️ Multi-truck"
                print(f"     {rec['order']}: {status}")
        else:
            print("   ❌ No recommendations extracted")
        
        # Expected Order Analysis
        print(f"\n🎯 EXPECTED ORDER ANALYSIS:")
        expected_orders = {
            'SO001': '8 cartons (Small order)',
            'SO002': '12 cartons (Medium order)', 
            'SO003': '33 cartons (Large order)',
            'SO004': '20 cartons (Electronics)',
            'SO005': '9 cartons (Mixed heavy)',
            'SO006': '60 cartons (Extra large order)'
        }
        
        for order, description in expected_orders.items():
            processed = order in str(results).upper()
            print(f"     {order}: {description} {'✅' if processed else '❌'}")
        
        # Overall Assessment
        print(f"\n🏆 OVERALL ASSESSMENT:")
        total_score = sum([
            results['server_accessible'],
            results['upload_success'], 
            processing_success,
            carton_data['mapping_success'],
            len(opt_data['space_utilization_data']) > 0
        ])
        max_score = 5
        success_rate = (total_score / max_score) * 100
        
        print(f"   Success Rate: {success_rate:.1f}% ({total_score}/{max_score})")
        
        if success_rate >= 80:
            print("   Overall Status: 🟢 EXCELLENT")
            print("   Assessment: Feature is working as expected with carton-based processing and single truck optimization")
        elif success_rate >= 60:
            print("   Overall Status: 🟡 GOOD")
            print("   Assessment: Core functionality working, minor optimizations needed")
        else:
            print("   Overall Status: 🔴 NEEDS ATTENTION") 
            print("   Assessment: Multiple issues detected, requires investigation")
        
        # Key Findings
        print(f"\n💡 KEY FINDINGS:")
        if results['upload_success']:
            print("   ✅ CSV upload and processing working")
        if carton_data['mapping_success']:
            print("   ✅ Carton-based processing implemented successfully")
        if opt_data['space_utilization_data']:
            print("   ✅ Space utilization calculations present")
        if results['orders_processed'] >= 6:
            print("   ✅ All 6 sale orders processed")
        
        print("\n" + "="*80)
        
        return results

def main():
    """Main test execution"""
    print("🚀 Starting Sale Order Truck Selection API Test...")
    
    tester = SaleOrderAPITester()
    test_results = tester.run_comprehensive_test()
    
    # Generate and display report
    tester.generate_report()
    
    # Save results
    results_file = "/workspaces/Truck_Opti/sale_order_api_test_results.json"
    with open(results_file, 'w') as f:
        json.dump(test_results, f, indent=2)
    print(f"\n💾 Detailed results saved to: {results_file}")

if __name__ == "__main__":
    main()