"""
Unit Tests for Carton API Endpoints
Comprehensive testing to ensure zero human debugging required
"""

import pytest
import json
import io
from unittest.mock import Mock, patch


@pytest.mark.api
@pytest.mark.unit
class TestCartonAPI:
    """Test suite for carton-related API endpoints"""
    
    def test_get_cartons_success(self, api_client, performance_monitor):
        """Test successful retrieval of cartons"""
        performance_monitor.start_timer("get_cartons")
        
        response = api_client.get("/api/cartons")
        
        performance_monitor.end_timer("get_cartons")
        performance_monitor.assert_performance("get_cartons", 0.5)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "success" in data
        assert data["success"] is True
        assert "cartons" in data
        assert isinstance(data["cartons"], list)
        assert len(data["cartons"]) > 0
        
        # Verify carton structure
        carton = data["cartons"][0]
        required_fields = ["id", "name", "length", "width", "height", "weight", "quantity"]
        for field in required_fields:
            assert field in carton, f"Missing field: {field}"
    
    def test_create_carton_success(self, api_client, performance_monitor):
        """Test successful carton creation"""
        new_carton = {
            "name": "Test Carton",
            "length": 1.5,
            "width": 1.0,
            "height": 0.8,
            "weight": 30.0,
            "quantity": 20
        }
        
        performance_monitor.start_timer("create_carton")
        
        response = api_client.post("/api/cartons", json=new_carton)
        
        performance_monitor.end_timer("create_carton")
        performance_monitor.assert_performance("create_carton", 0.5)
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["success"] is True
        assert "carton_id" in data
        assert isinstance(data["carton_id"], int)
        
        # Verify carton was actually created
        get_response = api_client.get("/api/cartons")
        cartons = get_response.json()["cartons"]
        created_carton = next((c for c in cartons if c["id"] == data["carton_id"]), None)
        
        assert created_carton is not None
        assert created_carton["name"] == new_carton["name"]
        assert created_carton["length"] == new_carton["length"]
    
    def test_create_carton_invalid_data(self, api_client):
        """Test carton creation with invalid data"""
        invalid_cartons = [
            # Missing required fields
            {"name": "Incomplete Carton"},
            
            # Invalid data types
            {
                "name": "Invalid Carton",
                "length": "not_a_number",
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 5
            },
            
            # Negative values
            {
                "name": "Negative Carton",
                "length": -1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 5
            },
            
            # Empty name
            {
                "name": "",
                "length": 1.0,
                "width": 1.0,
                "height": 1.0,
                "weight": 10.0,
                "quantity": 5
            }
        ]
        
        for invalid_carton in invalid_cartons:
            response = api_client.post("/api/cartons", json=invalid_carton)
            assert response.status_code == 400
            data = response.json()
            assert data["success"] is False
            assert "error" in data
    
    def test_update_carton_success(self, api_client):
        """Test successful carton update"""
        # First get an existing carton
        get_response = api_client.get("/api/cartons")
        cartons = get_response.json()["cartons"]
        assert len(cartons) > 0
        
        carton_id = cartons[0]["id"]
        updated_data = {
            "name": "Updated Carton Name",
            "length": 2.0,
            "width": 1.5,
            "height": 1.0,
            "weight": 35.0,
            "quantity": 15
        }
        
        response = api_client.put(f"/api/cartons/{carton_id}", json=updated_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # Verify update
        get_response = api_client.get("/api/cartons")
        updated_carton = next((c for c in get_response.json()["cartons"] if c["id"] == carton_id), None)
        
        assert updated_carton["name"] == updated_data["name"]
        assert updated_carton["length"] == updated_data["length"]
    
    def test_update_nonexistent_carton(self, api_client):
        """Test updating a non-existent carton"""
        response = api_client.put("/api/cartons/99999", json={"name": "Test"})
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    def test_delete_carton_success(self, api_client):
        """Test successful carton deletion"""
        # Create a carton to delete
        new_carton = {
            "name": "To Delete",
            "length": 1.0,
            "width": 1.0,
            "height": 1.0,
            "weight": 10.0,
            "quantity": 5
        }
        
        create_response = api_client.post("/api/cartons", json=new_carton)
        carton_id = create_response.json()["carton_id"]
        
        # Delete the carton
        delete_response = api_client.delete(f"/api/cartons/{carton_id}")
        
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data["success"] is True
        
        # Verify deletion
        get_response = api_client.get("/api/cartons")
        cartons = get_response.json()["cartons"]
        deleted_carton = next((c for c in cartons if c["id"] == carton_id), None)
        assert deleted_carton is None
    
    def test_delete_nonexistent_carton(self, api_client):
        """Test deleting a non-existent carton"""
        response = api_client.delete("/api/cartons/99999")
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "error" in data


@pytest.mark.api
@pytest.mark.integration
class TestCartonBulkUpload:
    """Test suite for bulk carton upload functionality"""
    
    def test_bulk_upload_success(self, api_client, test_csv_file, performance_monitor):
        """Test successful bulk carton upload from CSV"""
        performance_monitor.start_timer("bulk_upload")
        
        with open(test_csv_file, 'rb') as f:
            files = {'file': ('test_cartons.csv', f, 'text/csv')}
            response = api_client.post("/api/cartons/bulk-upload", files=files)
        
        performance_monitor.end_timer("bulk_upload")
        performance_monitor.assert_performance("bulk_upload", 2.0)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert "cartons_added" in data
        assert data["cartons_added"] > 0
        assert "errors" in data
        assert isinstance(data["errors"], list)
    
    def test_bulk_upload_invalid_file(self, api_client):
        """Test bulk upload with invalid file"""
        # Test with no file
        response = api_client.post("/api/cartons/bulk-upload")
        assert response.status_code == 400
        
        # Test with invalid file content
        files = {'file': ('invalid.txt', io.StringIO("invalid content"), 'text/plain')}
        response = api_client.post("/api/cartons/bulk-upload", files=files)
        assert response.status_code in [400, 500]  # Should handle gracefully
    
    def test_bulk_upload_partial_success(self, api_client, invalid_csv_file):
        """Test bulk upload with some valid and some invalid entries"""
        with open(invalid_csv_file, 'rb') as f:
            files = {'file': ('invalid_cartons.csv', f, 'text/csv')}
            response = api_client.post("/api/cartons/bulk-upload", files=files)
        
        # Should still return 200 but with errors reported
        data = response.json()
        if response.status_code == 200:
            assert "errors" in data
            assert len(data["errors"]) > 0  # Should report the invalid entries


@pytest.mark.api
@pytest.mark.performance
class TestCartonAPIPerformance:
    """Performance tests for carton API"""
    
    def test_get_cartons_performance(self, api_client, performance_monitor):
        """Test that getting cartons is fast enough"""
        # Test multiple calls to ensure consistency
        times = []
        
        for i in range(5):
            performance_monitor.start_timer(f"get_cartons_{i}")
            response = api_client.get("/api/cartons")
            duration = performance_monitor.end_timer(f"get_cartons_{i}")
            
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
                response = api_client.get("/api/cartons")
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
class TestCartonAPIErrorHandling:
    """Critical error handling tests"""
    
    def test_malformed_json(self, api_client):
        """Test handling of malformed JSON"""
        response = api_client.post("/api/cartons", 
                                 data="invalid json", 
                                 headers={'Content-Type': 'application/json'})
        
        assert response.status_code == 400
        # Should not crash the server
    
    def test_large_payload(self, api_client):
        """Test handling of unusually large payloads"""
        large_carton = {
            "name": "X" * 10000,  # Very long name
            "length": 1.0,
            "width": 1.0, 
            "height": 1.0,
            "weight": 10.0,
            "quantity": 5
        }
        
        response = api_client.post("/api/cartons", json=large_carton)
        # Should handle gracefully, not crash
        assert response.status_code in [200, 201, 400]
    
    def test_sql_injection_attempt(self, api_client):
        """Test protection against SQL injection"""
        malicious_carton = {
            "name": "'; DROP TABLE cartons; --",
            "length": 1.0,
            "width": 1.0,
            "height": 1.0,
            "weight": 10.0,
            "quantity": 5
        }
        
        response = api_client.post("/api/cartons", json=malicious_carton)
        
        # Should not crash and cartons table should still exist
        get_response = api_client.get("/api/cartons")
        assert get_response.status_code == 200
    
    def test_xss_prevention(self, api_client):
        """Test XSS prevention in carton names"""
        xss_carton = {
            "name": "<script>alert('xss')</script>",
            "length": 1.0,
            "width": 1.0,
            "height": 1.0,
            "weight": 10.0,
            "quantity": 5
        }
        
        response = api_client.post("/api/cartons", json=xss_carton)
        
        if response.status_code in [200, 201]:
            # Verify the script tag is either escaped or removed
            get_response = api_client.get("/api/cartons")
            cartons = get_response.json()["cartons"]
            
            # Find our carton
            created_carton = None
            for carton in cartons:
                if "script" in carton["name"].lower():
                    created_carton = carton
                    break
            
            if created_carton:
                # Should be escaped/sanitized
                assert "<script>" not in created_carton["name"] or "&lt;script&gt;" in created_carton["name"]