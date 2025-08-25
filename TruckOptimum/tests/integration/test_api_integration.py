"""
Integration Tests for API Endpoints
Comprehensive testing to ensure zero human debugging required
"""

import pytest
import json
import time
from unittest.mock import Mock, patch


@pytest.mark.integration
@pytest.mark.api
class TestAPIIntegration:
    """Integration tests for API workflow"""
    
    def test_complete_data_workflow(self, api_client, performance_monitor):
        """Test complete workflow: create trucks, cartons, and optimize"""
        performance_monitor.start_timer("complete_workflow")
        
        # Step 1: Create a truck
        new_truck = {
            "name": "Integration Test Truck",
            "length": 8.0,
            "width": 2.5,
            "height": 2.5,
            "max_weight": 3000.0,
            "cost_per_km": 2.0
        }
        
        truck_response = api_client.post("/api/trucks", json=new_truck)
        assert truck_response.status_code == 201
        truck_id = truck_response.json()["truck_id"]
        
        # Step 2: Create cartons
        cartons_to_create = [
            {
                "name": "Integration Carton 1",
                "length": 1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 20
            },
            {
                "name": "Integration Carton 2",
                "length": 1.5,
                "width": 1.0,
                "height": 0.5,
                "weight": 15.0,
                "quantity": 15
            }
        ]
        
        carton_ids = []
        for carton in cartons_to_create:
            carton_response = api_client.post("/api/cartons", json=carton)
            assert carton_response.status_code == 201
            carton_ids.append(carton_response.json()["carton_id"])
        
        # Step 3: Run optimization
        optimization_request = {
            "selected_cartons": [
                {"id": carton_ids[0], "quantity": 10},
                {"id": carton_ids[1], "quantity": 5}
            ],
            "algorithm": "best_fit"
        }
        
        opt_response = api_client.post("/api/optimize", json=optimization_request)
        assert opt_response.status_code == 200
        opt_data = opt_response.json()
        assert opt_data["success"] is True
        
        # Step 4: Verify optimization results
        results = opt_data["results"]
        assert "total_cost" in results
        assert "truck_assignments" in results
        assert results["total_trucks_used"] > 0
        
        performance_monitor.end_timer("complete_workflow")
        performance_monitor.assert_performance("complete_workflow", 5.0)
        
        # Cleanup
        for carton_id in carton_ids:
            api_client.delete(f"/api/cartons/{carton_id}")
        api_client.delete(f"/api/trucks/{truck_id}")
    
    def test_data_consistency(self, api_client):
        """Test data consistency across operations"""
        # Create a carton
        new_carton = {
            "name": "Consistency Test Carton",
            "length": 2.0,
            "width": 1.5,
            "height": 1.0,
            "weight": 25.0,
            "quantity": 30
        }
        
        create_response = api_client.post("/api/cartons", json=new_carton)
        assert create_response.status_code == 201
        carton_id = create_response.json()["carton_id"]
        
        # Verify carton appears in list
        list_response = api_client.get("/api/cartons")
        assert list_response.status_code == 200
        cartons = list_response.json()["cartons"]
        
        created_carton = next((c for c in cartons if c["id"] == carton_id), None)
        assert created_carton is not None
        assert created_carton["name"] == new_carton["name"]
        assert created_carton["quantity"] == new_carton["quantity"]
        
        # Update the carton
        updated_data = {
            "name": "Updated Consistency Carton",
            "length": 2.5,
            "width": 1.5,
            "height": 1.0,
            "weight": 30.0,
            "quantity": 25
        }
        
        update_response = api_client.put(f"/api/cartons/{carton_id}", json=updated_data)
        assert update_response.status_code == 200
        
        # Verify update consistency
        updated_list_response = api_client.get("/api/cartons")
        updated_cartons = updated_list_response.json()["cartons"]
        
        updated_carton = next((c for c in updated_cartons if c["id"] == carton_id), None)
        assert updated_carton is not None
        assert updated_carton["name"] == updated_data["name"]
        assert updated_carton["quantity"] == updated_data["quantity"]
        
        # Cleanup
        api_client.delete(f"/api/cartons/{carton_id}")
    
    def test_error_handling_consistency(self, api_client):
        """Test consistent error handling across endpoints"""
        # Test 404 errors
        endpoints_404 = [
            ("GET", "/api/cartons/99999"),
            ("PUT", "/api/cartons/99999"),
            ("DELETE", "/api/cartons/99999"),
            ("GET", "/api/trucks/99999"),
            ("PUT", "/api/trucks/99999"),
            ("DELETE", "/api/trucks/99999")
        ]
        
        for method, endpoint in endpoints_404:
            if method == "GET":
                response = api_client.get(endpoint)
            elif method == "PUT":
                response = api_client.put(endpoint, json={"name": "test"})
            elif method == "DELETE":
                response = api_client.delete(endpoint)
            
            assert response.status_code == 404
            data = response.json()
            assert "success" in data
            assert data["success"] is False
            assert "error" in data
        
        # Test 400 errors with invalid data
        invalid_data_endpoints = [
            ("POST", "/api/cartons", {"invalid": "data"}),
            ("POST", "/api/trucks", {"invalid": "data"}),
            ("PUT", "/api/cartons/1", {"invalid": "data"}),
            ("PUT", "/api/trucks/1", {"invalid": "data"})
        ]
        
        for method, endpoint, data in invalid_data_endpoints:
            if method == "POST":
                response = api_client.post(endpoint, json=data)
            elif method == "PUT":
                response = api_client.put(endpoint, json=data)
            
            assert response.status_code == 400
            response_data = response.json()
            assert "success" in response_data
            assert response_data["success"] is False
            assert "error" in response_data


