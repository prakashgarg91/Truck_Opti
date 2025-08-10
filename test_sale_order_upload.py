#!/usr/bin/env python3
"""
Test script for Sale Order Truck Selection feature
This script tests the file upload and processing functionality
"""

import requests
import json
import time
import os
from datetime import datetime

BASE_URL = "http://127.0.0.1:5000"

def test_sale_order_feature():
    """
    Comprehensive test of the Sale Order Truck Selection feature
    """
    print("🚚 Testing Sale Order Truck Selection Feature")
    print("=" * 60)
    
    test_results = {
        'navigation': False,
        'upload_interface': False, 
        'file_upload': False,
        'results_display': False,
        'data_validation': False,
        'errors': []
    }
    
    # Test 1: Check if homepage loads
    print("\n📍 Test 1: Homepage Navigation")
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        if response.status_code == 200:
            print("✅ Homepage loads successfully")
            if "Sale Order Truck Selection" in response.text:
                print("✅ Sale Order feature found in navigation")
                test_results['navigation'] = True
            else:
                print("❌ Sale Order feature not found in navigation")
        else:
            print(f"❌ Homepage failed with status {response.status_code}")
    except Exception as e:
        print(f"❌ Homepage test failed: {e}")
        test_results['errors'].append(f"Homepage error: {e}")
    
    # Test 2: Check sale-orders page
    print("\n📍 Test 2: Sale Orders Page Interface")
    try:
        response = requests.get(f"{BASE_URL}/sale-orders", timeout=10)
        if response.status_code == 200:
            print("✅ Sale orders page loads successfully")
            
            # Check for key elements
            page_content = response.text
            elements_found = {
                'file_input': 'type="file"' in page_content,
                'upload_form': 'enctype="multipart/form-data"' in page_content,
                'batch_name_input': 'name="batch_name"' in page_content,
                'sample_download': 'downloadSampleFile' in page_content,
                'format_requirements': 'sale_order_number' in page_content
            }
            
            for element, found in elements_found.items():
                if found:
                    print(f"✅ {element.replace('_', ' ').title()}: Found")
                else:
                    print(f"❌ {element.replace('_', ' ').title()}: Missing")
            
            if all(elements_found.values()):
                test_results['upload_interface'] = True
                print("✅ All upload interface elements present")
            else:
                print("⚠️ Some upload interface elements missing")
                
        else:
            print(f"❌ Sale orders page failed with status {response.status_code}")
            
    except Exception as e:
        print(f"❌ Sale orders page test failed: {e}")
        test_results['errors'].append(f"Sale orders page error: {e}")
    
    # Test 3: File Upload Test
    print("\n📍 Test 3: File Upload and Processing")
    try:
        # Check if sample file exists
        sample_file_path = "/workspaces/Truck_Opti/sample_sale_orders.csv"
        if not os.path.exists(sample_file_path):
            print(f"❌ Sample file not found at {sample_file_path}")
            test_results['errors'].append("Sample file not found")
            return test_results
            
        print("✅ Sample file found")
        
        # Read and analyze sample file
        with open(sample_file_path, 'r') as f:
            sample_content = f.read()
            lines = sample_content.strip().split('\n')
            
        print(f"✅ Sample file contains {len(lines)} lines (including header)")
        
        # Extract sale order numbers
        sale_orders = set()
        for line in lines[1:]:  # Skip header
            if line.strip():
                order_num = line.split(',')[0]
                sale_orders.add(order_num)
                
        print(f"✅ Found {len(sale_orders)} unique sale orders: {', '.join(sorted(sale_orders))}")
        
        # Prepare file upload
        batch_name = f"Test_Batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        with open(sample_file_path, 'rb') as f:
            files = {'file': ('sample_sale_orders.csv', f, 'text/csv')}
            data = {'batch_name': batch_name}
            
            print(f"📤 Uploading file with batch name: {batch_name}")
            
            # Upload file
            response = requests.post(
                f"{BASE_URL}/sale-orders",
                files=files,
                data=data,
                timeout=60  # Increased timeout for processing
            )
            
            if response.status_code == 200:
                print("✅ File upload successful")
                
                # Check if redirected to results page
                if 'sale-order-results' in response.url or 'redirected' in response.text.lower():
                    print("✅ Redirected to results page")
                    test_results['file_upload'] = True
                    
                    # Try to extract batch ID from response
                    if 'batch_id=' in response.url:
                        batch_id = response.url.split('batch_id=')[1].split('&')[0]
                        print(f"✅ Extracted batch ID: {batch_id}")
                        
                        # Test results page
                        return test_results_page(batch_id, sale_orders, test_results)
                    else:
                        print("⚠️ Could not extract batch ID from response")
                else:
                    print("⚠️ Did not redirect to results page")
                    print(f"Response URL: {response.url}")
                    
            elif response.status_code == 302:
                print("✅ File upload successful (redirected)")
                redirect_url = response.headers.get('Location', '')
                print(f"Redirect URL: {redirect_url}")
                
                if 'sale-order-results' in redirect_url:
                    test_results['file_upload'] = True
                    # Extract batch ID and test results
                    if '/sale-order-results/' in redirect_url:
                        batch_id = redirect_url.split('/sale-order-results/')[1]
                        print(f"✅ Extracted batch ID from redirect: {batch_id}")
                        return test_results_page(batch_id, sale_orders, test_results)
                        
            else:
                print(f"❌ File upload failed with status {response.status_code}")
                print("Response content:", response.text[:500])
                
    except Exception as e:
        print(f"❌ File upload test failed: {e}")
        test_results['errors'].append(f"File upload error: {e}")
    
    return test_results

