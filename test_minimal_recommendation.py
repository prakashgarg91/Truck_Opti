#!/usr/bin/env python
"""
Create minimal recommendation test to identify the issue
"""

import requests
import time

def test_page_load():
    """Test if the recommendation page loads"""
    print("=== Testing Page Load ===")
    try:
        response = requests.get("http://127.0.0.1:5000/recommend-truck", timeout=5)
        print(f"Page load: {response.status_code}")
        if response.status_code == 200:
            print("[OK] Page loads successfully")
            return True
        else:
            print(f"[FAIL] Page load failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Page load error: {e}")
        return False

def test_simple_post():
    """Test minimal POST request"""
    print("\n=== Testing Minimal POST ===")
    
    # Simplest possible data
    data = {
        'carton_type_1': '1',
        'carton_qty_1': '1'
    }
    
    print(f"Sending data: {data}")
    
    try:
        start_time = time.time()
        response = requests.post(
            "http://127.0.0.1:5000/recommend-truck", 
            data=data, 
            timeout=10
        )
        end_time = time.time()
        
        print(f"Response time: {end_time - start_time:.2f} seconds")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print("[OK] POST request successful")
            # Check response content
            content = response.text
            print(f"Response length: {len(content)} characters")
            
            # Quick content analysis
            if 'recommended' in content.lower():
                print("[SUCCESS] Found recommendations in response")
                return True
            elif 'error' in content.lower():
                print("[ERROR] Error found in response")
                return False
            elif 'cartonForm' in content:
                print("[INFO] Response shows form (processing may have failed)")
                return False
            else:
                print("[INFO] Response received but content unclear")
                return True
        else:
            print(f"[FAIL] POST failed: {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print("[TIMEOUT] Request timed out")
        return False
    except Exception as e:
        print(f"[ERROR] POST error: {e}")
        return False

def main():
    """Run minimal tests"""
    print("=" * 50)
    print("MINIMAL RECOMMENDATION TEST")
    print("=" * 50)
    
    tests = [
        ("Page Load", test_page_load),
        ("Simple POST", test_simple_post)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        result = test_func()
        results.append((test_name, result))
    
    # Summary
    print(f"\n{'='*50}")
    print("RESULTS")
    print("="*50)
    
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"[{status}] {test_name}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓ Basic functionality working")
    else:
        print(f"\n✗ {total-passed} issues found")
        
    return passed == total

if __name__ == "__main__":
    main()