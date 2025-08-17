"""
Domain Entities - Core Business Objects
Clean architecture entities with rich domain behavior
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
import uuid

from .value_objects import Dimensions, Weight, Volume, Money, PackingPosition, OptimizationStrategy
from ..exceptions.domain import DomainValidationError


@dataclass
class TruckEntity:
    """Core truck entity with rich domain behavior"""
    id: Optional[int] = None
    name: str = ""
    dimensions: Optional[Dimensions] = None
    max_weight: Optional[Weight] = None
    cost_per_km: Optional[Money] = None
    fuel_efficiency: float = 0.0  # km per liter
    driver_cost_per_day: Optional[Money] = None
    maintenance_cost_per_km: Optional[Money] = None
    truck_category: str = "Standard"
    availability: bool = True
    description: str = ""
    
    def __post_init__(self):
        if not self.name:
            raise DomainValidationError("Truck name is required")
        if self.dimensions and not self.dimensions.is_valid():
            raise DomainValidationError("Invalid truck dimensions")
    
    @property
    def volume(self) -> Optional[Volume]:
        """Calculate truck volume"""
        if not self.dimensions:
            return None
        return self.dimensions.volume()
    
    @property
    def is_available(self) -> bool:
        """Check if truck is available for booking"""
        return self.availability and self.dimensions and self.dimensions.is_valid()
    
    def can_fit_carton(self, carton: 'CartonEntity') -> bool:
        """Check if carton can physically fit in truck"""
        if not self.dimensions or not carton.dimensions:
            return False
        return self.dimensions.can_contain(carton.dimensions)
    
    def calculate_daily_operating_cost(self, distance_km: float) -> Money:
        """Calculate total daily operating cost"""
        total_cost = Decimal('0.00')
        
        if self.cost_per_km:
            total_cost += self.cost_per_km.amount * Decimal(str(distance_km))
        
        if self.driver_cost_per_day:
            total_cost += self.driver_cost_per_day.amount
        
        if self.maintenance_cost_per_km:
            total_cost += self.maintenance_cost_per_km.amount * Decimal(str(distance_km))
        
        return Money(total_cost)
    
    def get_capacity_utilization(self, packed_cartons: List['CartonEntity']) -> Dict[str, float]:
        """Calculate capacity utilization metrics"""
        if not packed_cartons:
            return {'volume': 0.0, 'weight': 0.0, 'count': 0}
        
        total_carton_volume = sum(c.volume.cubic_meters if c.volume else 0 for c in packed_cartons)
        total_carton_weight = sum(c.weight.kilograms if c.weight else 0 for c in packed_cartons)
        
        volume_util = (total_carton_volume / self.volume.cubic_meters * 100) if self.volume else 0
        weight_util = (total_carton_weight / self.max_weight.kilograms * 100) if self.max_weight else 0
        
        return {
            'volume': round(volume_util, 2),
            'weight': round(weight_util, 2),
            'count': len(packed_cartons)
        }


@dataclass
class CartonEntity:
    """Core carton entity with rich domain behavior"""
    id: Optional[int] = None
    name: str = ""
    dimensions: Optional[Dimensions] = None
    weight: Optional[Weight] = None
    can_rotate: bool = True
    fragile: bool = False
    stackable: bool = True
    max_stack_height: int = 5
    priority: int = 1  # 1-5, 5 being highest
    value: Optional[Money] = None
    category: str = "General"
    description: str = ""
    
    def __post_init__(self):
        if not self.name:
            raise DomainValidationError("Carton name is required")
        if self.dimensions and not self.dimensions.is_valid():
            raise DomainValidationError("Invalid carton dimensions")
        if self.priority not in range(1, 6):
            raise DomainValidationError("Priority must be between 1 and 5")
    
    @property
    def volume(self) -> Optional[Volume]:
        """Calculate carton volume"""
        if not self.dimensions:
            return None
        return self.dimensions.volume()
    
    @property
    def density(self) -> Optional[float]:
        """Calculate density in kg/m³"""
        if not self.weight or not self.volume:
            return None
        return self.weight.kilograms / self.volume.cubic_meters
    
    @property
    def is_high_priority(self) -> bool:
        """Check if carton has high priority"""
        return self.priority >= 4
    
    @property
    def handling_requirements(self) -> Dict[str, Any]:
        """Get handling requirements"""
        return {
            'fragile': self.fragile,
            'stackable': self.stackable,
            'max_stack_height': self.max_stack_height,
            'can_rotate': self.can_rotate,
            'priority': self.priority
        }
    
    def can_be_stacked_with(self, other: 'CartonEntity') -> bool:
        """Check if this carton can be stacked with another"""
        if not self.stackable or not other.stackable:
            return False
        if self.fragile or other.fragile:
            return False
        return True
    
    def get_possible_orientations(self) -> List[Dimensions]:
        """Get all possible orientations if rotation is allowed"""
        if not self.dimensions or not self.can_rotate:
            return [self.dimensions] if self.dimensions else []
        
        return self.dimensions.get_all_orientations()


@dataclass
class PackingJobEntity:
    """Core packing job entity with business logic"""
    id: Optional[int] = None
    name: str = ""
    truck: Optional[TruckEntity] = None
    cartons: List[CartonEntity] = field(default_factory=list)
    strategy: OptimizationStrategy = OptimizationStrategy.SPACE
    status: str = "pending"
    date_created: Optional[datetime] = None
    date_completed: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.name:
            raise DomainValidationError("Packing job name is required")
        if not self.date_created:
            self.date_created = datetime.utcnow()
    
    @property
    def is_completed(self) -> bool:
        """Check if packing job is completed"""
        return self.status == "completed" and self.date_completed is not None
    
    @property
    def total_cartons(self) -> int:
        """Get total number of cartons"""
        return len(self.cartons)
    
    @property
    def total_volume(self) -> Volume:
        """Calculate total volume of all cartons"""
        total_cubic_meters = sum(c.volume.cubic_meters if c.volume else 0 for c in self.cartons)
        return Volume(total_cubic_meters)
    
    @property
    def total_weight(self) -> Weight:
        """Calculate total weight of all cartons"""
        total_kg = sum(c.weight.kilograms if c.weight else 0 for c in self.cartons)
        return Weight(total_kg)
    
    @property
    def total_value(self) -> Money:
        """Calculate total value of all cartons"""
        total_amount = sum(c.value.amount if c.value else Decimal('0') for c in self.cartons)
        return Money(total_amount)
    
    def add_carton(self, carton: CartonEntity, quantity: int = 1) -> None:
        """Add cartons to the job"""
        if quantity <= 0:
            raise DomainValidationError("Quantity must be positive")
        
        for _ in range(quantity):
            self.cartons.append(carton)
    
    def remove_carton(self, carton_id: int) -> bool:
        """Remove carton from the job"""
        original_count = len(self.cartons)
        self.cartons = [c for c in self.cartons if c.id != carton_id]
        return len(self.cartons) < original_count
    
    def can_fit_in_truck(self) -> bool:
        """Check if all cartons can theoretically fit in the truck"""
        if not self.truck:
            return False
        
        return (self.total_volume.cubic_meters <= self.truck.volume.cubic_meters and
                self.total_weight.kilograms <= self.truck.max_weight.kilograms)
    
    def get_high_priority_cartons(self) -> List[CartonEntity]:
        """Get cartons with high priority"""
        return [c for c in self.cartons if c.is_high_priority]
    
    def get_fragile_cartons(self) -> List[CartonEntity]:
        """Get fragile cartons"""
        return [c for c in self.cartons if c.fragile]
    
    def validate_for_processing(self) -> List[str]:
        """Validate job is ready for processing"""
        errors = []
        
        if not self.truck:
            errors.append("No truck assigned to job")
        
        if not self.cartons:
            errors.append("No cartons in job")
        
        if self.truck and not self.truck.is_available:
            errors.append("Assigned truck is not available")
        
        if not self.can_fit_in_truck():
            errors.append("Cartons cannot fit in assigned truck")
        
        return errors


@dataclass
class ShipmentEntity:
    """Core shipment entity with logistics logic"""
    id: Optional[int] = None
    shipment_number: str = ""
    customer_name: str = ""
    delivery_address: str = ""
    priority: int = 1
    delivery_date: Optional[datetime] = None
    status: str = "pending"
    total_value: Optional[Money] = None
    special_instructions: str = ""
    items: List[CartonEntity] = field(default_factory=list)
    date_created: Optional[datetime] = None
    
    def __post_init__(self):
        if not self.shipment_number:
            self.shipment_number = f"SH-{uuid.uuid4().hex[:8].upper()}"
        if not self.date_created:
            self.date_created = datetime.utcnow()
    
    @property
    def is_urgent(self) -> bool:
        """Check if shipment is urgent"""
        return self.priority >= 4
    
    @property
    def total_items(self) -> int:
        """Get total number of items"""
        return len(self.items)
    
    @property
    def calculated_total_value(self) -> Money:
        """Calculate total value from items"""
        total = sum(item.value.amount if item.value else Decimal('0') for item in self.items)
        return Money(total)
    
    def add_item(self, carton: CartonEntity, quantity: int = 1) -> None:
        """Add items to shipment"""
        if quantity <= 0:
            raise DomainValidationError("Quantity must be positive")
        
        for _ in range(quantity):
            self.items.append(carton)
    
    def can_be_consolidated_with(self, other: 'ShipmentEntity') -> bool:
        """Check if this shipment can be consolidated with another"""
        if not other:
            return False
        
        # Same delivery area (simplified check)
        if self.delivery_address != other.delivery_address:
            return False
        
        # Similar delivery dates (within 1 day)
        if self.delivery_date and other.delivery_date:
            time_diff = abs((self.delivery_date - other.delivery_date).days)
            if time_diff > 1:
                return False
        
        return True
    
    def get_consolidation_score(self, other: 'ShipmentEntity') -> float:
        """Calculate consolidation compatibility score (0-1)"""
        if not self.can_be_consolidated_with(other):
            return 0.0
        
        score = 0.0
        
        # Priority similarity (25%)
        priority_diff = abs(self.priority - other.priority)
        score += (5 - priority_diff) / 5 * 0.25
        
        # Value similarity (25%)
        value_ratio = min(self.calculated_total_value.amount, other.calculated_total_value.amount) / \
                     max(self.calculated_total_value.amount, other.calculated_total_value.amount)
        score += value_ratio * 0.25
        
        # Item count similarity (25%)
        count_ratio = min(self.total_items, other.total_items) / max(self.total_items, other.total_items)
        score += count_ratio * 0.25
        
        # Date proximity (25%)
        if self.delivery_date and other.delivery_date:
            days_diff = abs((self.delivery_date - other.delivery_date).days)
            date_score = max(0, (7 - days_diff) / 7)  # 7 days max difference
            score += date_score * 0.25
        else:
            score += 0.25  # Assume good if no dates
        
        return round(score, 3)


@dataclass
class PackingResultEntity:
    """Core packing result entity with optimization metrics"""
    id: Optional[int] = None
    job_id: Optional[int] = None
    truck: Optional[TruckEntity] = None
    packed_cartons: List[CartonEntity] = field(default_factory=list)
    packing_positions: Dict[int, PackingPosition] = field(default_factory=dict)
    space_utilization: float = 0.0
    weight_utilization: float = 0.0
    total_cost: Optional[Money] = None
    optimization_score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    date_calculated: Optional[datetime] = None
    
    def __post_init__(self):
        if not self.date_calculated:
            self.date_calculated = datetime.utcnow()
    
    @property
    def is_optimal(self) -> bool:
        """Check if result is considered optimal"""
        return self.optimization_score >= 0.8 and self.space_utilization >= 75.0
    
    @property
    def efficiency_rating(self) -> str:
        """Get efficiency rating"""
        if self.optimization_score >= 0.9:
            return "Excellent"
        elif self.optimization_score >= 0.8:
            return "Good"
        elif self.optimization_score >= 0.6:
            return "Fair"
        else:
            return "Poor"
    
    def get_position_for_carton(self, carton_id: int) -> Optional[PackingPosition]:
        """Get packing position for specific carton"""
        return self.packing_positions.get(carton_id)
    
    def calculate_wasted_space(self) -> Volume:
        """Calculate wasted space in truck"""
        if not self.truck or not self.truck.volume:
            return Volume(0)
        
        used_volume = sum(c.volume.cubic_meters if c.volume else 0 for c in self.packed_cartons)
        wasted_cubic_meters = self.truck.volume.cubic_meters - used_volume
        return Volume(max(0, wasted_cubic_meters))
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get comprehensive performance metrics"""
        return {
            'space_utilization': self.space_utilization,
            'weight_utilization': self.weight_utilization,
            'optimization_score': self.optimization_score,
            'efficiency_rating': self.efficiency_rating,
            'packed_cartons_count': len(self.packed_cartons),
            'total_cost': self.total_cost.amount if self.total_cost else None,
            'wasted_space_m3': self.calculate_wasted_space().cubic_meters,
            'is_optimal': self.is_optimal
        }