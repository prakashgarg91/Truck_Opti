"""
Repository Layer - Data Access Abstraction
Clean architecture repository pattern implementation
"""

from .base import BaseRepository, RepositoryResult
from .truck_repository import TruckRepository, ITruckRepository
from .carton_repository import CartonRepository, ICartonRepository
from .packing_job_repository import PackingJobRepository, IPackingJobRepository
from .shipment_repository import ShipmentRepository, IShipmentRepository
from .analytics_repository import AnalyticsRepository, IAnalyticsRepository

__all__ = [
    # Base patterns
    'BaseRepository', 'RepositoryResult',
    
    # Truck repositories
    'ITruckRepository', 'TruckRepository',
    
    # Carton repositories  
    'ICartonRepository', 'CartonRepository',
    
    # Packing job repositories
    'IPackingJobRepository', 'PackingJobRepository',
    
    # Shipment repositories
    'IShipmentRepository', 'ShipmentRepository',
    
    # Analytics repositories
    'IAnalyticsRepository', 'AnalyticsRepository'
]