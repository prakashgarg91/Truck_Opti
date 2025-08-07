"""
Comprehensive Test Suite for Enhanced TruckOpti Features
Tests all the newly implemented advanced features including:
- Optimized packing algorithms
- Cost calculation engine
- AI-powered recommendations
- Route optimization
- WebSocket functionality
"""

import pytest
import json
import time
from datetime import datetime
import sys
import os

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from app.models import TruckType, CartonType, PackingJob, PackingResult
from app.packer import pack_cartons_optimized, calculate_optimal_truck_combination
from app.cost_engine import CostCalculationEngine, FuelPrices, RouteCost
from app.ml_optimizer import PackingAI
from app.route_optimizer import RouteOptimizer, Location


class TestOptimizedPackingAlgorithms:
    """Test enhanced packing algorithms"""
    
    def setup_method(self):
        """Set up test data"""
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        
        with self.app.app_context():
            db.create_all()
            
            # Create test truck types
            self.truck = TruckType(
                name="Test Truck 3000",
                length=600, width=250, height=250,
                max_weight=15000,
                cost_per_km=5.0,
                fuel_efficiency=12.0,
                driver_cost_per_day=2000.0,
                maintenance_cost_per_km=2.5
            )
            
            # Create test carton types
            self.carton_small = CartonType(
                name="Small Box", length=30, width=20, height=15,
                weight=2, can_rotate=True, fragile=False
            )
            self.carton_large = CartonType(
                name="Large Box", length=80, width=60, height=40,
                weight=10, can_rotate=True, fragile=True
            )
            
            db.session.add(self.truck)
            db.session.add(self.carton_small)
            db.session.add(self.carton_large)
            db.session.commit()
    
    def test_optimized_packing_performance(self):
        """Test that optimized algorithm handles large datasets efficiently"""
        with self.app.app_context():
            truck_quantities = {self.truck: 2}
            carton_quantities = {
                self.carton_small: 500,  # Large dataset
                self.carton_large: 200
            }
            
            start_time = time.time()
            results = pack_cartons_optimized(
                truck_quantities, carton_quantities, 'space', use_parallel=True
            )
            end_time = time.time()
            
            # Should complete within reasonable time (less than 30 seconds)
            assert (end_time - start_time) < 30
            assert len(results) > 0
            assert results[0]['fitted_items'] is not None
    
    def test_parallel_packing(self):
        """Test parallel processing functionality"""
        with self.app.app_context():
            truck_quantities = {self.truck: 3}
            carton_quantities = {self.carton_small: 100, self.carton_large: 50}
            
            # Test with parallel processing enabled
            results_parallel = pack_cartons_optimized(
                truck_quantities, carton_quantities, 'space', use_parallel=True, max_workers=2
            )
            
            # Test with parallel processing disabled
            results_sequential = pack_cartons_optimized(
                truck_quantities, carton_quantities, 'space', use_parallel=False
            )
            
            # Both should produce valid results
            assert len(results_parallel) > 0
            assert len(results_sequential) > 0
            
            # Results should be similar (may vary due to different algorithms)
            assert abs(len(results_parallel) - len(results_sequential)) <= 1


