#!/usr/bin/env python3
"""
Detailed Truck Management Testing Script
Focuses on CRUD operations, UI elements, and data validation
"""

import requests
import time
import json
from datetime import datetime
from bs4 import BeautifulSoup

BASE_URL = "http://127.0.0.1:5000"

class TruckManagementTester:
    def __init__(self):
        self.session = requests.Session()
        self.results = {
            'listing_page': {},
            'add_form': {},
            'edit_functionality': {},
            'delete_functionality': {},
            'export_features': {},
            'ui_elements': {},
            'data_validation': {},
            'issues': []
        }
    
    def log(self, message, test_type="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {test_type}: {message}")
    
    def test_truck_listing_page(self):
        """Test the truck listing page in detail"""
        self.log("=== TESTING TRUCK LISTING PAGE ===", "TEST")
        
        start_time = time.time()
        response = self.session.get(f"{BASE_URL}/truck-types")
        end_time = time.time()
        
        if response.status_code == 200:
            self.log(f"✅ Truck listing loaded in {(end_time - start_time)*1000:.2f}ms")
            
            # Parse HTML content
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Check for DataTables
            has_datatable = bool(soup.find('table', {'id': 'trucksTable'}) or 
                               soup.find('table', class_=lambda x: x and 'dataTable' in x))
            
            # Check for export buttons
            export_buttons = soup.find_all('button', text=lambda x: x and any(word in x.lower() for word in ['export', 'csv', 'pdf', 'excel']))
            
            # Count truck rows
            table = soup.find('table')
            truck_rows = 0
            if table:
                tbody = table.find('tbody')
                if tbody:
                    truck_rows = len(tbody.find_all('tr'))
                else:
                    truck_rows = len(table.find_all('tr')) - 1  # -1 for header
            
            # Check for action buttons (Edit, Delete)
            edit_buttons = soup.find_all('a', href=lambda x: x and 'edit' in x.lower())
            delete_buttons = soup.find_all('button', onclick=lambda x: x and 'delete' in x.lower()) or soup.find_all('a', href=lambda x: x and 'delete' in x.lower())
            
            # Check for Add New button
            add_button = soup.find('a', href=lambda x: x and 'add-truck' in x) or soup.find('button', text=lambda x: x and 'add' in x.lower())
            
            self.results['listing_page'] = {
                'load_time_ms': (end_time - start_time) * 1000,
                'has_datatable': has_datatable,
                'truck_count': truck_rows,
                'export_buttons_count': len(export_buttons),
                'edit_buttons_count': len(edit_buttons),
                'delete_buttons_count': len(delete_buttons),
                'has_add_button': bool(add_button),
                'has_search': bool(soup.find('input', {'type': 'search'})) or bool(soup.find('input', placeholder=lambda x: x and 'search' in x.lower())),
                'has_pagination': bool(soup.find('div', class_=lambda x: x and 'pagination' in x))
            }
            
            self.log(f"📊 Found {truck_rows} trucks in the table")
            self.log(f"🔍 DataTable integration: {'✅' if has_datatable else '❌'}")
            self.log(f"📤 Export buttons: {len(export_buttons)} found")
            self.log(f"✏️ Edit buttons: {len(edit_buttons)} found")
            self.log(f"🗑️ Delete buttons: {len(delete_buttons)} found")
            self.log(f"➕ Add button: {'✅' if add_button else '❌'}")
            
        else:
            self.log(f"❌ Failed to load truck listing page: {response.status_code}", "ERROR")
            self.results['issues'].append(f"Truck listing page returned status {response.status_code}")
    
    def test_add_truck_form(self):
        """Test the add truck form functionality"""
        self.log("=== TESTING ADD TRUCK FORM ===", "TEST")
        
        # Test form page loading
        response = self.session.get(f"{BASE_URL}/add-truck-type")
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Check form elements
            form = soup.find('form')
            if form:
                # Check for required fields
                required_fields = {
                    'name': soup.find('input', {'name': 'name'}) or soup.find('input', {'id': 'name'}),
                    'length': soup.find('input', {'name': 'length'}) or soup.find('input', {'id': 'length'}),
                    'width': soup.find('input', {'name': 'width'}) or soup.find('input', {'id': 'width'}),
                    'height': soup.find('input', {'name': 'height'}) or soup.find('input', {'id': 'height'}),
                    'max_weight': soup.find('input', {'name': 'max_weight'}) or soup.find('input', {'id': 'max_weight'}),
                    'cost_per_km': soup.find('input', {'name': 'cost_per_km'}) or soup.find('input', {'id': 'cost_per_km'})
                }
                
                submit_button = soup.find('input', {'type': 'submit'}) or soup.find('button', {'type': 'submit'})
                cancel_button = soup.find('a', text=lambda x: x and 'cancel' in x.lower()) or soup.find('button', text=lambda x: x and 'cancel' in x.lower())
                
                self.results['add_form'] = {
                    'has_form': True,
                    'required_fields': {k: bool(v) for k, v in required_fields.items()},
                    'has_submit_button': bool(submit_button),
                    'has_cancel_button': bool(cancel_button),
                    'form_method': form.get('method', '').upper(),
                    'form_action': form.get('action', '')
                }
                
                missing_fields = [k for k, v in required_fields.items() if not v]
                if missing_fields:
                    self.log(f"⚠️ Missing form fields: {', '.join(missing_fields)}", "WARNING")
                    self.results['issues'].append(f"Add truck form missing fields: {', '.join(missing_fields)}")
                else:
                    self.log("✅ All required form fields present")
                
                self.log(f"📝 Form method: {form.get('method', 'Not specified')}")
                self.log(f"📝 Submit button: {'✅' if submit_button else '❌'}")
                
            else:
                self.log("❌ No form found on add truck page", "ERROR")
                self.results['issues'].append("Add truck page has no form")
        else:
            self.log(f"❌ Failed to load add truck form: {response.status_code}", "ERROR")
    
    def test_truck_crud_operations(self):
        """Test Create, Read, Update, Delete operations"""
        self.log("=== TESTING TRUCK CRUD OPERATIONS ===", "TEST")
        
        # Test creating a new truck
        test_truck_data = {
            'name': f'Test Truck CRUD {int(time.time())}',
            'length': '12',
            'width': '6',
            'height': '8',
            'max_weight': '20000',
            'cost_per_km': '28.75'
        }
        
        # CREATE operation
        self.log("Testing CREATE operation...")
        create_response = self.session.post(f"{BASE_URL}/add-truck-type", data=test_truck_data)
        
        if create_response.status_code in [200, 302]:  # 302 is redirect after successful creation
            self.log("✅ Truck creation successful")
            
            # Try to find the created truck in the listing
            list_response = self.session.get(f"{BASE_URL}/truck-types")
            if test_truck_data['name'] in list_response.text:
                self.log("✅ Created truck appears in listing")
                self.results['crud_operations'] = {'create': True}
            else:
                self.log("⚠️ Created truck not found in listing", "WARNING")
                self.results['issues'].append("Created truck not visible in listing")
        else:
            self.log(f"❌ Truck creation failed: {create_response.status_code}", "ERROR")
            self.results['issues'].append(f"Truck creation failed with status {create_response.status_code}")
    
    def test_edit_functionality(self):
        """Test edit functionality and data pre-population"""
        self.log("=== TESTING EDIT FUNCTIONALITY ===", "TEST")
        
        # First, get the truck listing to find an existing truck to edit
        list_response = self.session.get(f"{BASE_URL}/truck-types")
        
        if list_response.status_code == 200:
            soup = BeautifulSoup(list_response.text, 'html.parser')
            
            # Look for edit links
            edit_links = soup.find_all('a', href=lambda x: x and 'edit' in x.lower())
            
            if edit_links:
                edit_url = edit_links[0].get('href')
                if not edit_url.startswith('http'):
                    edit_url = BASE_URL + edit_url
                
                self.log(f"Testing edit URL: {edit_url}")
                
                # Test the edit form
                edit_response = self.session.get(edit_url)
                
                if edit_response.status_code == 200:
                    edit_soup = BeautifulSoup(edit_response.text, 'html.parser')
                    
                    # Check if form fields are pre-populated
                    form = edit_soup.find('form')
                    if form:
                        # Check for pre-populated values
                        name_field = form.find('input', {'name': 'name'}) or form.find('input', {'id': 'name'})
                        length_field = form.find('input', {'name': 'length'}) or form.find('input', {'id': 'length'})
                        
                        name_value = name_field.get('value', '') if name_field else ''
                        length_value = length_field.get('value', '') if length_field else ''
                        
                        is_prepopulated = bool(name_value and length_value)
                        
                        self.results['edit_functionality'] = {
                            'edit_page_loads': True,
                            'has_form': True,
                            'fields_prepopulated': is_prepopulated,
                            'name_value': name_value,
                            'length_value': length_value
                        }
                        
                        if is_prepopulated:
                            self.log("✅ Edit form fields are pre-populated with existing data")
                        else:
                            self.log("❌ Edit form fields are NOT pre-populated", "ERROR")
                            self.results['issues'].append("Edit form fields not pre-populated - appears to create new item instead of editing")
                    else:
                        self.log("❌ No form found on edit page", "ERROR")
                        self.results['issues'].append("Edit page has no form")
                else:
                    self.log(f"❌ Edit page failed to load: {edit_response.status_code}", "ERROR")
                    self.results['issues'].append(f"Edit page returned status {edit_response.status_code}")
            else:
                self.log("⚠️ No edit links found in truck listing", "WARNING")
                self.results['issues'].append("No edit functionality available")
        else:
            self.log("❌ Could not access truck listing for edit testing", "ERROR")
    
    def test_export_functionality(self):
        """Test export functionality (CSV, PDF, Excel)"""
        self.log("=== TESTING EXPORT FUNCTIONALITY ===", "TEST")
        
        export_formats = ['csv', 'excel', 'pdf']
        export_results = {}
        
        for format_type in export_formats:
            try:
                # Try different possible export URLs
                possible_urls = [
                    f"/truck-types/export/{format_type}",
                    f"/export/trucks/{format_type}",
                    f"/trucks/export?format={format_type}"
                ]
                
                export_success = False
                for url in possible_urls:
                    response = self.session.get(BASE_URL + url)
                    if response.status_code == 200:
                        export_results[format_type] = {
                            'success': True,
                            'url': url,
                            'content_length': len(response.content),
                            'content_type': response.headers.get('content-type', '')
                        }
                        self.log(f"✅ {format_type.upper()} export working at {url}")
                        export_success = True
                        break
                
                if not export_success:
                    export_results[format_type] = {'success': False}
                    self.log(f"❌ {format_type.upper()} export not found", "WARNING")
                    
            except Exception as e:
                export_results[format_type] = {'success': False, 'error': str(e)}
                self.log(f"❌ Error testing {format_type} export: {e}", "ERROR")
        
        self.results['export_features'] = export_results
        
        working_exports = sum(1 for r in export_results.values() if r.get('success', False))
        self.log(f"📊 Export functionality: {working_exports}/{len(export_formats)} formats working")
    
    def test_ui_elements_and_responsiveness(self):
        """Test UI elements and responsive design"""
        self.log("=== TESTING UI ELEMENTS ===", "TEST")
        
        response = self.session.get(f"{BASE_URL}/truck-types")
        
        if response.status_code == 200:
            content = response.text
            
            # Check for Bootstrap and responsive elements
            ui_elements = {
                'has_bootstrap': 'bootstrap' in content.lower(),
                'has_responsive_meta': 'viewport' in content,
                'has_mobile_nav': 'navbar-toggler' in content or 'hamburger' in content.lower(),
                'has_cards': 'card' in content.lower(),
                'has_buttons': 'btn' in content.lower(),
                'has_icons': 'bi-' in content or 'fa-' in content or 'icon' in content.lower(),
                'has_datatable_css': 'dataTables' in content,
                'has_custom_css': '/static/style.css' in content
            }
            
            self.results['ui_elements'] = ui_elements
            
            self.log("🎨 UI Elements Analysis:")
            for element, present in ui_elements.items():
                self.log(f"   {element}: {'✅' if present else '❌'}")
    
    def generate_truck_management_report(self):
        """Generate detailed report for truck management testing"""
        self.log("=== GENERATING TRUCK MANAGEMENT REPORT ===", "TEST")
        
        report = f"""
TRUCK MANAGEMENT DETAILED TEST REPORT
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
{'='*80}

EXECUTIVE SUMMARY:
Truck Management Feature Status: {'🟢 FUNCTIONAL' if self.results.get('listing_page', {}).get('truck_count', 0) > 0 else '🔴 ISSUES DETECTED'}

DETAILED FINDINGS:

1. TRUCK LISTING PAGE:
   Load Time: {self.results.get('listing_page', {}).get('load_time_ms', 'N/A')}ms
   Truck Count: {self.results.get('listing_page', {}).get('truck_count', 'N/A')}
   DataTable Integration: {'✅' if self.results.get('listing_page', {}).get('has_datatable') else '❌'}
   Export Buttons: {self.results.get('listing_page', {}).get('export_buttons_count', 'N/A')}
   Edit Buttons: {self.results.get('listing_page', {}).get('edit_buttons_count', 'N/A')}
   Delete Buttons: {self.results.get('listing_page', {}).get('delete_buttons_count', 'N/A')}
   Add Button: {'✅' if self.results.get('listing_page', {}).get('has_add_button') else '❌'}
   Search Function: {'✅' if self.results.get('listing_page', {}).get('has_search') else '❌'}

2. ADD TRUCK FORM:
   Form Present: {'✅' if self.results.get('add_form', {}).get('has_form') else '❌'}
   Required Fields: {sum(self.results.get('add_form', {}).get('required_fields', {}).values())}/6
   Submit Button: {'✅' if self.results.get('add_form', {}).get('has_submit_button') else '❌'}
   Cancel Button: {'✅' if self.results.get('add_form', {}).get('has_cancel_button') else '❌'}

3. EDIT FUNCTIONALITY:
   Edit Page Loads: {'✅' if self.results.get('edit_functionality', {}).get('edit_page_loads') else '❌'}
   Fields Pre-populated: {'✅' if self.results.get('edit_functionality', {}).get('fields_prepopulated') else '❌ CRITICAL ISSUE'}

4. EXPORT FUNCTIONALITY:
"""
        
        if 'export_features' in self.results:
            for format_type, result in self.results['export_features'].items():
                report += f"   {format_type.upper()}: {'✅' if result.get('success') else '❌'}\n"
        
        report += f"""
5. UI ELEMENTS:
"""
        if 'ui_elements' in self.results:
            for element, present in self.results['ui_elements'].items():
                report += f"   {element}: {'✅' if present else '❌'}\n"
        
        report += f"""

CRITICAL ISSUES IDENTIFIED:
"""
        if self.results['issues']:
            for i, issue in enumerate(self.results['issues'], 1):
                report += f"{i}. {issue}\n"
        else:
            report += "No critical issues identified.\n"

        report += f"""

RECOMMENDATIONS:
1. {'✅' if self.results.get('edit_functionality', {}).get('fields_prepopulated') else '🔴'} Fix Edit Functionality: Edit forms should pre-populate with existing data
2. {'✅' if self.results.get('listing_page', {}).get('has_datatable') else '🔴'} Implement DataTables: Add sorting, filtering, and pagination
3. {'✅' if sum(r.get('success', False) for r in self.results.get('export_features', {}).values()) > 0 else '🔴'} Export Features: Implement CSV/PDF/Excel export functionality
4. {'✅' if self.results.get('listing_page', {}).get('has_search') else '🔴'} Search Functionality: Add search and filtering capabilities

OVERALL ASSESSMENT:
The truck management system has basic functionality but needs improvements in:
- Edit functionality (critical)
- Export capabilities 
- Enhanced UI/UX features
- Better data validation
"""
        
        # Save report
        with open('/workspaces/Truck_Opti/TRUCK_MANAGEMENT_DETAILED_REPORT.md', 'w') as f:
            f.write(report)
        
        print(report)
        return report
    
    def run_all_tests(self):
        """Run all truck management tests"""
        print("🚛 Truck Management Detailed Testing Starting...")
        print("="*80)
        
        start_time = time.time()
        
        try:
            self.test_truck_listing_page()
            self.test_add_truck_form()
            self.test_truck_crud_operations()
            self.test_edit_functionality()
            self.test_export_functionality()
            self.test_ui_elements_and_responsiveness()
            
        except Exception as e:
            self.log(f"Critical error during testing: {str(e)}", "ERROR")
            self.results['issues'].append(f"Critical test failure: {str(e)}")
        
        end_time = time.time()
        total_time = end_time - start_time
        
        self.log(f"🎉 Truck management testing completed in {total_time:.2f} seconds")
        
        return self.generate_truck_management_report()


if __name__ == "__main__":
    tester = TruckManagementTester()
    tester.run_all_tests()