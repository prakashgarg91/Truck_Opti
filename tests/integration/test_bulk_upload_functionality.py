#!/usr/bin/env python3
"""
Comprehensive Bulk Upload Testing Script
Tests both cartons and trucks bulk upload functionality
"""

import requests
import json
import time

def test_bulk_upload_endpoints():
    """Test bulk upload functionality for both cartons and trucks"""
    base_url = "http://localhost:5001"
    
    print("🔍 BULK UPLOAD FUNCTIONALITY TESTING")
    print("=" * 60)
    
    # Test 1: Check if bulk upload endpoints exist
    print("\n1. Testing bulk upload endpoint availability...")
    
    # Test cartons bulk upload endpoint
    try:
        response = requests.get(f"{base_url}/api/debug/routes")
        if response.status_code == 200:
            routes = response.json()
            route_urls = [route['rule'] for route in routes['routes']]
            
            cartons_bulk_exists = '/api/cartons/bulk-upload' in route_urls
            trucks_bulk_exists = '/api/trucks/bulk-upload' in route_urls
            
            print(f"✅ Cartons bulk upload endpoint exists: {cartons_bulk_exists}")
            print(f"✅ Trucks bulk upload endpoint exists: {trucks_bulk_exists}")
            
            if not cartons_bulk_exists:
                print("❌ Cartons bulk upload endpoint not found!")
            if not trucks_bulk_exists:
                print("❌ Trucks bulk upload endpoint not found!")
        else:
            print("❌ Could not fetch routes list")
    except Exception as e:
        print(f"❌ Error checking routes: {e}")
    
    # Test 2: Test CSV template downloads
    print("\n2. Testing CSV template downloads...")
    
    templates = [
        ('/api/templates/cartons.csv', 'cartons'),
        ('/api/templates/trucks.csv', 'trucks'),
        ('/api/templates/carton-selection.csv', 'carton_selection')
    ]
    
    for template_url, template_name in templates:
        try:
            response = requests.get(f"{base_url}{template_url}")
            if response.status_code == 200:
                print(f"✅ {template_name} template download: SUCCESS")
                # Check if it's actually CSV content
                if 'text/csv' in response.headers.get('Content-Type', ''):
                    print(f"   - Correct content type: {response.headers.get('Content-Type')}")
                else:
                    print(f"   - Content type: {response.headers.get('Content-Type', 'Unknown')}")
            else:
                print(f"❌ {template_name} template download: FAILED (Status: {response.status_code})")
        except Exception as e:
            print(f"❌ {template_name} template download: ERROR - {e}")
    
    # Test 3: Test bulk upload with sample data
    print("\n3. Testing bulk upload with sample CSV data...")
    
    # Test cartons bulk upload
    print("\n   3a. Testing cartons bulk upload...")
    
    # Create sample CSV data for cartons
    cartons_csv_content = """name,length,width,height,weight,quantity
Test Box Small,0.3,0.3,0.3,5,20
Test Box Medium,0.6,0.6,0.6,15,10
Test Box Large,1.0,1.0,1.0,30,5"""
    
    try:
        # Test with POST to bulk upload endpoint
        files = {'file': ('test_cartons.csv', cartons_csv_content, 'text/csv')}
        response = requests.post(f"{base_url}/api/cartons/bulk-upload", files=files)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"✅ Cartons bulk upload: SUCCESS")
                print(f"   - Cartons added: {result.get('cartons_added', 0)}")
                if result.get('errors'):
                    print(f"   - Errors: {len(result.get('errors', []))}")
            else:
                print(f"❌ Cartons bulk upload: FAILED - {result.get('error', 'Unknown error')}")
        else:
            print(f"❌ Cartons bulk upload: HTTP {response.status_code}")
            print(f"   - Response: {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ Cartons bulk upload: ERROR - {e}")
    
    # Test trucks bulk upload
    print("\n   3b. Testing trucks bulk upload...")
    
    # Create sample CSV data for trucks
    trucks_csv_content = """name,length,width,height,max_weight,cost_per_km
Test Van Small,3.0,1.8,1.9,1500,12
Test Truck Medium,6.0,2.2,2.2,4500,18
Test Truck Large,8.5,2.4,2.5,8000,25"""
    
    try:
        # Test with POST to bulk upload endpoint
        files = {'file': ('test_trucks.csv', trucks_csv_content, 'text/csv')}
        response = requests.post(f"{base_url}/api/trucks/bulk-upload", files=files)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"✅ Trucks bulk upload: SUCCESS")
                print(f"   - Trucks added: {result.get('trucks_added', 0)}")
                if result.get('errors'):
                    print(f"   - Errors: {len(result.get('errors', []))}")
            else:
                print(f"❌ Trucks bulk upload: FAILED - {result.get('error', 'Unknown error')}")
        else:
            print(f"❌ Trucks bulk upload: HTTP {response.status_code}")
            print(f"   - Response: {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ Trucks bulk upload: ERROR - {e}")
    
    # Test 4: Verify data was added
    print("\n4. Verifying uploaded data...")
    
    try:
        # Check cartons
        response = requests.get(f"{base_url}/api/cartons")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                cartons_count = len(result.get('cartons', []))
                print(f"✅ Total cartons in database: {cartons_count}")
                
                # Check if our test boxes are there
                test_boxes = [c for c in result.get('cartons', []) if 'Test Box' in c.get('name', '')]
                if test_boxes:
                    print(f"   - Test boxes found: {len(test_boxes)}")
                    for box in test_boxes:
                        print(f"     * {box.get('name')} - Qty: {box.get('quantity', 0)}")
                else:
                    print("   - No test boxes found in database")
            else:
                print(f"❌ Failed to fetch cartons: {result.get('error')}")
        else:
            print(f"❌ Could not fetch cartons: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Error checking cartons: {e}")
    
    try:
        # Check trucks
        response = requests.get(f"{base_url}/api/trucks")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                trucks_count = len(result.get('trucks', []))
                print(f"✅ Total trucks in database: {trucks_count}")
                
                # Check if our test trucks are there
                test_trucks = [t for t in result.get('trucks', []) if 'Test' in t.get('name', '')]
                if test_trucks:
                    print(f"   - Test trucks found: {len(test_trucks)}")
                    for truck in test_trucks:
                        print(f"     * {truck.get('name')} - Max Weight: {truck.get('max_weight', 0)}kg")
                else:
                    print("   - No test trucks found in database")
            else:
                print(f"❌ Failed to fetch trucks: {result.get('error')}")
        else:
            print(f"❌ Could not fetch trucks: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Error checking trucks: {e}")
    
    # Test 5: Test invalid data handling
    print("\n5. Testing invalid data handling...")
    
    # Test with invalid CSV
    invalid_csv = """name,length,width,height,weight,quantity
Invalid Box,abc,def,ghi,50,10
Another Invalid,,0,0,0,-5"""
    
    try:
        files = {'file': ('invalid.csv', invalid_csv, 'text/csv')}
        response = requests.post(f"{base_url}/api/cartons/bulk-upload", files=files)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                cartons_added = result.get('cartons_added', 0)
                errors = result.get('errors', [])
                print(f"✅ Invalid data handling: SUCCESS")
                print(f"   - Invalid cartons rejected: {len(errors)} errors")
                print(f"   - Valid cartons added: {cartons_added}")
            else:
                print(f"❌ Invalid data handling: FAILED - {result.get('error', 'Unknown error')}")
        else:
            print(f"❌ Invalid data handling: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Invalid data handling: ERROR - {e}")
    
    print("\n" + "=" * 60)
    print("🏁 BULK UPLOAD TESTING COMPLETED")
    print("=" * 60)

if __name__ == "__main__":
    test_bulk_upload_endpoints()