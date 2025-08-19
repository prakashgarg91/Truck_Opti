#!/usr/bin/env python
"""
Test recommendation generation to see why recommendations are not showing
"""

import requests
import time

def test_basic_recommendation():
    """Test basic recommendation generation with simple data"""
    print("=== Testing Basic Recommendation Generation ===")
    
    try:
        # First, get the page to establish session
        session = requests.Session()
        get_response = session.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        
        if get_response.status_code != 200:
            print(f"[FAIL] Could not load initial page: {get_response.status_code}")
            return False
        
        print("[OK] Initial page loaded")
        
        # Prepare test data - using carton ID 1 which should exist
        test_data = {
            'carton_type_1': '1',  # First carton (usually LED TV 32)
            'carton_qty_1': '2',   # Small quantity for quick processing
            'optimization_goal': 'space_utilization'  # LAFF algorithm
        }
        
        print(f"[INFO] Submitting test data: {test_data}")
        
        # Submit the form
        start_time = time.time()
        post_response = session.post(
            "http://127.0.0.1:5004/recommend-truck",
            data=test_data,
            timeout=120,  # Extended timeout for algorithm processing
            allow_redirects=True
        )
        end_time = time.time()
        
        processing_time = end_time - start_time
        print(f"[INFO] Processing took {processing_time:.2f} seconds")
        
        if post_response.status_code == 200:
            print("[OK] Form submission successful")
            
            content = post_response.text
            
            # Analyze response content for recommendations
            indicators = [
                ("Has HTML Structure", "<html" in content.lower()),
                ("Has Recommendations Section", "recommended trucks" in content.lower()),
                ("Has Algorithm Info", "algorithm" in content.lower()),
                ("Has Utilization Data", "utilization" in content.lower()),
                ("Has Table Structure", "<table" in content.lower() and "recommendTable" in content),
                ("Has Calculation Results", "%" in content),
                ("No Python Errors", "traceback" not in content.lower() and "error:" not in content.lower()),
                ("No Empty Results", "no recommendations" not in content.lower()),
                ("Has Truck Data", "truck" in content.lower()),
                ("Has Cost Data", "₹" in content or "cost" in content.lower())
            ]
            
            success_count = 0
            for indicator_name, result in indicators:
                status = "[OK]" if result else "[WARN]"
                print(f"  {status} {indicator_name}")
                if result:
                    success_count += 1
            
            print(f"  Response Analysis: {success_count}/{len(indicators)} indicators positive")
            
            # Check for specific error patterns
            if "error" in content.lower():
                print("[WARN] Response contains error text")
                # Extract error context
                import re
                error_pattern = r'error[^.]*[.]'
                errors = re.findall(error_pattern, content.lower())
                if errors:
                    print(f"  Error context: {errors[:3]}")
            
            # Check for recommendations table
            if "recommendTable" in content:
                print("[OK] Recommendations table structure found")
                
                # Count table rows (recommendations)
                import re
                row_pattern = r'<tr[^>]*>.*?</tr>'
                rows = re.findall(row_pattern, content, re.DOTALL)
                data_rows = [row for row in rows if 'truck' in row.lower() or 'recommendation' in row.lower()]
                print(f"  Found {len(data_rows)} potential recommendation rows")
                
                if len(data_rows) > 0:
                    print("[SUCCESS] Recommendations appear to be generated!")
                    return True
                else:
                    print("[WARN] Table structure exists but no recommendation data found")
                    return False
            else:
                print("[WARN] No recommendations table found in response")
                
                # Check if we're still on the input form
                if 'id="cartonForm"' in content:
                    print("[INFO] Response shows input form - processing may have failed")
                    return False
                else:
                    print("[INFO] Response doesn't show input form - unknown state")
                    return False
                    
        else:
            print(f"[FAIL] Form submission failed: {post_response.status_code}")
            if post_response.text:
                print(f"  Error response: {post_response.text[:200]}")
            return False
            
    except requests.exceptions.Timeout:
        print("[TIMEOUT] Request timed out after 120 seconds")
        print("[INFO] This suggests algorithm processing is taking too long")
        return False
    except Exception as e:
        print(f"[FAIL] Recommendation test error: {e}")
        return False

