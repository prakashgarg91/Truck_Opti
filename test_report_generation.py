#!/usr/bin/env python3
"""
Comprehensive Report Generation and PDF Export Testing
TruckOpti End-to-End Testing Suite
"""

import requests
import json
import time
import os

def test_report_generation():
    """Test report generation functionality"""
    base_url = 'http://localhost:5001'
    
    print('🔍 REPORT GENERATION AND PDF EXPORT TESTING')
    print('=' * 60)
    
    # Test 1: Generate optimization report
    print('\n1. Testing optimization report generation...')
    try:
        # First get a valid recommendation
        optimize_data = {
            'truck_id': 1,
            'carton_requirements': [
                {'carton_id': 1, 'quantity': 3},
                {'carton_id': 2, 'quantity': 2}
            ]
        }
        
        print('   📊 Generating optimization report...')
        start_time = time.time()
        
        # Generate optimization first
        response = requests.post(f'{base_url}/api/recommend-trucks', json=optimize_data)
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                recommendations = result.get('recommendations', [])
                if recommendations:
                    # Get the first recommendation
                    best_rec = recommendations[0]
                    print(f'   [SUCCESS] Optimization generated: {best_rec.get("efficiency_score", 0):.1f}% efficiency')
                    
                    # Test 2: Generate detailed report
                    print('\n2. Testing detailed report generation...')
                    report_data = {
                        'optimization_id': best_rec.get('id', 1),
                        'format': 'json',
                        'include_3d': True,
                        'include_cost_analysis': True
                    }
                    
                    report_response = requests.post(f'{base_url}/api/reports/generate', json=report_data)
                    if report_response.status_code == 200:
                        report_result = report_response.json()
                        if report_result.get('success'):
                            report_content = report_result.get('report', {})
                            print('   [SUCCESS] Detailed report generated successfully')
                            print(f"   - Report ID: {report_content.get('report_id', 'N/A')}")
                            print(f"   - Format: {report_content.get('format', 'Unknown')}")
                            print(f"   - 3D Data Included: {report_content.get('include_3d', False)}")
                            print(f"   - Cost Analysis: {report_content.get('include_cost_analysis', False)}")
                        else:
                            print(f"   [ERROR] Report generation failed: {report_result.get('error')}")
                    else:
                        print(f'   [ERROR] Report API failed: HTTP {report_response.status_code}')
                    
                    # Test 3: Test PDF export
                    print('\n3. Testing PDF export functionality...')
                    pdf_data = {
                        'report_id': report_content.get('report_id', 1),
                        'format': 'pdf',
                        'template': 'executive_summary'
                    }
                    
                    pdf_response = requests.post(f'{base_url}/api/reports/pdf', json=pdf_data)
                    if pdf_response.status_code == 200:
                        pdf_result = pdf_response.json()
                        if pdf_result.get('success'):
                            pdf_info = pdf_result.get('pdf', {})
                            print('   [SUCCESS] PDF export successful')
                            print(f"   - PDF URL: {pdf_info.get('download_url', 'N/A')}")
                            print(f"   - File size: {pdf_info.get('file_size', 'Unknown')}")
                            print(f"   - Pages: {pdf_info.get('page_count', 'Unknown')}")
                        else:
                            print(f"   [ERROR] PDF export failed: {pdf_result.get('error')}")
                    else:
                        print(f'   [ERROR] PDF API failed: HTTP {pdf_response.status_code}')
                    
                    # Test 4: Test Excel export
                    print('\n4. Testing Excel export functionality...')
                    excel_data = {
                        'report_id': report_content.get('report_id', 1),
                        'format': 'excel',
                        'include_raw_data': True
                    }
                    
                    excel_response = requests.post(f'{base_url}/api/reports/excel', json=excel_data)
                    if excel_response.status_code == 200:
                        excel_result = excel_response.json()
                        if excel_result.get('success'):
                            excel_info = excel_result.get('excel', {})
                            print('   [SUCCESS] Excel export successful')
                            print(f"   - Excel URL: {excel_info.get('download_url', 'N/A')}")
                            print(f"   - Sheets included: {excel_info.get('sheet_count', 'Unknown')}")
                        else:
                            print(f"   [ERROR] Excel export failed: {excel_result.get('error')}")
                    else:
                        print(f'   [ERROR] Excel API failed: HTTP {excel_response.status_code}')
                else:
                    print('   [ERROR] No recommendations generated for report testing')
            else:
                print(f"   [ERROR] Optimization failed: {result.get('error')}")
        else:
            print(f'   [ERROR] Optimization API failed: HTTP {response.status_code}')
            
        end_time = time.time()
        print(f'\n⏱️  Report generation test completed in {end_time - start_time:.2f} seconds')
        
    except Exception as e:
        print(f'   [ERROR] Error in report generation testing: {e}')
    
    # Test 5: Test report templates
    print('\n5. Testing report templates availability...')
    try:
        response = requests.get(f'{base_url}/api/reports/templates')
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                templates = result.get('templates', [])
                print(f'   [SUCCESS] Report templates available: {len(templates)} templates found')
                for template in templates:
                    print(f"   - {template.get('name', 'Unknown')}: {template.get('description', 'No description')}")
            else:
                print(f"   [ERROR] Templates API failed: {result.get('error')}")
        else:
            print(f'   [ERROR] Templates API failed: HTTP {response.status_code}')
    except Exception as e:
        print(f'   [ERROR] Error testing templates: {e}')
    
    print('\n' + '=' * 60)
    print('🏁 REPORT GENERATION TESTING COMPLETED')
    print('=' * 60)

if __name__ == '__main__':
    test_report_generation()