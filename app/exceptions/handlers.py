"""
Exception Handlers
Centralized exception handling for clean architecture
"""

from typing import Dict, Any, Optional, Tuple
from flask import jsonify, request, current_app
import logging
import traceback
import sys
from datetime import datetime

from .base import TruckOptiException
from .domain import DomainValidationError, BusinessLogicError, EntityNotFoundError
from ..core.logging import get_logger


class ExceptionHandler:
    """Centralized exception handler"""
    
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
    
    def handle_domain_validation_error(self, error: DomainValidationError) -> Tuple[Dict[str, Any], int]:
        """Handle domain validation errors"""
        self.logger.warning(f"Domain validation error: {str(error)}")
        
        response = {
            'error': 'Validation Error',
            'message': str(error),
            'type': 'domain_validation',
            'timestamp': datetime.utcnow().isoformat(),
            'field_errors': getattr(error, 'field_errors', {})
        }
        
        return response, 400
    
    def handle_business_logic_error(self, error: BusinessLogicError) -> Tuple[Dict[str, Any], int]:
        """Handle business logic errors"""
        self.logger.warning(f"Business logic error: {str(error)}")
        
        response = {
            'error': 'Business Logic Error',
            'message': str(error),
            'type': 'business_logic',
            'timestamp': datetime.utcnow().isoformat(),
            'rule': getattr(error, 'rule', None)
        }
        
        return response, 422
    
    def handle_entity_not_found_error(self, error: EntityNotFoundError) -> Tuple[Dict[str, Any], int]:
        """Handle entity not found errors"""
        self.logger.info(f"Entity not found: {str(error)}")
        
        response = {
            'error': 'Not Found',
            'message': str(error),
            'type': 'entity_not_found',
            'timestamp': datetime.utcnow().isoformat(),
            'entity_type': getattr(error, 'entity_type', None),
            'entity_id': getattr(error, 'entity_id', None)
        }
        
        return response, 404
    
    def handle_generic_exception(self, error: Exception) -> Tuple[Dict[str, Any], int]:
        """Handle generic exceptions"""
        self.logger.error(f"Unexpected error: {str(error)}", exc_info=True)
        
        # Don't expose internal details in production
        if current_app.config.get('DEBUG', False):
            message = str(error)
            traceback_info = traceback.format_exc()
        else:
            message = "An internal error occurred"
            traceback_info = None
        
        response = {
            'error': 'Internal Server Error',
            'message': message,
            'type': 'internal_error',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if traceback_info:
            response['traceback'] = traceback_info
        
        return response, 500


def register_error_handlers(app):
    """Register error handlers with Flask app"""
    handler = ExceptionHandler()
    
    @app.errorhandler(DomainValidationError)
    def handle_domain_validation_error(error):
        response, status_code = handler.handle_domain_validation_error(error)
        return jsonify(response), status_code
    
    @app.errorhandler(BusinessLogicError)
    def handle_business_logic_error(error):
        response, status_code = handler.handle_business_logic_error(error)
        return jsonify(response), status_code
    
    @app.errorhandler(EntityNotFoundError)
    def handle_entity_not_found_error(error):
        response, status_code = handler.handle_entity_not_found_error(error)
        return jsonify(response), status_code
    
    @app.errorhandler(404)
    def handle_not_found(error):
        response = {
            'error': 'Not Found',
            'message': 'The requested resource was not found',
            'type': 'http_error',
            'timestamp': datetime.utcnow().isoformat(),
            'path': request.path if request else None
        }
        return jsonify(response), 404
    
    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        response = {
            'error': 'Method Not Allowed',
            'message': 'The requested method is not allowed for this resource',
            'type': 'http_error',
            'timestamp': datetime.utcnow().isoformat(),
            'method': request.method if request else None,
            'path': request.path if request else None
        }
        return jsonify(response), 405
    
    @app.errorhandler(500)
    def handle_internal_server_error(error):
        # For .exe build, skip JSON error handling for HTML requests to allow template rendering
        if getattr(sys, 'frozen', False):
            # Check if this is an API request or HTML request
            is_api_request = (request.endpoint and request.endpoint.startswith('api.')) or \
                            request.path.startswith('/api/') or \
                            'application/json' in (request.headers.get('Accept', ''))
            
            if not is_api_request:
                # For HTML requests in exe build, let Flask handle normally
                raise error
        
        response, status_code = handler.handle_generic_exception(error)
        return jsonify(response), status_code