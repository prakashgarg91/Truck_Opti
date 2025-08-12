"""
Security Middleware
Enterprise-level security components for authentication, authorization, and protection
"""

import time
import hashlib
import secrets
from typing import Dict, Any, Optional
from flask import request, session, abort, g, current_app
from functools import wraps
from collections import defaultdict, deque
from datetime import datetime, timedelta
import logging

from app.core.logging import security_logger
from app.exceptions import AuthenticationError, AuthorizationError, ValidationError


class SecurityMiddleware:
    """
    Comprehensive security middleware for enterprise applications
    """
    
    def __init__(self, app=None):
        self.app = app
        self.failed_attempts = defaultdict(deque)
        self.blocked_ips = defaultdict(datetime)
        
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize security middleware with Flask app"""
        app.before_request(self.before_request)
        app.after_request(self.after_request)
    
    def before_request(self):
        """Security checks before processing request"""
        # Check if IP is blocked
        self._check_ip_blocked()
        
        # Validate request size
        self._validate_request_size()
        
        # Check for common attack patterns
        self._check_attack_patterns()
        
        # Set security headers context
        g.security_context = {
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', ''),
            'timestamp': datetime.utcnow()
        }
    
    def after_request(self, response):
        """Set security headers after processing request"""
        # Security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Content-Security-Policy'] = self._get_csp_policy()
        
        if request.is_secure:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        return response
    
    def _check_ip_blocked(self):
        """Check if IP address is temporarily blocked"""
        ip = request.remote_addr
        
        if ip in self.blocked_ips:
            if datetime.utcnow() > self.blocked_ips[ip]:
                del self.blocked_ips[ip]
                if ip in self.failed_attempts:
                    del self.failed_attempts[ip]
            else:
                security_logger.log_authentication(
                    user_id="unknown",
                    success=False,
                    ip_address=ip,
                    user_agent=request.headers.get('User-Agent')
                )
                abort(429, "Too many failed attempts. IP temporarily blocked.")
    
    def _validate_request_size(self):
        """Validate request size limits"""
        max_size = current_app.config.get('MAX_CONTENT_LENGTH', 16 * 1024 * 1024)
        
        if request.content_length and request.content_length > max_size:
            security_logger.logger.warning(
                f"Request size exceeded: {request.content_length} bytes",
                extra={
                    "event_type": "security_violation",
                    "violation_type": "request_size_exceeded",
                    "ip_address": request.remote_addr,
                    "size_bytes": request.content_length
                }
            )
            abort(413, "Request too large")
    
    def _check_attack_patterns(self):
        """Check for common attack patterns in request"""
        suspicious_patterns = [
            # SQL injection patterns
            r"('|(\\')|(;)|(\x00)|(\n)|(\r)|(\x1a)",
            # XSS patterns  
            r"<script[^>]*>.*?</script>",
            # Path traversal
            r"\.\./.*",
            # Command injection
            r"[;&|`]"
        ]
        
        # Check URL and parameters
        full_url = request.url
        for pattern in suspicious_patterns:
            if pattern in full_url.lower():
                security_logger.logger.warning(
                    f"Suspicious pattern detected in request",
                    extra={
                        "event_type": "security_violation",
                        "violation_type": "suspicious_pattern",
                        "pattern": pattern,
                        "ip_address": request.remote_addr,
                        "url": request.url
                    }
                )
                break
    
    def _get_csp_policy(self) -> str:
        """Get Content Security Policy"""
        return (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
            "font-src 'self' https://cdn.jsdelivr.net; "
            "object-src 'none'; "
            "media-src 'self'; "
            "frame-src 'none';"
        )
    
    def record_failed_attempt(self, ip: str):
        """Record failed authentication attempt"""
        now = datetime.utcnow()
        
        # Clean old attempts (older than 1 hour)
        cutoff = now - timedelta(hours=1)
        attempts = self.failed_attempts[ip]
        
        while attempts and attempts[0] < cutoff:
            attempts.popleft()
        
        # Add current attempt
        attempts.append(now)
        
        # Block IP if too many attempts
        if len(attempts) >= 5:
            self.blocked_ips[ip] = now + timedelta(minutes=15)
            security_logger.logger.warning(
                f"IP blocked due to repeated failed attempts",
                extra={
                    "event_type": "ip_blocked",
                    "ip_address": ip,
                    "failed_attempts": len(attempts)
                }
            )


class CSRFProtection:
    """Cross-Site Request Forgery protection"""
    
    def __init__(self, app=None):
        self.app = app
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize CSRF protection"""
        app.before_request(self.protect)
    
    def protect(self):
        """Validate CSRF tokens for state-changing requests"""
        if request.method in ['POST', 'PUT', 'DELETE', 'PATCH']:
            token = self.get_token()
            
            if not token:
                abort(403, "CSRF token missing")
            
            if not self.validate_token(token):
                security_logger.logger.warning(
                    "CSRF token validation failed",
                    extra={
                        "event_type": "csrf_violation",
                        "ip_address": request.remote_addr,
                        "user_agent": request.headers.get('User-Agent')
                    }
                )
                abort(403, "CSRF token invalid")
    
    def get_token(self) -> Optional[str]:
        """Extract CSRF token from request"""
        return (request.headers.get('X-CSRF-Token') or 
                request.form.get('csrf_token') or
                request.args.get('csrf_token'))
    
    def validate_token(self, token: str) -> bool:
        """Validate CSRF token"""
        session_token = session.get('csrf_token')
        return session_token and secrets.compare_digest(session_token, token)
    
    def generate_token(self) -> str:
        """Generate new CSRF token"""
        token = secrets.token_urlsafe(32)
        session['csrf_token'] = token
        return token


