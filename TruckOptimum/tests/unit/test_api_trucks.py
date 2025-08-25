"""
Unit Tests for Truck API Endpoints
Comprehensive testing to ensure zero human debugging required
"""

import pytest
import json
import io
from unittest.mock import Mock, patch


@pytest.mark.api
@pytest.mark.unit
class TestTruckAPI:
    """Test suite for truck-related API endpoints"""
    
    def test_get_trucks_success(self, api_client, performance_monitor):
        """Test successful retrieval of trucks"""
        performance_monitor.start_timer("get_trucks")
        
        response = api_client.get("/api/trucks")
        
        performance_monitor.end_timer("get_trucks")
        performance_monitor.assert_performance("get_trucks", 0.5)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "success" in data
        assert data["success"] is True
        assert "trucks" in data
        assert isinstance(data["trucks"], list)
        assert len(data["trucks"]) > 0
        
        # Verify truck structure
        truck = data["trucks"][0]
        required_fields = ["id", "name", "length", "width", "height", "max_weight", "cost_per_km"]
        for field in required_fields:
            assert field in truck, f"Missing field: {field}"
    
    def test_create_truck_success(self, api_client, performance_monitor):
        """Test successful truck creation"""
        new_truck = {
            "name": "Test Truck",
            "length": 10.0,
            "width": 2.5,
            "height": 3.0,
            "max_weight": 5000.0,
            "cost_per_km": 2.5
        }
        
        performance_monitor.start_timer("create_truck")
        
        response = api_client.post("/api/trucks", json=new_truck)
        
        performance_monitor.end_timer("create_truck")
        performance_monitor.assert_performance("create_truck", 0.5)
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["success"] is True
        assert "truck_id" in data
        assert isinstance(data["truck_id"], int)
        
        # Verify truck was actually created
        get_response = api_client.get("/api/trucks")
        trucks = get_response.json()["trucks"]
        created_truck = next((t for t in trucks if t["id"] == data["truck_id"]), None)
        
        assert created_truck is not None
        assert created_truck["name"] == new_truck["name"]
        assert created_truck["length"] == new_truck["length"]
    
    def test_create_truck_invalid_data(self, api_client):
        """Test truck creation with invalid data"""
        invalid_trucks = [
            # Missing required fields
            {"name": "Incomplete Truck"},
            
            # Invalid data types
            {
                "name": "Invalid Truck",
                "length": "not_a_number",
                "width": 2.5,
                "height": 3.0,
                "max_weight": 5000.0,
                "cost_per_km": 2.5
            },
            
            # Negative values
            {
                "name": "Negative Truck",
                "length": -10.0,
                "width": 2.5,
                "height": 3.0,
                "max_weight": 5000.0,
                "cost_per_km": 2.5
            },
            
            # Empty name
            {
                "name": "",
                "length": 10.0,
                "width": 2.5,
                "height": 3.0,
                "max_weight": 5000.0,
                "cost_per_km": 2.5
            }
        ]
        
        for invalid_truck in invalid_trucks:
            response = api_client.post("/api/trucks", json=invalid_truck)
            assert response.status_code == 400
            data = response.json()
            assert data["success"] is False
            assert "error" in data
    
    def test_update_truck_success(self, api_client):
        """Test successful truck update"""
        # First get an existing truck
        get_response = api_client.get("/api/trucks")
        trucks = get_response.json()["trucks"]
        assert len(trucks) > 0
        
        truck_id = trucks[0]["id"]
        updated_data = {
            "name": "Updated Truck Name",
            "length": 12.0,
            "width": 3.0,
            "height": 3.5,
            "max_weight": 6000.0,
            "cost_per_km": 3.0
        }
        
        response = api_client.put(f"/api/trucks/{truck_id}", json=updated_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # Verify update
        get_response = api_client.get("/api/trucks")
        updated_truck = next((t for t in get_response.json()["trucks"] if t["id"] == truck_id), None)
        
        assert updated_truck["name"] == updated_data["name"]
        assert updated_truck["length"] == updated_data["length"]
    
    def test_update_nonexistent_truck(self, api_client):
        """Test updating a non-existent truck"""
        response = api_client.put("/api/trucks/99999", json={"name": "Test"})
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    def test_delete_truck_success(self, api_client):
        """Test successful truck deletion"""
        # Create a truck to delete
        new_truck = {
            "name": "To Delete",
            "length": 8.0,
            "width": 2.0,
            "height": 2.5,
            "max_weight": 3000.0,
            "cost_per_km": 2.0
        }
        
        create_response = api_client.post("/api/trucks", json=new_truck)
        truck_id = create_response.json()["truck_id"]
        
        # Delete the truck
        delete_response = api_client.delete(f"/api/trucks/{truck_id}")
        
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data["success"] is True
        
        # Verify deletion
        get_response = api_client.get("/api/trucks")
        trucks = get_response.json()["trucks"]
        deleted_truck = next((t for t in trucks if t["id"] == truck_id), None)
        assert deleted_truck is None
    
    def test_delete_nonexistent_truck(self, api_client):
        """Test deleting a non-existent truck"""
        response = api_client.delete("/api/trucks/99999")
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "error" in data


@pytest.mark.api
@pytest.mark.integration
class TestTruckBulkUpload:
    """Test suite for bulk truck upload functionality"""
    
    def test_bulk_upload_success(self, api_client, test_csv_truck_file, performance_monitor):
        """Test successful bulk truck upload from CSV"""
        performance_monitor.start_timer("bulk_upload_trucks")
        
        with open(test_csv_truck_file, 'rb') as f:
            files = {'file': ('test_trucks.csv', f, 'text/csv')}
            response = api_client.post("/api/trucks/bulk-upload", files=files)
        
        performance_monitor.end_timer("bulk_upload_trucks")
        performance_monitor.assert_performance("bulk_upload_trucks", 2.0)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert "trucks_added" in data
        assert data["trucks_added"] > 0
        assert "errors" in data
        assert isinstance(data["errors"], list)
    
    def test_bulk_upload_invalid_file(self, api_client):
        """Test bulk upload with invalid file"""
        # Test with no file
        response = api_client.post("/api/trucks/bulk-upload")
        assert response.status_code == 400
        
        # Test with invalid file content
        files = {'file': ('invalid.txt', io.StringIO("invalid content"), 'text/plain')}
        response = api_client.post("/api/trucks/bulk-upload", files=files)
        assert response.status_code in [400, 500]  # Should handle gracefully
    
    def test_bulk_upload_partial_success(self, api_client, invalid_csv_truck_file):
        """Test bulk upload with some valid and some invalid entries"""
        with open(invalid_csv_truck_file, 'rb') as f:
            files = {'file': ('invalid_trucks.csv', f, 'text/csv')}
            response = api_client.post("/api/trucks/bulk-upload", files=files)
        
        # Should still return 200 but with errors reported
        data = response.json()
        if response.status_code == 200:
            assert "errors" in data
            assert len(data["errors"]) > 0  # Should report the invalid entries


@pytest.mark.api
@pytest.mark.performance
class TestTruckAPIPerformance:
    """Performance tests for truck API"""
    
    def test_get_trucks_performance(self, api_client, performance_monitor):
        """Test that getting trucks is fast enough"""
        # Test multiple calls to ensure consistency
        times = []
        
        for i in range(5):
            performance_monitor.start_timer(f"get_trucks_{i}")
            response = api_client.get("/api/trucks")
            duration = performance_monitor.end_timer(f"get_trucks_{i}")
            
            assert response.status_code == 200
            times.append(duration)
        
        # Average response time should be under 100ms
        avg_time = sum(times) / len(times)
        assert avg_time < 0.1, f"Average response time {avg_time:.3f}s too slow"
    
    def test_concurrent_requests(self, api_client):
        """Test handling concurrent requests"""
        import threading
        import time
        
        results = []
        errors = []
        
        def make_request():
            try:
                response = api_client.get("/api/trucks")
                results.append(response.status_code)
            except Exception as e:
                errors.append(str(e))
        
        # Create 10 concurrent threads
        threads = []
        for i in range(10):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
        
        # Start all threads
        start_time = time.time()
        for thread in threads:
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        total_time = time.time() - start_time
        
        # All requests should succeed
        assert len(errors) == 0, f"Concurrent request errors: {errors}"
        assert all(status == 200 for status in results)
        assert total_time < 2.0, f"Concurrent requests took too long: {total_time:.3f}s"


@pytest.mark.api  
@pytest.mark.critical
class TestTruckAPIErrorHandling:
    """Critical error handling tests"""
    
    def test_malformed_json(self, api_client):
        """Test handling of malformed JSON"""
        response = api_client.post("/api/trucks", 
                                 data="invalid json", 
                                 headers={'Content-Type': 'application/json'})
        
        assert response.status_code == 400
        # Should not crash the server
    
    def test_large_payload(self, api_client):
        """Test handling of unusually large payloads"""
        large_truck = {
            "name": "X" * 10000,  # Very long name
            "length": 10.0,
            "width": 2.5, 
            "height": 3.0,
            "max_weight": 5000.0,
            "cost_per_km": 2.5
        }
        
        response = api_client.post("/api/trucks", json=large_truck)
        # Should handle gracefully, not crash
        assert response.status_code in [200, 201, 400]
    
    def test_sql_injection_attempt(self, api_client):
        """Test protection against SQL injection"""
        malicious_truck = {
            "name": "'; DROP TABLE trucks; --",
            "length": 10.0,
            "width": 2.5,
            "height": 3.0,
            "max_weight": 5000.0,
            "cost_per_km": 2.5
        }
        
        response = api_client.post("/api/trucks", json=malicious_truck)
        
        # Should not crash and trucks table should still exist
        get_response = api_client.get("/api/trucks")
        assert get_response.status_code == 200
    
    def test_xss_prevention(self, api_client):
        """Test XSS prevention in truck names"""
        xss_truck = {
            "name": "<script>alert('xss')</script>",
            "length": 10.0,
            "width": 2.5,
            "height": 3.0,
            "max_weight": 5000.0,
            "cost_per_km": 2.5
        }
        
        response = api_client.post("/api/trucks", json=xss_truck)
        
        if response.status_code in [200, 201]:
            # Verify the script tag is either escaped or removed
            get_response = api_client.get("/api/trucks")
            trucks = get_response.json()["trucks"]
            
            # Find our truck
            created_truck = None
            for truck in trucks:
                if "script" in truck["name"].lower():
                    created_truck = truck
                    break
            
            if created_truck:
                # Should be escaped/sanitized
                assert "<script>" not in created_truck["name"] or "&lt;script&gt;" in created_truck["name"]