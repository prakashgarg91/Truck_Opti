"""
Domain Value Objects - Immutable Value Types
Clean architecture value objects with validation and behavior
"""

from dataclasses import dataclass
from typing import List, Optional, Union
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from datetime import datetime
import math

from ..exceptions.domain import DomainValidationError


@dataclass(frozen=True)
class Dimensions:
    """Immutable dimensions value object"""
    length: float
    width: float
    height: float
    unit: str = "cm"  # cm, m, mm

    def __post_init__(self):
        if self.length <= 0 or self.width <= 0 or self.height <= 0:
            raise DomainValidationError("All dimensions must be positive")
        if self.unit not in ["cm", "m", "mm", "in", "ft"]:
            raise DomainValidationError("Invalid unit")

    def is_valid(self) -> bool:
        """Check if dimensions are valid"""
        return self.length > 0 and self.width > 0 and self.height > 0

    def volume(self) -> 'Volume':
        """Calculate volume"""
        volume_cubic_units = self.length * self.width * self.height

        # Convert to cubic meters
        if self.unit == "cm":
            cubic_meters = volume_cubic_units / 1_000_000
        elif self.unit == "m":
            cubic_meters = volume_cubic_units
        elif self.unit == "mm":
            cubic_meters = volume_cubic_units / 1_000_000_000
        elif self.unit == "in":
            cubic_meters = volume_cubic_units * 0.000016387
        elif self.unit == "ft":
            cubic_meters = volume_cubic_units * 0.028317
        else:
            cubic_meters = volume_cubic_units / 1_000_000  # Default to cm

        return Volume(cubic_meters)

    def surface_area(self) -> float:
        """Calculate surface area"""
        return 2 * (self.length * self.width + self.width *
                    self.height + self.height * self.length)

    def diagonal(self) -> float:
        """Calculate 3D diagonal"""
        return math.sqrt(self.length**2 + self.width**2 + self.height**2)

    def can_contain(self, other: 'Dimensions') -> bool:
        """Check if these dimensions can contain another"""
        if not self.is_valid() or not other.is_valid():
            return False

        # Convert to same unit for comparison
        other_converted = other.convert_to(self.unit)

        return (self.length >= other_converted.length and
                self.width >= other_converted.width and
                self.height >= other_converted.height)

    def convert_to(self, target_unit: str) -> 'Dimensions':
        """Convert to different unit"""
        if self.unit == target_unit:
            return self

        # Conversion factors to meters
        to_meters = {
            "cm": 0.01,
            "m": 1.0,
            "mm": 0.001,
            "in": 0.0254,
            "ft": 0.3048
        }

        # Convert to meters first
        length_m = self.length * to_meters[self.unit]
        width_m = self.width * to_meters[self.unit]
        height_m = self.height * to_meters[self.unit]

        # Convert from meters to target unit
        from_meters = 1.0 / to_meters[target_unit]

        return Dimensions(
            length=length_m * from_meters,
            width=width_m * from_meters,
            height=height_m * from_meters,
            unit=target_unit
        )

    def get_all_orientations(self) -> List['Dimensions']:
        """Get all possible orientations (rotations)"""
        orientations = [
            Dimensions(self.length, self.width, self.height, self.unit),
            Dimensions(self.length, self.height, self.width, self.unit),
            Dimensions(self.width, self.length, self.height, self.unit),
            Dimensions(self.width, self.height, self.length, self.unit),
            Dimensions(self.height, self.length, self.width, self.unit),
            Dimensions(self.height, self.width, self.length, self.unit),
        ]

        # Remove duplicates
        unique_orientations = []
        for orientation in orientations:
            if orientation not in unique_orientations:
                unique_orientations.append(orientation)

        return unique_orientations

    def fits_in_any_orientation(self, container: 'Dimensions') -> bool:
        """Check if this fits in container in any orientation"""
        return any(container.can_contain(orientation)
                   for orientation in self.get_all_orientations())


