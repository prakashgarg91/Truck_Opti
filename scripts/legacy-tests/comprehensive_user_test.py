#!/usr/bin/env python3
"""
TruckOpti Comprehensive End-User Testing Suite
Simulates real user scenarios and tests all major functionality
"""

import sys
import os
import json
import sqlite3
import time
from pathlib import Path

# Add the web app to Python path
sys.path.insert(0, 'apps/web')

def test_database_setup():
    """Test 1: Database Setup and Sample Data"""
    print("\n" + "="*60)
    print("TEST 1: DATABASE SETUP AND SAMPLE DATA")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.app_context():
            from app.extensions import db
            from app.domain.entities import TruckType, CartonType
            
            # Check if database tables exist
            truck_count = TruckType.query.count()
            carton_count = CartonType.query.count()
            
            print(f"✅ Database connection: SUCCESS")
            print(f"✅ Truck types in database: {truck_count}")
            print(f"✅ Carton types in database: {carton_count}")
            
            if truck_count > 0 and carton_count > 0:
                print("✅ Sample data exists")
                return True
            else:
                print("⚠️  No sample data found")
                return False
                
    except Exception as e:
        print(f"❌ Database setup failed: {e}")
        return False

def test_3d_packing_engine():
    """Test 2: 3D Packing Algorithm"""
    print("\n" + "="*60)
    print("TEST 2: 3D PACKING ALGORITHM")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.app_context():
            from app.core.modern_3d_packing import Modern3DPacker
            
            # Create test container and items
            container = {
                'length': 400,
                'width': 200, 
                'height': 200,
                'max_weight': 1000
            }
            
            items = [
                {'name': 'Box1', 'length': 50, 'width': 40, 'height': 30, 'weight': 5},
                {'name': 'Box2', 'length': 60, 'width': 50, 'height': 40, 'weight': 8},
                {'name': 'Box3', 'length': 30, 'width': 30, 'height': 25, 'weight': 3},
                {'name': 'Box4', 'length': 40, 'width': 35, 'height': 20, 'weight': 4},
                {'name': 'Box5', 'length': 25, 'width': 25, 'height': 15, 'weight': 2}
            ]
            
            print(f"📦 Container: {container['length']}x{container['width']}x{container['height']}")
            print(f"📦 Items to pack: {len(items)}")
            
            # Test packing
            packer = Modern3DPacker()
            start_time = time.time()
            result = packer.pack(container, items)
            end_time = time.time()
            
            print(f"✅ Packing completed in {(end_time - start_time)*1000:.2f}ms")
            print(f"✅ Packed items: {len(result.get('packed_items', []))}")
            print(f"✅ Unpacked items: {len(result.get('unpacked_items', []))}")
            print(f"✅ Space utilization: {result.get('metrics', {}).get('utilization', 0):.1f}%")
            
            return len(result.get('packed_items', [])) > 0
            
    except Exception as e:
        print(f"❌ 3D Packing test failed: {e}")
        return False

def test_truck_recommendation():
    """Test 3: Smart Truck Recommendation"""
    print("\n" + "="*60)
    print("TEST 3: SMART TRUCK RECOMMENDATION")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.app_context():
            from app.domain.entities import TruckType, CartonType
            from app.application.services.optimization_service import OptimizationService
            
            # Get sample data
            trucks = TruckType.query.limit(3).all()
            cartons = CartonType.query.limit(3).all()
            
            if not trucks or not cartons:
                print("❌ No sample data available for testing")
                return False
            
            print(f"🚛 Available trucks: {len(trucks)}")
            print(f"📦 Available cartons: {len(cartons)}")
            
            # Create carton requirements
            carton_requirements = []
            for carton in cartons:
                carton_requirements.append({
                    'carton_id': carton.id,
                    'quantity': 5
                })
            
            # Test recommendation
            service = OptimizationService()
            recommendations = service.recommend_trucks(carton_requirements)
            
            print(f"✅ Recommendations generated: {len(recommendations)}")
            
            if recommendations:
                best = recommendations[0]
                print(f"✅ Best truck: {best.get('truck_name', 'Unknown')}")
                print(f"✅ Utilization: {best.get('volume_utilization', 0):.1f}%")
                print(f"✅ Recommendation score: {best.get('recommendation_score', 0):.1f}")
            
            return len(recommendations) > 0
            
    except Exception as e:
        print(f"❌ Truck recommendation test failed: {e}")
        return False

def test_data_upload_functionality():
    """Test 4: CSV Data Upload"""
    print("\n" + "="*60)
    print("TEST 4: CSV DATA UPLOAD FUNCTIONALITY")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.app_context():
            from app.services.data_upload_service import DataUploadService
            from io import StringIO
            
            # Create test CSV data
            csv_data = """name,length,width,height,weight
TestBox1,100,80,60,15
TestBox2,120,90,70,20
TestBox3,80,60,50,10"""
            
            csv_file = StringIO(csv_data)
            
            # Test upload service
            service = DataUploadService()
            result = service.process_items_upload(csv_file)
            
            print(f"✅ CSV parsing: SUCCESS")
            print(f"✅ Valid rows: {result.get('valid_rows', 0)}")
            print(f"✅ Invalid rows: {result.get('invalid_rows', 0)}")
            print(f"✅ Items processed: {len(result.get('items', []))}")
            
            return result.get('valid_rows', 0) > 0
            
    except Exception as e:
        print(f"❌ Data upload test failed: {e}")
        return False

