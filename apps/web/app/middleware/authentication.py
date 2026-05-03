"""
Authentication Middleware
JWT-based authentication for production-ready security
"""

from functools import wraps, lru_cache
from flask import request, jsonify, g
from datetime import datetime, timedelta, timezone
import jwt
import os
import secrets
from typing import Optional, Dict, Any


JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24
INSECURE_SECRET_SENTINELS = {
    '',
    'your-secret-key-change-in-production',
    'dev-jwt-secret-change-in-production',
    'testing-jwt-secret',
    'your-jwt-secret-key',
}


def _is_production_env() -> bool:
    return (os.getenv('FLASK_ENV') or os.getenv('TRUCKOPTI_ENV') or '').lower() in {'production', 'prod'}


def _is_insecure_secret(value: str) -> bool:
    normalized = value.strip()
    return not normalized or normalized in INSECURE_SECRET_SENTINELS or 'change-in-production' in normalized.lower()


@lru_cache(maxsize=1)
def get_jwt_secret() -> str:
    configured_secret = (os.getenv('JWT_SECRET_KEY') or '').strip()

    if configured_secret and not _is_insecure_secret(configured_secret):
        return configured_secret

    if _is_production_env():
        raise RuntimeError('JWT_SECRET_KEY must be set to a strong value in production')

    return secrets.token_urlsafe(48)


class AuthenticationError(Exception):
    """Authentication error exception"""
    pass


def generate_token(user_id: int, email: str, role: str = 'user') -> str:
    """
    Generate JWT token for authenticated user

    Args:
        user_id: User ID
        email: User email
        role: User role (user, admin, etc.)

    Returns:
        JWT token string
    """
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc)
    }

    token = jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)
    return token


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify and decode JWT token

    Args:
        token: JWT token string

    Returns:
        Decoded payload or None if invalid
    """
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthenticationError('Token has expired')
    except jwt.InvalidTokenError:
        raise AuthenticationError('Invalid token')
    except RuntimeError as exc:
        raise AuthenticationError(str(exc)) from exc


def get_token_from_request() -> Optional[str]:
    """
    Extract JWT token from the Authorization header only.

    Returns:
        Token string or None
    """
    # Check Authorization header
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header[7:]  # Remove 'Bearer ' prefix

    return None


def require_auth(f):
    """
    Decorator to require authentication for routes

    Usage:
        @app.route('/protected')
        @require_auth
        def protected_route():
            user = g.current_user
            return jsonify({'user': user})
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_token_from_request()

        if not token:
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'message': 'No token provided'
            }), 401

        try:
            payload = verify_token(token)
            g.current_user = payload
        except AuthenticationError as e:
            return jsonify({
                'success': False,
                'error': 'Authentication failed',
                'message': str(e)
            }), 401

        return f(*args, **kwargs)

    return decorated_function


def require_role(required_role: str):
    """
    Decorator to require specific role for routes

    Usage:
        @app.route('/admin')
        @require_auth
        @require_role('admin')
        def admin_route():
            return jsonify({'message': 'Admin access'})
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(g, 'current_user'):
                return jsonify({
                    'success': False,
                    'error': 'Authentication required'
                }), 401

            user_role = g.current_user.get('role')
            if user_role != required_role and user_role != 'admin':
                return jsonify({
                    'success': False,
                    'error': 'Insufficient permissions',
                    'message': f'Role {required_role} required'
                }), 403

            return f(*args, **kwargs)

        return decorated_function

    return decorator


def optional_auth(f):
    """
    Decorator for optional authentication
    Sets g.current_user if token is provided, but doesn't require it

    Usage:
        @app.route('/public-or-private')
        @optional_auth
        def flexible_route():
            if hasattr(g, 'current_user'):
                return jsonify({'user': g.current_user})
            return jsonify({'message': 'Public access'})
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_token_from_request()

        if token:
            try:
                payload = verify_token(token)
                g.current_user = payload
            except AuthenticationError:
                # Token invalid but continue anyway since auth is optional
                pass

        return f(*args, **kwargs)

    return decorated_function


# API Key Authentication (for external integrations)

class APIKeyAuth:
    """API Key authentication for external integrations"""

    def __init__(self):
        # In production, store API keys in database
        # This is a simple in-memory store for demonstration
        self.api_keys = {}

    def generate_api_key(self, client_name: str, permissions: list = None) -> str:
        """Generate new API key for client"""
        import secrets
        api_key = f"tk_{secrets.token_urlsafe(32)}"

        self.api_keys[api_key] = {
            'client_name': client_name,
            'permissions': permissions or ['read'],
            'created_at': datetime.now(timezone.utc).isoformat(),
            'active': True
        }

        return api_key

    def verify_api_key(self, api_key: str) -> Optional[Dict[str, Any]]:
        """Verify API key and return client info"""
        client_info = self.api_keys.get(api_key)

        if not client_info:
            return None

        if not client_info.get('active'):
            return None

        return client_info

    def revoke_api_key(self, api_key: str) -> bool:
        """Revoke API key"""
        if api_key in self.api_keys:
            self.api_keys[api_key]['active'] = False
            return True
        return False


# Global API key manager instance
api_key_manager = APIKeyAuth()


def require_api_key(f):
    """
    Decorator to require API key authentication

    Usage:
        @app.route('/api/external')
        @require_api_key
        def external_api():
            client = g.api_client
            return jsonify({'client': client['client_name']})
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check X-API-Key header
        api_key = request.headers.get('X-API-Key')

        if not api_key and request.args.get('api_key'):
            return jsonify({
                'success': False,
                'error': 'API key required',
                'message': 'Provide API key in the X-API-Key header only'
            }), 401

        if not api_key:
            return jsonify({
                'success': False,
                'error': 'API key required',
                'message': 'Provide API key in the X-API-Key header'
            }), 401

        client_info = api_key_manager.verify_api_key(api_key)

        if not client_info:
            return jsonify({
                'success': False,
                'error': 'Invalid API key',
                'message': 'The provided API key is invalid or has been revoked'
            }), 401

        g.api_client = client_info
        return f(*args, **kwargs)

    return decorated_function


__all__ = [
    'generate_token', 'verify_token', 'require_auth', 'require_role',
    'optional_auth', 'require_api_key', 'api_key_manager',
    'AuthenticationError', 'get_jwt_secret'
]