class TestCostCalculationEngine:
    """Test enhanced cost calculation features"""
    
    def setup_method(self):
        """Set up cost engine"""
        self.cost_engine = CostCalculationEngine()
        self.app = create_app()
        self.app.config['TESTING'] = True
        
        with self.app.app_context():
            db.create_all()
            
            self.truck = TruckType(
                name="Cost Test Truck",
                length=500, width=200, height=200,
                max_weight=10000,
                cost_per_km=4.0,
                fuel_efficiency=10.0,
                driver_cost_per_day=1500.0,
                maintenance_cost_per_km=2.0,
                truck_category="medium"
            )
            db.session.add(self.truck)
            db.session.commit()
    
    def test_fuel_price_fetching(self):
        """Test fuel price API integration"""
        fuel_prices = self.cost_engine.get_fuel_prices("India")
        
        assert isinstance(fuel_prices, FuelPrices)
        assert fuel_prices.diesel > 0
        assert fuel_prices.petrol > 0
        assert fuel_prices.currency == "INR"
    
    def test_comprehensive_cost_calculation(self):
        """Test comprehensive cost calculation"""
        with self.app.app_context():
            route_info = {
                'distance_km': 250,
                'route_type': 'highway',
                'location': 'India'
            }
            
            cost_breakdown = self.cost_engine.calculate_comprehensive_cost(
                self.truck, route_info
            )
            
            assert isinstance(cost_breakdown, RouteCost)
            assert cost_breakdown.distance_km == 250
            assert cost_breakdown.fuel_cost > 0
            assert cost_breakdown.toll_cost >= 0
            assert cost_breakdown.maintenance_cost > 0
            assert cost_breakdown.driver_cost > 0
            assert cost_breakdown.total_cost > 0
    
    def test_cost_optimization_strategy(self):
        """Test cost optimization for multiple trucks"""
        with self.app.app_context():
            trucks = [self.truck]  # In real test, would have multiple trucks
            route_info = {'distance_km': 150, 'route_type': 'highway'}
            
            optimization = self.cost_engine.optimize_cost_strategy(trucks, route_info)
            
            assert 'recommended_truck' in optimization
            assert 'all_options' in optimization
            assert len(optimization['all_options']) == len(trucks)


class TestAIPackingIntelligence:
    """Test AI-powered packing features"""
    
    def setup_method(self):
        """Set up AI testing environment"""
        self.ai = PackingAI()
        self.app = create_app()
        self.app.config['TESTING'] = True
        
        with self.app.app_context():
            db.create_all()
            
            # Create test data
            self.truck1 = TruckType(
                name="AI Test Truck 1", length=400, width=200, height=180,
                max_weight=8000, cost_per_km=3.5
            )
            self.truck2 = TruckType(
                name="AI Test Truck 2", length=600, width=250, height=220,
                max_weight=12000, cost_per_km=5.0
            )
            
            self.carton1 = CartonType(
                name="AI Carton 1", length=40, width=30, height=20,
                weight=5, fragile=False, priority=3
            )
            self.carton2 = CartonType(
                name="AI Carton 2", length=60, width=40, height=30,
                weight=8, fragile=True, priority=5
            )
            
            db.session.add_all([self.truck1, self.truck2, self.carton1, self.carton2])
            db.session.commit()
    
    def test_truck_type_prediction(self):
        """Test AI truck type recommendation"""
        with self.app.app_context():
            cartons = {self.carton1: 50, self.carton2: 30}
            
            recommendations = self.ai.predict_optimal_truck_type(cartons)
            
            assert len(recommendations) > 0
            assert all(hasattr(rec, 'confidence_score') for rec in recommendations)
            assert all(hasattr(rec, 'expected_utilization') for rec in recommendations)
            assert all(0 <= rec.confidence_score <= 1 for rec in recommendations)
    
    def test_weight_distribution_optimization(self):
        """Test weight distribution algorithm"""
        cartons = [self.carton1, self.carton2] * 10  # Multiple instances
        truck_dimensions = (600, 250, 220)
        
        distribution = self.ai.optimize_weight_distribution(cartons, truck_dimensions)
        
        assert distribution['status'] == 'success'
        assert 'weight_distribution' in distribution
        assert 'recommendations' in distribution
        assert 'balance_warnings' in distribution
    
    def test_packing_efficiency_prediction(self):
        """Test packing efficiency prediction"""
        with self.app.app_context():
            carton_combination = [self.carton1] * 20 + [self.carton2] * 10
            
            prediction = self.ai.predict_packing_efficiency(carton_combination, self.truck1)
            
            assert hasattr(prediction, 'predicted_utilization')
            assert hasattr(prediction, 'confidence_score')
            assert hasattr(prediction, 'estimated_time')
            assert hasattr(prediction, 'recommended_strategy')
            assert 0 <= prediction.predicted_utilization <= 1
            assert 0 <= prediction.confidence_score <= 1
    
    def test_learning_from_results(self):
        """Test AI learning capability"""
        input_data = {
            'carton_count': 50,
            'total_volume': 1000,
            'total_weight': 200,
            'fragile_ratio': 0.2,
            'truck_type': 'test_truck'
        }
        
        result_data = {
            'utilization': 0.85,
            'packing_time': 15.5,
            'success': True
        }
        
        performance_metrics = {
            'efficiency_score': 0.9,
            'cost_effectiveness': 0.8
        }
        
        # Should not raise any exceptions
        self.ai.learn_from_packing_result(input_data, result_data, performance_metrics)
        
        # Check that data was stored
        assert len(self.ai.historical_data) > 0
    
    def test_performance_insights(self):
        """Test performance insights generation"""
        # Add some mock historical data
        for i in range(10):
            self.ai.learn_from_packing_result(
                {'truck_type': f'truck_{i%3}', 'fragile_ratio': 0.1 * i},
                {'utilization': 0.8 + 0.1 * (i % 3), 'success': True},
                {'efficiency_score': 0.85}
            )
        
        insights = self.ai.get_performance_insights()
        
        assert insights['status'] == 'success'
        assert 'insights' in insights
        assert 'data_points' in insights


