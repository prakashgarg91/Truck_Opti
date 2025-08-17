"""
Truck Repository Implementation
Specialized repository for truck entity operations
"""

from typing import List, Optional, Dict, Any
from abc import ABC, abstractmethod
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from .base import BaseRepository, IRepository, RepositoryResult, QueryFilter, QuerySpec, PagedResult
from ..models import TruckType
from ..domain.entities import TruckEntity
from ..domain.value_objects import Dimensions, Weight, Money


class ITruckRepository(IRepository[TruckEntity]):
    """Truck repository interface"""
    
    @abstractmethod
    def get_available_trucks(self) -> RepositoryResult[List[TruckEntity]]:
        """Get all available trucks"""
        pass
    
    @abstractmethod
    def find_by_capacity_range(self, min_volume: float, max_volume: float) -> RepositoryResult[List[TruckEntity]]:
        """Find trucks by volume capacity range"""
        pass
    
    @abstractmethod
    def find_by_category(self, category: str) -> RepositoryResult[List[TruckEntity]]:
        """Find trucks by category"""
        pass
    
    @abstractmethod
    def get_trucks_for_weight(self, weight_kg: float) -> RepositoryResult[List[TruckEntity]]:
        """Get trucks that can handle specific weight"""
        pass
    
    @abstractmethod
    def search_trucks(self, search_term: str) -> RepositoryResult[List[TruckEntity]]:
        """Search trucks by name or description"""
        pass