def test_results_page(batch_id, expected_orders, test_results):
    """Test the results page for a given batch"""
    print(f"\n📍 Test 4: Results Page (Batch ID: {batch_id})")
    
    try:
        response = requests.get(f"{BASE_URL}/sale-order-results/{batch_id}", timeout=30)
        
        if response.status_code == 200:
            print("✅ Results page loads successfully")
            content = response.text
            
            # Check for sale order numbers
            found_orders = set()
            for order in expected_orders:
                if order in content:
                    found_orders.add(order)
                    print(f"✅ Found order {order} in results")
                else:
                    print(f"❌ Order {order} missing from results")
            
            # Check for truck recommendation elements
            recommendation_elements = {
                'utilization': any(word in content.lower() for word in ['utilization', 'utilisation']),
                'cost': 'cost' in content.lower(),
                'truck_recommendations': any(word in content.lower() for word in ['recommendation', 'truck', 'vehicle']),
                'order_details': 'order #' in content.lower() or 'order number' in content.lower()
            }
            
            print("\n📊 Results Page Analysis:")
            for element, found in recommendation_elements.items():
                status = "✅" if found else "❌"
                print(f"{status} {element.replace('_', ' ').title()}: {'Found' if found else 'Missing'}")
            
            # Data validation
            all_orders_found = len(found_orders) == len(expected_orders)
            has_recommendations = all(recommendation_elements.values())
            
            if all_orders_found:
                print(f"✅ All {len(expected_orders)} sale orders found in results")
                test_results['data_validation'] = True
            else:
                print(f"⚠️ Only {len(found_orders)}/{len(expected_orders)} orders found")
            
            if has_recommendations:
                print("✅ All recommendation elements found")
                test_results['results_display'] = True
            else:
                print("⚠️ Some recommendation elements missing")
                
        else:
            print(f"❌ Results page failed with status {response.status_code}")
            
    except Exception as e:
        print(f"❌ Results page test failed: {e}")
        test_results['errors'].append(f"Results page error: {e}")
        
    return test_results

def print_test_summary(results):
    """Print a comprehensive test summary"""
    print("\n🎯 TEST SUMMARY")
    print("=" * 60)
    
    tests = [
        ('Navigation', results['navigation']),
        ('Upload Interface', results['upload_interface']),
        ('File Upload', results['file_upload']),
        ('Results Display', results['results_display']),
        ('Data Validation', results['data_validation'])
    ]
    
    passed = sum(1 for _, result in tests if result)
    total = len(tests)
    
    for test_name, result in tests:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:20s}: {status}")
    
    print(f"\nOverall Score: {passed}/{total} tests passed")
    
    if results['errors']:
        print(f"\n❌ Errors Encountered ({len(results['errors'])}):")
        for i, error in enumerate(results['errors'], 1):
            print(f"   {i}. {error}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Sale Order feature is working correctly!")
    elif passed >= total * 0.8:
        print(f"\n⚠️ MOSTLY WORKING - {passed}/{total} tests passed")
    else:
        print(f"\n❌ NEEDS ATTENTION - Only {passed}/{total} tests passed")
    
    return passed == total

if __name__ == "__main__":
    try:
        start_time = time.time()
        results = test_sale_order_feature()
        end_time = time.time()
        
        print_test_summary(results)
        print(f"\nTest Duration: {end_time - start_time:.2f} seconds")
        
        # Save results to JSON
        results['test_duration'] = end_time - start_time
        results['timestamp'] = datetime.now().isoformat()
        
        with open('test_sale_order_results.json', 'w') as f:
            json.dump(results, f, indent=2)
        print("📄 Detailed results saved to test_sale_order_results.json")
        
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test execution failed: {e}")