def test_algorithm_processing():
    """Test if the algorithm processing pipeline works"""
    print("\n=== Testing Algorithm Processing Pipeline ===")
    
    try:
        # Test the packer module directly via API if available
        session = requests.Session()
        
        # Check if we can access any debug endpoints
        debug_endpoints = [
            "/api/truck-types",
            "/api/carton-types", 
            "/debug/packer",
            "/health"
        ]
        
        working_endpoints = []
        for endpoint in debug_endpoints:
            try:
                response = session.get(f"http://127.0.0.1:5004{endpoint}", timeout=5)
                if response.status_code == 200:
                    working_endpoints.append(endpoint)
                    print(f"[OK] {endpoint} accessible")
                elif response.status_code == 404:
                    print(f"[INFO] {endpoint} not available (404)")
                else:
                    print(f"[WARN] {endpoint} returned {response.status_code}")
            except:
                print(f"[INFO] {endpoint} not accessible")
        
        if working_endpoints:
            print(f"[OK] Found {len(working_endpoints)} working API endpoints")
            return True
        else:
            print("[INFO] No debug endpoints available - testing main flow only")
            return True
            
    except Exception as e:
        print(f"[WARN] Algorithm pipeline test error: {e}")
        return False

def test_carton_and_truck_data():
    """Test if carton and truck data is available for processing"""
    print("\n=== Testing Carton and Truck Data Availability ===")
    
    try:
        response = requests.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Count available cartons and trucks
            import re
            
            # Count carton options
            carton_pattern = r'<option value="(\d+)"[^>]*>([^<]+)</option>'
            carton_matches = re.findall(carton_pattern, content)
            
            print(f"[INFO] Found {len(carton_matches)} carton types:")
            for i, (value, name) in enumerate(carton_matches[:5]):
                print(f"  {i+1}. ID {value}: {name.split('(')[0].strip()}")
            if len(carton_matches) > 5:
                print(f"  ... and {len(carton_matches) - 5} more")
            
            # Check for algorithm options
            algo_pattern = r'<option value="([^"]+)"[^>]*>([^<]+)</option>'
            algo_matches = re.findall(algo_pattern, content)
            algo_matches = [match for match in algo_matches if 'algorithm' in match[1].lower()]
            
            print(f"\n[INFO] Found {len(algo_matches)} algorithm options:")
            for value, name in algo_matches:
                print(f"  - {value}: {name}")
            
            if len(carton_matches) > 0 and len(algo_matches) > 0:
                print("\n[OK] Sufficient data available for recommendation generation")
                return True
            else:
                print("\n[WARN] Insufficient data for recommendations")
                return False
                
        else:
            print(f"[FAIL] Could not load page: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Data availability test error: {e}")
        return False

def main():
    """Run recommendation generation tests"""
    print("=" * 70)
    print("RECOMMENDATION GENERATION DIAGNOSTIC")
    print("=" * 70)
    
    tests = [
        ("Carton and Truck Data", test_carton_and_truck_data),
        ("Algorithm Processing Pipeline", test_algorithm_processing),
        ("Basic Recommendation Generation", test_basic_recommendation)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"[ERROR] {test_name}: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 70)
    print("RECOMMENDATION GENERATION SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"[{status}] {test_name}")
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed == total:
        print("\nSUCCESS: Recommendation generation appears to be working")
        print("\nIf recommendations still don't show, check:")
        print("1. Browser JavaScript console for frontend errors")
        print("2. Flask server terminal for backend errors")
        print("3. Network tab for failed AJAX requests")
    elif passed >= total * 0.5:
        print(f"\nPARTIAL SUCCESS: {passed}/{total} tests passed")
        print("\nLikely issues:")
        failed_tests = [name for name, result in results if not result]
        for test in failed_tests:
            print(f"- {test}")
    else:
        print(f"\nISSUES DETECTED: {total-passed} major problems found")
        print("\nNeed to investigate:")
        failed_tests = [name for name, result in results if not result]
        for test in failed_tests:
            print(f"- {test}")
    
    print(f"\nNext steps:")
    print(f"1. Check Flask server is running on http://127.0.0.1:5004")
    print(f"2. Try manual test: submit form with carton data")
    print(f"3. Monitor server logs for processing errors")
    print(f"4. Check database connectivity and data")
    
    return passed >= total * 0.75

if __name__ == "__main__":
    main()