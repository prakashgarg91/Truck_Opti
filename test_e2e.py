"""
TruckOpti End-to-End Test Suite
Tests all major components as an end user would
"""
import sys
import json
from io import BytesIO

sys.path.insert(0, 'd:/Github/Truck_Opti/apps/web')
from app import create_app

def run_tests():
    app = create_app()
    client = app.test_client()
    
    results = []
    
    print('=' * 70)
    print('TRUCKOPTI END-TO-END TEST RESULTS')
    print('=' * 70)
    
    # Test 1: Health Check
    print('\n[Test 1] Health Check API')
    response = client.get('/api/health')
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    
    # Test 2: Items Template Download
    print('\n[Test 2] Items Template Download')
    response = client.get('/api/upload/template/items')
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    print(f'  Content-Type: {response.content_type}')
    
    # Test 3: Bins Template Download
    print('\n[Test 3] Bins Template Download')
    response = client.get('/api/upload/template/bins')
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    
    # Test 4: Export Items
    print('\n[Test 4] Export Items Data')
    response = client.get('/api/upload/export/items')
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    if passed:
        data_lines = response.data.decode().strip().split('\n')
        print(f'  Exported rows: {len(data_lines)-1}')
    
    # Test 5: 3D Packing API
    print('\n[Test 5] 3D Packing API')
    response = client.post('/api/pack',
        json={
            'container': {'length': 400, 'width': 200, 'height': 200},
            'items': [
                {'name': 'Box1', 'length': 50, 'width': 40, 'height': 30, 'weight': 5},
                {'name': 'Box2', 'length': 60, 'width': 50, 'height': 40, 'weight': 8},
                {'name': 'Box3', 'length': 30, 'width': 30, 'height': 25, 'weight': 3}
            ]
        },
        content_type='application/json'
    )
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    if passed:
        result = json.loads(response.data)
        print(f'  Packed items: {len(result.get("packed_items", []))}')
        print(f'  Utilization: {result.get("metrics", {}).get("utilization", 0)}%')
    
    # Test 6: Preview Upload
    print('\n[Test 6] Preview Upload')
    csv_data = b'name,length,width,height,weight\nTestA,40,30,20,5\nTestB,50,40,30,8'
    response = client.post('/api/upload/preview',
        data={'file': (BytesIO(csv_data), 'test.csv'), 'type': 'items'},
        content_type='multipart/form-data'
    )
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    if passed:
        result = json.loads(response.data)
        print(f'  Valid rows: {result.get("preview", {}).get("valid_rows", 0)}')
    
    # Test 7: Upload Items
    print('\n[Test 7] Upload Items')
    csv_data = b'name,length,width,height,weight\nEndToEndTest,100,80,60,15'
    response = client.post('/api/upload/items',
        data={'file': (BytesIO(csv_data), 'e2e_test.csv')},
        content_type='multipart/form-data'
    )
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    if passed:
        result = json.loads(response.data)
        print(f'  Imported: {result.get("summary", {}).get("imported", 0)} items')
    
    # Test 8: Main Pages
    print('\n[Test 8] Main Page Routes')
    pages = ['/', '/truck-types', '/carton-types', '/fleet-optimization', '/analytics']
    for page in pages:
        response = client.get(page)
        status_ok = response.status_code in [200, 302]
        results.append(status_ok)
        status_icon = 'PASS' if response.status_code == 200 else 'REDIRECT' if response.status_code == 302 else 'FAIL'
        print(f'  {page}: {response.status_code} {status_icon}')
    
    # Test 9: Export Bins
    print('\n[Test 9] Export Bins Data')
    response = client.get('/api/upload/export/bins')
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    if passed:
        data_lines = response.data.decode().strip().split('\n')
        print(f'  Exported rows: {len(data_lines)-1}')
    
    # Test 10: Multi-item Packing with Large Dataset
    print('\n[Test 10] Large Dataset Packing')
    items = [{'name': f'Item{i}', 'length': 20+i*2, 'width': 15+i, 'height': 10+i, 'weight': 2+i*0.5} for i in range(20)]
    response = client.post('/api/pack',
        json={
            'container': {'length': 600, 'width': 300, 'height': 250},
            'items': items
        },
        content_type='application/json'
    )
    passed = response.status_code == 200
    results.append(passed)
    print(f'  Status: {response.status_code} {"PASS" if passed else "FAIL"}')
    if passed:
        result = json.loads(response.data)
        print(f'  Total items: 20')
        print(f'  Packed: {len(result.get("packed_items", []))}')
        print(f'  Unpacked: {len(result.get("unpacked_items", []))}')
        print(f'  Utilization: {result.get("metrics", {}).get("utilization", 0)}%')
        print(f'  Execution time: {result.get("metrics", {}).get("execution_time", 0)}ms')
    
    # Summary
    print('\n' + '=' * 70)
    passed_count = sum(results)
    total_count = len(results)
    print(f'TEST SUMMARY: {passed_count}/{total_count} PASSED')
    print('=' * 70)
    
    return passed_count == total_count

if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
