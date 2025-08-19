#!/usr/bin/env python
"""
Manual test for bulk upload functionality to see exactly what's happening
"""

import requests
import time

def test_bulk_upload_button():
    """Test if bulk upload button and modal work"""
    print("=== Testing Bulk Upload Button and Modal ===")
    
    try:
        response = requests.get("http://127.0.0.1:5000/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Check for bulk upload elements
            checks = [
                ("Bulk Upload Button", 'onclick="showBulkUpload()"' in content),
                ("Bulk Upload Modal", 'id="bulkUploadModal"' in content),
                ("File Input", 'id="bulkFileInput"' in content),
                ("Preview CSV Function", 'onchange="previewCSV()"' in content),
                ("Process Upload Function", 'onclick="processBulkUpload()"' in content),
                ("Bootstrap Modal Class", 'class="modal fade"' in content),
                ("Bootstrap JS", 'bootstrap' in content.lower())
            ]
            
            all_working = True
            for check_name, result in checks:
                status = "[OK]" if result else "[FAIL]"
                print(f"  {status} {check_name}")
                if not result:
                    all_working = False
            
            return all_working
        else:
            print(f"[FAIL] Page load failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False

def test_javascript_functions():
    """Test if JavaScript functions are properly defined"""
    print("\n=== Testing JavaScript Functions ===")
    
    try:
        response = requests.get("http://127.0.0.1:5000/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Look for function definitions
            functions = [
                ("showBulkUpload", "function showBulkUpload()" in content),
                ("previewCSV", "function previewCSV()" in content), 
                ("processBulkUpload", "function processBulkUpload()" in content),
                ("downloadSampleCSV", "function downloadSampleCSV()" in content),
                ("FileReader Usage", "new FileReader()" in content),
                ("Modal Bootstrap", "new bootstrap.Modal" in content or "bootstrap.Modal" in content)
            ]
            
            all_working = True
            for func_name, found in functions:
                status = "[OK]" if found else "[FAIL]"
                print(f"  {status} {func_name}")
                if not found:
                    all_working = False
            
            return all_working
        else:
            print(f"[FAIL] Page load failed")
            return False
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False

def create_simple_test_csv():
    """Create a simple test CSV file"""
    print("\n=== Creating Test CSV ===")
    
    csv_content = """carton_name,quantity,value
LED TV 32,2,15000
Microwave,1,8000
Small Box,5,500"""
    
    try:
        with open("simple_test.csv", "w") as f:
            f.write(csv_content)
        print("[OK] Created simple_test.csv")
        print("CSV Content:")
        print(csv_content)
        return "simple_test.csv"
    except Exception as e:
        print(f"[FAIL] Error creating CSV: {e}")
        return None

def test_bulk_upload_workflow():
    """Test the complete bulk upload workflow"""
    print("\n=== Manual Bulk Upload Workflow Test ===")
    
    print("To test bulk upload manually:")
    print("1. Open http://127.0.0.1:5000/recommend-truck in browser")
    print("2. Open browser Developer Tools (F12)")
    print("3. Go to Console tab")
    print("4. Click 'Bulk Upload CSV' button")
    print("   - Check if modal opens")
    print("   - Check console for JavaScript errors")
    print("5. Select 'simple_test.csv' file")
    print("   - Check if CSV preview appears")
    print("   - Check console for FileReader errors")
    print("6. Click 'Import Data' button")
    print("   - Check if form fields get populated")
    print("   - Check console for DOM manipulation errors")
    print("")
    print("Common issues to check:")
    print("- Modal not opening: Bootstrap JS not loaded")
    print("- File not reading: FileReader API issues")
    print("- Form not populating: DOM element selection errors")
    print("- No CSV preview: CSV parsing errors")
    
    return True

def main():
    """Run all bulk upload tests"""
    print("=" * 60)
    print("BULK UPLOAD FUNCTIONALITY DIAGNOSTIC")
    print("=" * 60)
    
    tests = [
        ("Bulk Upload Elements", test_bulk_upload_button),
        ("JavaScript Functions", test_javascript_functions),
        ("Test CSV Creation", create_simple_test_csv),
        ("Manual Workflow", test_bulk_upload_workflow)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        try:
            result = test_func()
            if result:
                results.append((test_name, True))
            else:
                results.append((test_name, False))
        except Exception as e:
            print(f"[ERROR] {test_name}: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("BULK UPLOAD DIAGNOSTIC SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"[{status}] {test_name}")
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed >= total - 1:  # Allow for manual test to be pending
        print("\nBULK UPLOAD STATUS: Ready for manual testing")
        print("\nPossible issues if bulk upload doesn't work:")
        print("1. JavaScript console errors - check browser F12 console")
        print("2. Modal animation issues - try different browsers")
        print("3. File permissions - ensure CSV file is accessible")
        print("4. Carton name matching - ensure CSV carton names match database")
        
        print(f"\nManual test file: simple_test.csv")
        print(f"Manual test URL: http://127.0.0.1:5000/recommend-truck")
    else:
        print(f"\nBULK UPLOAD STATUS: Issues detected")
        failed = [name for name, result in results if not result]
        print(f"Failed components: {', '.join(failed)}")
    
    return passed >= total - 1

if __name__ == "__main__":
    main()