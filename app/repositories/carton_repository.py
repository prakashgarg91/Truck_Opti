"""
Carton Repository Implementation
Specialized repository for carton entity operations
"""

from typing import List, Optional, Dict, Any
from abc import ABC, abstractmethod
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from .base import BaseRepository, IRepository, RepositoryResult, QueryFilter, QuerySpec, PagedResult
from ..models import CartonType
from ..domain.entities import CartonEntity
from ..domain.value_objects import Dimensions, Weight, Money


class ICartonRepository(IRepository[CartonEntity]):
    """Carton repository interface"""
    
    @abstractmethod
    def find_by_category(self, category: str) -> RepositoryResult[List[CartonEntity]]:
        """Find cartons by category"""
        pass
    
    @abstractmethod
    def find_fragile_cartons(self) -> RepositoryResult[List[CartonEntity]]:
        """Find all fragile cartons"""
        pass
    
    @abstractmethod
    def find_by_dimensions_range(self, min_volume: float, max_volume: float) -> RepositoryResult[List[CartonEntity]]:
        """Find cartons by volume range"""
        pass
    
    @abstractmethod
    def search_cartons(self, search_term: str) -> RepositoryResult[List[CartonEntity]]:
        """Search cartons by name or description"""
        pass


class CartonRepository(BaseRepository[CartonEntity, CartonType], ICartonRepository):
    """Concrete carton repository implementation"""
    
    def __init__(self, db: Session):
        super().__init__(db, CartonType, self._map_to_entity)
    
    def _map_to_entity(self, model: CartonType) -> CartonEntity:
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
            
            weight = Weight(model.weight, "kg") if model.weight else None
            value = Money(model.value or 0.0)
            
            return CartonEntity(
                id=model.id,
                name=model.name,
                dimensions=dimensions,
                weight=weight,
                can_rotate=model.can_rotate,
                fragile=model.fragile,
                stackable=model.stackable,
                max_stack_height=model.max_stack_height,
                priority=model.priority,
                value=value,
                category=model.category or "General",
                description=model.description or ""
            )
        except Exception as e:
            self.logger.error(f"Error mapping carton model to entity: {str(e)}")
            raise
    
    def find_by_category(self, category: str) -> RepositoryResult[List[CartonEntity]]:
        """Find cartons by category"""
        try:
            spec = QuerySpec()
            spec.add_filter("category", "eq", category)
            
            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result
            
        except Exception as e:
            self.logger.error(f"Error finding cartons by category: {str(e)}")
            return RepositoryResult.error_result(f"Error finding cartons by category: {str(e)}")
    
    def find_fragile_cartons(self) -> RepositoryResult[List[CartonEntity]]:
        """Find all fragile cartons"""
        try:
            spec = QuerySpec()
            spec.add_filter("fragile", "eq", True)
            
            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result
            
        except Exception as e:
            self.logger.error(f"Error finding fragile cartons: {str(e)}")
            return RepositoryResult.error_result(f"Error finding fragile cartons: {str(e)}")
    
    def find_by_dimensions_range(self, min_volume: float, max_volume: float) -> RepositoryResult[List[CartonEntity]]:
        """Find cartons by volume range"""
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
            self.logger.error(f"Error finding cartons by dimensions range: {str(e)}")
            return RepositoryResult.error_result(f"Error finding cartons by dimensions range: {str(e)}")
    
    def search_cartons(self, search_term: str) -> RepositoryResult[List[CartonEntity]]:
        """Search cartons by name or description"""
        try:
            query = self.db.query(self.model_class).filter(
                or_(
                    self.model_class.name.ilike(f'%{search_term}%'),
                    self.model_class.description.ilike(f'%{search_term}%'),
                    self.model_class.category.ilike(f'%{search_term}%')
                )
            )
            
            models = query.all()
            entities = [self._map_to_entity(model) for model in models]
            
            return RepositoryResult.success_result(entities)
            
        except Exception as e:
            self.logger.error(f"Error searching cartons: {str(e)}")
            return RepositoryResult.error_result(f"Error searching cartons: {str(e)}")
    
    def get_cartons_by_priority(self, min_priority: int = 1) -> RepositoryResult[List[CartonEntity]]:
        """Get cartons with minimum priority level"""
        try:
            spec = QuerySpec()
            spec.add_filter("priority", "gte", min_priority)
            spec.sort_field = "priority"
            spec.sort_direction = "desc"
            
            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result
            
        except Exception as e:
            self.logger.error(f"Error getting cartons by priority: {str(e)}")
            return RepositoryResult.error_result(f"Error getting cartons by priority: {str(e)}")
    
    def get_packaging_analytics(self) -> RepositoryResult[Dict[str, Any]]:
        """Get packaging analytics for cartons"""
        try:
            # Calculate various carton metrics
            total_cartons = self.db.query(func.count(self.model_class.id)).scalar()
            
            # Volume distribution
            volume_stats = self.db.query(
                func.avg(self.model_class.length * self.model_class.width * self.model_class.height / 1000000).label('avg_volume'),
                func.min(self.model_class.length * self.model_class.width * self.model_class.height / 1000000).label('min_volume'),
                func.max(self.model_class.length * self.model_class.width * self.model_class.height / 1000000).label('max_volume')
            ).first()
            
            # Category distribution
            category_distribution = self.db.query(
                self.model_class.category,
                func.count(self.model_class.id).label('count')
            ).group_by(self.model_class.category).all()
            
            # Fragile vs non-fragile
            fragile_count = self.db.query(func.count(self.model_class.id)).filter(
                self.model_class.fragile == True
            ).scalar()
            
            # Priority distribution
            priority_distribution = self.db.query(
                self.model_class.priority,
                func.count(self.model_class.id).label('count')
            ).group_by(self.model_class.priority).all()
            
            analytics = {
                'total_cartons': total_cartons,
                'volume_statistics': {
                    'avg_volume_m3': float(volume_stats.avg_volume or 0),
                    'min_volume_m3': float(volume_stats.min_volume or 0),
                    'max_volume_m3': float(volume_stats.max_volume or 0)
                },
                'category_distribution': [
                    {'category': cat.category, 'count': cat.count}
                    for cat in category_distribution
                ],
                'fragile_ratio': (fragile_count / total_cartons * 100) if total_cartons > 0 else 0,
                'priority_distribution': [
                    {'priority': pri.priority, 'count': pri.count}
                    for pri in priority_distribution
                ]
            }
            
            return RepositoryResult.success_result(analytics)
            
        except Exception as e:
            self.logger.error(f"Error getting packaging analytics: {str(e)}")
            return RepositoryResult.error_result(f"Error getting packaging analytics: {str(e)}")
    
    def get_cartons_by_ids(self, carton_ids: List[int]) -> RepositoryResult[List[CartonEntity]]:
        """Get multiple cartons by their IDs"""
        try:
            models = self.db.query(self.model_class).filter(
                self.model_class.id.in_(carton_ids)
            ).all()
            
            entities = [self._map_to_entity(model) for model in models]
            return RepositoryResult.success_result(entities)
            
        except Exception as e:
            self.logger.error(f"Error getting cartons by IDs: {str(e)}")
            return RepositoryResult.error_result(f"Error getting cartons by IDs: {str(e)}")
    
    def find_similar_cartons(self, reference_carton: CartonEntity, tolerance: float = 0.1) -> RepositoryResult[List[CartonEntity]]:
        """Find cartons similar to reference carton"""
        try:
            if not reference_carton.dimensions:
                return RepositoryResult.success_result([])
            
            ref_volume = reference_carton.dimensions.volume().cubic_meters
            min_volume = ref_volume * (1 - tolerance)
            max_volume = ref_volume * (1 + tolerance)
            
            # Find cartons with similar volume
            volume_result = self.find_by_dimensions_range(min_volume, max_volume)
            if not volume_result.success:
                return volume_result
            
            similar_cartons = []
            for carton in volume_result.data:
                # Additional similarity checks
                if (carton.category == reference_carton.category and
                    carton.fragile == reference_carton.fragile and
                    abs(carton.priority - reference_carton.priority) <= 1):
                    similar_cartons.append(carton)
            
            return RepositoryResult.success_result(similar_cartons)
            
        except Exception as e:
            self.logger.error(f"Error finding similar cartons: {str(e)}")
            return RepositoryResult.error_result(f"Error finding similar cartons: {str(e)}")