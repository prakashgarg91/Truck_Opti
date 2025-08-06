import unittest
import requests

class TestAppEndpoints(unittest.TestCase):
    BASE_URL = "http://127.0.0.1:5000"

    def test_main_page(self):
        response = requests.get(self.BASE_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Dashboard", response.content)

    def test_truck_types_page(self):
        response = requests.get(f"{self.BASE_URL}/truck-types")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Truck Types", response.content)

    def test_carton_types_page(self):
        response = requests.get(f"{self.BASE_URL}/carton-types")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Carton Types", response.content)

    def test_packing_jobs_page(self):
        response = requests.get(f"{self.BASE_URL}/packing-jobs")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Packing Jobs", response.content)

    def test_fit_cartons_page(self):
        response = requests.get(f"{self.BASE_URL}/fit-cartons")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Fit Cartons in Selected Trucks", response.content)

    def test_recommend_truck_page(self):
        response = requests.get(f"{self.BASE_URL}/recommend-truck")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Recommend Truck for Cartons", response.content)

    def test_calculate_truck_requirements_page(self):
        response = requests.get(f"{self.BASE_URL}/calculate-truck-requirements")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Truck Requirement Calculator", response.content)

    def test_fleet_optimization_page(self):
        response = requests.get(f"{self.BASE_URL}/fleet-optimization")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Fleet Optimization", response.content)

    def test_batch_processing_page(self):
        response = requests.get(f"{self.BASE_URL}/batch-processing")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Batch Processing", response.content)

    def test_analytics_page(self):
        response = requests.get(f"{self.BASE_URL}/analytics")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Analytics", response.content)

if __name__ == "__main__":
    unittest.main()