import traceback
import logging
import json
from datetime import datetime
from typing import Dict, Any, List

class ErrorCaptureSystem:
    def __init__(self):
        """Initialize error capture system"""
        self.logger = logging.getLogger('error_capture')
        self.error_store = []
        self.MAX_STORED_ERRORS = 100

    def capture_error(self, error: Exception, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Capture and log detailed error information
        
        Args:
            error (Exception): The error that occurred
            context (Dict[str, Any], optional): Additional context about the error
        
        Returns:
            Dict[str, Any]: Detailed error log
        """
        error_log = {
            'timestamp': datetime.now().isoformat(),
            'error_type': type(error).__name__,
            'error_message': str(error),
            'traceback': traceback.format_exc(),
            'context': context or {},
            'error_classification': self.classify_error(error)
        }
        
        # Log the error
        self.logger.error(f"Captured Error: {json.dumps(error_log, indent=2)}")
        
        # Store error (with size limit)
        if len(self.error_store) >= self.MAX_STORED_ERRORS:
            self.error_store.pop(0)
        self.error_store.append(error_log)
        
        return error_log

    def classify_error(self, error: Exception) -> str:
        """
        Classify error based on its type and characteristics
        
        Args:
            error (Exception): The error to classify
        
        Returns:
            str: Error classification
        """
        error_type_map = {
            ValueError: 'validation',
            TypeError: 'type_error',
            ConnectionError: 'connection',
            RuntimeError: 'runtime',
            PermissionError: 'permission',
            FileNotFoundError: 'file_not_found'
        }
        
        return error_type_map.get(type(error), 'unknown')

    def get_recent_errors(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Retrieve recent errors
        
        Args:
            limit (int, optional): Number of recent errors to retrieve. Defaults to 10.
        
        Returns:
            List[Dict[str, Any]]: List of recent error logs
        """
        return self.error_store[-limit:]

    def generate_improvement_suggestions(self, error: Exception) -> List[Dict[str, str]]:
        """
        Generate potential improvement suggestions based on error type
        
        Args:
            error (Exception): The error to analyze
        
        Returns:
            List[Dict[str, str]]: List of improvement suggestions
        """
        error_type = type(error)
        suggestions = []

        # Validation Error Suggestions
        if error_type is ValueError:
            suggestions.extend([
                {
                    'type': 'input_validation',
                    'description': 'Implement more robust input validation before processing'
                },
                {
                    'type': 'error_handling',
                    'description': 'Add more descriptive error messages for user feedback'
                }
            ])
        
        # Connection Error Suggestions
        elif error_type is ConnectionError:
            suggestions.extend([
                {
                    'type': 'retry_mechanism',
                    'description': 'Implement exponential backoff for connection retries'
                },
                {
                    'type': 'fallback',
                    'description': 'Add fallback mechanisms for network failures'
                }
            ])
        
        # Type Error Suggestions
        elif error_type is TypeError:
            suggestions.extend([
                {
                    'type': 'type_checking',
                    'description': 'Use type hints and runtime type checking'
                },
                {
                    'type': 'conversion',
                    'description': 'Add robust type conversion and validation'
                }
            ])
        
        # Generic Fallback
        if not suggestions:
            suggestions.append({
                'type': 'general',
                'description': 'Review and refactor code to improve error resilience'
            })
        
        return suggestions