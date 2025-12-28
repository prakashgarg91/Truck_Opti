"""
API Layer - RESTful API Endpoints
Versioned API implementation for TruckOpti
"""

# Import API versions
from .v1 import api_v1
from .upload_routes import upload_bp

__all__ = ['api_v1', 'upload_bp']
