"""
Controller Layer - Presentation Logic
Clean architecture controllers with separation of concerns
"""

from .base import BaseController, ControllerResult, ApiController, WebController
from .truck_controller import TruckController
from .optimization_controller import OptimizationController
from .analytics_controller import AnalyticsController
from .shipment_controller import ShipmentController

__all__ = [
    # Base controllers
    'BaseController', 'ControllerResult', 'ApiController', 'WebController',
    
    # Specific controllers
    'TruckController', 'OptimizationController', 'AnalyticsController', 
    'ShipmentController'
]