import pytest
import json
from app.packer import SpaceOptimizer
from app.models import CartonType, TruckType as Truck
from app.ml_optimizer import MLSpaceOptimizationEngine

class TestRemainingSpaceOptimization:
    def setup_method(self):
        """Setup method to initialize test data before each test"""
        self.space_optimizer = SpaceOptimizer()
        self.ml_optimizer = MLSpaceOptimizationEngine()

    def test_basic_space_utilization(self):
        """Test basic space utilization calculation"""
        truck = Truck(length=600, width=240, height=260)
        cartons = [
            CartonType(length=50, width=40, height=30),
            CartonType(length=60, width=45, height=35),
            CartonType(length=55, width=42, height=32)
        ]
        
        # Pack cartons
        packed_cartons = self.space_optimizer.pack_cartons(truck, cartons)
        
        # Calculate space utilization
        total_truck_volume = truck.length * truck.width * truck.height
        total_carton_volume = sum(carton.length * carton.width * carton.height for carton in packed_cartons)
        utilization_percentage = (total_carton_volume / total_truck_volume) * 100
        
        assert utilization_percentage > 0, "Space utilization should be greater than 0%"
        assert utilization_percentage <= 100, "Space utilization cannot exceed 100%"
        assert len(packed_cartons) > 0, "At least some cartons should be packed"

    def test_remaining_space_recommendations(self):
        """Test generating recommendations for remaining space"""
        truck = Truck(length=600, width=240, height=260)
        initial_cartons = [
            CartonType(length=50, width=40, height=30),
            CartonType(length=60, width=45, height=35)
        ]
        
        # Pack initial cartons
        packed_cartons = self.space_optimizer.pack_cartons(truck, initial_cartons)
        
        # Get remaining space
        remaining_volume = self.space_optimizer.calculate_remaining_volume(truck, packed_cartons)
        
        # Generate recommendations for additional cartons
        recommended_cartons = self.ml_optimizer.recommend_cartons_for_remaining_space(
            truck, packed_cartons, remaining_volume
        )
        
        assert recommended_cartons is not None, "Should generate carton recommendations"
        assert len(recommended_cartons) > 0, "Should recommend at least one carton"
        
        # Verify recommendations fit in remaining space
        total_recommended_volume = sum(
            carton['volume_per_carton'] 
            for carton in recommended_cartons
        )
        assert total_recommended_volume <= remaining_volume, "Recommended cartons should fit in remaining space"

    def test_edge_cases_space_optimization(self):
        """Test edge cases for space optimization"""
        test_scenarios = [
            # Empty truck
            {"truck": Truck(length=600, width=240, height=260), "cartons": []},
            
            # Truck with single large carton
            {"truck": Truck(length=600, width=240, height=260), "cartons": [
                CartonType(length=590, width=230, height=250)
            ]},
            
            # Truck with many small cartons
            {"truck": Truck(length=600, width=240, height=260), "cartons": [
                CartonType(length=50, width=40, height=30) for _ in range(50)
            ]}
        ]
        
        for scenario in test_scenarios:
            truck = scenario["truck"]
            cartons = scenario["cartons"]
            
            packed_cartons = self.space_optimizer.pack_cartons(truck, cartons)
            
            remaining_volume = self.space_optimizer.calculate_remaining_volume(truck, packed_cartons)
            recommended_cartons = self.ml_optimizer.recommend_cartons_for_remaining_space(
                truck, packed_cartons, remaining_volume
            )
            
            # Assertions for each scenario
            assert remaining_volume >= 0, "Remaining volume cannot be negative"
            assert len(recommended_cartons) >= 0, "Recommendations can be empty but not None"

    def test_performance_space_optimization(self):
        """Test performance of space optimization calculations"""
        import time
        
        truck = Truck(length=600, width=240, height=260)
        cartons = [CartonType(length=50, width=40, height=30) for _ in range(100)]
        
        start_time = time.time()
        packed_cartons = self.space_optimizer.pack_cartons(truck, cartons)
        remaining_volume = self.space_optimizer.calculate_remaining_volume(truck, packed_cartons)
        recommended_cartons = self.ml_optimizer.recommend_cartons_for_remaining_space(
            truck, packed_cartons, remaining_volume
        )
        end_time = time.time()
        
        # Performance assertions
        assert end_time - start_time < 1.0, "Optimization should complete within 1 second"
        assert len(packed_cartons) > 0, "Should pack at least some cartons"
        assert len(recommended_cartons) >= 0, "Can generate recommendations"

    def test_api_endpoint_integration(self, test_client):
        """Test API endpoints for space optimization"""
        # Test getting space optimization data
        response = test_client.get('/api/space-optimization/1')
        assert response.status_code == 200, "API should return successful response"
        
        optimization_data = json.loads(response.data)
        assert 'utilization' in optimization_data, "Should include space utilization"
        assert 'recommended_cartons' in optimization_data, "Should include carton recommendations"
        
        # Test applying optimizations
        test_payload = {
            "truck_id": 1,
            "additional_cartons": [
                {"length": 50, "width": 40, "height": 30}
            ]
        }
        response = test_client.post('/api/space-optimization/apply', json=test_payload)
        assert response.status_code == 200, "Should successfully apply optimizations"
        
        application_result = json.loads(response.data)
        assert 'success' in application_result, "Should confirm successful optimization application"
        assert application_result['success'] is True, "Optimization application should succeed"

# Run with: pytest test_remaining_space_optimization.py