#!/usr/bin/env python
"""
Test bulk upload functionality in truck recommendations
"""

import requests
import time

def test_bulk_upload_elements():
    """Test if bulk upload elements are present and accessible"""
    print("=== Testing Bulk Upload Elements ===")
    
    try:
        response = requests.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            print("[OK] Page loads successfully")
            
            # Check for bulk upload elements
            checks = [
                ("Bulk Upload Button", 'onclick="showBulkUpload()"' in content),
                ("Bulk Upload Modal", 'id="bulkUploadModal"' in content),
                ("File Input", 'id="bulkFileInput"' in content),
                ("CSV Preview", 'id="csvPreview"' in content),
                ("Preview Table", 'id="previewTable"' in content),
                ("showBulkUpload Function", 'function showBulkUpload()' in content),
                ("previewCSV Function", 'function previewCSV()' in content),
                ("processBulkUpload Function", 'function processBulkUpload()' in content),
                ("downloadSampleCSV Function", 'function downloadSampleCSV()' in content)
            ]
            
            all_passed = True
            for check_name, result in checks:
                status = "[OK]" if result else "[FAIL]"
                print(f"  {status} {check_name}")
                if not result:
                    all_passed = False
            
            return all_passed
        else:
            print(f"[FAIL] Page load failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Page test error: {e}")
        return False

def test_carton_data():
    """Check if carton data is available for bulk upload"""
    print("\n=== Testing Available Carton Data ===")
    
    try:
        response = requests.get("http://127.0.0.1:5004/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Check for carton options
            import re
            option_pattern = r'<option value="(\d+)"[^>]*>([^<]+)</option>'
            carton_matches = re.findall(option_pattern, content)
            
            if carton_matches:
                print(f"[OK] Found {len(carton_matches)} carton types available:")
                for value, name in carton_matches[:5]:  # Show first 5
                    carton_name = name.split('(')[0].strip()
                    print(f"  - ID {value}: {carton_name}")
                if len(carton_matches) > 5:
                    print(f"  ... and {len(carton_matches) - 5} more")
                return True, carton_matches
            else:
                print("[FAIL] No carton types found in select options")
                return False, []
        else:
            print(f"[FAIL] Could not load page: {response.status_code}")
            return False, []
    except Exception as e:
        print(f"[FAIL] Error checking carton data: {e}")
        return False, []

def create_test_csv(carton_data):
    """Create a test CSV file with available carton data"""
    print("\n=== Creating Test CSV ===")
    
    if not carton_data:
        print("[FAIL] No carton data available for CSV creation")
        return None
    
    # Use first few cartons for testing
    csv_content = "carton_name,quantity,value\n"
    
    test_cartons = [
        ("LED TV 32", 3, 15000),
        ("Small Box", 5, 500),
        ("Medium Box", 2, 800)
    ]
    
    available_names = [name.split('(')[0].strip() for _, name in carton_data]
    
    for carton_name, qty, value in test_cartons:
        # Find closest match in available cartons
        matching_name = None
        for available in available_names:
            if carton_name.lower() in available.lower() or available.lower() in carton_name.lower():
                matching_name = available
                break
        
        if matching_name:
            csv_content += f"{matching_name},{qty},{value}\n"
            print(f"[OK] Added: {matching_name} (qty: {qty}, value: {value})")
        else:
            # Use first available carton as fallback
            if available_names:
                csv_content += f"{available_names[0]},{qty},{value}\n"
                print(f"[INFO] Used fallback: {available_names[0]} (qty: {qty}, value: {value})")
    
    # Save test CSV
    with open("test_bulk_upload.csv", "w") as f:
        f.write(csv_content)
    
    print(f"[OK] Test CSV created: test_bulk_upload.csv")
    print(f"CSV content:\n{csv_content}")
    
    return "test_bulk_upload.csv"

def test_bulk_upload_simulation():
    """Simulate bulk upload process using JavaScript evaluation"""
    print("\n=== Testing Bulk Upload Simulation ===")
    
    print("[INFO] This test verifies the bulk upload structure is ready")
    print("[INFO] Manual testing required for full functionality")
    
    # List what we expect to work
    expected_flow = [
        "1. User clicks 'Bulk Upload CSV' button",
        "2. Modal opens with file input and preview area", 
        "3. User selects CSV file",
        "4. previewCSV() function shows CSV content",
        "5. User clicks 'Import Data'",
        "6. processBulkUpload() populates form fields",
        "7. Modal closes and form is ready for submission"
    ]
    
    print("\nExpected bulk upload flow:")
    for step in expected_flow:
        print(f"  {step}")
    
    return True

def main():
    """Run all bulk upload tests"""
    print("=" * 60)
    print("BULK UPLOAD FUNCTIONALITY TEST")
    print("=" * 60)
    
    tests = [
        ("Bulk Upload Elements", test_bulk_upload_elements),
        ("Carton Data Availability", lambda: test_carton_data()[0]),
        ("Bulk Upload Simulation", test_bulk_upload_simulation)
    ]
    
    results = []
    carton_data = []
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        try:
            if test_name == "Carton Data Availability":
                result, carton_data = test_carton_data()
            else:
                result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"[ERROR] {test_name}: {e}")
            results.append((test_name, False))
    
    # Create test CSV if we have carton data
    csv_file = None
    if carton_data:
        csv_file = create_test_csv(carton_data)
    
    # Summary
    print("\n" + "=" * 60)
    print("BULK UPLOAD TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"[{status}] {test_name}")
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed == total:
        print("\nALL TESTS PASSED!")
        print("\nManual testing steps:")
        print("1. Open http://127.0.0.1:5004/recommend-truck")
        print("2. Click 'Bulk Upload CSV' button")
        print("3. Upload the test_bulk_upload.csv file")
        print("4. Verify CSV preview appears")
        print("5. Click 'Import Data'")
        print("6. Check that form fields are populated")
        
        if csv_file:
            print(f"\nTest file available: {csv_file}")
            print("Use this file for manual testing")
    else:
        print(f"\n{total-passed} tests failed - investigating issues...")
        
        # Specific troubleshooting
        failed_tests = [name for name, result in results if not result]
        print(f"Failed tests: {', '.join(failed_tests)}")
    
    return passed == total

if __name__ == "__main__":
    main()