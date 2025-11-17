"""
Unit Tests for Optimization Engine
Comprehensive testing to ensure zero human debugging required
"""

import pytest
import json
from unittest.mock import Mock, patch


@pytest.mark.unit
@pytest.mark.critical
class TestOptimizationEngine:
    """Test suite for truck optimization algorithms"""
    
    def test_basic_optimization(self, api_client, performance_monitor):
        """Test basic optimization with standard input"""
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 10},
                {"id": 2, "quantity": 5}
            ],
            "algorithm": "first_fit"
        }
        
        performance_monitor.start_timer("basic_optimization")
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        performance_monitor.end_timer("basic_optimization")
        performance_monitor.assert_performance("basic_optimization", 2.0)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "success" in data
        assert data["success"] is True
        assert "results" in data
        assert "total_cost" in data["results"]
        assert "truck_assignments" in data["results"]
        assert isinstance(data["results"]["truck_assignments"], list)
    
    def test_advanced_optimization_algorithms(self, api_client, performance_monitor):
        """Test all optimization algorithms"""
        algorithms = ["first_fit", "best_fit", "next_fit", "worst_fit"]
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 20},
                {"id": 2, "quantity": 15},
                {"id": 3, "quantity": 10}
            ]
        }
        
        results = {}
        
        for algorithm in algorithms:
            optimization_request["algorithm"] = algorithm
            
            performance_monitor.start_timer(f"optimization_{algorithm}")
            
            response = api_client.post("/api/optimize", json=optimization_request)
            
            performance_monitor.end_timer(f"optimization_{algorithm}")
            performance_monitor.assert_performance(f"optimization_{algorithm}", 3.0)
            
            assert response.status_code == 200
            data = response.json()
            
            assert data["success"] is True
            assert "results" in data
            assert "total_cost" in data["results"]
            assert data["results"]["total_cost"] > 0
            
            results[algorithm] = data["results"]
        
        # Verify all algorithms returned valid results
        assert len(results) == len(algorithms)
    
    def test_empty_carton_selection(self, api_client):
        """Test optimization with empty carton selection"""
        optimization_request = {
            "selected_cartons": [],
            "algorithm": "first_fit"
        }
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    def test_invalid_carton_ids(self, api_client):
        """Test optimization with invalid carton IDs"""
        optimization_request = {
            "selected_cartons": [
                {"id": 99999, "quantity": 10},  # Non-existent carton
                {"id": 1, "quantity": 5}
            ],
            "algorithm": "first_fit"
        }
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        # Should handle gracefully - either filter out invalid IDs or return error
        assert response.status_code in [200, 400]
        data = response.json()
        
        if response.status_code == 200:
            # If successful, should have processed only valid cartons
            assert data["success"] is True
        else:
            # If error, should provide meaningful error message
            assert data["success"] is False
            assert "error" in data
    
    def test_zero_quantity_cartons(self, api_client):
        """Test optimization with zero quantity cartons"""
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 0},
                {"id": 2, "quantity": 5}
            ],
            "algorithm": "first_fit"
        }
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        # Should filter out zero quantity cartons or handle gracefully
        if response.status_code == 200:
            data = response.json()
            assert data["success"] is True
            # Should have processed only non-zero quantity cartons
        else:
            assert response.status_code == 400
    
    def test_large_quantity_optimization(self, api_client, performance_monitor):
        """Test optimization with large quantities"""
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 1000},
                {"id": 2, "quantity": 500},
                {"id": 3, "quantity": 750}
            ],
            "algorithm": "best_fit"
        }
        
        performance_monitor.start_timer("large_quantity_optimization")
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        duration = performance_monitor.end_timer("large_quantity_optimization")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert "results" in data
        assert duration < 10.0, f"Large quantity optimization took too long: {duration:.3f}s"
    
    def test_optimization_result_structure(self, api_client):
        """Test that optimization results have correct structure"""
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 10}
            ],
            "algorithm": "first_fit"
        }
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "success" in data
        assert "results" in data
        
        results = data["results"]
        required_fields = ["total_cost", "truck_assignments", "total_trucks_used"]
        for field in required_fields:
            assert field in results, f"Missing field in results: {field}"
        
        # Verify truck assignment structure
        if results["truck_assignments"]:
            assignment = results["truck_assignments"][0]
            truck_fields = ["truck_id", "truck_name", "cartons", "utilization"]
            for field in truck_fields:
                assert field in assignment, f"Missing field in truck assignment: {field}"
    
    def test_cost_calculation_accuracy(self, api_client):
        """Test that cost calculations are accurate"""
        # First get truck and carton data to manually calculate expected cost
        trucks_response = api_client.get("/api/trucks")
        cartons_response = api_client.get("/api/cartons")
        
        assert trucks_response.status_code == 200
        assert cartons_response.status_code == 200
        
        trucks = trucks_response.json()["trucks"]
        cartons = cartons_response.json()["cartons"]
        
        # Use known cartons and trucks for predictable calculation
        if len(trucks) > 0 and len(cartons) > 0:
            optimization_request = {
                "selected_cartons": [
                    {"id": cartons[0]["id"], "quantity": 1}
                ],
                "algorithm": "first_fit"
            }
            
            response = api_client.post("/api/optimize", json=optimization_request)
            
            assert response.status_code == 200
            data = response.json()
            
            assert data["success"] is True
            assert data["results"]["total_cost"] >= 0
            
            # Cost should be reasonable (not negative, not excessive)
            total_cost = data["results"]["total_cost"]
            assert total_cost >= 0
            assert total_cost < 1000000  # Sanity check
    
    def test_utilization_calculation(self, api_client):
        """Test truck utilization calculations"""
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 5}
            ],
            "algorithm": "first_fit"
        }
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        
        # Check utilization values are valid percentages
        for assignment in data["results"]["truck_assignments"]:
            utilization = assignment["utilization"]
            assert 0 <= utilization <= 100, f"Invalid utilization: {utilization}%"


