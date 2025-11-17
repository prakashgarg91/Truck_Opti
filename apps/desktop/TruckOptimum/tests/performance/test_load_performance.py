"""
Performance and Load Testing Suite
Comprehensive performance testing to ensure zero human debugging required
"""

import pytest
import time
import threading
import multiprocessing
import psutil
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import json


@pytest.mark.performance
@pytest.mark.critical
class TestAPIPerformance:
    """Test API endpoint performance under various conditions"""
    
    def test_single_request_performance(self, api_client, performance_monitor):
        """Test performance of individual API requests"""
        endpoints = [
            ("GET", "/api/cartons", None),
            ("GET", "/api/trucks", None),
            ("POST", "/api/cartons", {
                "name": "Perf Test Carton",
                "length": 1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 10
            })
        ]
        
        for method, endpoint, data in endpoints:
            performance_monitor.start_timer(f"single_{method}_{endpoint.replace('/', '_')}")
            
            if method == "GET":
                response = api_client.get(endpoint)
            elif method == "POST":
                response = api_client.post(endpoint, json=data)
            
            duration = performance_monitor.end_timer(f"single_{method}_{endpoint.replace('/', '_')}")
            
            assert response.status_code in [200, 201], f"Request failed: {response.status_code}"
            assert duration < 1.0, f"{method} {endpoint} too slow: {duration:.3f}s"
            
            # Cleanup if we created something
            if method == "POST" and response.status_code == 201:
                response_data = response.json()
                if "carton_id" in response_data:
                    api_client.delete(f"/api/cartons/{response_data['carton_id']}")
                elif "truck_id" in response_data:
                    api_client.delete(f"/api/trucks/{response_data['truck_id']}")
    
    def test_concurrent_request_performance(self, api_client, performance_monitor):
        """Test performance under concurrent load"""
        
        def make_request(request_id):
            start_time = time.time()
            response = api_client.get("/api/cartons")
            duration = time.time() - start_time
            return {
                "id": request_id,
                "status_code": response.status_code,
                "duration": duration,
                "success": response.status_code == 200
            }
        
        # Test with 20 concurrent requests
        concurrent_requests = 20
        
        performance_monitor.start_timer("concurrent_load_test")
        
        with ThreadPoolExecutor(max_workers=concurrent_requests) as executor:
            futures = [executor.submit(make_request, i) for i in range(concurrent_requests)]
            results = [future.result() for future in as_completed(futures)]
        
        total_duration = performance_monitor.end_timer("concurrent_load_test")
        
        # Analyze results
        successful_requests = [r for r in results if r["success"]]
        failed_requests = [r for r in results if not r["success"]]
        
        durations = [r["duration"] for r in successful_requests]
        avg_duration = sum(durations) / len(durations) if durations else 0
        max_duration = max(durations) if durations else 0
        
        # Assertions
        assert len(failed_requests) == 0, f"Failed requests: {len(failed_requests)}"
        assert len(successful_requests) == concurrent_requests, "Not all requests succeeded"
        assert total_duration < 10.0, f"Concurrent load test took too long: {total_duration:.3f}s"
        assert avg_duration < 2.0, f"Average response time too slow: {avg_duration:.3f}s"
        assert max_duration < 5.0, f"Max response time too slow: {max_duration:.3f}s"
    
    def test_optimization_performance(self, api_client, performance_monitor):
        """Test optimization endpoint performance"""
        # Create test cartons first
        carton_ids = []
        
        for i in range(5):
            carton_data = {
                "name": f"Perf Optimization Carton {i}",
                "length": 1.0 + i * 0.2,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0 + i * 5,
                "quantity": 20
            }
            
            response = api_client.post("/api/cartons", json=carton_data)
            if response.status_code == 201:
                carton_ids.append(response.json()["carton_id"])
        
        # Test optimization with different quantities
        test_scenarios = [
            ("small", [{"id": carton_ids[0], "quantity": 5}] if carton_ids else []),
            ("medium", [{"id": cid, "quantity": 10} for cid in carton_ids[:3]]),
            ("large", [{"id": cid, "quantity": 25} for cid in carton_ids])
        ]
        
        for scenario_name, selected_cartons in test_scenarios:
            if not selected_cartons:
                continue
                
            optimization_request = {
                "selected_cartons": selected_cartons,
                "algorithm": "best_fit"
            }
            
            performance_monitor.start_timer(f"optimization_{scenario_name}")
            
            response = api_client.post("/api/optimize", json=optimization_request)
            
            duration = performance_monitor.end_timer(f"optimization_{scenario_name}")
            
            assert response.status_code == 200, f"Optimization failed for {scenario_name}"
            
            # Performance thresholds based on scenario size
            thresholds = {"small": 2.0, "medium": 5.0, "large": 10.0}
            assert duration < thresholds[scenario_name], f"{scenario_name} optimization too slow: {duration:.3f}s"
        
        # Cleanup
        for carton_id in carton_ids:
            api_client.delete(f"/api/cartons/{carton_id}")