@pytest.mark.integration
@pytest.mark.database
class TestDatabaseIntegration:
    """Integration tests for database operations"""
    
    def test_transaction_integrity(self, api_client):
        """Test database transaction integrity"""
        # Get initial counts
        initial_cartons = api_client.get("/api/cartons")
        initial_trucks = api_client.get("/api/trucks")
        
        initial_carton_count = len(initial_cartons.json()["cartons"])
        initial_truck_count = len(initial_trucks.json()["trucks"])
        
        # Create multiple items
        cartons_created = []
        trucks_created = []
        
        for i in range(3):
            carton_data = {
                "name": f"Transaction Test Carton {i}",
                "length": 1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 10
            }
            
            truck_data = {
                "name": f"Transaction Test Truck {i}",
                "length": 8.0,
                "width": 2.5,
                "height": 2.5,
                "max_weight": 3000.0,
                "cost_per_km": 2.0
            }
            
            carton_response = api_client.post("/api/cartons", json=carton_data)
            truck_response = api_client.post("/api/trucks", json=truck_data)
            
            if carton_response.status_code == 201:
                cartons_created.append(carton_response.json()["carton_id"])
            if truck_response.status_code == 201:
                trucks_created.append(truck_response.json()["truck_id"])
        
        # Verify counts increased
        current_cartons = api_client.get("/api/cartons")
        current_trucks = api_client.get("/api/trucks")
        
        current_carton_count = len(current_cartons.json()["cartons"])
        current_truck_count = len(current_trucks.json()["trucks"])
        
        assert current_carton_count == initial_carton_count + len(cartons_created)
        assert current_truck_count == initial_truck_count + len(trucks_created)
        
        # Cleanup
        for carton_id in cartons_created:
            api_client.delete(f"/api/cartons/{carton_id}")
        for truck_id in trucks_created:
            api_client.delete(f"/api/trucks/{truck_id}")
        
        # Verify cleanup
        final_cartons = api_client.get("/api/cartons")
        final_trucks = api_client.get("/api/trucks")
        
        final_carton_count = len(final_cartons.json()["cartons"])
        final_truck_count = len(final_trucks.json()["trucks"])
        
        assert final_carton_count == initial_carton_count
        assert final_truck_count == initial_truck_count
    
    def test_concurrent_database_operations(self, api_client):
        """Test concurrent database operations"""
        import threading
        import time
        
        results = []
        errors = []
        
        def create_carton(index):
            try:
                carton_data = {
                    "name": f"Concurrent Carton {index}",
                    "length": 1.0,
                    "width": 1.0,
                    "height": 1.0,
                    "weight": 10.0,
                    "quantity": 5
                }
                
                response = api_client.post("/api/cartons", json=carton_data)
                results.append((index, response.status_code, response.json()))
            except Exception as e:
                errors.append((index, str(e)))
        
        # Create 5 concurrent threads
        threads = []
        for i in range(5):
            thread = threading.Thread(target=create_carton, args=(i,))
            threads.append(thread)
        
        # Start all threads
        for thread in threads:
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join()
        
        # Verify results
        assert len(errors) == 0, f"Concurrent operations failed: {errors}"
        assert len(results) == 5
        
        # All should succeed
        created_ids = []
        for index, status_code, response_data in results:
            assert status_code == 201
            assert response_data["success"] is True
            created_ids.append(response_data["carton_id"])
        
        # Cleanup
        for carton_id in created_ids:
            api_client.delete(f"/api/cartons/{carton_id}")


