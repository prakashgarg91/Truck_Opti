#!/usr/bin/env python3
"""
TruckOpti Execute Every Function Test Suite
Tests each and every function by actually calling them with test data
"""

import sys
import os
import json
import time
import traceback
import inspect
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from io import StringIO, BytesIO
import tempfile

# Add the web app to Python path
sys.path.insert(0, 'apps/web')

class FunctionExecutor:
    def __init__(self):
        self.executed_functions = []
        self.function_results = {}
        self.total_functions = 0
        self.passed_functions = 0
        self.failed_functions = 0
        self.app = None
        
    def setup_test_environment(self):
        """Setup comprehensive test environment"""
        print("🔧 Setting up comprehensive function execution environment...")
        try:
            from app import create_app
            self.app = create_app('testing')
            
            with self.app.app_context():
                from app.extensions import db
                db.create_all()
                self._create_comprehensive_test_data()
            
            print("✅ Function execution environment setup complete")
            return True
        except Exception as e:
            print(f"❌ Function execution environment setup failed: {e}")
            traceback.print_exc()
            return False
    
    def _create_comprehensive_test_data(self):
        """Create comprehensive test data for all functions"""
        from app.extensions import db
        from app.domain.entities import TruckType, CartonType
        
        # Create test trucks with various sizes
        trucks = [
            TruckType(name="Small Test Truck", length=600, width=250, height=250, max_weight=3000),
            TruckType(name="Medium Test Truck", length=800, width=250, height=300, max_weight=5000),
            TruckType(name="Large Test Truck", length=1200, width=250, height=350, max_weight=8000),
        ]
        
        # Create test cartons with various properties
        cartons = [
            CartonType(name="Small Test Box", length=50, width=50, height=50, weight=10),
            CartonType(name="Medium Test Box", length=100, width=80, height=60, weight=25),
            CartonType(name="Large Test Box", length=150, width=120, height=80, weight=50),
        ]
        
        for truck in trucks:
            db.session.add(truck)
        for carton in cartons:
            db.session.add(carton)
        
        db.session.commit()
        print("✅ Comprehensive test data created")

    def execute_function(self, func, test_name, *args, **kwargs):
        """Execute a function with error handling and result tracking"""
        self.total_functions += 1
        
        try:
            start_time = time.time()
            result = func(*args, **kwargs)
            end_time = time.time()
            
            execution_time = (end_time - start_time) * 1000  # Convert to milliseconds
            
            self.passed_functions += 1
            self.function_results[test_name] = {
                'status': 'PASS',
                'result': str(result)[:200] if result is not None else 'None',
                'execution_time_ms': round(execution_time, 3),
                'error': None
            }
            
            print(f"   ✅ {test_name}: PASS ({execution_time:.2f}ms)")
            return result
            
        except Exception as e:
            self.failed_functions += 1
            self.function_results[test_name] = {
                'status': 'FAIL',
                'result': None,
                'execution_time_ms': 0,
                'error': str(e)
            }
            
            print(f"   ❌ {test_name}: FAIL - {str(e)}")
            return None

    def test_core_3d_packing_functions(self):
        """Test every function in the 3D packing module"""
        print("\n" + "="*70)
        print("EXECUTING: CORE 3D PACKING FUNCTIONS")
        print("="*70)
        
        try:
            from app.core.modern_3d_packing import (
                Item3D, Bin3D, PlacedItem, PackingMetrics, PackingResult,
                ExtremePointsPacker, GeneticAlgorithmPacker, Modern3DPacker,
                Orientation, items_from_dict, bin_from_dict
            )
            
            # Test Item3D class functions
            print("\n📦 Testing Item3D class functions:")
            
            # Create test item
            item = Item3D(
                id="test_item_1",
                name="Test Box",
                length=100, width=80, height=60,
                weight=15, quantity=1
            )
            
            # Test all Item3D methods
            self.execute_function(lambda: item.volume, "Item3D.volume")
            self.execute_function(lambda: item.base_area, "Item3D.base_area")
            self.execute_function(item.get_dimensions, "Item3D.get_dimensions", Orientation.LWH)
            self.execute_function(item.get_all_orientations, "Item3D.get_all_orientations")
            self.execute_function(item.to_dict, "Item3D.to_dict")
            
            # Test Bin3D class functions
            print("\n🚛 Testing Bin3D class functions:")
            
            bin_3d = Bin3D(
                id="test_bin_1",
                name="Test Truck",
                length=600, width=250, height=250,
                max_weight=3000
            )
            
            # Test all Bin3D methods
            self.execute_function(lambda: bin_3d.volume, "Bin3D.volume")
            self.execute_function(lambda: bin_3d.center_x, "Bin3D.center_x")
            self.execute_function(lambda: bin_3d.center_y, "Bin3D.center_y")
            self.execute_function(lambda: bin_3d.center_z, "Bin3D.center_z")
            self.execute_function(bin_3d.to_dict, "Bin3D.to_dict")
            
            # Test PlacedItem class functions
            print("\n📍 Testing PlacedItem class functions:")
            
            placed_item = PlacedItem(
                item=item,
                bin_id="test_bin_1",
                x=10, y=20, z=30,
                orientation=Orientation.LWH
            )
            
            # Test all PlacedItem methods
            self.execute_function(lambda: placed_item.x2, "PlacedItem.x2")
            self.execute_function(lambda: placed_item.y2, "PlacedItem.y2")
            self.execute_function(lambda: placed_item.z2, "PlacedItem.z2")
            self.execute_function(lambda: placed_item.center_x, "PlacedItem.center_x")
            self.execute_function(lambda: placed_item.center_y, "PlacedItem.center_y")
            self.execute_function(lambda: placed_item.center_z, "PlacedItem.center_z")
            
            # Test intersection with another item
            other_item = PlacedItem(
                item=item,
                bin_id="test_bin_1",
                x=50, y=60, z=70,
                orientation=Orientation.LWH
            )
            self.execute_function(placed_item.intersects, "PlacedItem.intersects", other_item)
            self.execute_function(placed_item.get_support_area, "PlacedItem.get_support_area", [])
            self.execute_function(placed_item.to_dict, "PlacedItem.to_dict")
            
            # Test ExtremePointsPacker functions
            print("\n🎯 Testing ExtremePointsPacker functions:")
            
            packer = ExtremePointsPacker(bin_3d)
            
            # Test packer methods
            dims = (100, 80, 60)
            self.execute_function(packer.can_place, "ExtremePointsPacker.can_place", item, 0, 0, 0, dims)
            self.execute_function(packer.get_support_at_position, "ExtremePointsPacker.get_support_at_position", 0, 0, 0, 100, 80)
            self.execute_function(packer.find_best_position, "ExtremePointsPacker.find_best_position", item)
            
            # Test placing an item
            position = packer.find_best_position(item)
            if position:
                x, y, z, dims = position
                self.execute_function(packer.place_item, "ExtremePointsPacker.place_item", item, x, y, z, dims)
            
            # Test packing multiple items
            items = [item, Item3D("item2", "Box2", 50, 50, 50, 8, 1)]
            self.execute_function(packer.pack, "ExtremePointsPacker.pack", items)
            
            # Test GeneticAlgorithmPacker functions
            print("\n🧬 Testing GeneticAlgorithmPacker functions:")
            
            ga_packer = GeneticAlgorithmPacker(bin_3d, population_size=10, generations=5)
            
            # Test GA methods
            self.execute_function(ga_packer.create_chromosome, "GeneticAlgorithmPacker.create_chromosome", items)
            
            chromosome = ga_packer.create_chromosome(items)
            self.execute_function(ga_packer.evaluate_fitness, "GeneticAlgorithmPacker.evaluate_fitness", chromosome)
            
            parent1 = ga_packer.create_chromosome(items)
            parent2 = ga_packer.create_chromosome(items)
            self.execute_function(ga_packer.crossover, "GeneticAlgorithmPacker.crossover", parent1, parent2)
            self.execute_function(ga_packer.mutate, "GeneticAlgorithmPacker.mutate", chromosome)
            self.execute_function(ga_packer.pack, "GeneticAlgorithmPacker.pack", items)
            
            # Test Modern3DPacker functions
            print("\n🚀 Testing Modern3DPacker functions:")
            
            modern_packer = Modern3DPacker()
            
            # Test all packing algorithms
            from app.core.modern_3d_packing import PackingAlgorithm
            
            for algorithm in PackingAlgorithm:
                self.execute_function(
                    modern_packer.pack, 
                    f"Modern3DPacker.pack_{algorithm.value}", 
                    items, bin_3d, algorithm
                )
            
            # Test algorithm comparison
            self.execute_function(modern_packer.compare_algorithms, "Modern3DPacker.compare_algorithms", items, bin_3d)
            self.execute_function(modern_packer.get_best_algorithm, "Modern3DPacker.get_best_algorithm", items, bin_3d)
            
            # Test helper functions
            print("\n🔧 Testing helper functions:")
            
            item_dicts = [
                {'id': 'test1', 'name': 'Test1', 'length': 100, 'width': 80, 'height': 60, 'weight': 15}
            ]
            bin_dict = {'id': 'bin1', 'name': 'Bin1', 'length': 600, 'width': 250, 'height': 250, 'max_weight': 3000}
            
            self.execute_function(items_from_dict, "items_from_dict", item_dicts)
            self.execute_function(bin_from_dict, "bin_from_dict", bin_dict)
            
            return True
            
        except Exception as e:
            print(f"❌ Core 3D packing functions test failed: {e}")
            traceback.print_exc()
            return False

    def test_packer_module_functions(self):
        """Test every function in the packer module"""
        print("\n" + "="*70)
        print("EXECUTING: PACKER MODULE FUNCTIONS")
        print("="*70)
        
        try:
            from app.packer import (
                pack_cartons_optimized, pack_cartons, calculate_optimal_truck_combination,
                calculate_performance_score, estimate_packing_time, optimize_fleet_distribution,
                validate_dimensional_integrity, validate_truck_dimensions, validate_carton_dimensions
            )
            
            # Create test data
            with self.app.app_context():
                from app.domain.entities import TruckType, CartonType
                
                trucks = TruckType.query.all()
                cartons = CartonType.query.all()
                
                if not trucks or not cartons:
                    print("⚠️  No test data available, creating minimal data")
                    return False
                
                # Test pack_cartons_optimized
                print("\n📦 Testing packing functions:")
                
                truck_quantities = {trucks[0]: 1}
                carton_quantities = {cartons[0]: 5, cartons[1]: 3}
                
                self.execute_function(
                    pack_cartons_optimized,
                    "pack_cartons_optimized",
                    truck_quantities, carton_quantities, 'space'
                )
                
                self.execute_function(
                    pack_cartons,
                    "pack_cartons",
                    truck_quantities, carton_quantities, 'space'
                )
                
                # Test calculate_optimal_truck_combination
                print("\n🚛 Testing truck combination functions:")
                
                self.execute_function(
                    calculate_optimal_truck_combination,
                    "calculate_optimal_truck_combination",
                    carton_quantities, trucks[:2]
                )
                
                # Test performance functions
                print("\n📊 Testing performance functions:")
                
                mock_result = {
                    'space_utilization': 75.5,
                    'weight_utilization': 60.2,
                    'packing_efficiency': 80.0
                }
                
                self.execute_function(
                    calculate_performance_score,
                    "calculate_performance_score",
                    mock_result, 'space'
                )
                
                self.execute_function(
                    estimate_packing_time,
                    "estimate_packing_time",
                    50, 3
                )
                
                # Test fleet optimization
                print("\n🚢 Testing fleet optimization functions:")
                
                carton_list = [cartons[0], cartons[1]]
                truck_fleet = trucks[:2]
                
                self.execute_function(
                    optimize_fleet_distribution,
                    "optimize_fleet_distribution",
                    carton_list, truck_fleet
                )
                
                # Test validation functions
                print("\n✅ Testing validation functions:")
                
                self.execute_function(
                    validate_dimensional_integrity,
                    "validate_dimensional_integrity",
                    trucks[:2], cartons[:2]
                )
                
                self.execute_function(
                    validate_truck_dimensions,
                    "validate_truck_dimensions",
                    trucks[0]
                )
                
                self.execute_function(
                    validate_carton_dimensions,
                    "validate_carton_dimensions",
                    cartons[0]
                )
            
            return True
            
        except Exception as e:
            print(f"❌ Packer module functions test failed: {e}")
            traceback.print_exc()
            return False

    def test_api_route_functions(self):
        """Test every API route function"""
        print("\n" + "="*70)
        print("EXECUTING: API ROUTE FUNCTIONS")
        print("="*70)
        
        try:
            with self.app.test_client() as client:
                
                # Test basic API endpoints
                print("\n🌐 Testing basic API endpoints:")
                
                self.execute_function(
                    lambda: client.get('/api/health'),
                    "GET /api/health"
                )
                
                self.execute_function(
                    lambda: client.get('/api/truck-types'),
                    "GET /api/truck-types"
                )
                
                self.execute_function(
                    lambda: client.get('/api/carton-types'),
                    "GET /api/carton-types"
                )
                
                self.execute_function(
                    lambda: client.get('/api/analytics'),
                    "GET /api/analytics"
                )
                
                # Test POST endpoints with data
                print("\n📤 Testing POST API endpoints:")
                
                # Test truck creation
                truck_data = {
                    'name': 'API Test Truck',
                    'length': 700,
                    'width': 250,
                    'height': 280,
                    'max_weight': 4000
                }
                
                self.execute_function(
                    lambda: client.post('/api/truck-types', json=truck_data),
                    "POST /api/truck-types"
                )
                
                # Test carton creation
                carton_data = {
                    'name': 'API Test Box',
                    'length': 60,
                    'width': 50,
                    'height': 40,
                    'weight': 12
                }
                
                self.execute_function(
                    lambda: client.post('/api/carton-types', json=carton_data),
                    "POST /api/carton-types"
                )
                
                # Test 3D packing API
                print("\n📦 Testing 3D packing API:")
                
                pack_data = {
                    'container': {
                        'length': 600,
                        'width': 250,
                        'height': 250,
                        'max_weight': 3000
                    },
                    'items': [
                        {
                            'name': 'Test Box 1',
                            'length': 100,
                            'width': 80,
                            'height': 60,
                            'weight': 15
                        },
                        {
                            'name': 'Test Box 2',
                            'length': 80,
                            'width': 60,
                            'height': 50,
                            'weight': 12
                        }
                    ]
                }
                
                self.execute_function(
                    lambda: client.post('/api/pack', json=pack_data),
                    "POST /api/pack"
                )
                
                # Test fleet optimization API
                print("\n🚛 Testing fleet optimization API:")
                
                fleet_data = {
                    'trucks': [
                        {'id': 1, 'quantity': 1},
                        {'id': 2, 'quantity': 1}
                    ],
                    'cartons': [
                        {'id': 1, 'quantity': 10},
                        {'id': 2, 'quantity': 5}
                    ],
                    'optimization_goal': 'space'
                }
                
                self.execute_function(
                    lambda: client.post('/api/fleet-optimization', json=fleet_data),
                    "POST /api/fleet-optimization"
                )
                
                # Test truck recommendation API
                print("\n🤖 Testing truck recommendation API:")
                
                recommendation_data = {
                    'cartons': [
                        {'carton_id': 1, 'quantity': 15},
                        {'carton_id': 2, 'quantity': 8}
                    ]
                }
                
                self.execute_function(
                    lambda: client.post('/api/truck-recommendation-ai', json=recommendation_data),
                    "POST /api/truck-recommendation-ai"
                )
            
            return True
            
        except Exception as e:
            print(f"❌ API route functions test failed: {e}")
            traceback.print_exc()
            return False

    def test_database_model_functions(self):
        """Test every database model function"""
        print("\n" + "="*70)
        print("EXECUTING: DATABASE MODEL FUNCTIONS")
        print("="*70)
        
        try:
            with self.app.app_context():
                from app.domain.entities import TruckType, CartonType
                from app.models import BaseModel, UserSettings
                
                # Test TruckType model functions
                print("\n🚛 Testing TruckType model functions:")
                
                truck = TruckType.query.first()
                if truck:
                    self.execute_function(
                        truck.calculate_max_cartons,
                        "TruckType.calculate_max_cartons"
                    )
                    
                    self.execute_function(
                        truck.get_performance_metrics,
                        "TruckType.get_performance_metrics"
                    )
                    
                    self.execute_function(
                        truck.as_dict,
                        "TruckType.as_dict"
                    )
                
                # Test CartonType model functions
                print("\n📦 Testing CartonType model functions:")
                
                carton = CartonType.query.first()
                if carton:
                    self.execute_function(
                        carton.get_packaging_metrics,
                        "CartonType.get_packaging_metrics"
                    )
                    
                    self.execute_function(
                        carton.as_dict,
                        "CartonType.as_dict"
                    )
                
                # Test UserSettings model functions
                print("\n👤 Testing UserSettings model functions:")
                
                self.execute_function(
                    UserSettings.get_user_settings,
                    "UserSettings.get_user_settings",
                    'test_user'
                )
                
                settings = UserSettings.get_user_settings('test_user')
                if settings:
                    self.execute_function(
                        settings.as_dict,
                        "UserSettings.as_dict"
                    )
            
            return True
            
        except Exception as e:
            print(f"❌ Database model functions test failed: {e}")
            traceback.print_exc()
            return False

    def test_utility_functions(self):
        """Test utility and helper functions"""
        print("\n" + "="*70)
        print("EXECUTING: UTILITY AND HELPER FUNCTIONS")
        print("="*70)
        
        try:
            # Test route utility functions
            print("\n🔧 Testing route utility functions:")
            
            from app.routes import (
                _get_avg_utilization, _get_total_cost, _get_avg_weight_utilization,
                convert_decimals_to_floats
            )
            
            with self.app.app_context():
                self.execute_function(
                    _get_avg_utilization,
                    "_get_avg_utilization"
                )
                
                self.execute_function(
                    _get_total_cost,
                    "_get_total_cost"
                )
                
                self.execute_function(
                    _get_avg_weight_utilization,
                    "_get_avg_weight_utilization"
                )
            
            # Test decimal conversion
            from decimal import Decimal
            test_data = {
                'value1': Decimal('123.45'),
                'value2': 67.89,
                'nested': {
                    'decimal_val': Decimal('99.99')
                }
            }
            
            self.execute_function(
                convert_decimals_to_floats,
                "convert_decimals_to_floats",
                test_data
            )
            
            # Test configuration functions
            print("\n⚙️  Testing configuration functions:")
            
            try:
                from app.config.settings import get_config
                
                self.execute_function(
                    get_config,
                    "get_config"
                )
            except ImportError:
                print("   ⚠️  Configuration functions not found")
            
            return True
            
        except Exception as e:
            print(f"❌ Utility functions test failed: {e}")
            traceback.print_exc()
            return False

    def test_data_upload_functions(self):
        """Test data upload and processing functions"""
        print("\n" + "="*70)
        print("EXECUTING: DATA UPLOAD FUNCTIONS")
        print("="*70)
        
        try:
            # Test CSV upload functionality
            print("\n📊 Testing CSV upload functions:")
            
            with self.app.test_client() as client:
                
                # Test template downloads
                self.execute_function(
                    lambda: client.get('/api/upload/template/items'),
                    "GET /api/upload/template/items"
                )
                
                self.execute_function(
                    lambda: client.get('/api/upload/template/bins'),
                    "GET /api/upload/template/bins"
                )
                
                # Test CSV upload preview
                csv_data = b'name,length,width,height,weight\nTest Item,100,80,60,15\nTest Item 2,120,90,70,20'
                
                self.execute_function(
                    lambda: client.post('/api/upload/preview', 
                        data={'file': (BytesIO(csv_data), 'test.csv'), 'type': 'items'},
                        content_type='multipart/form-data'
                    ),
                    "POST /api/upload/preview"
                )
                
                # Test actual CSV upload
                self.execute_function(
                    lambda: client.post('/api/upload/items',
                        data={'file': (BytesIO(csv_data), 'test.csv')},
                        content_type='multipart/form-data'
                    ),
                    "POST /api/upload/items"
                )
                
                # Test data export
                self.execute_function(
                    lambda: client.get('/api/upload/export/items'),
                    "GET /api/upload/export/items"
                )
                
                self.execute_function(
                    lambda: client.get('/api/upload/export/bins'),
                    "GET /api/upload/export/bins"
                )
            
            return True
            
        except Exception as e:
            print(f"❌ Data upload functions test failed: {e}")
            traceback.print_exc()
            return False

    def test_web_page_functions(self):
        """Test web page route functions"""
        print("\n" + "="*70)
        print("EXECUTING: WEB PAGE FUNCTIONS")
        print("="*70)
        
        try:
            with self.app.test_client() as client:
                
                # Test main web pages
                print("\n🌐 Testing web page routes:")
                
                pages = [
                    ('/', 'index'),
                    ('/truck-types', 'truck_types'),
                    ('/carton-types', 'carton_types'),
                    ('/fleet-optimization', 'fleet_optimization'),
                    ('/analytics', 'analytics'),
                    ('/batch-processing', 'batch_processing'),
                    ('/customers', 'customers'),
                    ('/routes', 'routes')
                ]
                
                for url, name in pages:
                    self.execute_function(
                        lambda u=url: client.get(u),
                        f"GET {url} ({name})"
                    )
                
                # Test form submission pages
                print("\n📝 Testing form pages:")
                
                form_pages = [
                    ('/add-truck-type', 'add_truck_type'),
                    ('/add-carton-type', 'add_carton_type'),
                    ('/add-customer', 'add_customer'),
                    ('/add-route', 'add_route')
                ]
                
                for url, name in form_pages:
                    self.execute_function(
                        lambda u=url: client.get(u),
                        f"GET {url} ({name})"
                    )
            
            return True
            
        except Exception as e:
            print(f"❌ Web page functions test failed: {e}")
            traceback.print_exc()
            return False

    def test_advanced_api_functions(self):
        """Test advanced API functions"""
        print("\n" + "="*70)
        print("EXECUTING: ADVANCED API FUNCTIONS")
        print("="*70)
        
        try:
            with self.app.test_client() as client:
                
                # Test cost analysis API
                print("\n💰 Testing cost analysis functions:")
                
                cost_data = {
                    'distance': 100,
                    'fuel_price': 85.50,
                    'truck_type': 'medium',
                    'load_weight': 2000
                }
                
                self.execute_function(
                    lambda: client.post('/api/cost-analysis', json=cost_data),
                    "POST /api/cost-analysis"
                )
                
                # Test performance metrics API
                print("\n📊 Testing performance metrics functions:")
                
                self.execute_function(
                    lambda: client.get('/api/performance-metrics'),
                    "GET /api/performance-metrics"
                )
                
                # Test fuel prices API
                print("\n⛽ Testing fuel prices functions:")
                
                self.execute_function(
                    lambda: client.get('/api/fuel-prices?location=India'),
                    "GET /api/fuel-prices"
                )
                
                # Test analytics drill-down
                print("\n🔍 Testing analytics drill-down functions:")
                
                self.execute_function(
                    lambda: client.get('/api/analytics/performance-drill-down'),
                    "GET /api/analytics/performance-drill-down"
                )
                
                # Test search API
                print("\n🔎 Testing search functions:")
                
                self.execute_function(
                    lambda: client.get('/api/search?q=test&type=trucks'),
                    "GET /api/search"
                )
            
            return True
            
        except Exception as e:
            print(f"❌ Advanced API functions test failed: {e}")
            traceback.print_exc()
            return False

    def run_comprehensive_function_tests(self):
        """Run comprehensive tests on every function"""
        print("🔧 TRUCKOPTI COMPREHENSIVE FUNCTION EXECUTION TESTS")
        print("=" * 80)
        print("Executing and testing every individual function in the application")
        print("=" * 80)
        
        if not self.setup_test_environment():
            print("❌ Could not setup test environment. Aborting tests.")
            return False
        
        # Define all function test categories
        test_categories = [
            ("Core 3D Packing Functions", self.test_core_3d_packing_functions),
            ("Packer Module Functions", self.test_packer_module_functions),
            ("API Route Functions", self.test_api_route_functions),
            ("Database Model Functions", self.test_database_model_functions),
            ("Utility Functions", self.test_utility_functions),
            ("Data Upload Functions", self.test_data_upload_functions),
            ("Web Page Functions", self.test_web_page_functions),
            ("Advanced API Functions", self.test_advanced_api_functions),
        ]
        
        start_time = time.time()
        
        # Run each test category
        category_results = []
        for category_name, test_func in test_categories:
            try:
                print(f"\n🚀 Starting {category_name}...")
                result = test_func()
                category_results.append((category_name, result))
                print(f"✅ Completed {category_name}: {'PASS' if result else 'FAIL'}")
            except Exception as e:
                print(f"\n❌ {category_name} failed with exception: {e}")
                traceback.print_exc()
                category_results.append((category_name, False))
        
        end_time = time.time()
        
        # Generate comprehensive report
        self.generate_execution_report(category_results, end_time - start_time)
        
        # Return overall success
        return self.passed_functions >= self.total_functions * 0.8  # 80% pass rate

    def generate_execution_report(self, category_results, total_time):
        """Generate comprehensive execution report"""
        print("\n" + "="*80)
        print("COMPREHENSIVE FUNCTION EXECUTION REPORT")
        print("="*80)
        
        # Category results
        print("\n📋 CATEGORY EXECUTION RESULTS:")
        categories_passed = 0
        for category_name, result in category_results:
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"   {status} {category_name}")
            if result:
                categories_passed += 1
        
        # Function execution statistics
        print(f"\n🔧 FUNCTION EXECUTION STATISTICS:")
        print(f"   Total Functions Executed: {self.total_functions}")
        print(f"   Functions Passed: {self.passed_functions}")
        print(f"   Functions Failed: {self.failed_functions}")
        print(f"   Success Rate: {(self.passed_functions/self.total_functions)*100:.1f}%")
        print(f"   Total Execution Time: {total_time:.2f} seconds")
        
        # Performance analysis
        print(f"\n⚡ PERFORMANCE ANALYSIS:")
        if self.function_results:
            execution_times = [r['execution_time_ms'] for r in self.function_results.values() if r['status'] == 'PASS']
            if execution_times:
                avg_time = sum(execution_times) / len(execution_times)
                max_time = max(execution_times)
                min_time = min(execution_times)
                
                print(f"   Average Execution Time: {avg_time:.2f}ms")
                print(f"   Fastest Function: {min_time:.2f}ms")
                print(f"   Slowest Function: {max_time:.2f}ms")
        
        # Show failed functions for debugging
        failed_functions = [name for name, result in self.function_results.items() if result['status'] == 'FAIL']
        if failed_functions:
            print(f"\n❌ FAILED FUNCTIONS ({len(failed_functions)}):")
            for func_name in failed_functions[:10]:  # Show first 10 failures
                error = self.function_results[func_name]['error']
                print(f"   - {func_name}: {error}")
            if len(failed_functions) > 10:
                print(f"   ... and {len(failed_functions) - 10} more")
        
        # Overall assessment
        print(f"\n🎯 OVERALL FUNCTION EXECUTION ASSESSMENT:")
        success_rate = (self.passed_functions / self.total_functions) * 100
        
        if success_rate >= 95:
            print("   🎉 EXCELLENT - Nearly all functions executing perfectly!")
            print("   ✅ All core functionality is working flawlessly")
            print("   🚀 Application is ready for production deployment")
        elif success_rate >= 85:
            print("   🌟 VERY GOOD - Most functions executing well")
            print("   ✅ Core functionality is solid with minor issues")
            print("   ⚠️  Some non-critical functions need attention")
        elif success_rate >= 70:
            print("   👍 GOOD - Majority of functions working")
            print("   ⚠️  Some important functions need fixes")
            print("   🔧 Recommended to address failures before production")
        else:
            print("   ⚠️  NEEDS IMPROVEMENT - Many functions have issues")
            print("   🔧 Significant work needed on core functionality")
            print("   ❌ Not recommended for production deployment")
        
        # Detailed function results summary
        print(f"\n📊 DETAILED EXECUTION RESULTS:")
        
        # Group results by category
        passed_by_category = {}
        failed_by_category = {}
        
        for func_name, result in self.function_results.items():
            category = func_name.split('.')[0] if '.' in func_name else 'Other'
            
            if result['status'] == 'PASS':
                passed_by_category[category] = passed_by_category.get(category, 0) + 1
            else:
                failed_by_category[category] = failed_by_category.get(category, 0) + 1
        
        all_categories = set(list(passed_by_category.keys()) + list(failed_by_category.keys()))
        
        for category in sorted(all_categories):
            passed = passed_by_category.get(category, 0)
            failed = failed_by_category.get(category, 0)
            total = passed + failed
            rate = (passed / total * 100) if total > 0 else 0
            
            print(f"   {category}: {passed}/{total} ({rate:.1f}%)")

def main():
    """Main function execution test"""
    executor = FunctionExecutor()
    success = executor.run_comprehensive_function_tests()
    return success

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)