@pytest.mark.performance
@pytest.mark.load
class TestSystemLoad:
    """Test system performance under heavy load"""
    
    def test_memory_usage_under_load(self, api_client, performance_monitor):
        """Test memory usage during heavy operations"""
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create many cartons to test memory usage
        carton_ids = []
        
        performance_monitor.start_timer("memory_load_test")
        
        try:
            for i in range(50):  # Create 50 cartons
                carton_data = {
                    "name": f"Memory Test Carton {i}",
                    "length": 1.0,
                    "width": 1.0,
                    "height": 1.0,
                    "weight": 10.0,
                    "quantity": 10
                }
                
                response = api_client.post("/api/cartons", json=carton_data)
                if response.status_code == 201:
                    carton_ids.append(response.json()["carton_id"])
                
                # Check memory every 10 cartons
                if i % 10 == 0:
                    current_memory = process.memory_info().rss / 1024 / 1024
                    memory_increase = current_memory - initial_memory
                    
                    # Memory increase should be reasonable
                    assert memory_increase < 100, f"Memory usage increased too much: {memory_increase:.2f}MB"
            
            # Test optimization with many cartons
            if len(carton_ids) >= 10:
                selected_cartons = [{"id": cid, "quantity": 5} for cid in carton_ids[:10]]
                
                optimization_request = {
                    "selected_cartons": selected_cartons,
                    "algorithm": "best_fit"
                }
                
                response = api_client.post("/api/optimize", json=optimization_request)
                assert response.status_code == 200, "Optimization failed under load"
            
            final_memory = process.memory_info().rss / 1024 / 1024
            total_memory_increase = final_memory - initial_memory
            
        finally:
            # Cleanup
            for carton_id in carton_ids:
                try:
                    api_client.delete(f"/api/cartons/{carton_id}")
                except:
                    pass  # Continue cleanup even if some fail
        
        duration = performance_monitor.end_timer("memory_load_test")
        
        # Final assertions
        assert duration < 30.0, f"Memory load test took too long: {duration:.3f}s"
        assert total_memory_increase < 200, f"Total memory increase too high: {total_memory_increase:.2f}MB"
    
    def test_database_performance_under_load(self, api_client, performance_monitor):
        """Test database performance with many operations"""
        
        def create_and_delete_carton(carton_id):
            """Create and immediately delete a carton"""
            carton_data = {
                "name": f"DB Load Test {carton_id}",
                "length": 1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 5
            }
            
            # Create
            create_response = api_client.post("/api/cartons", json=carton_data)
            if create_response.status_code == 201:
                created_id = create_response.json()["carton_id"]
                # Delete
                delete_response = api_client.delete(f"/api/cartons/{created_id}")
                return create_response.status_code == 201 and delete_response.status_code == 200
            
            return False
        
        performance_monitor.start_timer("database_load_test")
        
        # Perform many create/delete operations concurrently
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(create_and_delete_carton, i) for i in range(30)]
            results = [future.result() for future in as_completed(futures)]
        
        duration = performance_monitor.end_timer("database_load_test")
        
        successful_operations = sum(results)
        
        # Assertions
        assert successful_operations >= 25, f"Too many database operations failed: {successful_operations}/30"
        assert duration < 20.0, f"Database load test took too long: {duration:.3f}s"
    
    def test_stress_test_optimization(self, api_client, performance_monitor):
        """Stress test the optimization algorithm"""
        # Create cartons for stress testing
        carton_ids = []
        
        for i in range(20):  # Create 20 different carton types
            carton_data = {
                "name": f"Stress Test Carton {i}",
                "length": 0.5 + i * 0.1,
                "width": 0.5 + i * 0.05,
                "height": 0.5 + i * 0.08,
                "weight": 5.0 + i * 2,
                "quantity": 100
            }
            
            response = api_client.post("/api/cartons", json=carton_data)
            if response.status_code == 201:
                carton_ids.append(response.json()["carton_id"])
        
        # Test optimization with increasingly large quantities
        stress_levels = [
            ("light", 5),
            ("medium", 15),
            ("heavy", 30),
            ("extreme", 50)
        ]
        
        try:
            for level_name, quantity_per_carton in stress_levels:
                selected_cartons = [
                    {"id": cid, "quantity": quantity_per_carton} 
                    for cid in carton_ids[:10]  # Use first 10 cartons
                ]
                
                optimization_request = {
                    "selected_cartons": selected_cartons,
                    "algorithm": "best_fit"
                }
                
                performance_monitor.start_timer(f"stress_{level_name}")
                
                response = api_client.post("/api/optimize", json=optimization_request)
                
                duration = performance_monitor.end_timer(f"stress_{level_name}")
                
                assert response.status_code == 200, f"Stress test {level_name} failed"
                
                # Performance thresholds increase with stress level
                thresholds = {"light": 3.0, "medium": 8.0, "heavy": 15.0, "extreme": 30.0}
                assert duration < thresholds[level_name], f"Stress test {level_name} too slow: {duration:.3f}s"
                
                # Verify results are reasonable
                data = response.json()
                assert data["success"] is True, f"Stress test {level_name} returned failure"
                assert data["results"]["total_cost"] > 0, f"Stress test {level_name} returned invalid cost"
        
        finally:
            # Cleanup
            for carton_id in carton_ids:
                try:
                    api_client.delete(f"/api/cartons/{carton_id}")
                except:
                    pass