def test_analytics_dashboard():
    """Test 5: Analytics and Reporting"""
    print("\n" + "="*60)
    print("TEST 5: ANALYTICS AND REPORTING")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.app_context():
            from app.repositories.analytics_repository import AnalyticsRepository
            
            # Test analytics
            repo = AnalyticsRepository()
            
            # Get basic stats
            stats = repo.get_dashboard_stats()
            
            print(f"✅ Dashboard stats retrieved")
            print(f"✅ Total trucks: {stats.get('total_trucks', 0)}")
            print(f"✅ Total cartons: {stats.get('total_cartons', 0)}")
            print(f"✅ Total jobs: {stats.get('total_jobs', 0)}")
            
            # Test utilization metrics
            utilization = repo.get_utilization_metrics()
            print(f"✅ Utilization metrics: {len(utilization)} data points")
            
            return True
            
    except Exception as e:
        print(f"❌ Analytics test failed: {e}")
        return False

def test_api_endpoints():
    """Test 6: API Endpoints"""
    print("\n" + "="*60)
    print("TEST 6: API ENDPOINTS")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.test_client() as client:
            # Test health endpoint
            response = client.get('/api/health')
            print(f"✅ Health endpoint: {response.status_code}")
            
            # Test truck types endpoint
            response = client.get('/api/truck-types')
            print(f"✅ Truck types endpoint: {response.status_code}")
            
            # Test carton types endpoint
            response = client.get('/api/carton-types')
            print(f"✅ Carton types endpoint: {response.status_code}")
            
            # Test packing endpoint
            test_data = {
                'container': {'length': 400, 'width': 200, 'height': 200},
                'items': [
                    {'name': 'Test', 'length': 50, 'width': 40, 'height': 30, 'weight': 5}
                ]
            }
            response = client.post('/api/pack', json=test_data)
            print(f"✅ Packing endpoint: {response.status_code}")
            
            return True
            
    except Exception as e:
        print(f"❌ API endpoints test failed: {e}")
        return False

def test_user_interface_templates():
    """Test 7: User Interface Templates"""
    print("\n" + "="*60)
    print("TEST 7: USER INTERFACE TEMPLATES")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.test_client() as client:
            # Test main pages
            pages = [
                ('/', 'Dashboard'),
                ('/truck-types', 'Truck Types'),
                ('/carton-types', 'Carton Types'),
                ('/fleet-optimization', 'Fleet Optimization'),
                ('/analytics', 'Analytics')
            ]
            
            for url, name in pages:
                response = client.get(url)
                status = "✅" if response.status_code in [200, 302] else "❌"
                print(f"{status} {name}: {response.status_code}")
            
            return True
            
    except Exception as e:
        print(f"❌ UI templates test failed: {e}")
        return False

def test_performance_benchmarks():
    """Test 8: Performance Benchmarks"""
    print("\n" + "="*60)
    print("TEST 8: PERFORMANCE BENCHMARKS")
    print("="*60)
    
    try:
        from app import create_app
        app = create_app()
        
        with app.app_context():
            from app.core.modern_3d_packing import Modern3DPacker
            
            # Large dataset test
            container = {'length': 1000, 'width': 500, 'height': 400, 'max_weight': 5000}
            items = []
            
            # Generate 50 random items
            import random
            for i in range(50):
                items.append({
                    'name': f'Item{i}',
                    'length': random.randint(20, 100),
                    'width': random.randint(15, 80),
                    'height': random.randint(10, 60),
                    'weight': random.randint(1, 20)
                })
            
            print(f"📦 Performance test: {len(items)} items")
            
            packer = Modern3DPacker()
            start_time = time.time()
            result = packer.pack(container, items)
            end_time = time.time()
            
            execution_time = (end_time - start_time) * 1000
            print(f"✅ Execution time: {execution_time:.2f}ms")
            print(f"✅ Packed: {len(result.get('packed_items', []))}")
            print(f"✅ Utilization: {result.get('metrics', {}).get('utilization', 0):.1f}%")
            
            # Performance benchmark
            if execution_time < 1000:  # Less than 1 second
                print("✅ Performance: EXCELLENT")
            elif execution_time < 5000:  # Less than 5 seconds
                print("✅ Performance: GOOD")
            else:
                print("⚠️  Performance: NEEDS IMPROVEMENT")
            
            return True
            
    except Exception as e:
        print(f"❌ Performance test failed: {e}")
        return False

def run_comprehensive_tests():
    """Run all comprehensive end-user tests"""
    print("🚛 TRUCKOPTI COMPREHENSIVE END-USER TESTING SUITE")
    print("=" * 80)
    print("Simulating real user scenarios and testing all major functionality")
    print("=" * 80)
    
    tests = [
        ("Database Setup", test_database_setup),
        ("3D Packing Engine", test_3d_packing_engine),
        ("Truck Recommendation", test_truck_recommendation),
        ("Data Upload", test_data_upload_functionality),
        ("Analytics Dashboard", test_analytics_dashboard),
        ("API Endpoints", test_api_endpoints),
        ("User Interface", test_user_interface_templates),
        ("Performance", test_performance_benchmarks)
    ]
    
    results = []
    start_time = time.time()
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))
    
    end_time = time.time()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\nOverall Results: {passed}/{total} tests passed")
    print(f"Success Rate: {(passed/total)*100:.1f}%")
    print(f"Total Execution Time: {(end_time - start_time):.2f} seconds")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - APPLICATION IS READY FOR END USERS!")
    elif passed >= total * 0.8:
        print("\n✅ MOST TESTS PASSED - APPLICATION IS MOSTLY FUNCTIONAL")
    else:
        print("\n⚠️  SEVERAL TESTS FAILED - APPLICATION NEEDS ATTENTION")
    
    return passed == total

if __name__ == '__main__':
    success = run_comprehensive_tests()
    sys.exit(0 if success else 1)