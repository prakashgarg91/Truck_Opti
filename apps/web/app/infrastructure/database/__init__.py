"""
Database Infrastructure
SQLAlchemy models and database utilities
"""

# Import models from the app-level models.py for backward compatibility
from app.models import (
    TruckType, CartonType, PackingJob, PackingResult,
    Shipment, UserSettings, db
)

__all__ = [
    'db', 'TruckType', 'CartonType', 'PackingJob',
    'PackingResult', 'Shipment', 'UserSettings'
]
