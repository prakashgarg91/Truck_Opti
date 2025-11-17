"""
Web UI Layer - User Interface Routes
Web blueprints for HTML pages and UI interactions
"""

from flask import Blueprint

# Import and register sub-blueprints
from .dashboard import dashboard_bp
from .truck_management import truck_mgmt_bp
from .carton_management import carton_mgmt_bp
from .optimization_ui import optimization_ui_bp
from .analytics_ui import analytics_ui_bp

# Create main web blueprint
web_bp = Blueprint('web', __name__, url_prefix='/web')

# Register UI blueprints
web_bp.register_blueprint(dashboard_bp)
web_bp.register_blueprint(truck_mgmt_bp)
web_bp.register_blueprint(carton_mgmt_bp)
web_bp.register_blueprint(optimization_ui_bp)
web_bp.register_blueprint(analytics_ui_bp)

__all__ = ['web_bp']
