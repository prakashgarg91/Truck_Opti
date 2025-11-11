"""
API Layer - RESTful API Endpoints
Versioned API implementation for TruckOpti
"""

from flask import Blueprint

# Import API versions
from .v1 import api_v1

__all__ = ['api_v1']
