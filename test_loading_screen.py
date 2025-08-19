#!/usr/bin/env python
"""
Test script to verify loading screen with algorithm information is working
"""

import requests
import time

def test_loading_screen_functionality():
    """Test that the loading screen includes algorithm information"""
    try:
        # Test GET request to the page
        response = requests.get('http://127.0.0.1:5001/recommend-truck', timeout=10)
        
        if response.status_code == 200:
            content = response.text
            
            # Check for algorithm selection elements
            checks = [
                'Algorithm & Optimization Goal' in content,
                'LAFF Algorithm' in content,
                'Cost-Optimized Multi-Truck Algorithm' in content,
                'Value-Protected Packing Algorithm' in content,
                'Balanced Multi-Criteria Algorithm' in content,
                'algorithmName' in content,
                'algorithmDescription' in content,
                'algorithmPreview' in content,
                'showProgressWithSteps' in content
            ]
            
            passed_checks = sum(checks)
            total_checks = len(checks)
            
            print(f"Loading Screen Enhancement Test Results:")
            print(f"[OK] Page loads successfully: {response.status_code == 200}")
            print(f"[OK] Algorithm selection UI: {'Algorithm & Optimization Goal' in content}")
            print(f"[OK] LAFF Algorithm option: {'LAFF Algorithm' in content}")
            print(f"[OK] Algorithm preview box: {'algorithmPreview' in content}")
            print(f"[OK] Algorithm info display: {'algorithmName' in content}")
            print(f"[OK] Progress with steps function: {'showProgressWithSteps' in content}")
            print(f"[OK] Algorithm description field: {'algorithmDescription' in content}")
            print(f"")
            print(f"Overall: {passed_checks}/{total_checks} checks passed")
            
            if passed_checks == total_checks:
                print("SUCCESS: All loading screen enhancements are properly implemented!")
                return True
            else:
                print("PARTIAL: Some enhancements may be missing")
                return False
                
        else:
            print(f"FAIL: Page request failed with status {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"FAIL: Request error - {e}")
        return False
    except Exception as e:
        print(f"FAIL: Unexpected error - {e}")
        return False

def main():
    """Run the test"""
    print("=== TruckOpti Loading Screen with Algorithm Info Test ===")
    print()
    
    success = test_loading_screen_functionality()
    
    print()
    if success:
        print("RESULT: Loading screen enhancement successful!")
        print("   - Algorithm selection UI implemented")
        print("   - Algorithm preview information shown")
        print("   - Progress screen shows algorithm being used")
        print("   - Enhanced user experience delivered")
    else:
        print("RESULT: Enhancement needs review")
    
    return success

if __name__ == "__main__":
    main()