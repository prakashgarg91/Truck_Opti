import unittest
import json
from app import create_app, db
from app.models import TruckType, CartonType, PackingJob, Shipment

class DrillDownAPITestCase(unittest.TestCase):
    def setUp(self):
        """Set up test client and database"""
        self.app = create_app('testing')
        self.client = self.app.test_client()
        
        with self.app.app_context():
            db.create_all()
            
            # Seed test data
            truck = TruckType(name='Test Truck', length=600, width=250, height=300, max_weight=10000)
            carton = CartonType(name='Test Carton', length=50, width=40, height=30, weight=10)
            job = PackingJob(name='Test Job', optimization_goal='space')
            shipment = Shipment(total_weight=1000, total_volume=50)
            
            db.session.add_all([truck, carton, job, shipment])
            db.session.commit()
    
    def tearDown(self):
        """Clean up database"""
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
    
    def test_drill_down_trucks(self):
        """Test trucks drill-down endpoint"""
        response = self.client.get('/api/drill-down/trucks')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn('data', data)
        self.assertIn('total_count', data)
        self.assertGreater(data['total_count'], 0)
    
    def test_drill_down_cartons(self):
        """Test items/cartons drill-down endpoint"""
        response = self.client.get('/api/drill-down/items')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn('data', data)
        self.assertIn('total_count', data)
        self.assertGreater(data['total_count'], 0)
    
    def test_drill_down_jobs(self):
        """Test jobs drill-down endpoint"""
        response = self.client.get('/api/drill-down/jobs')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn('data', data)
        self.assertIn('total_count', data)
    
    def test_drill_down_shipments(self):
        """Test shipments drill-down endpoint"""
        response = self.client.get('/api/drill-down/shipments')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn('data', data)
        self.assertIn('total_count', data)
    
    def test_invalid_drill_down_type(self):
        """Test invalid drill-down type"""
        response = self.client.get('/api/drill-down/invalid')
        self.assertEqual(response.status_code, 400)
        
        data = json.loads(response.data)
        self.assertIn('error', data)
        self.assertIn('valid_types', data)

if __name__ == '__main__':
    unittest.main()