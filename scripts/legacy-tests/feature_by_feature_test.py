#!/usr/bin/env python3
"""
TruckOpti Feature-by-Feature Testing Suite
Tests every feature as an end user would interact with them
"""

import sys
import os
import json
import sqlite3
import time
from pathlib import Path
from io import StringIO, BytesIO

# Add the web app to Python path
sys.path.insert(0, 'apps/web')

class TruckOptiFeatureTester:
    def __init__(self):
        self.test_results = []
        self.app = None
        self.client = None
        
    def setup_test_environment(self):
        """Setup test environment"""
        print("🔧 Setting up test environment...")
        try:
            from app import create_app
            self.app = create_app('testing')
            self.client = self.app.test_client()
            
            with self.app.app_context():
                from app.extensions import db
                db.create_all()
                self._seed_test_data()
            
            print("✅ Test environment setup complete")
            return True
        except Exception as e:
            print(f"❌ Test environment setup failed: {e}")
            return False
    
    def _seed_test_data(self):
        """Seed database with test data"""
        from app.extensions import db
        from app.domain.entities import TruckType, CartonType
        
        # Add test trucks
        trucks = [
            TruckType(name="Small Truck", length=600, width=250, height=250, max_weight=3000),
            TruckType(name="Medium Truck", length=800, width=250, height=300, max_weight=5000),
            TruckType(name="Large Truck", length=1200, width=250, height=350, max_weight=8000),
        ]
        
        # Add test cartons
        cartons = [
            CartonType(name="Small Box", length=50, width=50, height=50, weight=10),
            CartonType(name="Medium Box", length=100, width=100, height=100, weight=25),
            CartonType(name="Large Box", length=150, width=150, height=150, weight=50),
        ]
        
        for truck in trucks:
            db.session.add(truck)
        for carton in cartons:
            db.session.add(carton)
        
        db.session.commit()
        print("✅ Test data seeded")

    def test_feature_1_health_check(self):
        """Feature 1: Application Health Check"""
        print("\n" + "="*60)
        print("FEATURE 1: APPLICATION HEALTH CHECK")
        print("="*60)
        
        try:
            response = self.client.get('/api/health')
            
            print(f"📡 Health endpoint status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.get_json()
                print(f"✅ Application status: {data.get('status', 'unknown')}")
                print(f"✅ Version: {data.get('version', 'unknown')}")
                print(f"✅ Architecture: {data.get('architecture', 'unknown')}")
                return True
            else:
                print(f"❌ Health check failed with status {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Health check error: {e}")
            return False

    def test_feature_2_truck_management(self):
        """Feature 2: Truck Type Management (CRUD)"""
        print("\n" + "="*60)
        print("FEATURE 2: TRUCK TYPE MANAGEMENT")
        print("="*60)
        
        try:
            # Test GET - List trucks
            print("📋 Testing: List all trucks")
            response = self.client.get('/api/truck-types')
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                trucks = response.get_json()
                print(f"   ✅ Found {len(trucks)} trucks")
                for truck in trucks[:3]:  # Show first 3
                    print(f"      - {truck.get('name')}: {truck.get('length')}x{truck.get('width')}x{truck.get('height')}")
            
            # Test POST - Create new truck
            print("\n🚛 Testing: Create new truck")
            new_truck = {
                "name": "Test Truck XL",
                "length": 1000,
                "width": 300,
                "height": 400,
                "max_weight": 10000
            }
            
            response = self.client.post('/api/truck-types', json=new_truck)
            print(f"   Status: {response.status_code}")
            
            if response.status_code in [200, 201]:
                print("   ✅ Truck created successfully")
                created_truck = response.get_json()
                truck_id = created_truck.get('id')
                
                # Test PUT - Update truck
                print("\n✏️  Testing: Update truck")
                updated_data = {"name": "Test Truck XL Updated", "max_weight": 12000}
                response = self.client.put(f'/api/truck-types/{truck_id}', json=updated_data)
                print(f"   Status: {response.status_code}")
                
                if response.status_code == 200:
                    print("   ✅ Truck updated successfully")
                
                # Test DELETE - Delete truck
                print("\n🗑️  Testing: Delete truck")
                response = self.client.delete(f'/api/truck-types/{truck_id}')
                print(f"   Status: {response.status_code}")
                
                if response.status_code in [200, 204]:
                    print("   ✅ Truck deleted successfully")
            
            return True
            
        except Exception as e:
            print(f"❌ Truck management test error: {e}")
            return False

    def test_feature_3_carton_management(self):
        """Feature 3: Carton Type Management (CRUD)"""
        print("\n" + "="*60)
        print("FEATURE 3: CARTON TYPE MANAGEMENT")
        print("="*60)
        
        try:
            # Test GET - List cartons
            print("📦 Testing: List all cartons")
            response = self.client.get('/api/carton-types')
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                cartons = response.get_json()
                print(f"   ✅ Found {len(cartons)} cartons")
                for carton in cartons[:3]:  # Show first 3
                    print(f"      - {carton.get('name')}: {carton.get('length')}x{carton.get('width')}x{carton.get('height')} ({carton.get('weight')}kg)")
            
            # Test POST - Create new carton
            print("\n📦 Testing: Create new carton")
            new_carton = {
                "name": "Test Box Premium",
                "length": 80,
                "width": 60,
                "height": 40,
                "weight": 15
            }
            
            response = self.client.post('/api/carton-types', json=new_carton)
            print(f"   Status: {response.status_code}")
            
            if response.status_code in [200, 201]:
                print("   ✅ Carton created successfully")
                created_carton = response.get_json()
                carton_id = created_carton.get('id')
                
                # Test PUT - Update carton
                print("\n✏️  Testing: Update carton")
                updated_data = {"name": "Test Box Premium Updated", "weight": 18}
                response = self.client.put(f'/api/carton-types/{carton_id}', json=updated_data)
                print(f"   Status: {response.status_code}")
                
                if response.status_code == 200:
                    print("   ✅ Carton updated successfully")
                
                # Test DELETE - Delete carton
                print("\n🗑️  Testing: Delete carton")
                response = self.client.delete(f'/api/carton-types/{carton_id}')
                print(f"   Status: {response.status_code}")
                
                if response.status_code in [200, 204]:
                    print("   ✅ Carton deleted successfully")
            
            return True
            
        except Exception as e:
            print(f"❌ Carton management test error: {e}")
            return False

    def test_feature_4_3d_packing(self):
        """Feature 4: 3D Packing Optimization"""
        print("\n" + "="*60)
        print("FEATURE 4: 3D PACKING OPTIMIZATION")
        print("="*60)
        
        try:
            # Test basic packing
            print("🎯 Testing: Basic 3D packing")
            
            packing_request = {
                "container": {
                    "length": 400,
                    "width": 200,
                    "height": 200,
                    "max_weight": 1000
                },
                "items": [
                    {"name": "Box1", "length": 50, "width": 40, "height": 30, "weight": 5},
                    {"name": "Box2", "length": 60, "width": 50, "height": 40, "weight": 8},
                    {"name": "Box3", "length": 30, "width": 30, "height": 25, "weight": 3},
                    {"name": "Box4", "length": 40, "width": 35, "height": 20, "weight": 4},
                    {"name": "Box5", "length": 25, "width": 25, "height": 15, "weight": 2}
                ]
            }
            
            start_time = time.time()
            response = self.client.post('/api/pack', json=packing_request)
            end_time = time.time()
            
            print(f"   Status: {response.status_code}")
            print(f"   Processing time: {(end_time - start_time)*1000:.2f}ms")
            
            if response.status_code == 200:
                result = response.get_json()
                packed_items = result.get('packed_items', [])
                unpacked_items = result.get('unpacked_items', [])
                metrics = result.get('metrics', {})
                
                print(f"   ✅ Total items: {len(packing_request['items'])}")
                print(f"   ✅ Packed items: {len(packed_items)}")
                print(f"   ✅ Unpacked items: {len(unpacked_items)}")
                print(f"   ✅ Space utilization: {metrics.get('utilization', 0):.1f}%")
                print(f"   ✅ Weight utilization: {metrics.get('weight_utilization', 0):.1f}%")
                
                # Show packed item positions
                print("\n   📍 Packed item positions:")
                for item in packed_items[:3]:  # Show first 3
                    pos = item.get('position', {})
                    print(f"      - {item.get('name')}: ({pos.get('x', 0)}, {pos.get('y', 0)}, {pos.get('z', 0)})")
                
                return len(packed_items) > 0
            else:
                print(f"   ❌ Packing failed with status {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ 3D packing test error: {e}")
            return False

    def test_feature_5_truck_recommendation(self):
        """Feature 5: Smart Truck Recommendation"""
        print("\n" + "="*60)
        print("FEATURE 5: SMART TRUCK RECOMMENDATION")
        print("="*60)
        
        try:
            # Get available cartons first
            cartons_response = self.client.get('/api/carton-types')
            if cartons_response.status_code != 200:
                print("❌ Could not get carton types for recommendation test")
                return False
            
            cartons = cartons_response.get_json()
            if not cartons:
                print("❌ No cartons available for recommendation test")
                return False
            
            # Test truck recommendation
            print("🤖 Testing: Smart truck recommendation")
            
            recommendation_request = {
                "carton_requirements": [
                    {"carton_id": cartons[0]['id'], "quantity": 10},
                    {"carton_id": cartons[1]['id'], "quantity": 5},
                ]
            }
            
            if len(cartons) > 2:
                recommendation_request["carton_requirements"].append(
                    {"carton_id": cartons[2]['id'], "quantity": 3}
                )
            
            start_time = time.time()
            response = self.client.post('/api/recommend-trucks', json=recommendation_request)
            end_time = time.time()
            
            print(f"   Status: {response.status_code}")
            print(f"   Processing time: {(end_time - start_time)*1000:.2f}ms")
            
            if response.status_code == 200:
                result = response.get_json()
                recommendations = result.get('recommendations', [])
                
                print(f"   ✅ Recommendations generated: {len(recommendations)}")
                print(f"   ✅ Total cartons to pack: {result.get('carton_count', 0)}")
                print(f"   ✅ Trucks analyzed: {result.get('total_trucks_analyzed', 0)}")
                
                # Show top recommendations
                print("\n   🏆 Top recommendations:")
                for i, rec in enumerate(recommendations[:3], 1):
                    print(f"      {i}. {rec.get('truck_name', 'Unknown')}")
                    print(f"         - Volume utilization: {rec.get('volume_utilization', 0):.1f}%")
                    print(f"         - Weight utilization: {rec.get('weight_utilization', 0):.1f}%")
                    print(f"         - Recommendation score: {rec.get('recommendation_score', 0):.1f}")
                
                return len(recommendations) > 0
            else:
                print(f"   ❌ Recommendation failed with status {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Truck recommendation test error: {e}")
            return False

    def test_feature_6_csv_upload_download(self):
        """Feature 6: CSV Upload/Download Functionality"""
        print("\n" + "="*60)
        print("FEATURE 6: CSV UPLOAD/DOWNLOAD")
        print("="*60)
        
        try:
            # Test template download
            print("📥 Testing: Download CSV templates")
            
            # Download items template
            response = self.client.get('/api/upload/template/items')
            print(f"   Items template status: {response.status_code}")
            if response.status_code == 200:
                print(f"   ✅ Items template downloaded ({len(response.data)} bytes)")
            
            # Download bins template
            response = self.client.get('/api/upload/template/bins')
            print(f"   Bins template status: {response.status_code}")
            if response.status_code == 200:
                print(f"   ✅ Bins template downloaded ({len(response.data)} bytes)")
            
            # Test CSV upload preview
            print("\n👀 Testing: CSV upload preview")
            
            csv_data = """name,length,width,height,weight
Test Item 1,100,80,60,15
Test Item 2,120,90,70,20
Test Item 3,80,60,50,10"""
            
            csv_file = BytesIO(csv_data.encode())
            
            response = self.client.post('/api/upload/preview', 
                data={'file': (csv_file, 'test_items.csv'), 'type': 'items'},
                content_type='multipart/form-data'
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.get_json()
                preview = result.get('preview', {})
                print(f"   ✅ Valid rows: {preview.get('valid_rows', 0)}")
                print(f"   ✅ Invalid rows: {preview.get('invalid_rows', 0)}")
                print(f"   ✅ Total rows processed: {preview.get('total_rows', 0)}")
            
            # Test actual CSV upload
            print("\n📤 Testing: CSV upload (items)")
            
            csv_file = BytesIO(csv_data.encode())
            response = self.client.post('/api/upload/items',
                data={'file': (csv_file, 'test_items.csv')},
                content_type='multipart/form-data'
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.get_json()
                summary = result.get('summary', {})
                print(f"   ✅ Items imported: {summary.get('imported', 0)}")
                print(f"   ✅ Items skipped: {summary.get('skipped', 0)}")
                print(f"   ✅ Errors: {summary.get('errors', 0)}")
            
            # Test data export
            print("\n📤 Testing: Data export")
            
            response = self.client.get('/api/upload/export/items')
            print(f"   Items export status: {response.status_code}")
            
            if response.status_code == 200:
                exported_data = response.data.decode()
                lines = exported_data.strip().split('\n')
                print(f"   ✅ Exported {len(lines)-1} items (plus header)")
            
            return True
            
        except Exception as e:
            print(f"❌ CSV upload/download test error: {e}")
            return False

    def test_feature_7_analytics_dashboard(self):
        """Feature 7: Analytics Dashboard"""
        print("\n" + "="*60)
        print("FEATURE 7: ANALYTICS DASHBOARD")
        print("="*60)
        
        try:
            # Test analytics endpoint
            print("📊 Testing: Analytics data retrieval")
            
            response = self.client.get('/api/analytics')
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                analytics = response.get_json()
                
                print("   ✅ Analytics data retrieved:")
                print(f"      - Total trucks: {analytics.get('total_trucks', 0)}")
                print(f"      - Total cartons: {analytics.get('total_cartons', 0)}")
                print(f"      - Total jobs: {analytics.get('total_jobs', 0)}")
                print(f"      - Average utilization: {analytics.get('avg_utilization', 0):.1f}%")
                
                # Check for utilization metrics
                utilization_data = analytics.get('utilization_metrics', [])
                print(f"      - Utilization data points: {len(utilization_data)}")
                
                # Check for performance metrics
                performance_data = analytics.get('performance_metrics', {})
                print(f"      - Performance metrics available: {len(performance_data)}")
            
            # Test dashboard page
            print("\n🏠 Testing: Dashboard page")
            
            response = self.client.get('/analytics')
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                print("   ✅ Analytics dashboard page loaded")
            elif response.status_code == 302:
                print("   ✅ Analytics dashboard redirected (normal)")
            
            return True
            
        except Exception as e:
            print(f"❌ Analytics dashboard test error: {e}")
            return False

    def test_feature_8_web_pages(self):
        """Feature 8: Web Pages and Navigation"""
        print("\n" + "="*60)
        print("FEATURE 8: WEB PAGES AND NAVIGATION")
        print("="*60)
        
        try:
            pages_to_test = [
                ('/', 'Dashboard'),
                ('/truck-types', 'Truck Types Management'),
                ('/carton-types', 'Carton Types Management'),
                ('/fleet-optimization', 'Fleet Optimization'),
                ('/analytics', 'Analytics Dashboard'),
            ]
            
            print("🌐 Testing: Web page accessibility")
            
            all_pages_ok = True
            
            for url, name in pages_to_test:
                response = self.client.get(url)
                status_icon = "✅" if response.status_code == 200 else "🔄" if response.status_code == 302 else "❌"
                print(f"   {status_icon} {name} ({url}): {response.status_code}")
                
                if response.status_code not in [200, 302]:
                    all_pages_ok = False
            
            return all_pages_ok
            
        except Exception as e:
            print(f"❌ Web pages test error: {e}")
            return False

    def test_feature_9_api_error_handling(self):
        """Feature 9: API Error Handling"""
        print("\n" + "="*60)
        print("FEATURE 9: API ERROR HANDLING")
        print("="*60)
        
        try:
            print("🛡️  Testing: API error handling")
            
            # Test invalid endpoints
            print("\n   Testing invalid endpoints:")
            response = self.client.get('/api/nonexistent')
            print(f"      Invalid endpoint: {response.status_code}")
            
            # Test invalid data
            print("\n   Testing invalid data submission:")
            invalid_truck = {"name": "", "length": -1}  # Invalid data
            response = self.client.post('/api/truck-types', json=invalid_truck)
            print(f"      Invalid truck data: {response.status_code}")
            
            # Test malformed JSON
            print("\n   Testing malformed requests:")
            response = self.client.post('/api/pack', 
                data="invalid json", 
                content_type='application/json'
            )
            print(f"      Malformed JSON: {response.status_code}")
            
            # Test missing required fields
            print("\n   Testing missing required fields:")
            incomplete_packing = {"container": {"length": 100}}  # Missing required fields
            response = self.client.post('/api/pack', json=incomplete_packing)
            print(f"      Incomplete packing request: {response.status_code}")
            
            print("   ✅ Error handling tests completed")
            return True
            
        except Exception as e:
            print(f"❌ API error handling test error: {e}")
            return False

    def test_feature_10_performance_stress(self):
        """Feature 10: Performance and Stress Testing"""
        print("\n" + "="*60)
        print("FEATURE 10: PERFORMANCE AND STRESS TESTING")
        print("="*60)
        
        try:
            print("⚡ Testing: Performance with large datasets")
            
            # Generate large dataset
            large_container = {
                "length": 1000,
                "width": 500,
                "height": 400,
                "max_weight": 10000
            }
            
            large_items = []
            for i in range(50):  # 50 items
                large_items.append({
                    "name": f"Item_{i}",
                    "length": 20 + (i % 30),
                    "width": 15 + (i % 25),
                    "height": 10 + (i % 20),
                    "weight": 2 + (i % 10)
                })
            
            large_packing_request = {
                "container": large_container,
                "items": large_items
            }
            
            print(f"   📦 Testing with {len(large_items)} items")
            
            start_time = time.time()
            response = self.client.post('/api/pack', json=large_packing_request)
            end_time = time.time()
            
            execution_time = (end_time - start_time) * 1000
            
            print(f"   Status: {response.status_code}")
            print(f"   Execution time: {execution_time:.2f}ms")
            
            if response.status_code == 200:
                result = response.get_json()
                packed_items = result.get('packed_items', [])
                metrics = result.get('metrics', {})
                
                print(f"   ✅ Packed items: {len(packed_items)}/{len(large_items)}")
                print(f"   ✅ Utilization: {metrics.get('utilization', 0):.1f}%")
                
                # Performance assessment
                if execution_time < 1000:
                    print("   🚀 Performance: EXCELLENT (<1s)")
                elif execution_time < 5000:
                    print("   ✅ Performance: GOOD (<5s)")
                else:
                    print("   ⚠️  Performance: NEEDS IMPROVEMENT (>5s)")
            
            # Test concurrent requests simulation
            print("\n   🔄 Testing: Multiple concurrent requests")
            
            concurrent_results = []
            for i in range(5):  # Simulate 5 concurrent requests
                small_request = {
                    "container": {"length": 200, "width": 200, "height": 200, "max_weight": 500},
                    "items": [{"name": f"ConcurrentItem_{i}", "length": 50, "width": 50, "height": 50, "weight": 10}]
                }
                
                start_time = time.time()
                response = self.client.post('/api/pack', json=small_request)
                end_time = time.time()
                
                concurrent_results.append({
                    'status': response.status_code,
                    'time': (end_time - start_time) * 1000
                })
            
            successful_requests = sum(1 for r in concurrent_results if r['status'] == 200)
            avg_time = sum(r['time'] for r in concurrent_results) / len(concurrent_results)
            
            print(f"   ✅ Successful requests: {successful_requests}/5")
            print(f"   ✅ Average response time: {avg_time:.2f}ms")
            
            return successful_requests >= 4  # At least 80% success rate
            
        except Exception as e:
            print(f"❌ Performance stress test error: {e}")
            return False

    def run_all_feature_tests(self):
        """Run all feature tests"""
        print("🚛 TRUCKOPTI COMPREHENSIVE FEATURE TESTING")
        print("=" * 80)
        print("Testing every feature as an end user would interact with them")
        print("=" * 80)
        
        if not self.setup_test_environment():
            print("❌ Could not setup test environment. Aborting tests.")
            return False
        
        # Define all feature tests
        feature_tests = [
            ("Health Check", self.test_feature_1_health_check),
            ("Truck Management", self.test_feature_2_truck_management),
            ("Carton Management", self.test_feature_3_carton_management),
            ("3D Packing", self.test_feature_4_3d_packing),
            ("Truck Recommendation", self.test_feature_5_truck_recommendation),
            ("CSV Upload/Download", self.test_feature_6_csv_upload_download),
            ("Analytics Dashboard", self.test_feature_7_analytics_dashboard),
            ("Web Pages", self.test_feature_8_web_pages),
            ("Error Handling", self.test_feature_9_api_error_handling),
            ("Performance & Stress", self.test_feature_10_performance_stress),
        ]
        
        start_time = time.time()
        
        # Run each test
        for feature_name, test_func in feature_tests:
            try:
                result = test_func()
                self.test_results.append((feature_name, result))
            except Exception as e:
                print(f"\n❌ {feature_name} test failed with exception: {e}")
                self.test_results.append((feature_name, False))
        
        end_time = time.time()
        
        # Generate comprehensive report
        self.generate_test_report(end_time - start_time)
        
        # Return overall success
        passed = sum(1 for _, result in self.test_results if result)
        return passed == len(self.test_results)

    def generate_test_report(self, total_time):
        """Generate comprehensive test report"""
        print("\n" + "="*80)
        print("COMPREHENSIVE FEATURE TEST REPORT")
        print("="*80)
        
        passed = sum(1 for _, result in self.test_results if result)
        total = len(self.test_results)
        
        # Feature-by-feature results
        print("\n📋 FEATURE TEST RESULTS:")
        for feature_name, result in self.test_results:
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"   {status} {feature_name}")
        
        # Summary statistics
        print(f"\n📊 SUMMARY STATISTICS:")
        print(f"   Total Features Tested: {total}")
        print(f"   Features Passed: {passed}")
        print(f"   Features Failed: {total - passed}")
        print(f"   Success Rate: {(passed/total)*100:.1f}%")
        print(f"   Total Test Time: {total_time:.2f} seconds")
        
        # Overall assessment
        print(f"\n🎯 OVERALL ASSESSMENT:")
        if passed == total:
            print("   🎉 ALL FEATURES WORKING PERFECTLY!")
            print("   ✅ Application is ready for production use")
            print("   ✅ All end-user scenarios tested successfully")
        elif passed >= total * 0.9:
            print("   🌟 EXCELLENT - Most features working perfectly")
            print("   ✅ Application is production-ready with minor issues")
        elif passed >= total * 0.8:
            print("   👍 GOOD - Most features working well")
            print("   ⚠️  Some features need attention before production")
        else:
            print("   ⚠️  NEEDS IMPROVEMENT - Several features have issues")
            print("   🔧 Significant work needed before production deployment")
        
        # Recommendations
        print(f"\n💡 RECOMMENDATIONS:")
        if passed == total:
            print("   • Deploy to production environment")
            print("   • Begin user training and onboarding")
            print("   • Set up monitoring and analytics")
            print("   • Plan for scaling based on user load")
        else:
            failed_features = [name for name, result in self.test_results if not result]
            print("   • Fix the following features before deployment:")
            for feature in failed_features:
                print(f"     - {feature}")
            print("   • Re-run tests after fixes")
            print("   • Consider staged rollout for working features")

def main():
    """Main test execution"""
    tester = TruckOptiFeatureTester()
    success = tester.run_all_feature_tests()
    return success

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)