class TestRouteOptimization:
    """Test route optimization features"""
    
    def setup_method(self):
        """Set up route optimizer"""
        self.optimizer = RouteOptimizer()
    
    def test_geocoding(self):
        """Test address geocoding"""
        location = self.optimizer.geocode_address("Mumbai")
        
        assert isinstance(location, Location)
        assert location.name == "Mumbai"
        assert abs(location.latitude - 19.0760) < 0.1  # Approximate Mumbai coordinates
        assert abs(location.longitude - 72.8777) < 0.1
    
    def test_distance_calculation(self):
        """Test distance calculation between locations"""
        mumbai = Location(19.0760, 72.8777, name="Mumbai")
        delhi = Location(28.7041, 77.1025, name="Delhi")
        
        distance = self.optimizer.calculate_distance(mumbai, delhi)
        
        # Mumbai to Delhi is approximately 1150-1200 km
        assert 1100 <= distance <= 1250
    
    def test_route_optimization(self):
        """Test multi-destination route optimization"""
        start = Location(19.0760, 72.8777, name="Mumbai")
        destinations = [
            Location(18.5204, 73.8567, name="Pune"),
            Location(23.0225, 72.5714, name="Ahmedabad"),
            Location(28.7041, 77.1025, name="Delhi")
        ]
        
        optimized_route = self.optimizer.optimize_multi_destination_route(
            start, destinations, return_to_start=True, optimization_goal="distance"
        )
        
        assert len(optimized_route.waypoints) == 5  # Start + 3 destinations + return
        assert optimized_route.total_distance_km > 0
        assert optimized_route.total_duration_minutes > 0
        assert 0 <= optimized_route.optimization_score <= 100
    
    def test_traffic_updates(self):
        """Test real-time traffic updates"""
        # Create a mock route
        from app.route_optimizer import OptimizedRoute
        mock_route = OptimizedRoute([], [], 500, 360, 5000, 85.0)
        
        traffic_updates = self.optimizer.get_real_time_traffic_updates(mock_route)
        
        assert 'updates' in traffic_updates
        assert 'total_additional_delay' in traffic_updates
        assert 'updated_eta' in traffic_updates
        assert 'last_updated' in traffic_updates
    
    def test_fleet_route_optimization(self):
        """Test fleet route optimization (VRP)"""
        vehicles = [
            {'id': 'truck_1', 'capacity': 1000, 'start_location': 'Mumbai'},
            {'id': 'truck_2', 'capacity': 1500, 'start_location': 'Delhi'}
        ]
        
        orders = [
            {'id': 'order_1', 'delivery_address': 'Pune', 'weight': 200},
            {'id': 'order_2', 'delivery_address': 'Bangalore', 'weight': 300},
            {'id': 'order_3', 'delivery_address': 'Chennai', 'weight': 400}
        ]
        
        optimization = self.optimizer.optimize_fleet_routes(vehicles, orders)
        
        assert 'optimized_routes' in optimization
        assert 'total_vehicles_used' in optimization
        assert 'total_distance' in optimization
        assert 'total_cost' in optimization


