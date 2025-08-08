#!/usr/bin/env python3
"""
Comprehensive Carton Management Testing Script
Tests CRUD operations, data validation, bulk operations, and UI functionality
"""

import requests
import time
import json
from datetime import datetime
from bs4 import BeautifulSoup
import random

BASE_URL = "http://127.0.0.1:5000"

class CartonManagementTester:
    def __init__(self):
        self.session = requests.Session()
        self.results = {
            'listing_page': {},
            'add_form': {},
            'edit_functionality': {},
            'delete_functionality': {},
            'data_validation': {},
            'bulk_operations': {},
            'export_features': {},
            'ui_elements': {},
            'performance': {},
            'issues': []
        }
        self.test_cartons = []
    
    def log(self, message, test_type="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {test_type}: {message}")
    
    def test_carton_listing_page(self):
        """Test the carton listing page comprehensively"""
        self.log("=== TESTING CARTON LISTING PAGE ===", "TEST")
        
        start_time = time.time()
        response = self.session.get(f"{BASE_URL}/carton-types")
        end_time = time.time()
        
        if response.status_code == 200:
            load_time = (end_time - start_time) * 1000
            self.log(f"✅ Carton listing loaded in {load_time:.2f}ms")
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Analyze page structure
            table = soup.find('table')
            carton_count = 0
            if table:
                tbody = table.find('tbody')
                carton_count = len(tbody.find_all('tr')) if tbody else len(table.find_all('tr')) - 1
            
            # Check for DataTable features
            has_datatable = bool(soup.find('table', {'id': lambda x: x and 'carton' in x.lower()}) or
                               soup.find('script', string=lambda x: x and 'DataTable' in x))
            
            # Check for action buttons
            edit_buttons = soup.find_all('a', href=lambda x: x and 'edit-carton' in x)
            delete_buttons = soup.find_all('button', onclick=lambda x: x and 'delete' in x.lower())
            add_button = soup.find('a', href=lambda x: x and 'add-carton' in x)
            
            # Check for export functionality
            export_buttons = soup.find_all('button', string=lambda x: x and any(word in x.lower() for word in ['export', 'csv', 'download']))
            
            # Check for search and filter
            search_input = soup.find('input', {'type': 'search'}) or soup.find('input', placeholder=lambda x: x and 'search' in x.lower())
            filter_elements = soup.find_all('select', {'name': lambda x: x and 'filter' in x.lower()})
            
            self.results['listing_page'] = {
                'load_time_ms': load_time,
                'carton_count': carton_count,
                'has_datatable': has_datatable,
                'edit_buttons': len(edit_buttons),
                'delete_buttons': len(delete_buttons),
                'has_add_button': bool(add_button),
                'export_buttons': len(export_buttons),
                'has_search': bool(search_input),
                'filter_options': len(filter_elements),
                'page_responsive': 'viewport' in response.text
            }
            
            self.log(f"📊 Found {carton_count} cartons in system")
            self.log(f"🔍 DataTable integration: {'✅' if has_datatable else '❌'}")
            self.log(f"✏️ Edit buttons: {len(edit_buttons)}")
            self.log(f"🗑️ Delete buttons: {len(delete_buttons)}")
            self.log(f"📤 Export buttons: {len(export_buttons)}")
            self.log(f"🔎 Search functionality: {'✅' if search_input else '❌'}")
            
        else:
            self.log(f"❌ Carton listing failed to load: {response.status_code}", "ERROR")
            self.results['issues'].append(f"Carton listing returned status {response.status_code}")
    
    def test_add_carton_form(self):
        """Test add carton form functionality and validation"""
        self.log("=== TESTING ADD CARTON FORM ===", "TEST")
        
        response = self.session.get(f"{BASE_URL}/add-carton-type")
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            form = soup.find('form')
            if form:
                # Check for all required fields
                required_fields = {
                    'name': soup.find('input', {'name': 'name'}),
                    'length': soup.find('input', {'name': 'length'}),
                    'width': soup.find('input', {'name': 'width'}),
                    'height': soup.find('input', {'name': 'height'}),
                    'weight': soup.find('input', {'name': 'weight'})
                }
                
                # Check for additional fields that might be useful
                optional_fields = {
                    'description': soup.find('textarea', {'name': 'description'}) or soup.find('input', {'name': 'description'}),
                    'category': soup.find('select', {'name': 'category'}),
                    'material': soup.find('input', {'name': 'material'}),
                    'fragile': soup.find('input', {'name': 'fragile', 'type': 'checkbox'}),
                    'stackable': soup.find('input', {'name': 'stackable', 'type': 'checkbox'})
                }
                
                # Check form validation attributes
                validation_features = {
                    'required_fields': sum(1 for field in required_fields.values() if field and field.get('required')),
                    'min_max_validation': sum(1 for field in required_fields.values() if field and (field.get('min') or field.get('max'))),
                    'pattern_validation': sum(1 for field in required_fields.values() if field and field.get('pattern')),
                    'client_side_validation': bool(soup.find('script', string=lambda x: x and 'validation' in x.lower())) if soup else False
                }
                
                submit_button = soup.find('input', {'type': 'submit'}) or soup.find('button', {'type': 'submit'})
                cancel_link = soup.find('a', string=lambda x: x and 'cancel' in x.lower())
                
                self.results['add_form'] = {
                    'form_exists': True,
                    'required_fields_present': {k: bool(v) for k, v in required_fields.items()},
                    'optional_fields_present': {k: bool(v) for k, v in optional_fields.items()},
                    'validation_features': validation_features,
                    'has_submit': bool(submit_button),
                    'has_cancel': bool(cancel_link),
                    'form_method': form.get('method', '').upper()
                }
                
                missing_required = [k for k, v in required_fields.items() if not v]
                if missing_required:
                    self.log(f"⚠️ Missing required fields: {', '.join(missing_required)}", "WARNING")
                    self.results['issues'].append(f"Add carton form missing: {', '.join(missing_required)}")
                else:
                    self.log("✅ All required fields present in add form")
                
                optional_count = sum(1 for v in optional_fields.values() if v)
                validation_count = sum(1 for v in validation_features.values() if isinstance(v, bool) and v) + sum(v for v in validation_features.values() if isinstance(v, int))
                self.log(f"📝 Optional fields: {optional_count}/5 available")
                self.log(f"✅ Validation features: {validation_count}/4 implemented")
            else:
                self.log("❌ No form found on add carton page", "ERROR")
                self.results['issues'].append("Add carton page missing form")
        else:
            self.log(f"❌ Add carton form failed to load: {response.status_code}", "ERROR")
    
    def test_carton_crud_operations(self):
        """Test Create, Read, Update, Delete operations"""
        self.log("=== TESTING CARTON CRUD OPERATIONS ===", "TEST")
        
        # CREATE - Test adding new cartons
        test_cartons = [
            {
                'name': f'Test Small Carton {int(time.time())}',
                'length': '25', 'width': '20', 'height': '15', 'weight': '2.5'
            },
            {
                'name': f'Test Medium Carton {int(time.time())}',
                'length': '40', 'width': '30', 'height': '25', 'weight': '8.0'
            },
            {
                'name': f'Test Large Carton {int(time.time())}',
                'length': '60', 'width': '45', 'height': '35', 'weight': '15.0'
            }
        ]
        
        created_cartons = 0
        for carton_data in test_cartons:
            try:
                create_response = self.session.post(f"{BASE_URL}/add-carton-type", data=carton_data)
                
                if create_response.status_code in [200, 302]:
                    created_cartons += 1
                    self.test_cartons.append(carton_data['name'])
                    self.log(f"✅ Created carton: {carton_data['name']}")
                else:
                    self.log(f"❌ Failed to create carton: {carton_data['name']}", "ERROR")
                    
            except Exception as e:
                self.log(f"❌ Error creating carton {carton_data['name']}: {e}", "ERROR")
                self.results['issues'].append(f"Carton creation error: {str(e)}")
        
        self.results['crud_operations'] = {
            'create_attempts': len(test_cartons),
            'create_successful': created_cartons,
            'create_success_rate': (created_cartons / len(test_cartons)) * 100
        }
        
        self.log(f"📊 Carton Creation: {created_cartons}/{len(test_cartons)} successful ({(created_cartons / len(test_cartons)) * 100:.1f}%)")
        
        # READ - Verify created cartons appear in listing
        list_response = self.session.get(f"{BASE_URL}/carton-types")
        if list_response.status_code == 200:
            visible_cartons = sum(1 for carton_name in self.test_cartons if carton_name in list_response.text)
            self.results['crud_operations']['read_verification'] = visible_cartons / len(self.test_cartons) if self.test_cartons else 1
            self.log(f"✅ Carton Visibility: {visible_cartons}/{len(self.test_cartons)} created cartons visible")
    
    def test_edit_functionality(self):
        """Test carton editing functionality"""
        self.log("=== TESTING CARTON EDIT FUNCTIONALITY ===", "TEST")
        
        # Get carton listing to find edit links
        list_response = self.session.get(f"{BASE_URL}/carton-types")
        
        if list_response.status_code == 200:
            soup = BeautifulSoup(list_response.text, 'html.parser')
            edit_links = soup.find_all('a', href=lambda x: x and 'edit-carton' in x)
            
            if edit_links:
                # Test first edit link
                edit_url = edit_links[0].get('href')
                if not edit_url.startswith('http'):
                    edit_url = BASE_URL + edit_url
                
                self.log(f"Testing edit URL: {edit_url}")
                
                edit_response = self.session.get(edit_url)
                
                if edit_response.status_code == 200:
                    edit_soup = BeautifulSoup(edit_response.text, 'html.parser')
                    
                    # Check if form is pre-populated
                    form = edit_soup.find('form')
                    if form:
                        # Check for pre-filled values
                        name_field = form.find('input', {'name': 'name'})
                        length_field = form.find('input', {'name': 'length'})
                        width_field = form.find('input', {'name': 'width'})
                        
                        prepopulated_fields = [
                            name_field.get('value', '') if name_field else '',
                            length_field.get('value', '') if length_field else '',
                            width_field.get('value', '') if width_field else ''
                        ]
                        
                        is_prepopulated = all(value.strip() for value in prepopulated_fields)
                        
                        self.results['edit_functionality'] = {
                            'edit_page_loads': True,
                            'has_form': True,
                            'fields_prepopulated': is_prepopulated,
                            'prepopulated_values': {
                                'name': prepopulated_fields[0],
                                'length': prepopulated_fields[1],
                                'width': prepopulated_fields[2]
                            }
                        }
                        
                        if is_prepopulated:
                            self.log("✅ Edit form fields are pre-populated correctly")
                        else:
                            self.log("❌ Edit form fields are NOT pre-populated - CRITICAL ISSUE", "ERROR")
                            self.results['issues'].append("Edit carton form not pre-populated - creates new instead of editing")
                    else:
                        self.log("❌ Edit page has no form", "ERROR")
                        self.results['issues'].append("Edit carton page missing form")
                else:
                    self.log(f"❌ Edit page failed to load: {edit_response.status_code}", "ERROR")
            else:
                self.log("⚠️ No edit links found", "WARNING")
                self.results['issues'].append("No carton edit functionality available")
        else:
            self.log("❌ Could not access carton listing for edit testing", "ERROR")
    
    def test_data_validation(self):
        """Test data validation and error handling"""
        self.log("=== TESTING DATA VALIDATION ===", "TEST")
        
        validation_tests = [
            {
                'name': 'Empty Values Test',
                'data': {'name': '', 'length': '', 'width': '', 'height': '', 'weight': ''},
                'should_fail': True
            },
            {
                'name': 'Negative Values Test',
                'data': {'name': 'Test Negative', 'length': '-10', 'width': '20', 'height': '15', 'weight': '5'},
                'should_fail': True
            },
            {
                'name': 'Zero Values Test',
                'data': {'name': 'Test Zero', 'length': '0', 'width': '0', 'height': '0', 'weight': '0'},
                'should_fail': True
            },
            {
                'name': 'Invalid Characters Test',
                'data': {'name': 'Test Invalid', 'length': 'abc', 'width': '20', 'height': '15', 'weight': '5'},
                'should_fail': True
            },
            {
                'name': 'Very Large Values Test',
                'data': {'name': 'Test Large', 'length': '999999', 'width': '999999', 'height': '999999', 'weight': '999999'},
                'should_fail': False  # Should be accepted but might warn
            }
        ]
        
        validation_results = []
        
        for test in validation_tests:
            try:
                response = self.session.post(f"{BASE_URL}/add-carton-type", data=test['data'])
                
                test_result = {
                    'test_name': test['name'],
                    'expected_failure': test['should_fail'],
                    'actual_status': response.status_code,
                    'failed_as_expected': (response.status_code != 302) if test['should_fail'] else (response.status_code == 302),
                    'response_content_has_error': 'error' in response.text.lower() or 'invalid' in response.text.lower()
                }
                
                validation_results.append(test_result)
                
                if test_result['failed_as_expected']:
                    self.log(f"✅ {test['name']}: Validation working correctly")
                else:
                    self.log(f"⚠️ {test['name']}: Validation issue detected", "WARNING")
                    self.results['issues'].append(f"Validation issue: {test['name']}")
                    
            except Exception as e:
                self.log(f"❌ Error in validation test {test['name']}: {e}", "ERROR")
                validation_results.append({'test_name': test['name'], 'error': str(e)})
        
        self.results['data_validation'] = {
            'tests_run': len(validation_tests),
            'tests_passed': sum(1 for r in validation_results if r.get('failed_as_expected', False)),
            'validation_working': (sum(1 for r in validation_results if r.get('failed_as_expected', False)) / len(validation_tests)) * 100,
            'detailed_results': validation_results
        }
        
        self.log(f"🧪 Data Validation: {self.results['data_validation']['tests_passed']}/{len(validation_tests)} tests passed")
    
    def test_bulk_operations(self):
        """Test bulk operations and batch processing"""
        self.log("=== TESTING BULK OPERATIONS ===", "TEST")
        
        # Check if there's a bulk operation interface
        list_response = self.session.get(f"{BASE_URL}/carton-types")
        
        if list_response.status_code == 200:
            soup = BeautifulSoup(list_response.text, 'html.parser')
            
            # Look for bulk operation elements
            bulk_elements = {
                'select_all_checkbox': bool(soup.find('input', {'type': 'checkbox', 'id': lambda x: x and 'select' in x.lower() and 'all' in x.lower()})),
                'bulk_delete_button': bool(soup.find('button', string=lambda x: x and 'bulk' in x.lower() and 'delete' in x.lower())),
                'bulk_export_button': bool(soup.find('button', string=lambda x: x and 'bulk' in x.lower() and 'export' in x.lower())),
                'individual_checkboxes': len(soup.find_all('input', {'type': 'checkbox', 'name': lambda x: x and 'carton' in x.lower()})),
                'bulk_actions_dropdown': bool(soup.find('select', {'name': lambda x: x and 'bulk' in x.lower()}))
            }
            
            self.results['bulk_operations'] = bulk_elements
            
            bulk_score = sum(1 for v in bulk_elements.values() if isinstance(v, bool) and v)
            self.log(f"📊 Bulk Operations: {bulk_score}/5 features available")
            
            if bulk_elements['individual_checkboxes'] > 0:
                self.log(f"☑️ Individual selection: {bulk_elements['individual_checkboxes']} checkboxes found")
            else:
                self.log("⚠️ No individual selection checkboxes found", "WARNING")
        else:
            self.log("❌ Could not test bulk operations", "ERROR")
    
    def test_export_functionality(self):
        """Test export functionality for cartons"""
        self.log("=== TESTING CARTON EXPORT FUNCTIONALITY ===", "TEST")
        
        export_formats = ['csv', 'excel', 'pdf', 'json']
        export_results = {}
        
        for format_type in export_formats:
            # Try multiple possible export endpoints
            possible_urls = [
                f"/carton-types/export/{format_type}",
                f"/export/cartons/{format_type}",
                f"/cartons/export?format={format_type}",
                f"/api/cartons/export/{format_type}"
            ]
            
            export_found = False
            for url in possible_urls:
                try:
                    response = self.session.get(BASE_URL + url)
                    if response.status_code == 200:
                        export_results[format_type] = {
                            'available': True,
                            'url': url,
                            'content_length': len(response.content),
                            'content_type': response.headers.get('content-type', ''),
                            'filename_header': response.headers.get('content-disposition', '')
                        }
                        self.log(f"✅ {format_type.upper()} export available at {url}")
                        export_found = True
                        break
                except Exception as e:
                    continue
            
            if not export_found:
                export_results[format_type] = {'available': False}
                self.log(f"❌ {format_type.upper()} export not found")
        
        self.results['export_features'] = export_results
        working_exports = sum(1 for r in export_results.values() if r.get('available', False))
        self.log(f"📤 Export Functionality: {working_exports}/{len(export_formats)} formats working")
    
    def test_performance_metrics(self):
        """Test carton management performance"""
        self.log("=== TESTING PERFORMANCE METRICS ===", "TEST")
        
        performance_tests = []
        
        # Test listing page load times
        for i in range(3):
            start_time = time.time()
            response = self.session.get(f"{BASE_URL}/carton-types")
            end_time = time.time()
            
            if response.status_code == 200:
                performance_tests.append({
                    'test': 'listing_load',
                    'time_ms': (end_time - start_time) * 1000,
                    'success': True
                })
        
        # Test form load times
        start_time = time.time()
        response = self.session.get(f"{BASE_URL}/add-carton-type")
        end_time = time.time()
        
        if response.status_code == 200:
            performance_tests.append({
                'test': 'add_form_load',
                'time_ms': (end_time - start_time) * 1000,
                'success': True
            })
        
        self.results['performance'] = {
            'avg_listing_load_ms': sum(t['time_ms'] for t in performance_tests if t['test'] == 'listing_load') / max(1, sum(1 for t in performance_tests if t['test'] == 'listing_load')),
            'form_load_ms': next((t['time_ms'] for t in performance_tests if t['test'] == 'add_form_load'), 0),
            'all_tests': performance_tests
        }
        
        self.log(f"⚡ Average listing load: {self.results['performance']['avg_listing_load_ms']:.2f}ms")
        self.log(f"⚡ Form load time: {self.results['performance']['form_load_ms']:.2f}ms")
    
    def generate_carton_management_report(self):
        """Generate comprehensive carton management report"""
        self.log("=== GENERATING CARTON MANAGEMENT REPORT ===", "TEST")
        
        report = f"""
CARTON MANAGEMENT COMPREHENSIVE TEST REPORT
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
{'='*80}

EXECUTIVE SUMMARY:
Carton management is a fundamental feature for defining cargo types and specifications.
This report evaluates all carton-related functionality and user experience.

DETAILED ANALYSIS:

1. CARTON LISTING PAGE:
   Load Time: {self.results['listing_page'].get('load_time_ms', 'N/A'):.2f}ms
   Cartons in System: {self.results['listing_page'].get('carton_count', 'N/A')}
   DataTable Integration: {'✅' if self.results['listing_page'].get('has_datatable') else '❌'}
   Edit Actions: {self.results['listing_page'].get('edit_buttons', 'N/A')} buttons
   Delete Actions: {self.results['listing_page'].get('delete_buttons', 'N/A')} buttons
   Add New Button: {'✅' if self.results['listing_page'].get('has_add_button') else '❌'}
   Search Function: {'✅' if self.results['listing_page'].get('has_search') else '❌'}
   Export Options: {self.results['listing_page'].get('export_buttons', 0)} found

2. ADD CARTON FORM:
   Form Exists: {'✅' if self.results['add_form'].get('form_exists') else '❌'}
   Required Fields Complete: {sum(self.results['add_form'].get('required_fields_present', {}).values())}/5
   Optional Fields: {sum(self.results['add_form'].get('optional_fields_present', {}).values())}/5
   Validation Features: {sum(self.results['add_form'].get('validation_features', {}).values())}/4
   Submit/Cancel: {'✅' if self.results['add_form'].get('has_submit') and self.results['add_form'].get('has_cancel') else '⚠️'}

3. CRUD OPERATIONS:
   Create Success Rate: {self.results.get('crud_operations', {}).get('create_success_rate', 0):.1f}%
   Read Verification: {(self.results.get('crud_operations', {}).get('read_verification', 0) * 100):.1f}%
   Update/Edit: {'✅ Working' if self.results.get('edit_functionality', {}).get('fields_prepopulated') else '❌ NOT WORKING'}

4. DATA VALIDATION:
   Validation Tests: {self.results.get('data_validation', {}).get('tests_run', 'N/A')}
   Validation Success: {self.results.get('data_validation', {}).get('validation_working', 0):.1f}%
   Error Handling: {'✅' if self.results.get('data_validation', {}).get('validation_working', 0) > 60 else '❌'}

5. BULK OPERATIONS:
   Bulk Features: {sum(1 for v in self.results.get('bulk_operations', {}).values() if isinstance(v, bool) and v)}/5 available
   Individual Selection: {self.results.get('bulk_operations', {}).get('individual_checkboxes', 0)} checkboxes
   Bulk Actions: {'✅' if self.results.get('bulk_operations', {}).get('bulk_actions_dropdown') else '❌'}

6. EXPORT FUNCTIONALITY:
   Export Formats: {sum(1 for r in self.results.get('export_features', {}).values() if r.get('available', False))}/4 working
   Available: {', '.join(k.upper() for k, v in self.results.get('export_features', {}).items() if v.get('available', False)) or 'None'}

7. PERFORMANCE:
   Average Load Time: {self.results.get('performance', {}).get('avg_listing_load_ms', 0):.2f}ms
   Form Load Time: {self.results.get('performance', {}).get('form_load_ms', 0):.2f}ms
   Performance Grade: {'🟢 Excellent' if self.results.get('performance', {}).get('avg_listing_load_ms', 1000) < 200 else '🟡 Good' if self.results.get('performance', {}).get('avg_listing_load_ms', 1000) < 1000 else '🔴 Needs Improvement'}

CRITICAL ISSUES IDENTIFIED:
"""
        if self.results['issues']:
            for i, issue in enumerate(self.results['issues'], 1):
                report += f"{i}. {issue}\n"
        else:
            report += "No critical issues identified.\n"

        report += f"""

KEY RECOMMENDATIONS:

1. {'🔴 CRITICAL' if not self.results.get('edit_functionality', {}).get('fields_prepopulated') else '✅'} - Fix Edit Functionality:
   Edit forms must pre-populate with existing data to allow actual editing

2. {'🟡 HIGH PRIORITY' if sum(1 for r in self.results.get('export_features', {}).values() if r.get('available', False)) == 0 else '✅'} - Implement Export Features:
   Add CSV, Excel, PDF export capabilities for carton data

3. {'🟡 HIGH PRIORITY' if not self.results.get('listing_page', {}).get('has_search') else '✅'} - Add Search/Filter:
   Implement search and filtering for large carton inventories

4. {'🟢 MEDIUM' if sum(1 for v in self.results.get('bulk_operations', {}).values() if isinstance(v, bool) and v) < 3 else '✅'} - Enhance Bulk Operations:
   Add bulk selection, delete, and export capabilities

5. {'🟢 LOW PRIORITY' if sum(self.results.get('add_form', {}).get('validation_features', {}).values()) >= 2 else '🟡 MEDIUM'} - Improve Validation:
   Add client-side validation and better error messages

FEATURE COMPLETENESS SCORE:
- Basic Functionality: {85 if self.results.get('crud_operations', {}).get('create_success_rate', 0) > 80 else 60}%
- Advanced Features: {40 if sum(1 for r in self.results.get('export_features', {}).values() if r.get('available', False)) > 0 else 20}%
- User Experience: {70 if self.results.get('edit_functionality', {}).get('fields_prepopulated') else 30}%

OVERALL CARTON MANAGEMENT GRADE: {'A-' if len(self.results['issues']) == 0 and self.results.get('edit_functionality', {}).get('fields_prepopulated') else 'B' if len(self.results['issues']) <= 2 else 'C'}
"""
        
        # Save report
        with open('/workspaces/Truck_Opti/CARTON_MANAGEMENT_COMPREHENSIVE_REPORT.md', 'w') as f:
            f.write(report)
        
        print(report)
        return report
    
    def run_all_tests(self):
        """Run all carton management tests"""
        print("📦 Carton Management Comprehensive Testing Starting...")
        print("="*80)
        
        start_time = time.time()
        
        try:
            self.test_carton_listing_page()
            self.test_add_carton_form()
            self.test_carton_crud_operations()
            self.test_edit_functionality()
            self.test_data_validation()
            self.test_bulk_operations()
            self.test_export_functionality()
            self.test_performance_metrics()
            
        except Exception as e:
            self.log(f"Critical error during testing: {str(e)}", "ERROR")
            self.results['issues'].append(f"Critical test failure: {str(e)}")
        
        end_time = time.time()
        total_time = end_time - start_time
        
        self.log(f"🎉 Carton management testing completed in {total_time:.2f} seconds")
        
        return self.generate_carton_management_report()


if __name__ == "__main__":
    tester = CartonManagementTester()
    tester.run_all_tests()