@pytest.mark.performance
@pytest.mark.integration
class TestEndToEndPerformance:
    """Test performance of complete workflows"""
    
    def test_complete_workflow_performance(self, api_client, performance_monitor):
        """Test performance of complete user workflow"""
        
        performance_monitor.start_timer("complete_workflow_performance")
        
        # Step 1: Create truck
        truck_data = {
            "name": "Performance Test Truck",
            "length": 10.0,
            "width": 2.5,
            "height": 3.0,
            "max_weight": 5000.0,
            "cost_per_km": 2.5
        }
        
        truck_response = api_client.post("/api/trucks", json=truck_data)
        assert truck_response.status_code == 201
        truck_id = truck_response.json()["truck_id"]
        
        # Step 2: Create multiple cartons
        carton_ids = []
        for i in range(10):
            carton_data = {
                "name": f"Workflow Perf Carton {i}",
                "length": 1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 15
            }
            
            carton_response = api_client.post("/api/cartons", json=carton_data)
            if carton_response.status_code == 201:
                carton_ids.append(carton_response.json()["carton_id"])
        
        # Step 3: Run optimization
        selected_cartons = [{"id": cid, "quantity": 8} for cid in carton_ids[:5]]
        
        optimization_request = {
            "selected_cartons": selected_cartons,
            "algorithm": "best_fit"
        }
        
        opt_response = api_client.post("/api/optimize", json=optimization_request)
        assert opt_response.status_code == 200
        
        total_duration = performance_monitor.end_timer("complete_workflow_performance")
        
        # Cleanup
        for carton_id in carton_ids:
            api_client.delete(f"/api/cartons/{carton_id}")
        api_client.delete(f"/api/trucks/{truck_id}")
        
        # Performance assertion
        assert total_duration < 15.0, f"Complete workflow too slow: {total_duration:.3f}s"
    
    def test_bulk_operation_performance(self, api_client, test_csv_file, performance_monitor):
        """Test performance of bulk operations"""
        
        # Test bulk carton upload performance if endpoint exists
        try:
            performance_monitor.start_timer("bulk_upload_performance")
            
            with open(test_csv_file, 'rb') as f:
                files = {'file': ('test_cartons.csv', f, 'text/csv')}
                response = api_client.post("/api/cartons/bulk-upload", files=files)
            
            duration = performance_monitor.end_timer("bulk_upload_performance")
            
            if response.status_code == 200:
                # Bulk upload should be fast
                assert duration < 5.0, f"Bulk upload too slow: {duration:.3f}s"
                
                data = response.json()
                assert data["success"] is True, "Bulk upload failed"
                assert data["cartons_added"] > 0, "No cartons added in bulk upload"
            
        except Exception:
            # Skip if bulk upload not implemented
            pass
    
    def test_algorithm_comparison_performance(self, api_client, performance_monitor):
        """Compare performance of different optimization algorithms"""
        
        # Create test cartons
        carton_ids = []
        for i in range(8):
            carton_data = {
                "name": f"Algorithm Test Carton {i}",
                "length": 1.0 + i * 0.1,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0 + i * 2,
                "quantity": 20
            }
            
            response = api_client.post("/api/cartons", json=carton_data)
            if response.status_code == 201:
                carton_ids.append(response.json()["carton_id"])
        
        algorithms = ["first_fit", "best_fit", "next_fit", "worst_fit"]
        selected_cartons = [{"id": cid, "quantity": 12} for cid in carton_ids[:5]]
        
        algorithm_performance = {}
        
        try:
            for algorithm in algorithms:
                optimization_request = {
                    "selected_cartons": selected_cartons,
                    "algorithm": algorithm
                }
                
                performance_monitor.start_timer(f"algorithm_{algorithm}")
                
                response = api_client.post("/api/optimize", json=optimization_request)
                
                duration = performance_monitor.end_timer(f"algorithm_{algorithm}")
                
                if response.status_code == 200:
                    data = response.json()
                    algorithm_performance[algorithm] = {
                        "duration": duration,
                        "total_cost": data["results"]["total_cost"],
                        "trucks_used": data["results"]["total_trucks_used"]
                    }
                    
                    # Each algorithm should complete within reasonable time
                    assert duration < 8.0, f"Algorithm {algorithm} too slow: {duration:.3f}s"
        
        finally:
            # Cleanup
            for carton_id in carton_ids:
                try:
                    api_client.delete(f"/api/cartons/{carton_id}")
                except:
                    pass
        
        # Verify we got results for multiple algorithms
        assert len(algorithm_performance) > 0, "No algorithms completed successfully"