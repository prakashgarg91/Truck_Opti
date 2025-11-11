"""
API Version 1 - RESTful Endpoints
Main API blueprint with all v1 endpoints
"""

from flask import Blueprint, jsonify
from datetime import datetime

# Create main API v1 blueprint
api_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')

# Import and register resource blueprints
from .trucks import trucks_bp
from .cartons import cartons_bp
from .optimization import optimization_bp
from .analytics import analytics_bp
from .shipments import shipments_bp
from .health import health_bp

# Register sub-blueprints
api_v1.register_blueprint(trucks_bp)
api_v1.register_blueprint(cartons_bp)
api_v1.register_blueprint(optimization_bp)
api_v1.register_blueprint(analytics_bp)
api_v1.register_blueprint(shipments_bp)
api_v1.register_blueprint(health_bp)


# API v1 root endpoint
@api_v1.route('/')
def api_root():
    """API v1 root endpoint with available resources"""
    return jsonify({
        'version': '1.0',
        'status': 'active',
        'timestamp': datetime.utcnow().isoformat(),
        'resources': {
            'trucks': '/api/v1/trucks',
            'cartons': '/api/v1/cartons',
            'optimization': '/api/v1/optimization',
            'analytics': '/api/v1/analytics',
            'shipments': '/api/v1/shipments',
            'health': '/api/v1/health'
        },
        'documentation': '/api/v1/docs'
    })


__all__ = ['api_v1']
