import requests
import json

def test_bulk_upload_cartons():
    """Test bulk upload functionality for cartons"""
    url = "http://localhost:5001/api/cartons/bulk"
    headers = {"Content-Type": "application/json"}
    
    # Test data with new cartons to upload
    bulk_data = {
        "cartons": [
            {
                "name": "Test Bulk Box A",
                "length": 0.8,
                "width": 0.6,
                "height": 0.4,
                "weight": 15.0,
                "quantity": 5
            },
            {
                "name": "Test Bulk Box B", 
                "length": 1.2,
                "width": 1.0,
                "height": 0.8,
                "weight": 25.0,
                "quantity": 3
            }
        ]
    }
    
    try:
        response = requests.post(url, json=bulk_data, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Success: {json.dumps(result, indent=2)}")
        else:
            print(f"Error Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to the application")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_bulk_upload_cartons()