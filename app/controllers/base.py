"""
Base Controller Implementation
Enterprise controller patterns with validation and error handling
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import logging
from functools import wraps
from flask import request, jsonify, render_template, flash, redirect, url_for

from ..exceptions.domain import DomainValidationError, BusinessLogicError, EntityNotFoundError
from ..core.logging import get_logger
from ..core.container import get_container


@dataclass
class ControllerResult:
    """Standardized controller operation result"""
    success: bool
    data: Any = None
    error: str = None
    status_code: int = 200
    headers: Dict[str, str] = field(default_factory=dict)
    template: str = None
    redirect_url: str = None
    
    @classmethod
    def success(cls, data: Any = None, status_code: int = 200, 
                template: str = None, headers: Dict[str, str] = None) -> 'ControllerResult':
        """Create successful result"""
        return cls(
            success=True,
            data=data,
            status_code=status_code,
            template=template,
            headers=headers or {}
        )
    
    @classmethod
    def error(cls, error: str, status_code: int = 400, 
              template: str = None, headers: Dict[str, str] = None) -> 'ControllerResult':
        """Create error result"""
        return cls(
            success=False,
            error=error,
            status_code=status_code,
            template=template,
            headers=headers or {}
        )
    
    @classmethod
    def redirect(cls, url: str, status_code: int = 302) -> 'ControllerResult':
        """Create redirect result"""
        return cls(
            success=True,
            redirect_url=url,
            status_code=status_code
        )
    
    def to_response(self):
        """Convert to Flask response"""
        if self.redirect_url:
            return redirect(self.redirect_url), self.status_code
        
        if self.template:
            context = {'data': self.data} if self.success else {'error': self.error}
            return render_template(self.template, **context), self.status_code
        
        # JSON response for API
        response_data = {
            'success': self.success,
            'data': self.data if self.success else None,
            'error': self.error if not self.success else None,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        response = jsonify(response_data)
        response.status_code = self.status_code
        
        for key, value in self.headers.items():
            response.headers[key] = value
        
        return response


@dataclass
class RequestValidation:
    """Request validation configuration"""
    required_fields: List[str] = field(default_factory=list)
    optional_fields: List[str] = field(default_factory=list)
    field_types: Dict[str, type] = field(default_factory=dict)
    custom_validators: Dict[str, callable] = field(default_factory=dict)


def validate_request(validation: RequestValidation):
    """Decorator for request validation"""
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                # Get request data
                if request.is_json:
                    data = request.get_json() or {}
                else:
                    data = request.form.to_dict()
                    # Merge with URL parameters
                    data.update(request.args.to_dict())
                
                # Validate required fields
                missing_fields = [field for field in validation.required_fields 
                                if field not in data or data[field] in [None, '', []]]
                
                if missing_fields:
                    return ControllerResult.error(
                        f"Missing required fields: {', '.join(missing_fields)}",
                        status_code=400
                    ).to_response()
                
                # Validate field types
                for field, expected_type in validation.field_types.items():
                    if field in data:
                        try:
                            if expected_type == int:
                                data[field] = int(data[field])
                            elif expected_type == float:
                                data[field] = float(data[field])
                            elif expected_type == bool:
                                data[field] = str(data[field]).lower() in ['true', '1', 'yes', 'on']
                            elif expected_type == list and isinstance(data[field], str):
                                data[field] = data[field].split(',')
                        except (ValueError, TypeError):
                            return ControllerResult.error(
                                f"Invalid type for field '{field}', expected {expected_type.__name__}",
                                status_code=400
                            ).to_response()
                
                # Run custom validators
                for field, validator in validation.custom_validators.items():
                    if field in data:
                        try:
                            if not validator(data[field]):
                                return ControllerResult.error(
                                    f"Validation failed for field '{field}'",
                                    status_code=400
                                ).to_response()
                        except Exception as e:
                            return ControllerResult.error(
                                f"Validation error for field '{field}': {str(e)}",
                                status_code=400
                            ).to_response()
                
                # Add validated data to kwargs
                kwargs['validated_data'] = data
                return func(self, *args, **kwargs)
                
            except Exception as e:
                self.logger.error(f"Request validation error: {str(e)}")
                return ControllerResult.error(
                    "Request validation failed",
                    status_code=400
                ).to_response()
        
        return wrapper
    return decorator


def handle_exceptions(func):
    """Decorator for exception handling"""
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        try:
            return func(self, *args, **kwargs)
        except DomainValidationError as e:
            self.logger.warning(f"Domain validation error: {str(e)}")
            return ControllerResult.error(str(e), status_code=400).to_response()
        except BusinessLogicError as e:
            self.logger.warning(f"Business logic error: {str(e)}")
            return ControllerResult.error(str(e), status_code=422).to_response()
        except EntityNotFoundError as e:
            self.logger.warning(f"Entity not found: {str(e)}")
            return ControllerResult.error(str(e), status_code=404).to_response()
        except Exception as e:
            self.logger.error(f"Unexpected error in {func.__name__}: {str(e)}", exc_info=True)
            return ControllerResult.error(
                "An unexpected error occurred",
                status_code=500
            ).to_response()
    
    return wrapper


class BaseController(ABC):
    """
    Base controller with common functionality
    """
    
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
        self.container = get_container()
    
    def get_service(self, service_type):
        """Get service from container"""
        return self.container.get(service_type)
    
    def get_request_data(self) -> Dict[str, Any]:
        """Get request data from JSON or form"""
        if request.is_json:
            return request.get_json() or {}
        else:
            data = request.form.to_dict()
            data.update(request.args.to_dict())
            return data
    
    def get_pagination_params(self) -> Dict[str, int]:
        """Get pagination parameters from request"""
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # Limit per_page to prevent abuse
        per_page = min(per_page, 100)
        
        return {'page': page, 'per_page': per_page}
    
    def get_sort_params(self) -> Dict[str, str]:
        """Get sorting parameters from request"""
        sort_field = request.args.get('sort', 'id')
        sort_direction = request.args.get('order', 'asc')
        
        if sort_direction not in ['asc', 'desc']:
            sort_direction = 'asc'
        
        return {'sort_field': sort_field, 'sort_direction': sort_direction}
    
    def create_success_response(self, data: Any = None, message: str = None,
                               status_code: int = 200) -> Tuple[Dict, int]:
        """Create standardized success response"""
        response = {
            'success': True,
            'data': data,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
        return response, status_code
    
    def create_error_response(self, error: str, status_code: int = 400,
                             details: Dict[str, Any] = None) -> Tuple[Dict, int]:
        """Create standardized error response"""
        response = {
            'success': False,
            'error': error,
            'details': details,
            'timestamp': datetime.utcnow().isoformat()
        }
        return response, status_code
    
    def flash_message(self, message: str, category: str = 'info'):
        """Flash message for web interface"""
        flash(message, category)
    
    def log_action(self, action: str, details: Dict[str, Any] = None):
        """Log controller action"""
        self.logger.info(f"Action: {action}", extra={
            'action': action,
            'details': details or {},
            'user_agent': request.headers.get('User-Agent'),
            'ip_address': request.remote_addr
        })


class ApiController(BaseController):
    """
    Base controller for API endpoints
    """
    
    def __init__(self):
        super().__init__()
        self.default_headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        }
    
    @handle_exceptions
    def health_check(self):
        """Health check endpoint"""
        container_health = self.container.health_check()
        
        response_data = {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0.0',
            'container_health': container_health
        }
        
        status_code = 200 if container_health['status'] == 'healthy' else 503
        
        return ControllerResult.success(
            data=response_data,
            status_code=status_code,
            headers=self.default_headers
        ).to_response()
    
    def create_paginated_response(self, paged_result, message: str = None) -> Tuple[Dict, int]:
        """Create paginated API response"""
        response = {
            'success': True,
            'data': {
                'items': paged_result.items,
                'pagination': {
                    'page': paged_result.page,
                    'per_page': paged_result.per_page,
                    'total': paged_result.total,
                    'pages': paged_result.pages,
                    'has_prev': paged_result.has_prev,
                    'has_next': paged_result.has_next
                }
            },
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
        return response, 200


class WebController(BaseController):
    """
    Base controller for web interface
    """
    
    def __init__(self):
        super().__init__()
        self.default_template_context = {
            'app_name': 'TruckOpti Enterprise',
            'version': '3.6.0'
        }
    
    def render_with_context(self, template: str, **context) -> str:
        """Render template with default context"""
        full_context = {**self.default_template_context, **context}
        return render_template(template, **full_context)
    
    @handle_exceptions
    def handle_form_submission(self, form_data: Dict[str, Any], 
                              success_url: str, error_template: str):
        """Generic form submission handler"""
        try:
            # Override in subclasses
            result = self.process_form_data(form_data)
            
            if result.success:
                self.flash_message("Operation completed successfully", 'success')
                return redirect(url_for(success_url))
            else:
                self.flash_message(f"Error: {result.error}", 'error')
                return self.render_with_context(error_template, form_data=form_data)
                
        except Exception as e:
            self.logger.error(f"Form submission error: {str(e)}")
            self.flash_message("An unexpected error occurred", 'error')
            return self.render_with_context(error_template, form_data=form_data)
    
    def process_form_data(self, form_data: Dict[str, Any]) -> ControllerResult:
        """Override in subclasses"""
        return ControllerResult.success()


class CrudController(ApiController):
    """
    Generic CRUD controller for entities
    """
    
    def __init__(self, service_type):
        super().__init__()
        self.service = self.get_service(service_type)
    
    @handle_exceptions
    @validate_request(RequestValidation())
    def list_entities(self, validated_data: Dict[str, Any]):
        """List entities with pagination and filtering"""
        pagination = self.get_pagination_params()
        sorting = self.get_sort_params()
        
        # Build query specification
        from ..repositories.base import QuerySpec
        spec = QuerySpec(
            page=pagination['page'],
            per_page=pagination['per_page'],
            sort_field=sorting['sort_field'],
            sort_direction=sorting['sort_direction']
        )
        
        result = self.service.get_all(spec)
        
        if result.success:
            return self.create_paginated_response(result.data)
        else:
            return self.create_error_response(result.error)
    
    @handle_exceptions
    def get_entity(self, entity_id: int):
        """Get single entity by ID"""
        result = self.service.get_by_id(entity_id)
        
        if result.success:
            return self.create_success_response(result.data)
        else:
            return self.create_error_response(result.error, status_code=404)
    
    @handle_exceptions
    @validate_request(RequestValidation())
    def create_entity(self, validated_data: Dict[str, Any]):
        """Create new entity"""
        result = self.service.create(validated_data)
        
        if result.success:
            return self.create_success_response(
                result.data, 
                "Entity created successfully", 
                status_code=201
            )
        else:
            return self.create_error_response(result.error)
    
    @handle_exceptions
    @validate_request(RequestValidation())
    def update_entity(self, entity_id: int, validated_data: Dict[str, Any]):
        """Update existing entity"""
        result = self.service.update(entity_id, validated_data)
        
        if result.success:
            return self.create_success_response(result.data, "Entity updated successfully")
        else:
            return self.create_error_response(result.error)
    
    @handle_exceptions
    def delete_entity(self, entity_id: int):
        """Delete entity"""
        result = self.service.delete(entity_id)
        
        if result.success:
            return self.create_success_response(None, "Entity deleted successfully")
        else:
            return self.create_error_response(result.error)