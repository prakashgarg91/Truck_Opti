"""
Truck Controller - Truck Management Operations
"""

from .base import ApiController


class TruckController(ApiController):
    """Controller for truck operations"""
    
    def __init__(self):
        super().__init__()
    
    def list_trucks(self):
        """List all trucks"""
        return self.create_success_response({"trucks": []})