class RateLimiter:
    """Rate limiting middleware"""
    
    def __init__(self, app=None, default_rate="100/hour"):
        self.app = app
        self.default_rate = default_rate
        self.request_counts = defaultdict(lambda: defaultdict(deque))
        
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize rate limiter"""
        app.before_request(self.check_rate_limit)
    
    def check_rate_limit(self):
        """Check if request exceeds rate limit"""
        identifier = self.get_identifier()
        rate_limit = self.get_rate_limit()
        
        if not self.is_within_limit(identifier, rate_limit):
            security_logger.logger.warning(
                "Rate limit exceeded",
                extra={
                    "event_type": "rate_limit_exceeded",
                    "identifier": identifier,
                    "rate_limit": rate_limit,
                    "endpoint": request.endpoint
                }
            )
            abort(429, "Rate limit exceeded")
    
    def get_identifier(self) -> str:
        """Get identifier for rate limiting (IP or user ID)"""
        if hasattr(g, 'current_user') and g.current_user:
            return f"user:{g.current_user.id}"
        return f"ip:{request.remote_addr}"
    
    def get_rate_limit(self) -> str:
        """Get rate limit for current endpoint"""
        endpoint = request.endpoint or 'default'
        return getattr(request, 'rate_limit', self.default_rate)
    
    def is_within_limit(self, identifier: str, rate_limit: str) -> bool:
        """Check if identifier is within rate limit"""
        limit, period = self.parse_rate_limit(rate_limit)
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=period)
        
        # Clean old requests
        requests = self.request_counts[identifier][rate_limit]
        while requests and requests[0] < cutoff:
            requests.popleft()
        
        # Check if under limit
        if len(requests) >= limit:
            return False
        
        # Record current request
        requests.append(now)
        return True
    
    def parse_rate_limit(self, rate_limit: str) -> tuple:
        """Parse rate limit string (e.g., '100/hour')"""
        limit, period_str = rate_limit.split('/')
        
        period_map = {
            'second': 1,
            'minute': 60,
            'hour': 3600,
            'day': 86400
        }
        
        period = period_map.get(period_str, 3600)
        return int(limit), period


def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, 'current_user') or not g.current_user:
            raise AuthenticationError("Authentication required")
        return f(*args, **kwargs)
    return decorated_function


def require_permission(permission: str):
    """Decorator to require specific permission"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(g, 'current_user') or not g.current_user:
                raise AuthenticationError("Authentication required")
            
            if not g.current_user.has_permission(permission):
                security_logger.log_authorization(
                    user_id=g.current_user.id,
                    resource=request.endpoint,
                    action=permission,
                    granted=False
                )
                raise AuthorizationError(f"Permission required: {permission}")
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def rate_limit(rate: str):
    """Decorator to set rate limit for endpoint"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            request.rate_limit = rate
            return f(*args, **kwargs)
        return decorated_function
    return decorator