class TruckRepository(BaseRepository[TruckEntity, TruckType], ITruckRepository):
    """Concrete truck repository implementation"""
    
    def __init__(self, db: Session):
        super().__init__(db, TruckType, self._map_to_entity)
    
    def _map_to_entity(self, model: TruckType) -> TruckEntity:
        """Map SQLAlchemy model to domain entity"""
        try:
            dimensions = None
            if model.length and model.width and model.height:
                dimensions = Dimensions(
                    length=model.length,
                    width=model.width, 
                    height=model.height,
                    unit="cm"
                )
            
            max_weight = Weight(model.max_weight, "kg") if model.max_weight else None
            cost_per_km = Money(model.cost_per_km or 0.0)
            driver_cost = Money(model.driver_cost_per_day or 0.0)
            maintenance_cost = Money(model.maintenance_cost_per_km or 0.0)
            
            return TruckEntity(
                id=model.id,
                name=model.name,
                dimensions=dimensions,
                max_weight=max_weight,
                cost_per_km=cost_per_km,
                fuel_efficiency=model.fuel_efficiency or 0.0,
                driver_cost_per_day=driver_cost,
                maintenance_cost_per_km=maintenance_cost,
                truck_category=model.truck_category or "Standard",
                availability=model.availability,
                description=model.description or ""
            )
        except Exception as e:
            self.logger.error(f"Error mapping truck model to entity: {str(e)}")
            raise
    
    def get_available_trucks(self) -> RepositoryResult[List[TruckEntity]]:
        """Get all available trucks"""
        try:
            spec = QuerySpec()
            spec.add_filter("availability", "eq", True)
            
            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result
            
        except Exception as e:
            self.logger.error(f"Error getting available trucks: {str(e)}")
            return RepositoryResult.error_result(f"Error getting available trucks: {str(e)}")
    
    def find_by_capacity_range(self, min_volume: float, max_volume: float) -> RepositoryResult[List[TruckEntity]]:
        """Find trucks by volume capacity range"""
        try:
            # Calculate volume in database using raw SQL for performance
            query = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.length.isnot(None),
                    self.model_class.width.isnot(None),
                    self.model_class.height.isnot(None),
                    (self.model_class.length * self.model_class.width * self.model_class.height / 1000000).between(min_volume, max_volume)
                )
            )
            
            models = query.all()
            entities = [self._map_to_entity(model) for model in models]
            
            return RepositoryResult.success_result(entities)
            
        except Exception as e:
            self.logger.error(f"Error finding trucks by capacity range: {str(e)}")
            return RepositoryResult.error_result(f"Error finding trucks by capacity range: {str(e)}")
    
    def find_by_category(self, category: str) -> RepositoryResult[List[TruckEntity]]:
        """Find trucks by category"""
        try:
            spec = QuerySpec()
            spec.add_filter("truck_category", "eq", category)
            spec.add_filter("availability", "eq", True)
            
            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result
            
        except Exception as e:
            self.logger.error(f"Error finding trucks by category: {str(e)}")
            return RepositoryResult.error_result(f"Error finding trucks by category: {str(e)}")
    
    def get_trucks_for_weight(self, weight_kg: float) -> RepositoryResult[List[TruckEntity]]:
        """Get trucks that can handle specific weight"""
        try:
            spec = QuerySpec()
            spec.add_filter("max_weight", "gte", weight_kg)
            spec.add_filter("availability", "eq", True)
            spec.sort_field = "max_weight"
            spec.sort_direction = "asc"
            
            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result
            
        except Exception as e:
            self.logger.error(f"Error getting trucks for weight: {str(e)}")
            return RepositoryResult.error_result(f"Error getting trucks for weight: {str(e)}")
    
    def search_trucks(self, search_term: str) -> RepositoryResult[List[TruckEntity]]:
        """Search trucks by name or description"""
        try:
            query = self.db.query(self.model_class).filter(
                or_(
                    self.model_class.name.ilike(f'%{search_term}%'),
                    self.model_class.description.ilike(f'%{search_term}%')
                )
            )
            
            models = query.all()
            entities = [self._map_to_entity(model) for model in models]
            
            return RepositoryResult.success_result(entities)
            
        except Exception as e:
            self.logger.error(f"Error searching trucks: {str(e)}")
            return RepositoryResult.error_result(f"Error searching trucks: {str(e)}")
    
    def get_performance_analytics(self) -> RepositoryResult[Dict[str, Any]]:
        """Get truck performance analytics"""
        try:
            # Calculate various truck metrics
            total_trucks = self.db.query(func.count(self.model_class.id)).scalar()
            available_trucks = self.db.query(func.count(self.model_class.id)).filter(
                self.model_class.availability == True
            ).scalar()
            
            # Average capacity by category
            capacity_by_category = self.db.query(
                self.model_class.truck_category,
                func.avg(self.model_class.length * self.model_class.width * self.model_class.height / 1000000).label('avg_volume'),
                func.count(self.model_class.id).label('count')
            ).group_by(self.model_class.truck_category).all()
            
            # Cost efficiency metrics
            cost_efficiency = self.db.query(
                func.avg(self.model_class.cost_per_km).label('avg_cost_per_km'),
                func.avg(self.model_class.fuel_efficiency).label('avg_fuel_efficiency')
            ).first()
            
            analytics = {
                'total_trucks': total_trucks,
                'available_trucks': available_trucks,
                'availability_rate': (available_trucks / total_trucks * 100) if total_trucks > 0 else 0,
                'capacity_by_category': [
                    {
                        'category': cat.truck_category,
                        'avg_volume_m3': float(cat.avg_volume or 0),
                        'count': cat.count
                    }
                    for cat in capacity_by_category
                ],
                'cost_metrics': {
                    'avg_cost_per_km': float(cost_efficiency.avg_cost_per_km or 0),
                    'avg_fuel_efficiency': float(cost_efficiency.avg_fuel_efficiency or 0)
                }
            }
            
            return RepositoryResult.success_result(analytics)
            
        except Exception as e:
            self.logger.error(f"Error getting truck analytics: {str(e)}")
            return RepositoryResult.error_result(f"Error getting truck analytics: {str(e)}")
    
    def get_optimal_trucks_for_cartons(self, total_volume: float, total_weight: float) -> RepositoryResult[List[TruckEntity]]:
        """Get optimal trucks for given carton requirements"""
        try:
            # Find trucks that can handle the requirements
            query = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.availability == True,
                    self.model_class.max_weight >= total_weight,
                    (self.model_class.length * self.model_class.width * self.model_class.height / 1000000) >= total_volume
                )
            ).order_by(
                # Order by efficiency: smallest truck that fits, then by cost
                (self.model_class.length * self.model_class.width * self.model_class.height),
                self.model_class.cost_per_km
            )
            
            models = query.all()
            entities = [self._map_to_entity(model) for model in models]
            
            return RepositoryResult.success_result(entities)
            
        except Exception as e:
            self.logger.error(f"Error getting optimal trucks: {str(e)}")
            return RepositoryResult.error_result(f"Error getting optimal trucks: {str(e)}")
    
    def update_availability(self, truck_id: int, available: bool) -> RepositoryResult[TruckEntity]:
        """Update truck availability status"""
        try:
            return self.update(truck_id, {'availability': available})
            
        except Exception as e:
            self.logger.error(f"Error updating truck availability: {str(e)}")
            return RepositoryResult.error_result(f"Error updating truck availability: {str(e)}")
    
    def get_trucks_by_ids(self, truck_ids: List[int]) -> RepositoryResult[List[TruckEntity]]:
        """Get multiple trucks by their IDs"""
        try:
            models = self.db.query(self.model_class).filter(
                self.model_class.id.in_(truck_ids)
            ).all()
            
            entities = [self._map_to_entity(model) for model in models]
            return RepositoryResult.success_result(entities)
            
        except Exception as e:
            self.logger.error(f"Error getting trucks by IDs: {str(e)}")
            return RepositoryResult.error_result(f"Error getting trucks by IDs: {str(e)}")