@dataclass(frozen=True)
class Weight:
    """Immutable weight value object"""
    value: float
    unit: str = "kg"  # kg, g, lb, oz, ton

    def __post_init__(self):
        if self.value < 0:
            raise DomainValidationError("Weight cannot be negative")
        if self.unit not in ["kg", "g", "lb", "oz", "ton"]:
            raise DomainValidationError("Invalid weight unit")

    @property
    def kilograms(self) -> float:
        """Get weight in kilograms"""
        conversions = {
            "kg": 1.0,
            "g": 0.001,
            "lb": 0.453592,
            "oz": 0.0283495,
            "ton": 1000.0
        }
        return self.value * conversions[self.unit]

    @property
    def grams(self) -> float:
        """Get weight in grams"""
        return self.kilograms * 1000

    @property
    def pounds(self) -> float:
        """Get weight in pounds"""
        return self.kilograms / 0.453592

    def convert_to(self, target_unit: str) -> 'Weight':
        """Convert to different unit"""
        if self.unit == target_unit:
            return self

        kg_value = self.kilograms

        conversions = {
            "kg": 1.0,
            "g": 1000.0,
            "lb": 2.20462,
            "oz": 35.274,
            "ton": 0.001
        }

        target_value = kg_value * conversions[target_unit]
        return Weight(target_value, target_unit)

    def __add__(self, other: 'Weight') -> 'Weight':
        """Add weights"""
        total_kg = self.kilograms + other.kilograms
        return Weight(total_kg, "kg")

    def __sub__(self, other: 'Weight') -> 'Weight':
        """Subtract weights"""
        result_kg = max(0, self.kilograms - other.kilograms)
        return Weight(result_kg, "kg")


@dataclass(frozen=True)
class Volume:
    """Immutable volume value object"""
    cubic_meters: float

    def __post_init__(self):
        if self.cubic_meters < 0:
            raise DomainValidationError("Volume cannot be negative")

    @property
    def cubic_centimeters(self) -> float:
        """Get volume in cubic centimeters"""
        return self.cubic_meters * 1_000_000

    @property
    def liters(self) -> float:
        """Get volume in liters"""
        return self.cubic_meters * 1000

    @property
    def cubic_feet(self) -> float:
        """Get volume in cubic feet"""
        return self.cubic_meters * 35.3147

    def __add__(self, other: 'Volume') -> 'Volume':
        """Add volumes"""
        return Volume(self.cubic_meters + other.cubic_meters)

    def __sub__(self, other: 'Volume') -> 'Volume':
        """Subtract volumes"""
        return Volume(max(0, self.cubic_meters - other.cubic_meters))

    def __mul__(self, factor: float) -> 'Volume':
        """Multiply volume by factor"""
        return Volume(self.cubic_meters * factor)

    def __truediv__(self, divisor: float) -> 'Volume':
        """Divide volume"""
        if divisor == 0:
            raise DomainValidationError("Cannot divide by zero")
        return Volume(self.cubic_meters / divisor)


@dataclass(frozen=True)
class Money:
    """Immutable money value object"""
    amount: Decimal
    currency: str = "INR"

    def __post_init__(self):
        if not isinstance(self.amount, Decimal):
            object.__setattr__(self, 'amount', Decimal(str(self.amount)))

        if self.amount < 0:
            raise DomainValidationError("Money amount cannot be negative")

        # Round to 2 decimal places
        rounded_amount = self.amount.quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP)
        object.__setattr__(self, 'amount', rounded_amount)

    def __add__(self, other: 'Money') -> 'Money':
        """Add money amounts"""
        if self.currency != other.currency:
            raise DomainValidationError("Cannot add different currencies")
        return Money(self.amount + other.amount, self.currency)

    def __sub__(self, other: 'Money') -> 'Money':
        """Subtract money amounts"""
        if self.currency != other.currency:
            raise DomainValidationError("Cannot subtract different currencies")
        result = self.amount - other.amount
        return Money(max(Decimal('0'), result), self.currency)

    def __mul__(self, factor: Union[int, float, Decimal]) -> 'Money':
        """Multiply money by factor"""
        return Money(self.amount * Decimal(str(factor)), self.currency)

    def __truediv__(self, divisor: Union[int, float, Decimal]) -> 'Money':
        """Divide money"""
        if divisor == 0:
            raise DomainValidationError("Cannot divide by zero")
        return Money(self.amount / Decimal(str(divisor)), self.currency)

    def format(self) -> str:
        """Format money as string"""
        return f"{self.currency} {self.amount:,.2f}"


