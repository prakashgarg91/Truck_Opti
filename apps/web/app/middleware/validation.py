"""
Input Validation Middleware
Comprehensive validation to prevent SQL injection, XSS, and other attacks
"""

from functools import wraps
from flask import request, jsonify
from typing import Dict, Any, List, Optional
import re
import bleach


class ValidationError(Exception):
    """Validation error exception"""
    pass


class Validator:
    """Comprehensive input validator"""

    # Common validation patterns
    EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    PHONE_PATTERN = re.compile(r'^\+?[1-9]\d{1,14}$')  # E.164 format
    URL_PATTERN = re.compile(
        r'^https?://'  # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain
        r'localhost|'  # localhost
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # IP
        r'(?::\d+)?'  # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE
    )
    ALPHANUMERIC_PATTERN = re.compile(r'^[a-zA-Z0-9]+$')

    # SQL injection patterns to block
    SQL_INJECTION_PATTERNS = [
        re.compile(r'\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b', re.IGNORECASE),
        re.compile(r'[\'";\-\-]'),  # Common SQL metacharacters
        re.compile(r'(OR|AND)\s+\d+\s*=\s*\d+', re.IGNORECASE),  # OR 1=1
    ]

    # XSS patterns to block
    XSS_PATTERNS = [
        re.compile(r'<script[^>]*>.*?</script>', re.IGNORECASE | re.DOTALL),
        re.compile(r'javascript:', re.IGNORECASE),
        re.compile(r'on\w+\s*=', re.IGNORECASE),  # onclick, onload, etc.
    ]

    @staticmethod
    def sanitize_string(value: str, max_length: Optional[int] = None) -> str:
        """
        Sanitize string input to prevent XSS

        Args:
            value: Input string
            max_length: Maximum allowed length

        Returns:
            Sanitized string
        """
        if not isinstance(value, str):
            raise ValidationError('Value must be a string')

        # Check for SQL injection patterns
        for pattern in Validator.SQL_INJECTION_PATTERNS:
            if pattern.search(value):
                raise ValidationError('Potentially malicious input detected')

        # Sanitize HTML/XSS
        sanitized = bleach.clean(value, tags=[], strip=True)

        # Trim whitespace
        sanitized = sanitized.strip()

        # Check length
        if max_length and len(sanitized) > max_length:
            raise ValidationError(f'Value exceeds maximum length of {max_length}')

        return sanitized

    @staticmethod
    def validate_email(email: str) -> str:
        """Validate email address"""
        email = Validator.sanitize_string(email, max_length=255)

        if not Validator.EMAIL_PATTERN.match(email):
            raise ValidationError('Invalid email format')

        return email.lower()

    @staticmethod
    def validate_float(value: Any, min_value: Optional[float] = None,
                      max_value: Optional[float] = None) -> float:
        """
        Validate and convert to float

        Args:
            value: Input value
            min_value: Minimum allowed value
            max_value: Maximum allowed value

        Returns:
            Validated float
        """
        try:
            float_value = float(value)
        except (ValueError, TypeError):
            raise ValidationError('Value must be a valid number')

        if min_value is not None and float_value < min_value:
            raise ValidationError(f'Value must be at least {min_value}')

        if max_value is not None and float_value > max_value:
            raise ValidationError(f'Value must not exceed {max_value}')

        return float_value

    @staticmethod
    def validate_int(value: Any, min_value: Optional[int] = None,
                    max_value: Optional[int] = None) -> int:
        """
        Validate and convert to integer

        Args:
            value: Input value
            min_value: Minimum allowed value
            max_value: Maximum allowed value

        Returns:
            Validated integer
        """
        try:
            int_value = int(value)
        except (ValueError, TypeError):
            raise ValidationError('Value must be a valid integer')

        if min_value is not None and int_value < min_value:
            raise ValidationError(f'Value must be at least {min_value}')

        if max_value is not None and int_value > max_value:
            raise ValidationError(f'Value must not exceed {max_value}')

        return int_value

    @staticmethod
    def validate_bool(value: Any) -> bool:
        """Validate and convert to boolean"""
        if isinstance(value, bool):
            return value

        if isinstance(value, str):
            value_lower = value.lower()
            if value_lower in ('true', '1', 'yes', 'y'):
                return True
            if value_lower in ('false', '0', 'no', 'n'):
                return False

        if isinstance(value, int):
            return bool(value)

        raise ValidationError('Value must be a valid boolean')

    @staticmethod
    def validate_enum(value: Any, allowed_values: List[Any]) -> Any:
        """Validate value is in allowed list"""
        if value not in allowed_values:
            raise ValidationError(f'Value must be one of: {", ".join(str(v) for v in allowed_values)}')

        return value

    @staticmethod
    def validate_dict(value: Any, required_keys: Optional[List[str]] = None) -> Dict:
        """Validate dictionary structure"""
        if not isinstance(value, dict):
            raise ValidationError('Value must be a dictionary')

        if required_keys:
            missing_keys = set(required_keys) - set(value.keys())
            if missing_keys:
                raise ValidationError(f'Missing required keys: {", ".join(missing_keys)}')

        return value

    @staticmethod
    def validate_list(value: Any, min_length: Optional[int] = None,
                     max_length: Optional[int] = None) -> List:
        """Validate list structure"""
        if not isinstance(value, list):
            raise ValidationError('Value must be a list')

        if min_length is not None and len(value) < min_length:
            raise ValidationError(f'List must contain at least {min_length} items')

        if max_length is not None and len(value) > max_length:
            raise ValidationError(f'List must not exceed {max_length} items')

        return value


