#!/usr/bin/env python
"""
Test bulk upload functionality by checking browser console logs and JavaScript execution
"""

import requests
import time
import os

def test_javascript_console_errors():
    """Check for JavaScript console errors that might prevent bulk upload from working"""
    print("=== Testing JavaScript Console Issues ===")
    
    try:
        response = requests.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Check for potential JavaScript issues
            js_issues = []
            
            # Check if Bootstrap is loaded (required for modals)
            if 'bootstrap' not in content.lower():
                js_issues.append("Bootstrap library might not be loaded")
            
            # Check if jQuery is loaded (if used)
            if '$(' in content and 'jquery' not in content.lower():
                js_issues.append("jQuery used but might not be loaded")
            
            # Check for syntax errors in JavaScript
            js_blocks = []
            import re
            script_pattern = r'<script[^>]*>(.*?)</script>'
            js_blocks = re.findall(script_pattern, content, re.DOTALL)
            
            for i, js_block in enumerate(js_blocks):
                # Basic syntax checks
                if 'function showBulkUpload()' in js_block:
                    print(f"[OK] Found showBulkUpload function in script block {i+1}")
                if 'function previewCSV()' in js_block:
                    print(f"[OK] Found previewCSV function in script block {i+1}")
                if 'function processBulkUpload()' in js_block:
                    print(f"[OK] Found processBulkUpload function in script block {i+1}")
            
            if js_issues:
                print("[WARN] Potential JavaScript issues found:")
                for issue in js_issues:
                    print(f"  - {issue}")
                return False
            else:
                print("[OK] No obvious JavaScript issues detected")
                return True
                
        else:
            print(f"[FAIL] Could not load page: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Error checking JavaScript: {e}")
        return False

def test_modal_bootstrap_compatibility():
    """Test if Bootstrap modal functionality is properly set up"""
    print("\n=== Testing Bootstrap Modal Compatibility ===")
    
    try:
        response = requests.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Check for Bootstrap 5 compatibility
            checks = [
                ("Bootstrap 5 CSS", 'bootstrap@5' in content or 'bootstrap/5' in content),
                ("Bootstrap 5 JS", 'bootstrap@5' in content or 'bootstrap/5' in content),
                ("Modal Structure", 'class="modal fade"' in content),
                ("Modal Dialog", 'class="modal-dialog' in content),
                ("Modal Content", 'class="modal-content"' in content),
                ("Modal Trigger", 'data-bs-toggle="modal"' in content or 'new bootstrap.Modal' in content),
                ("File Input", 'type="file"' in content and 'accept=".csv"' in content)
            ]
            
            all_passed = True
            for check_name, result in checks:
                status = "[OK]" if result else "[WARN]"
                print(f"  {status} {check_name}")
                if not result:
                    all_passed = False
            
            return all_passed
        else:
            print(f"[FAIL] Could not load page: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Error checking modal compatibility: {e}")
        return False

def test_file_input_functionality():
    """Test if file input and FileReader functionality is properly implemented"""
    print("\n=== Testing File Input Implementation ===")
    
    try:
        response = requests.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Check for FileReader usage
            file_reader_checks = [
                ("FileReader Class", 'new FileReader()' in content),
                ("FileReader onload", 'reader.onload' in content),
                ("readAsText Method", 'readAsText(' in content),
                ("File Input onchange", 'onchange="previewCSV()"' in content),
                ("CSV File Validation", 'text/csv' in content and '.csv' in content),
                ("CSV Parsing Logic", 'split(\'\\n\')' in content and 'split(\',\')' in content)
            ]
            
            all_passed = True
            for check_name, result in file_reader_checks:
                status = "[OK]" if result else "[FAIL]"
                print(f"  {status} {check_name}")
                if not result:
                    all_passed = False
            
            return all_passed
        else:
            print(f"[FAIL] Could not load page: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Error checking file input: {e}")
        return False

def test_form_manipulation():
    """Test if form manipulation logic is correct"""
    print("\n=== Testing Form Manipulation Logic ===")
    
    try:
        response = requests.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Check for form manipulation logic
            form_checks = [
                ("Carton Rows Element", 'getElementById(\'cartonRows\')' in content),
                ("Carton Row Class", 'querySelector(\'.carton-row\')' in content),
                ("Select Element Query", 'querySelector(\'select\')' in content),
                ("Input Element Query", 'querySelector(\'input' in content),
                ("Row Creation Logic", 'createElement(\'div\')' in content),
                ("HTML Template Replacement", 'innerHTML.replace(' in content),
                ("Row Count Management", 'rowCount++' in content),
                ("Form Value Setting", '.value =' in content)
            ]
            
            all_passed = True
            for check_name, result in form_checks:
                status = "[OK]" if result else "[FAIL]"
                print(f"  {status} {check_name}")
                if not result:
                    all_passed = False
            
            return all_passed
        else:
            print(f"[FAIL] Could not load page: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Error checking form manipulation: {e}")
        return False

def create_comprehensive_test_csv():
    """Create a comprehensive test CSV with various scenarios"""
    print("\n=== Creating Comprehensive Test CSV ===")
    
    csv_content = """carton_name,quantity,value
LED TV 32,3,15000
LED TV 43,2,25000
Microwave,1,8000
Small Box,10,500
Medium Box,5,800"""
    
    with open("comprehensive_test.csv", "w") as f:
        f.write(csv_content)
    
    print("[OK] Created comprehensive_test.csv")
    print("CSV Content:")
    print(csv_content)
    
    return "comprehensive_test.csv"

def main():
    """Run comprehensive bulk upload diagnostics"""
    print("=" * 70)
    print("COMPREHENSIVE BULK UPLOAD DIAGNOSTIC")
    print("=" * 70)
    
    tests = [
        ("JavaScript Console Issues", test_javascript_console_errors),
        ("Bootstrap Modal Compatibility", test_modal_bootstrap_compatibility),
        ("File Input Functionality", test_file_input_functionality),
        ("Form Manipulation Logic", test_form_manipulation)
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
    
    # Create test file
    test_csv = create_comprehensive_test_csv()
    
    # Summary
    print("\n" + "=" * 70)
    print("BULK UPLOAD DIAGNOSTIC SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"[{status}] {test_name}")
    
    print(f"\nResults: {passed}/{total} diagnostic tests passed")
    
    if passed == total:
        print("\nDIAGNOSTIC: All systems appear functional")
        print("\nPossible issues to check manually:")
        print("1. Browser JavaScript console for runtime errors")
        print("2. Network tab for failed resource loads")
        print("3. Modal animation timing issues")
        print("4. File permissions for CSV upload")
        
    else:
        print(f"\nDIAGNOSTIC: {total-passed} issues detected")
        failed_tests = [name for name, result in results if not result]
        print("Issues found in:", ", ".join(failed_tests))
    
    print(f"\nTest files created:")
    print(f"- comprehensive_test.csv (for manual testing)")
    
    print(f"\nManual testing procedure:")
    print(f"1. Open http://127.0.0.1:5004/recommend-truck in browser")
    print(f"2. Open browser Developer Tools (F12)")
    print(f"3. Go to Console tab")
    print(f"4. Click 'Bulk Upload CSV' button")
    print(f"5. Check console for any JavaScript errors")
    print(f"6. If modal opens, try uploading {test_csv}")
    print(f"7. Check if CSV preview appears correctly")
    print(f"8. Try clicking 'Import Data' and verify form population")
    
    return passed >= total * 0.75

if __name__ == "__main__":
    main()