@dataclass(frozen=True)
class PackingPosition:
    """3D position for packed items"""
    x: float
    y: float
    z: float
    orientation: int = 0  # 0-5 for different rotations

    def __post_init__(self):
        if any(coord < 0 for coord in [self.x, self.y, self.z]):
            raise DomainValidationError(
                "Position coordinates cannot be negative")
        if self.orientation not in range(6):
            raise DomainValidationError("Orientation must be 0-5")

    def distance_from_origin(self) -> float:
        """Calculate distance from origin"""
        return math.sqrt(self.x**2 + self.y**2 + self.z**2)

    def is_at_bottom(self) -> bool:
        """Check if position is at bottom of container"""
        return self.z == 0


class OptimizationStrategy(Enum):
    """Optimization strategy enumeration"""
    SPACE = "space"
    COST = "cost"
    WEIGHT = "weight"
    BALANCED = "balanced"
    TIME = "time"

    def __str__(self):
        return self.value

    @classmethod
    def from_string(cls, value: str) -> 'OptimizationStrategy':
        """Create from string value"""
        try:
            return cls(value.lower())
        except ValueError:
            raise DomainValidationError(
                f"Invalid optimization strategy: {value}")


class PackingStrategy(Enum):
    """Packing strategy enumeration"""
    BOTTOM_LEFT_FILL = "bottom_left_fill"
    BEST_FIT = "best_fit"
    FIRST_FIT = "first_fit"
    GENETIC_ALGORITHM = "genetic_algorithm"

    def __str__(self):
        return self.value


class Priority(Enum):
    """Priority levels"""
    VERY_LOW = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    VERY_HIGH = 5

    @property
    def is_urgent(self) -> bool:
        return self.value >= 4


@dataclass(frozen=True)
class CostBreakdown:
    """Detailed cost breakdown"""
    fuel_cost: Money
    driver_cost: Money
    maintenance_cost: Money
    toll_cost: Money = Money(Decimal('0'))
    insurance_cost: Money = Money(Decimal('0'))
    loading_cost: Money = Money(Decimal('0'))

    @property
    def total_cost(self) -> Money:
        """Calculate total cost"""
        return (self.fuel_cost + self.driver_cost + self.maintenance_cost +
                self.toll_cost + self.insurance_cost + self.loading_cost)

    @property
    def operational_cost(self) -> Money:
        """Calculate operational cost (without tolls and insurance)"""
        return self.fuel_cost + self.driver_cost + \
            self.maintenance_cost + self.loading_cost

    def get_breakdown_percentages(self) -> dict:
        """Get cost breakdown as percentages"""
        total = self.total_cost.amount
        if total == 0:
            return {}

        return {
            'fuel': float(self.fuel_cost.amount / total * 100),
            'driver': float(self.driver_cost.amount / total * 100),
            'maintenance': float(self.maintenance_cost.amount / total * 100),
            'toll': float(self.toll_cost.amount / total * 100),
            'insurance': float(self.insurance_cost.amount / total * 100),
            'loading': float(self.loading_cost.amount / total * 100)
        }


@dataclass(frozen=True)
class Address:
    """Address value object"""
    street: str
    city: str
    state: str
    postal_code: str
    country: str = "India"

    def __post_init__(self):
        if not all([self.street, self.city, self.state, self.postal_code]):
            raise DomainValidationError("All address fields are required")

    def format_single_line(self) -> str:
        """Format address as single line"""
        return f"{
            self.street}, {
            self.city}, {
            self.state} {
                self.postal_code}, {
                    self.country}"

    def format_multi_line(self) -> str:
        """Format address as multiple lines"""
        return f"{
            self.street}\n{
            self.city}, {
            self.state} {
                self.postal_code}\n{
                    self.country}"

    def is_same_city(self, other: 'Address') -> bool:
        """Check if in same city"""
        return (self.city.lower() == other.city.lower() and
                self.state.lower() == other.state.lower())

    def is_same_region(self, other: 'Address') -> bool:
        """Check if in same region (state)"""
        return self.state.lower() == other.state.lower()


@dataclass(frozen=True)
class DateRange:
    """Date range value object"""
    start_date: datetime
    end_date: datetime

    def __post_init__(self):
        if self.start_date >= self.end_date:
            raise DomainValidationError("Start date must be before end date")

    @property
    def duration_days(self) -> int:
        """Get duration in days"""
        return (self.end_date - self.start_date).days

    def contains_date(self, date: datetime) -> bool:
        """Check if date is within range"""
        return self.start_date <= date <= self.end_date

    def overlaps_with(self, other: 'DateRange') -> bool:
        """Check if overlaps with another date range"""
        return (self.start_date <= other.end_date and
                other.start_date <= self.end_date)
