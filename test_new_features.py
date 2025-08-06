import unittest
import json
from app import create_app, db
from app.models import TruckType, CartonType

class NewFeaturesTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()
            # Add some test data
            truck1 = TruckType(name='Test Truck 1', length=500, width=200, height=200, max_weight=10000, cost_per_km=10, fuel_efficiency=5, driver_cost_per_day=2000, maintenance_cost_per_km=2)
            truck2 = TruckType(name='Test Truck 2', length=1000, width=250, height=250, max_weight=25000, cost_per_km=20, fuel_efficiency=3, driver_cost_per_day=3000, maintenance_cost_per_km=5)
            carton1 = CartonType(name='Test Carton 1', length=50, width=50, height=50, weight=100, value=1000)
            carton2 = CartonType(name='Test Carton 2', length=100, width=100, height=100, weight=500, value=5000)
            db.session.add_all([truck1, truck2, carton1, carton2])
            db.session.commit()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_calculate_truck_requirements_api(self):
        response = self.client.post('/api/calculate-truck-requirements',
                                    data=json.dumps({'cartons': [{'id': 1, 'quantity': 10}]}),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsInstance(data, list)

    def test_fleet_optimization_api(self):
        response = self.client.post('/api/fleet-optimization',
                                    data=json.dumps({
                                        'trucks': [{'id': 1, 'quantity': 1}],
                                        'cartons': [{'id': 1, 'quantity': 10}]
                                    }),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsInstance(data, list)

if __name__ == '__main__':
    unittest.main()