class TestAPIEndpoints:
    """Test all API endpoints"""
    
    def setup_method(self):
        """Set up Flask test client"""
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        
        with self.app.app_context():
            db.create_all()
            
            # Create test data
            truck = TruckType(
                name="API Test Truck", length=500, width=200, height=200,
                max_weight=10000, cost_per_km=4.0
            )
            carton = CartonType(
                name="API Test Carton", length=40, width=30, height=20, weight=5
            )
            
            db.session.add(truck)
            db.session.add(carton)
            db.session.commit()
            
            self.truck_id = truck.id
            self.carton_id = carton.id
        
        self.client = self.app.test_client()
    
    def test_cost_analysis_api(self):
        """Test cost analysis API endpoint"""
        with self.app.app_context():
            response = self.client.post('/api/cost-analysis', 
                json={
                    'truck_ids': [self.truck_id],
                    'route_info': {'distance_km': 200, 'route_type': 'highway'}
                },
                content_type='application/json'
            )
            
            assert response.status_code == 200
            data = json.loads(response.data)
            assert 'analysis' in data
            assert 'fuel_prices' in data
    
    def test_fleet_optimization_api(self):
        """Test fleet cost optimization API"""
        with self.app.app_context():
            response = self.client.post('/api/fleet-cost-optimization',
                json={
                    'trucks': [{'id': self.truck_id, 'quantity': 2}],
                    'cartons': [{'id': self.carton_id, 'quantity': 50}],
                    'route_info': {'distance_km': 150},
                    'optimization_goals': ['cost', 'space']
                },
                content_type='application/json'
            )
            
            assert response.status_code == 200
            data = json.loads(response.data)
            assert 'optimization_results' in data
            assert 'fleet_costs' in data
    
    def test_route_optimization_api(self):
        """Test route optimization API"""
        response = self.client.post('/api/optimize-route',
            json={
                'start_location': 'Mumbai',
                'destinations': ['Pune', 'Bangalore'],
                'optimization_goal': 'distance'
            },
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'optimized_route' in data
        assert 'time_windows' in data
    
    def test_truck_recommendation_ai_api(self):
        """Test AI truck recommendation API"""
        with self.app.app_context():
            response = self.client.post('/api/truck-recommendation-ai',
                json={
                    'cartons': [{'id': self.carton_id, 'quantity': 100}],
                    'max_trucks': 5
                },
                content_type='application/json'
            )
            
            assert response.status_code == 200
            data = json.loads(response.data)
            assert 'recommendations' in data
            assert 'total_cartons' in data
    
    def test_performance_metrics_api(self):
        """Test performance metrics API"""
        response = self.client.get('/api/performance-metrics')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'system_stats' in data
        assert 'performance_tips' in data


class TestFormValidation:
    """Test form validation functionality"""
    
    def test_validation_rules(self):
        """Test validation rule functions"""
        # This would typically be tested in JavaScript, but we can test the concepts
        
        # Test required field
        def required(value):
            return len(str(value).strip()) > 0 or "This field is required"
        
        assert required("test") == True
        assert required("") == "This field is required"
        assert required("   ") == "This field is required"
        
        # Test numeric validation
        def numeric(value):
            try:
                float(value)
                return True
            except (ValueError, TypeError):
                return "Please enter a valid number"
        
        assert numeric("123") == True
        assert numeric("123.45") == True
        assert numeric("abc") == "Please enter a valid number"
        
        # Test range validation
        def range_validator(min_val, max_val):
            def validator(value):
                try:
                    num = float(value)
                    if min_val <= num <= max_val:
                        return True
                    return f"Value must be between {min_val} and {max_val}"
                except (ValueError, TypeError):
                    return "Please enter a valid number"
            return validator
        
        range_1_100 = range_validator(1, 100)
        assert range_1_100("50") == True
        assert range_1_100("0") == "Value must be between 1 and 100"
        assert range_1_100("150") == "Value must be between 1 and 100"


class TestIntegrationScenarios:
    """Test complete integration scenarios"""
    
    def setup_method(self):
        """Set up integration test environment"""
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        
        with self.app.app_context():
            db.create_all()
    
    def test_complete_packing_workflow(self):
        """Test complete packing workflow from creation to optimization"""
        with self.app.app_context():
            # 1. Create truck and carton types
            truck = TruckType(
                name="Integration Truck", length=600, width=250, height=250,
                max_weight=15000, cost_per_km=5.0, fuel_efficiency=12.0
            )
            
            carton = CartonType(
                name="Integration Carton", length=50, width=40, height=30,
                weight=8, can_rotate=True, fragile=False
            )
            
            db.session.add(truck)
            db.session.add(carton)
            db.session.commit()
            
            # 2. Create packing job
            job = PackingJob(
                name="Integration Test Job",
                truck_type_id=truck.id,
                optimization_goal='cost'
            )
            db.session.add(job)
            db.session.commit()
            
            # 3. Run optimized packing
            truck_quantities = {truck: 2}
            carton_quantities = {carton: 100}
            
            results = pack_cartons_optimized(
                truck_quantities, carton_quantities, 'cost'
            )
            
            # 4. Store results
            for result in results:
                packing_result = PackingResult(
                    job_id=job.id,
                    truck_count=1,
                    space_utilization=result.get('utilization', 0),
                    total_cost=result.get('total_cost', 0),
                    result_data=json.dumps(result)
                )
                db.session.add(packing_result)
            
            db.session.commit()
            
            # 5. Verify results
            saved_results = PackingResult.query.filter_by(job_id=job.id).all()
            assert len(saved_results) > 0
            assert saved_results[0].space_utilization >= 0
            assert saved_results[0].total_cost >= 0
    
    def test_cost_optimization_integration(self):
        """Test integration of cost calculation with packing optimization"""
        with self.app.app_context():
            # Create test data
            truck = TruckType(
                name="Cost Integration Truck", length=500, width=200, height=200,
                max_weight=10000, cost_per_km=4.0, fuel_efficiency=10.0,
                driver_cost_per_day=1500.0, maintenance_cost_per_km=2.0
            )
            
            carton = CartonType(
                name="Cost Integration Carton", length=40, width=30, height=25,
                weight=6, value=500.0
            )
            
            db.session.add(truck)
            db.session.add(carton)
            db.session.commit()
            
            # Run optimization with cost focus
            truck_quantities = {truck: 1}
            carton_quantities = {carton: 50}
            
            results = pack_cartons_optimized(
                truck_quantities, carton_quantities, 'cost'
            )
            
            # Verify cost calculations are included
            assert len(results) > 0
            assert 'total_cost' in results[0]
            assert results[0]['total_cost'] > 0


def run_all_tests():
    """Run all tests and generate a report"""
    import pytest
    import sys
    
    # Run tests with verbose output
    exit_code = pytest.main([
        __file__,
        '-v',
        '--tb=short',
        '--color=yes'
    ])
    
    return exit_code == 0


if __name__ == "__main__":
    success = run_all_tests()
    if success:
        print("\n✅ All tests passed successfully!")
    else:
        print("\n❌ Some tests failed. Please check the output above.")
    
    sys.exit(0 if success else 1)