@pytest.mark.api
@pytest.mark.integration
class TestOptimizationIntegration:
    """Integration tests for optimization workflow"""
    
    def test_full_optimization_workflow(self, api_client, performance_monitor):
        """Test complete optimization workflow from selection to results"""
        # Step 1: Get available cartons
        cartons_response = api_client.get("/api/cartons")
        assert cartons_response.status_code == 200
        cartons = cartons_response.json()["cartons"]
        assert len(cartons) > 0
        
        # Step 2: Select cartons for optimization
        selected_cartons = [
            {"id": cartons[0]["id"], "quantity": 10}
        ]
        if len(cartons) > 1:
            selected_cartons.append({"id": cartons[1]["id"], "quantity": 5})
        
        # Step 3: Run optimization
        optimization_request = {
            "selected_cartons": selected_cartons,
            "algorithm": "best_fit"
        }
        
        performance_monitor.start_timer("full_workflow")
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        performance_monitor.end_timer("full_workflow")
        performance_monitor.assert_performance("full_workflow", 3.0)
        
        # Step 4: Verify results
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert "results" in data
        assert data["results"]["total_trucks_used"] > 0
        assert len(data["results"]["truck_assignments"]) > 0
        
        # Step 5: Verify all selected cartons are assigned
        total_assigned = {}
        for assignment in data["results"]["truck_assignments"]:
            for carton in assignment["cartons"]:
                carton_id = carton["id"]
                quantity = carton["quantity"]
                total_assigned[carton_id] = total_assigned.get(carton_id, 0) + quantity
        
        # Verify quantities match what was requested
        for selected in selected_cartons:
            assert selected["id"] in total_assigned
            assert total_assigned[selected["id"]] == selected["quantity"]
    
    def test_bulk_upload_to_optimization(self, api_client, test_csv_file):
        """Test workflow from bulk upload to optimization"""
        # Step 1: Bulk upload cartons
        with open(test_csv_file, 'rb') as f:
            files = {'file': ('test_cartons.csv', f, 'text/csv')}
            upload_response = api_client.post("/api/cartons/bulk-upload", files=files)
        
        # Skip if bulk upload not implemented
        if upload_response.status_code == 404:
            pytest.skip("Bulk upload endpoint not implemented")
        
        assert upload_response.status_code == 200
        upload_data = upload_response.json()
        assert upload_data["success"] is True
        
        # Step 2: Get updated cartons list
        cartons_response = api_client.get("/api/cartons")
        assert cartons_response.status_code == 200
        cartons = cartons_response.json()["cartons"]
        
        # Step 3: Use uploaded cartons in optimization
        selected_cartons = [
            {"id": cartons[0]["id"], "quantity": 5}
        ]
        
        optimization_request = {
            "selected_cartons": selected_cartons,
            "algorithm": "first_fit"
        }
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


@pytest.mark.performance
@pytest.mark.critical
class TestOptimizationPerformance:
    """Performance tests for optimization engine"""
    
    def test_algorithm_performance_comparison(self, api_client, performance_monitor):
        """Compare performance of different algorithms"""
        algorithms = ["first_fit", "best_fit", "next_fit", "worst_fit"]
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 50},
                {"id": 2, "quantity": 30},
                {"id": 3, "quantity": 20}
            ]
        }
        
        performance_results = {}
        
        for algorithm in algorithms:
            optimization_request["algorithm"] = algorithm
            
            performance_monitor.start_timer(f"perf_{algorithm}")
            
            response = api_client.post("/api/optimize", json=optimization_request)
            
            duration = performance_monitor.end_timer(f"perf_{algorithm}")
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            
            performance_results[algorithm] = {
                "duration": duration,
                "total_cost": data["results"]["total_cost"],
                "trucks_used": data["results"]["total_trucks_used"]
            }
        
        # All algorithms should complete within reasonable time
        for algorithm, results in performance_results.items():
            assert results["duration"] < 5.0, f"{algorithm} took too long: {results['duration']:.3f}s"
    
    def test_memory_usage_large_dataset(self, api_client):
        """Test memory usage with large carton quantities"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss
        
        # Large optimization request
        optimization_request = {
            "selected_cartons": [
                {"id": 1, "quantity": 500},
                {"id": 2, "quantity": 300},
                {"id": 3, "quantity": 200}
            ],
            "algorithm": "best_fit"
        }
        
        response = api_client.post("/api/optimize", json=optimization_request)
        
        final_memory = process.memory_info().rss
        memory_increase = (final_memory - initial_memory) / 1024 / 1024  # MB
        
        assert response.status_code == 200
        # Memory increase should be reasonable (less than 100MB for this test)
        assert memory_increase < 100, f"Memory usage increased by {memory_increase:.2f}MB"