import unittest
import sys
import os
import logging

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.error_capture import ErrorCaptureSystem

class TestErrorCaptureSystem(unittest.TestCase):
    def setUp(self):
        """Set up test environment for error capture testing"""
        # Initialize error capture system
        self.error_capture = ErrorCaptureSystem()
        
        # Configure test logging
        logging.basicConfig(level=logging.DEBUG)
        self.logger = logging.getLogger('error_capture_test')

    def test_api_error_logging(self):
        """Test logging of API-related errors"""
        try:
            # Simulate an API error scenario
            raise ValueError("Test API Error")
        except Exception as e:
            error_log = self.error_capture.capture_error(
                error=e,
                context={
                    'source': 'api',
                    'endpoint': '/sales_order',
                    'method': 'POST'
                }
            )
            
            # Verify error log contains expected information
            self.assertIsNotNone(error_log)
            self.assertIn('Test API Error', error_log['error_message'])
            self.assertEqual(error_log['context']['source'], 'api')

    def test_error_classification(self):
        """Test error classification system"""
        test_errors = [
            (ValueError("Input validation error"), 'validation'),
            (ConnectionError("Network connection failed"), 'connection'),
            (TypeError("Incorrect type"), 'type_error'),
            (Exception("Generic error"), 'unknown')
        ]
        
        for error, expected_type in test_errors:
            classified_error = self.error_capture.classify_error(error)
            self.assertEqual(classified_error, expected_type)

    def test_error_context_collection(self):
        """Test comprehensive error context collection"""
        class MockTruck:
            def optimize_loading(self):
                raise RuntimeError("Test optimization error")
        
        try:
            # Simulate a complex error scenario
            truck = MockTruck()
            truck.optimize_loading()
        except Exception as e:
            error_log = self.error_capture.capture_error(
                error=e,
                context={
                    'source': 'optimization',
                    'truck_type': 'box',
                    'additional_data': {
                        'capacity': 100,
                        'current_load': 50
                    }
                }
            )
            
            # Verify detailed context capture
            self.assertIsNotNone(error_log)
            self.assertIn('additional_data', error_log['context'])
            self.assertEqual(error_log['context']['truck_type'], 'box')

    def test_error_persistence(self):
        """Test error persistence and retrieval"""
        # Simulate multiple errors
        errors = [
            ValueError("First error"),
            ConnectionError("Second error"),
            TypeError("Third error")
        ]
        
        stored_errors = []
        for error in errors:
            error_log = self.error_capture.capture_error(
                error=error,
                context={'test_batch': 'persistence_test'}
            )
            stored_errors.append(error_log)
        
        # Retrieve and verify stored errors
        retrieved_errors = self.error_capture.get_recent_errors(limit=3)
        self.assertEqual(len(retrieved_errors), 3)
        
        # Verify error details match
        for original, retrieved in zip(stored_errors, retrieved_errors):
            self.assertEqual(original['error_message'], retrieved['error_message'])

    def test_error_improvement_suggestions(self):
        """Test generating improvement suggestions for errors"""
        test_errors = [
            (ValueError("Validation error"), 'input_validation'),
            (ConnectionError("Network error"), 'retry_mechanism'),
            (TypeError("Type mismatch"), 'type_checking'),
            (Exception("Generic error"), 'general')
        ]
        
        for error, expected_suggestion_type in test_errors:
            suggestions = self.error_capture.generate_improvement_suggestions(error)
            
            # Verify suggestions are generated
            self.assertIsNotNone(suggestions)
            self.assertTrue(len(suggestions) > 0)
            
            # Check that at least one suggestion matches the expected type
            suggestion_types = [suggestion['type'] for suggestion in suggestions]
            self.assertIn(expected_suggestion_type, suggestion_types)

    def test_error_store_size_limit(self):
        """Test that error store does not exceed maximum size"""
        # Create more errors than MAX_STORED_ERRORS
        for i in range(150):
            self.error_capture.capture_error(
                ValueError(f"Test error {i}"),
                context={'index': i}
            )
        
        # Verify only the last 100 errors are stored
        recent_errors = self.error_capture.get_recent_errors(limit=110)
        self.assertTrue(len(recent_errors) <= 100)

if __name__ == '__main__':
    unittest.main()