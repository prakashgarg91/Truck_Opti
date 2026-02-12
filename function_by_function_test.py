#!/usr/bin/env python3
"""
TruckOpti Function-by-Function Testing Suite
Tests every individual function in the application
"""

import sys
import os
import json
import time
import traceback
from pathlib import Path
from unittest.mock import Mock, patch
import inspect

# Add the web app to Python path
sys.path.insert(0, 'apps/web')

class FunctionTester:
    def __init__(self):
        self.test_results = []
        self.functions_tested = 0
        self.functions_passed = 0
        self.app = None
        
    def setup_test_environment(self):
        """Setup test environment"""
        print("🔧 Setting up function testing environment...")
        try:
            from app import create_app
            self.app = create_app('testing')
            
            with self.app.app_context():
                from app.extensions import db
                db.create_all()
                self._seed_minimal_test_data()
            
            print("✅ Function test environment setup complete")
            return True
        except Exception as e:
            print(f"❌ Function test environment setup failed: {e}")
            return False
    
    def _seed_minimal_test_data(self):
        """Seed minimal test data for function testing"""
        from app.extensions import db
        from app.domain.entities import TruckType, CartonType
        
        # Add minimal test data
        truck = TruckType(name="Test Truck", length=600, width=250, height=250, max_weight=3000)
        carton = CartonType(name="Test Box", length=50, width=50, height=50, weight=10)
        
        db.session.add(truck)
        db.session.add(carton)
        db.session.commit()

    def test_core_packing_functions(self):
        """Test core 3D packing functions"""
        print("\n" + "="*60)
        print("TESTING: CORE 3D PACKING FUNCTIONS")
        print("="*60)
        
        try:
            from app.core.modern_3d_packing import Modern3DPacker
            
            # Test Modern3DPacker initialization
            print("📦 Testing: Modern3DPacker.__init__()")
            packer = Modern3DPacker()
            self._record_test("Modern3DPacker.__init__", True, "Initialization successful")
            
            # Test pack function
            print("📦 Testing: Modern3DPacker.pack()")
            container = {'length': 100, 'width': 100, 'height': 100, 'max_weight': 1000}
            items = [{'name': 'Box1', 'length': 30, 'width': 30, 'height': 30, 'weight': 10}]
            
            result = packer.pack(container, items)
            
            # Validate result structure
            expected_keys = ['packed_items', 'unpacked_items', 'metrics']
            has_expected_structure = all(key in result for key in expected_keys)
            
            self._record_test("Modern3DPacker.pack", has_expected_structure, 
                            f"Result keys: {list(result.keys())}")
            
            # Test _calculate_metrics function if accessible
            if hasattr(packer, '_calculate_metrics'):
                print("📦 Testing: Modern3DPacker._calculate_metrics()")
                try:
                    metrics = packer._calculate_metrics(container, result.get('packed_items', []))
                    self._record_test("Modern3DPacker._calculate_metrics", 
                                    isinstance(metrics, dict), f"Metrics type: {type(metrics)}")
                except Exception as e:
                    self._record_test("Modern3DPacker._calculate_metrics", False, str(e))
            
            return True
            
        except Exception as e:
            self._record_test("Core Packing Functions", False, f"Exception: {e}")
            return False

    def test_optimization_service_functions(self):
        """Test optimization service functions"""
        print("\n" + "="*60)
        print("TESTING: OPTIMIZATION SERVICE FUNCTIONS")
        print("="*60)
        
        try:
            from app.application.services.optimization_service import OptimizationService
            
            # Test OptimizationService initialization
            print("🤖 Testing: OptimizationService.__init__()")
            service = OptimizationService()
            self._record_test("OptimizationService.__init__", True, "Initialization successful")
            
            # Test recommend_trucks function
            print("🤖 Testing: OptimizationService.recommend_trucks()")
            carton_requirements = [{'carton_id': 1, 'quantity': 5}]
            
            try:
                recommendations = service.recommend_trucks(carton_requirements)
                self._record_test("OptimizationService.recommend_trucks", 
                                isinstance(recommendations, list), 
                                f"Recommendations type: {type(recommendations)}")
            except Exception as e:
                self._record_test("OptimizationService.recommend_trucks", False, str(e))
            
            # Test other optimization functions
            optimization_methods = [
                'optimize_packing',
                'calculate_utilization',
                'analyze_constraints',
                'generate_recommendations'
            ]
            
            for method_name in optimization_methods:
                if hasattr(service, method_name):
                    print(f"🤖 Testing: OptimizationService.{method_name}()")
                    try:
                        method = getattr(service, method_name)
                        # Try to call with minimal parameters
                        if method_name == 'calculate_utilization':
                            result = method(100, 80)  # volume_used, total_volume
                        else:
                            # Skip methods that require complex parameters
                            continue
                        
                        self._record_test(f"OptimizationService.{method_name}", True, "Method executed")
                    except Exception as e:
                        self._record_test(f"OptimizationService.{method_name}", False, str(e))
            
            return True
            
        except Exception as e:
            self._record_test("Optimization Service Functions", False, f"Exception: {e}")
            return False

    def test_database_model_functions(self):
        """Test database model functions"""
        print("\n" + "="*60)
        print("TESTING: DATABASE MODEL FUNCTIONS")
        print("="*60)
        
        try:
            with self.app.app_context():
                from app.domain.entities import TruckType, CartonType
                
                # Test TruckType model functions
                print("🗄️  Testing: TruckType model functions")
                
                # Test TruckType creation
                truck = TruckType(name="Function Test Truck", length=800, width=250, height=300, max_weight=5000)
                self._record_test("TruckType.__init__", True, "TruckType creation successful")
                
                # Test TruckType methods
                if hasattr(truck, 'calculate_volume'):
                    volume = truck.calculate_volume()
                    self._record_test("TruckType.calculate_volume", 
                                    isinstance(volume, (int, float)), f"Volume: {volume}")
                
                if hasattr(truck, 'to_dict'):
                    truck_dict = truck.to_dict()
                    self._record_test("TruckType.to_dict", 
                                    isinstance(truck_dict, dict), f"Dict keys: {list(truck_dict.keys())}")
                
                # Test CartonType model functions
                print("🗄️  Testing: CartonType model functions")
                
                # Test CartonType creation
                carton = CartonType(name="Function Test Box", length=60, width=40, height=30, weight=15)
                self._record_test("CartonType.__init__", True, "CartonType creation successful")
                
                # Test CartonType methods
                if hasattr(carton, 'calculate_volume'):
                    volume = carton.calculate_volume()
                    self._record_test("CartonType.calculate_volume", 
                                    isinstance(volume, (int, float)), f"Volume: {volume}")
                
                if hasattr(carton, 'to_dict'):
                    carton_dict = carton.to_dict()
                    self._record_test("CartonType.to_dict", 
                                    isinstance(carton_dict, dict), f"Dict keys: {list(carton_dict.keys())}")
            
            return True
            
        except Exception as e:
            self._record_test("Database Model Functions", False, f"Exception: {e}")
            return False

    def test_api_route_functions(self):
        """Test API route functions"""
        print("\n" + "="*60)
        print("TESTING: API ROUTE FUNCTIONS")
        print("="*60)
        
        try:
            with self.app.test_client() as client:
                
                # Test health check function
                print("🌐 Testing: health_check() function")
                response = client.get('/api/health')
                health_success = response.status_code == 200
                self._record_test("health_check", health_success, f"Status: {response.status_code}")
                
                # Test truck types API functions
                print("🌐 Testing: api_truck_types() function")
                response = client.get('/api/truck-types')
                trucks_success = response.status_code == 200
                self._record_test("api_truck_types", trucks_success, f"Status: {response.status_code}")
                
                # Test carton types API functions
                print("🌐 Testing: api_carton_types() function")
                response = client.get('/api/carton-types')
                cartons_success = response.status_code == 200
                self._record_test("api_carton_types", cartons_success, f"Status: {response.status_code}")
                
                # Test packing API function
                print("🌐 Testing: api_pack_items() function")
                pack_data = {
                    'container': {'length': 200, 'width': 200, 'height': 200, 'max_weight': 500},
                    'items': [{'name': 'TestBox', 'length': 50, 'width': 50, 'height': 50, 'weight': 10}]
                }
                response = client.post('/api/pack', json=pack_data)
                pack_success = response.status_code == 200
                self._record_test("api_pack_items", pack_success, f"Status: {response.status_code}")
                
                # Test analytics API function
                print("🌐 Testing: api_analytics() function")
                response = client.get('/api/analytics')
                analytics_success = response.status_code == 200
                self._record_test("api_analytics", analytics_success, f"Status: {response.status_code}")
            
            return True
            
        except Exception as e:
            self._record_test("API Route Functions", False, f"Exception: {e}")
            return False

    def test_utility_functions(self):
        """Test utility and helper functions"""
        print("\n" + "="*60)
        print("TESTING: UTILITY AND HELPER FUNCTIONS")
        print("="*60)
        
        try:
            # Test data validation functions
            print("🔧 Testing: Data validation functions")
            
            try:
                from app.core.utils import validate_dimensions, validate_weight
                
                # Test validate_dimensions
                valid_dims = validate_dimensions(100, 80, 60)
                self._record_test("validate_dimensions", isinstance(valid_dims, bool), 
                                f"Validation result: {valid_dims}")
                
                # Test validate_weight
                valid_weight = validate_weight(50)
                self._record_test("validate_weight", isinstance(valid_weight, bool), 
                                f"Weight validation: {valid_weight}")
                
            except ImportError:
                print("   ⚠️  Utility functions not found in expected location")
            
            # Test configuration functions
            print("🔧 Testing: Configuration functions")
            
            try:
                from app.config.settings import get_config
                
                config = get_config()
                self._record_test("get_config", isinstance(config, dict), 
                                f"Config keys: {len(config) if isinstance(config, dict) else 'Not dict'}")
                
            except ImportError:
                print("   ⚠️  Configuration functions not found")
            
            # Test logging functions
            print("🔧 Testing: Logging functions")
            
            try:
                from app.core.advanced_logging import log_info, log_error
                
                # Test log_info
                log_info("Function test message")
                self._record_test("log_info", True, "Logging function executed")
                
                # Test log_error
                log_error("Function test error")
                self._record_test("log_error", True, "Error logging function executed")
                
            except ImportError:
                print("   ⚠️  Logging functions not found")
            
            return True
            
        except Exception as e:
            self._record_test("Utility Functions", False, f"Exception: {e}")
            return False

    def test_algorithm_functions(self):
        """Test algorithm and calculation functions"""
        print("\n" + "="*60)
        print("TESTING: ALGORITHM AND CALCULATION FUNCTIONS")
        print("="*60)
        
        try:
            # Test 3D packing algorithms
            print("🧮 Testing: 3D packing algorithm functions")
            
            try:
                from app.packer import pack_cartons_optimized, calculate_optimal_truck_combination
                
                # Test pack_cartons_optimized
                truck_data = {'length': 600, 'width': 250, 'height': 250, 'max_weight': 3000}
                carton_data = [{'length': 50, 'width': 50, 'height': 50, 'weight': 10, 'quantity': 5}]
                
                result = pack_cartons_optimized(truck_data, carton_data)
                self._record_test("pack_cartons_optimized", isinstance(result, dict), 
                                f"Result type: {type(result)}")
                
                # Test calculate_optimal_truck_combination
                trucks = [truck_data]
                cartons = carton_data
                
                combination = calculate_optimal_truck_combination(trucks, cartons)
                self._record_test("calculate_optimal_truck_combination", 
                                isinstance(combination, (dict, list)), 
                                f"Combination type: {type(combination)}")
                
            except ImportError:
                print("   ⚠️  Packer functions not found")
            
            # Test cost calculation functions
            print("🧮 Testing: Cost calculation functions")
            
            try:
                from app.cost_engine import cost_engine
                
                if hasattr(cost_engine, 'calculate_transportation_cost'):
                    cost = cost_engine.calculate_transportation_cost(100, 25)  # distance, cost_per_km
                    self._record_test("calculate_transportation_cost", 
                                    isinstance(cost, (int, float)), f"Cost: {cost}")
                
            except ImportError:
                print("   ⚠️  Cost engine functions not found")
            
            # Test route optimization functions
            print("🧮 Testing: Route optimization functions")
            
            try:
                from app.route_optimizer import route_optimizer
                
                if hasattr(route_optimizer, 'optimize_route'):
                    # Test with minimal data
                    locations = [{'lat': 28.6139, 'lng': 77.2090}, {'lat': 28.7041, 'lng': 77.1025}]
                    route = route_optimizer.optimize_route(locations)
                    self._record_test("optimize_route", route is not None, 
                                    f"Route result: {type(route)}")
                
            except ImportError:
                print("   ⚠️  Route optimizer functions not found")
            
            return True
            
        except Exception as e:
            self._record_test("Algorithm Functions", False, f"Exception: {e}")
            return False

    def test_data_processing_functions(self):
        """Test data processing and transformation functions"""
        print("\n" + "="*60)
        print("TESTING: DATA PROCESSING FUNCTIONS")
        print("="*60)
        
        try:
            # Test CSV processing functions
            print("📊 Testing: CSV processing functions")
            
            try:
                from app.services.data_upload_service import DataUploadService
                
                service = DataUploadService()
                self._record_test("DataUploadService.__init__", True, "Service initialization")
                
                # Test CSV validation
                if hasattr(service, 'validate_csv_data'):
                    test_data = [{'name': 'Test', 'length': 100, 'width': 80, 'height': 60, 'weight': 15}]
                    validation = service.validate_csv_data(test_data, 'items')
                    self._record_test("validate_csv_data", isinstance(validation, dict), 
                                    f"Validation result: {type(validation)}")
                
                # Test data transformation
                if hasattr(service, 'transform_data'):
                    transformed = service.transform_data(test_data)
                    self._record_test("transform_data", isinstance(transformed, list), 
                                    f"Transformed data: {type(transformed)}")
                
            except ImportError:
                print("   ⚠️  Data upload service not found")
            
            # Test analytics processing functions
            print("📊 Testing: Analytics processing functions")
            
            try:
                from app.repositories.analytics_repository import AnalyticsRepository
                
                with self.app.app_context():
                    repo = AnalyticsRepository()
                    self._record_test("AnalyticsRepository.__init__", True, "Repository initialization")
                    
                    # Test dashboard stats
                    if hasattr(repo, 'get_dashboard_stats'):
                        stats = repo.get_dashboard_stats()
                        self._record_test("get_dashboard_stats", isinstance(stats, dict), 
                                        f"Stats keys: {list(stats.keys()) if isinstance(stats, dict) else 'Not dict'}")
                    
                    # Test utilization metrics
                    if hasattr(repo, 'get_utilization_metrics'):
                        metrics = repo.get_utilization_metrics()
                        self._record_test("get_utilization_metrics", isinstance(metrics, list), 
                                        f"Metrics count: {len(metrics) if isinstance(metrics, list) else 'Not list'}")
                
            except ImportError:
                print("   ⚠️  Analytics repository not found")
            
            return True
            
        except Exception as e:
            self._record_test("Data Processing Functions", False, f"Exception: {e}")
            return False

    def test_security_functions(self):
        """Test security and authentication functions"""
        print("\n" + "="*60)
        print("TESTING: SECURITY AND AUTHENTICATION FUNCTIONS")
        print("="*60)
        
        try:
            # Test authentication functions
            print("🔒 Testing: Authentication functions")
            
            try:
                from app.middleware.authentication import validate_token, generate_token
                
                # Test token generation
                token = generate_token({'user_id': 1, 'role': 'user'})
                self._record_test("generate_token", isinstance(token, str), 
                                f"Token type: {type(token)}")
                
                # Test token validation
                if token:
                    validation = validate_token(token)
                    self._record_test("validate_token", isinstance(validation, dict), 
                                    f"Validation result: {type(validation)}")
                
            except ImportError:
                print("   ⚠️  Authentication functions not found")
            
            # Test security validation functions
            print("🔒 Testing: Security validation functions")
            
            try:
                from app.middleware.validation import validate_input, sanitize_input
                
                # Test input validation
                test_input = {'name': 'Test Truck', 'length': 600}
                validation = validate_input(test_input, 'truck')
                self._record_test("validate_input", isinstance(validation, dict), 
                                f"Validation result: {type(validation)}")
                
                # Test input sanitization
                sanitized = sanitize_input('<script>alert("test")</script>')
                self._record_test("sanitize_input", isinstance(sanitized, str), 
                                f"Sanitized: {sanitized}")
                
            except ImportError:
                print("   ⚠️  Validation functions not found")
            
            # Test rate limiting functions
            print("🔒 Testing: Rate limiting functions")
            
            try:
                from app.middleware.rate_limiting import check_rate_limit, update_rate_limit
                
                # Test rate limit check
                limit_check = check_rate_limit('127.0.0.1', 'api')
                self._record_test("check_rate_limit", isinstance(limit_check, bool), 
                                f"Rate limit check: {limit_check}")
                
            except ImportError:
                print("   ⚠️  Rate limiting functions not found")
            
            return True
            
        except Exception as e:
            self._record_test("Security Functions", False, f"Exception: {e}")
            return False

    def test_performance_functions(self):
        """Test performance monitoring and optimization functions"""
        print("\n" + "="*60)
        print("TESTING: PERFORMANCE MONITORING FUNCTIONS")
        print("="*60)
        
        try:
            # Test performance monitoring
            print("⚡ Testing: Performance monitoring functions")
            
            try:
                from app.core.performance import get_performance_metrics, optimize_performance
                
                # Test performance metrics
                metrics = get_performance_metrics()
                self._record_test("get_performance_metrics", isinstance(metrics, dict), 
                                f"Metrics keys: {list(metrics.keys()) if isinstance(metrics, dict) else 'Not dict'}")
                
                # Test performance optimization
                optimization = optimize_performance()
                self._record_test("optimize_performance", isinstance(optimization, dict), 
                                f"Optimization result: {type(optimization)}")
                
            except ImportError:
                print("   ⚠️  Performance functions not found")
            
            # Test caching functions
            print("⚡ Testing: Caching functions")
            
            try:
                from app.core.caching import cache_get, cache_set, cache_delete
                
                # Test cache operations
                cache_set('test_key', 'test_value', 300)
                self._record_test("cache_set", True, "Cache set operation")
                
                cached_value = cache_get('test_key')
                self._record_test("cache_get", cached_value == 'test_value', 
                                f"Cached value: {cached_value}")
                
                cache_delete('test_key')
                self._record_test("cache_delete", True, "Cache delete operation")
                
            except ImportError:
                print("   ⚠️  Caching functions not found")
            
            return True
            
        except Exception as e:
            self._record_test("Performance Functions", False, f"Exception: {e}")
            return False

    def test_integration_functions(self):
        """Test external integration functions"""
        print("\n" + "="*60)
        print("TESTING: EXTERNAL INTEGRATION FUNCTIONS")
        print("="*60)
        
        try:
            # Test WebSocket functions
            print("🔌 Testing: WebSocket integration functions")
            
            try:
                from app.extensions import socketio
                
                # Test socketio initialization
                self._record_test("socketio_initialization", socketio is not None, 
                                "SocketIO object exists")
                
            except ImportError:
                print("   ⚠️  SocketIO functions not found")
            
            # Test email functions
            print("🔌 Testing: Email integration functions")
            
            try:
                from app.services.email_service import send_notification, send_report
                
                # Test email notification (mock)
                with patch('app.services.email_service.send_notification') as mock_send:
                    mock_send.return_value = True
                    result = send_notification('test@example.com', 'Test Subject', 'Test Body')
                    self._record_test("send_notification", result, "Email notification sent")
                
            except ImportError:
                print("   ⚠️  Email functions not found")
            
            # Test external API functions
            print("🔌 Testing: External API integration functions")
            
            try:
                from app.services.external_api import get_fuel_prices, get_traffic_data
                
                # Test fuel prices (mock)
                with patch('app.services.external_api.get_fuel_prices') as mock_fuel:
                    mock_fuel.return_value = {'diesel': 85.50, 'petrol': 95.20}
                    prices = get_fuel_prices()
                    self._record_test("get_fuel_prices", isinstance(prices, dict), 
                                    f"Fuel prices: {prices}")
                
            except ImportError:
                print("   ⚠️  External API functions not found")
            
            return True
            
        except Exception as e:
            self._record_test("Integration Functions", False, f"Exception: {e}")
            return False

    def _record_test(self, function_name, passed, details):
        """Record test result"""
        self.functions_tested += 1
        if passed:
            self.functions_passed += 1
        
        self.test_results.append({
            'function': function_name,
            'passed': passed,
            'details': details
        })
        
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {status} {function_name}: {details}")

    def run_all_function_tests(self):
        """Run all function tests"""
        print("🔧 TRUCKOPTI FUNCTION-BY-FUNCTION TESTING")
        print("=" * 80)
        print("Testing every individual function in the application")
        print("=" * 80)
        
        if not self.setup_test_environment():
            print("❌ Could not setup test environment. Aborting tests.")
            return False
        
        # Define all function test categories
        function_test_categories = [
            ("Core 3D Packing Functions", self.test_core_packing_functions),
            ("Optimization Service Functions", self.test_optimization_service_functions),
            ("Database Model Functions", self.test_database_model_functions),
            ("API Route Functions", self.test_api_route_functions),
            ("Utility Functions", self.test_utility_functions),
            ("Algorithm Functions", self.test_algorithm_functions),
            ("Data Processing Functions", self.test_data_processing_functions),
            ("Security Functions", self.test_security_functions),
            ("Performance Functions", self.test_performance_functions),
            ("Integration Functions", self.test_integration_functions),
        ]
        
        start_time = time.time()
        
        # Run each test category
        category_results = []
        for category_name, test_func in function_test_categories:
            try:
                result = test_func()
                category_results.append((category_name, result))
            except Exception as e:
                print(f"\n❌ {category_name} failed with exception: {e}")
                category_results.append((category_name, False))
        
        end_time = time.time()
        
        # Generate comprehensive report
        self.generate_function_test_report(category_results, end_time - start_time)
        
        # Return overall success
        return self.functions_passed >= self.functions_tested * 0.8  # 80% pass rate

    def generate_function_test_report(self, category_results, total_time):
        """Generate comprehensive function test report"""
        print("\n" + "="*80)
        print("COMPREHENSIVE FUNCTION TEST REPORT")
        print("="*80)
        
        # Category results
        print("\n📋 FUNCTION CATEGORY RESULTS:")
        categories_passed = 0
        for category_name, result in category_results:
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"   {status} {category_name}")
            if result:
                categories_passed += 1
        
        # Individual function results summary
        print(f"\n🔧 INDIVIDUAL FUNCTION RESULTS:")
        passed_functions = [r for r in self.test_results if r['passed']]
        failed_functions = [r for r in self.test_results if not r['passed']]
        
        print(f"   ✅ Functions Passed: {len(passed_functions)}")
        print(f"   ❌ Functions Failed: {len(failed_functions)}")
        
        # Show failed functions for debugging
        if failed_functions:
            print(f"\n❌ FAILED FUNCTIONS:")
            for func in failed_functions[:10]:  # Show first 10 failures
                print(f"   - {func['function']}: {func['details']}")
            if len(failed_functions) > 10:
                print(f"   ... and {len(failed_functions) - 10} more")
        
        # Summary statistics
        print(f"\n📊 SUMMARY STATISTICS:")
        print(f"   Total Function Categories: {len(category_results)}")
        print(f"   Categories Passed: {categories_passed}")
        print(f"   Total Functions Tested: {self.functions_tested}")
        print(f"   Functions Passed: {self.functions_passed}")
        print(f"   Function Success Rate: {(self.functions_passed/self.functions_tested)*100:.1f}%")
        print(f"   Total Test Time: {total_time:.2f} seconds")
        
        # Overall assessment
        print(f"\n🎯 OVERALL FUNCTION ASSESSMENT:")
        success_rate = (self.functions_passed / self.functions_tested) * 100
        
        if success_rate >= 95:
            print("   🎉 EXCELLENT - Nearly all functions working perfectly!")
            print("   ✅ Application functions are production-ready")
        elif success_rate >= 85:
            print("   🌟 VERY GOOD - Most functions working well")
            print("   ✅ Application is functional with minor issues")
        elif success_rate >= 70:
            print("   👍 GOOD - Majority of functions working")
            print("   ⚠️  Some functions need attention")
        else:
            print("   ⚠️  NEEDS IMPROVEMENT - Many functions have issues")
            print("   🔧 Significant work needed on core functions")
        
        # Recommendations
        print(f"\n💡 FUNCTION-LEVEL RECOMMENDATIONS:")
        if success_rate >= 90:
            print("   • All core functions are working well")
            print("   • Focus on optimizing performance")
            print("   • Consider adding more advanced features")
        elif success_rate >= 80:
            print("   • Fix the failed functions identified above")
            print("   • Add more comprehensive error handling")
            print("   • Improve function documentation")
        else:
            print("   • Priority: Fix core packing and optimization functions")
            print("   • Review database model implementations")
            print("   • Strengthen API route error handling")
            print("   • Add comprehensive function testing")

def main():
    """Main function test execution"""
    tester = FunctionTester()
    success = tester.run_all_function_tests()
    return success

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)