def validate_request(schema: Dict[str, Dict[str, Any]]):
    """
    Decorator to validate request data against schema

    Schema format:
    {
        'field_name': {
            'type': 'string|int|float|bool|email|dict|list|enum',
            'required': True|False,
            'min': value,
            'max': value,
            'allowed_values': [...],  # for enum
            'required_keys': [...],  # for dict
            'sanitize': True|False,  # for string
        }
    }

    Usage:
        @app.route('/api/trucks', methods=['POST'])
        @validate_request({
            'name': {'type': 'string', 'required': True, 'max': 100},
            'length': {'type': 'float', 'required': True, 'min': 0},
            'width': {'type': 'float', 'required': True, 'min': 0},
            'height': {'type': 'float', 'required': True, 'min': 0},
        })
        def create_truck():
            data = request.validated_data
            # data is guaranteed to be validated
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get request data
            if request.is_json:
                data = request.get_json()
            else:
                data = request.form.to_dict()

            if not data:
                return jsonify({
                    'success': False,
                    'error': 'Validation failed',
                    'message': 'No data provided'
                }), 400

            validated_data = {}
            errors = {}

            # Validate each field
            for field_name, field_schema in schema.items():
                value = data.get(field_name)
                field_type = field_schema.get('type', 'string')
                required = field_schema.get('required', False)

                # Check required fields
                if required and value is None:
                    errors[field_name] = 'This field is required'
                    continue

                # Skip validation if not required and not provided
                if value is None:
                    continue

                # Validate based on type
                try:
                    if field_type == 'string':
                        max_length = field_schema.get('max')
                        validated_data[field_name] = Validator.sanitize_string(value, max_length)

                    elif field_type == 'int':
                        min_val = field_schema.get('min')
                        max_val = field_schema.get('max')
                        validated_data[field_name] = Validator.validate_int(value, min_val, max_val)

                    elif field_type == 'float':
                        min_val = field_schema.get('min')
                        max_val = field_schema.get('max')
                        validated_data[field_name] = Validator.validate_float(value, min_val, max_val)

                    elif field_type == 'bool':
                        validated_data[field_name] = Validator.validate_bool(value)

                    elif field_type == 'email':
                        validated_data[field_name] = Validator.validate_email(value)

                    elif field_type == 'enum':
                        allowed_values = field_schema.get('allowed_values', [])
                        validated_data[field_name] = Validator.validate_enum(value, allowed_values)

                    elif field_type == 'dict':
                        required_keys = field_schema.get('required_keys')
                        validated_data[field_name] = Validator.validate_dict(value, required_keys)

                    elif field_type == 'list':
                        min_length = field_schema.get('min')
                        max_length = field_schema.get('max')
                        validated_data[field_name] = Validator.validate_list(value, min_length, max_length)

                    else:
                        validated_data[field_name] = value

                except ValidationError as e:
                    errors[field_name] = str(e)

            # Return errors if validation failed
            if errors:
                return jsonify({
                    'success': False,
                    'error': 'Validation failed',
                    'validation_errors': errors
                }), 400

            # Attach validated data to request
            request.validated_data = validated_data

            return f(*args, **kwargs)

        return decorated_function

    return decorator


__all__ = ['Validator', 'ValidationError', 'validate_request']
