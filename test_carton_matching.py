#!/usr/bin/env python
"""
Test carton name matching for bulk upload
"""

import requests
import re

def test_carton_name_matching():
    """Test if CSV carton names can match database carton names"""
    print("=== Testing Carton Name Matching ===")
    
    try:
        response = requests.get("http://127.0.0.1:5000/recommend-truck", timeout=10)
        if response.status_code == 200:
            content = response.text
            
            # Extract carton options from the select element
            option_pattern = r'<option value="(\d+)"[^>]*>([^<]+)</option>'
            carton_matches = re.findall(option_pattern, content)
            
            print(f"Found {len(carton_matches)} carton types in database:")
            
            # List all available cartons
            cartons_list = []
            for value, full_name in carton_matches:
                # Extract just the carton name (before dimensions)
                carton_name = full_name.split('(')[0].strip()
                cartons_list.append((value, carton_name, full_name))
                print(f"  ID {value}: '{carton_name}' (Full: {full_name})")
            
            # Test CSV names that might be used
            test_csv_names = [
                "LED TV 32",
                "LED TV 43", 
                "Microwave",
                "Small Box",
                "Medium Box",
                "Large Box",
                "AC Split",
                "Washing Machine"
            ]
            
            print(f"\nTesting CSV name matching:")
            matched_names = []
            
            for csv_name in test_csv_names:
                # Find matching carton
                matched = False
                for value, db_name, full_name in cartons_list:
                    if (csv_name.lower() == db_name.lower() or 
                        csv_name.lower() in db_name.lower() or
                        db_name.lower() in csv_name.lower()):
                        print(f"  ✓ '{csv_name}' → '{db_name}' (ID {value})")
                        matched_names.append((csv_name, db_name, value))
                        matched = True
                        break
                
                if not matched:
                    print(f"  ✗ '{csv_name}' → No match found")
            
            # Create a working CSV with matched names
            if matched_names:
                print(f"\nCreating working CSV with matched names:")
                csv_content = "carton_name,quantity,value\n"
                for csv_name, db_name, value in matched_names[:3]:  # Use first 3 matches
                    csv_content += f"{db_name},2,1000\n"
                
                with open("working_bulk_test.csv", "w") as f:
                    f.write(csv_content)
                
                print(f"Created working_bulk_test.csv:")
                print(csv_content)
                
                return True
            else:
                print("No matching carton names found!")
                return False
        
        else:
            print(f"Failed to load page: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"Error: {e}")
        return False

def create_comprehensive_csv():
    """Create a comprehensive CSV with various name formats"""
    print("\n=== Creating Comprehensive Test CSV ===")
    
    csv_content = """carton_name,quantity,value
LED TV 32,2,15000
LED TV 43,1,25000
Microwave,1,8000
A,5,500
B,3,800
C,2,1200
Small Box,4,400
Medium Box,2,600
Large Box,1,1000"""
    
    with open("comprehensive_bulk_test.csv", "w") as f:
        f.write(csv_content)
    
    print("Created comprehensive_bulk_test.csv with various name formats:")
    print(csv_content)
    return "comprehensive_bulk_test.csv"

def main():
    """Run carton matching tests"""
    print("=" * 60)
    print("BULK UPLOAD CARTON NAME MATCHING TEST")
    print("=" * 60)
    
    success1 = test_carton_name_matching()
    csv_file = create_comprehensive_csv()
    
    print("\n" + "=" * 60)
    print("CARTON MATCHING SUMMARY")
    print("=" * 60)
    
    if success1:
        print("✓ Carton name matching should work")
        print("✓ Created working_bulk_test.csv with exact database names")
    else:
        print("✗ Carton name matching may have issues")
    
    print(f"✓ Created {csv_file} for comprehensive testing")
    
    print("\nTo test bulk upload manually:")
    print("1. Open http://127.0.0.1:5000/recommend-truck")
    print("2. Click 'Bulk Upload CSV'")
    print("3. Try uploading working_bulk_test.csv first")
    print("4. If that works, try comprehensive_bulk_test.csv")
    print("5. Check browser console (F12) for any JavaScript errors")
    
    print("\nIf bulk upload still doesn't work, check:")
    print("- Browser console for JavaScript errors")
    print("- Modal opens when clicking 'Bulk Upload CSV'")
    print("- File input accepts .csv files")
    print("- CSV preview shows when file is selected")
    print("- Form fields populate when 'Import Data' is clicked")
    
    return success1

if __name__ == "__main__":
    main()