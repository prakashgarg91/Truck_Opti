"""
Rate Limiting Middleware
Protect API from abuse and DDoS attacks
"""

from functools import wraps
from flask import request, jsonify, g
from typing import Dict, Tuple
import time


class RateLimiter:
    """
    Simple in-memory rate limiter
    For production, use Redis-backed rate limiting
    """

    def __init__(self):
        # Store: {key: [(timestamp, request_count)]}
        self.requests = {}
        self.cleanup_interval = 3600  # Cleanup every hour
        self.last_cleanup = time.time()

    def _get_client_key(self) -> str:
        """Get unique client identifier"""
        # Try to get user ID if authenticated
        if hasattr(g, 'current_user'):
            return f"user:{g.current_user['user_id']}"

        # Try to get API key if present
        if hasattr(g, 'api_client'):
            return f"api_client:{g.api_client['client_name']}"

        # Fall back to IP address
        return f"ip:{request.remote_addr}"

    def _cleanup_old_requests(self):
        """Remove old request records"""
        current_time = time.time()

        if current_time - self.last_cleanup < self.cleanup_interval:
            return

        cutoff_time = current_time - 3600  # Keep last hour

        for key in list(self.requests.keys()):
            self.requests[key] = [
                (ts, count) for ts, count in self.requests[key]
                if ts > cutoff_time
            ]

            # Remove empty entries
            if not self.requests[key]:
                del self.requests[key]

        self.last_cleanup = current_time

    def check_rate_limit(self, max_requests: int, window_seconds: int) -> Tuple[bool, Dict]:
        """
        Check if request is within rate limit

        Args:
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds

        Returns:
            Tuple of (is_allowed, rate_limit_info)
        """
        self._cleanup_old_requests()

        client_key = self._get_client_key()
        current_time = time.time()
        window_start = current_time - window_seconds

        # Get requests within window
        if client_key not in self.requests:
            self.requests[client_key] = []

        # Count requests in window
        requests_in_window = [
            (ts, count) for ts, count in self.requests[client_key]
            if ts > window_start
        ]

        request_count = sum(count for _, count in requests_in_window)

        # Check if limit exceeded
        if request_count >= max_requests:
            # Calculate when the limit will reset
            if requests_in_window:
                oldest_request_time = min(ts for ts, _ in requests_in_window)
                reset_time = oldest_request_time + window_seconds
            else:
                reset_time = current_time + window_seconds

            return False, {
                'limit': max_requests,
                'remaining': 0,
                'reset': int(reset_time),
                'retry_after': int(reset_time - current_time)
            }

        # Record this request
        self.requests[client_key] = requests_in_window + [(current_time, 1)]

        return True, {
            'limit': max_requests,
            'remaining': max_requests - request_count - 1,
            'reset': int(current_time + window_seconds)
        }


# Global rate limiter instance
rate_limiter = RateLimiter()


def rate_limit(max_requests: int = 100, window_seconds: int = 60):
    """
    Decorator to apply rate limiting to routes

    Args:
        max_requests: Maximum number of requests allowed
        window_seconds: Time window in seconds

    Usage:
        @app.route('/api/resource')
        @rate_limit(max_requests=10, window_seconds=60)  # 10 requests per minute
        def resource():
            return jsonify({'data': 'value'})
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            is_allowed, rate_info = rate_limiter.check_rate_limit(
                max_requests, window_seconds
            )

            # Add rate limit headers to response
            def add_rate_limit_headers(response):
                response.headers['X-RateLimit-Limit'] = str(rate_info['limit'])
                response.headers['X-RateLimit-Remaining'] = str(rate_info['remaining'])
                response.headers['X-RateLimit-Reset'] = str(rate_info['reset'])
                return response

            if not is_allowed:
                response = jsonify({
                    'success': False,
                    'error': 'Rate limit exceeded',
                    'message': f'Too many requests. Please try again in {rate_info["retry_after"]} seconds.',
                    'rate_limit': rate_info
                })
                response.status_code = 429
                response.headers['Retry-After'] = str(rate_info['retry_after'])
                return add_rate_limit_headers(response)

            # Execute route
            response = f(*args, **kwargs)

            # Add rate limit headers to successful response
            if hasattr(response, 'headers'):
                return add_rate_limit_headers(response)

            return response

        return decorated_function

    return decorator


# Predefined rate limit tiers
def rate_limit_tier_free(f):
    """Free tier: 60 requests per hour"""
    return rate_limit(max_requests=60, window_seconds=3600)(f)


def rate_limit_tier_basic(f):
    """Basic tier: 300 requests per hour"""
    return rate_limit(max_requests=300, window_seconds=3600)(f)


def rate_limit_tier_pro(f):
    """Pro tier: 1000 requests per hour"""
    return rate_limit(max_requests=1000, window_seconds=3600)(f)


def rate_limit_tier_enterprise(f):
    """Enterprise tier: 10000 requests per hour"""
    return rate_limit(max_requests=10000, window_seconds=3600)(f)


__all__ = [
    'rate_limiter', 'rate_limit',
    'rate_limit_tier_free', 'rate_limit_tier_basic',
    'rate_limit_tier_pro', 'rate_limit_tier_enterprise'
]