@pytest.mark.integration
@pytest.mark.performance
class TestAPIPerformanceIntegration:
    """Performance integration tests"""
    
    def test_bulk_operations_performance(self, api_client, performance_monitor):
        """Test performance of bulk operations"""
        # Create multiple cartons in sequence
        carton_ids = []
        
        performance_monitor.start_timer("bulk_create_cartons")
        
        for i in range(20):
            carton_data = {
                "name": f"Bulk Carton {i}",
                "length": 1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 5
            }
            
            response = api_client.post("/api/cartons", json=carton_data)
            if response.status_code == 201:
                carton_ids.append(response.json()["carton_id"])
        
        create_duration = performance_monitor.end_timer("bulk_create_cartons")
        
        # Test bulk retrieval
        performance_monitor.start_timer("bulk_retrieve_cartons")
        
        response = api_client.get("/api/cartons")
        assert response.status_code == 200
        cartons = response.json()["cartons"]
        
        retrieve_duration = performance_monitor.end_timer("bulk_retrieve_cartons")
        
        # Test bulk optimization
        selected_cartons = [{"id": cid, "quantity": 2} for cid in carton_ids[:10]]
        
        performance_monitor.start_timer("bulk_optimization")
        
        opt_response = api_client.post("/api/optimize", json={
            "selected_cartons": selected_cartons,
            "algorithm": "best_fit"
        })
        
        opt_duration = performance_monitor.end_timer("bulk_optimization")
        
        # Performance assertions
        assert create_duration < 10.0, f"Bulk create too slow: {create_duration:.3f}s"
        assert retrieve_duration < 1.0, f"Bulk retrieve too slow: {retrieve_duration:.3f}s"
        assert opt_duration < 5.0, f"Bulk optimization too slow: {opt_duration:.3f}s"
        
        # Cleanup
        performance_monitor.start_timer("bulk_cleanup")
        
        for carton_id in carton_ids:
            api_client.delete(f"/api/cartons/{carton_id}")
        
        cleanup_duration = performance_monitor.end_timer("bulk_cleanup")
        assert cleanup_duration < 5.0, f"Bulk cleanup too slow: {cleanup_duration:.3f}s"
    
    def test_api_response_times(self, api_client, performance_monitor):
        """Test individual API response times"""
        endpoints_to_test = [
            ("GET", "/api/cartons"),
            ("GET", "/api/trucks"),
        ]
        
        for method, endpoint in endpoints_to_test:
            # Test multiple times for consistency
            times = []
            
            for i in range(5):
                performance_monitor.start_timer(f"{method}_{endpoint}_{i}")
                
                if method == "GET":
                    response = api_client.get(endpoint)
                
                duration = performance_monitor.end_timer(f"{method}_{endpoint}_{i}")
                
                assert response.status_code == 200
                times.append(duration)
            
            # Average should be fast
            avg_time = sum(times) / len(times)
            max_time = max(times)
            
            assert avg_time < 0.5, f"{method} {endpoint} average too slow: {avg_time:.3f}s"
            assert max_time < 1.0, f"{method} {endpoint} max too slow: {max_time:.3f}s"


@pytest.mark.integration
@pytest.mark.critical
class TestSystemIntegration:
    """Critical system integration tests"""
    
    def test_system_health_check(self, api_client):
        """Test overall system health"""
        # Test all main endpoints are responsive
        endpoints = [
            "/api/cartons",
            "/api/trucks"
        ]
        
        for endpoint in endpoints:
            response = api_client.get(endpoint)
            assert response.status_code == 200, f"Health check failed for {endpoint}"
            
            data = response.json()
            assert "success" in data
            assert data["success"] is True
    
    def test_data_validation_across_system(self, api_client):
        """Test data validation is consistent across the system"""
        # Test carton validation
        invalid_carton = {
            "name": "",  # Invalid: empty name
            "length": -1.0,  # Invalid: negative
            "width": 1.0,
            "height": 1.0,
            "weight": 10.0,
            "quantity": 5
        }
        
        carton_response = api_client.post("/api/cartons", json=invalid_carton)
        assert carton_response.status_code == 400
        assert carton_response.json()["success"] is False
        
        # Test truck validation
        invalid_truck = {
            "name": "",  # Invalid: empty name
            "length": -8.0,  # Invalid: negative
            "width": 2.5,
            "height": 2.5,
            "max_weight": 3000.0,
            "cost_per_km": 2.0
        }
        
        truck_response = api_client.post("/api/trucks", json=invalid_truck)
        assert truck_response.status_code == 400
        assert truck_response.json()["success"] is False
    
    def test_optimization_with_real_data(self, api_client):
        """Test optimization with realistic data scenarios"""
        # Get existing cartons and trucks
        cartons_response = api_client.get("/api/cartons")
        trucks_response = api_client.get("/api/trucks")
        
        assert cartons_response.status_code == 200
        assert trucks_response.status_code == 200
        
        cartons = cartons_response.json()["cartons"]
        trucks = trucks_response.json()["trucks"]
        
        if len(cartons) > 0 and len(trucks) > 0:
            # Test with multiple cartons and realistic quantities
            selected_cartons = []
            for i, carton in enumerate(cartons[:3]):  # Use first 3 cartons
                selected_cartons.append({
                    "id": carton["id"],
                    "quantity": min(carton["quantity"], 10)  # Reasonable quantity
                })
            
            if selected_cartons:
                optimization_request = {
                    "selected_cartons": selected_cartons,
                    "algorithm": "best_fit"
                }
                
                response = api_client.post("/api/optimize", json=optimization_request)
                assert response.status_code == 200
                
                data = response.json()
                assert data["success"] is True
                assert "results" in data
                
                # Verify reasonable results
                results = data["results"]
                assert results["total_cost"] >= 0
                assert results["total_trucks_used"] > 0
                assert len(results["truck_assignments"]) > 0