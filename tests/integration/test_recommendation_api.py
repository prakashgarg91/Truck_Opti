import requests
import json

def test_recommendation_api():
    """Test the truck recommendation API with a sample request"""
    url = "http://localhost:5001/api/recommend-trucks"
    headers = {"Content-Type": "application/json"}
    
    # Sample data for testing
    test_data = {
        "carton_requirements": [
            {"carton_id": 1, "quantity": 5},
            {"carton_id": 2, "quantity": 3},
            {"carton_id": 3, "quantity": 2}
        ],
        "algorithm": "auto",
        "compare_algorithms": True
    }
    
    try:
        response = requests.post(url, json=test_data, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
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
    test_recommendation_api()