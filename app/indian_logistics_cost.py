"""
Comprehensive Indian Logistics Cost Calculator
Factors in all real-world costs for accurate transportation pricing
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import math

@dataclass
class RouteDetails:
    """Complete route information for cost calculation"""
    origin: str
    destination: str
    distance_km: float
    highway_percentage: float = 0.7  # 70% highway, 30% city roads
    toll_roads: bool = True
    estimated_travel_time_hours: float = 0
    route_difficulty: str = "normal"  # easy, normal, difficult
    
    def __post_init__(self):
        if self.estimated_travel_time_hours == 0:
            # Calculate based on distance and road type
            avg_speed = 45 if self.highway_percentage > 0.5 else 30  # km/h
            self.estimated_travel_time_hours = self.distance_km / avg_speed

@dataclass
class TruckSpecs:
    """Truck specifications for cost calculation"""
    category: str  # LCV, MCV, HCV
    fuel_tank_capacity: float
    mileage_kmpl: float
    driver_capacity: int = 1  # 1 or 2 drivers needed
    sleeper_cabin: bool = False
    max_daily_driving_hours: float = 10

@dataclass
class IndianLogisticsCostBreakdown:
    """Detailed cost breakdown for Indian logistics"""
    # Fuel Costs
    fuel_cost: float = 0
    fuel_surcharge: float = 0  # Additional fuel cost fluctuations
    
    # Driver Costs  
    driver_wages: float = 0
    driver_allowances: float = 0  # DA, food allowance
    night_halt_charges: float = 0
    overtime_charges: float = 0
    
    # Route Costs
    toll_charges: float = 0
    state_border_taxes: float = 0
    entry_permits: float = 0
    parking_charges: float = 0
    
    # Vehicle Costs
    vehicle_maintenance: float = 0
    tire_wear: float = 0
    insurance_per_trip: float = 0
    vehicle_depreciation: float = 0
    
    # Additional Costs
    loading_unloading: float = 0
    documentation_charges: float = 0
    gst_applicable: float = 0
    emergency_fund: float = 0  # 2-3% buffer
    
    @property
    def total_cost(self) -> float:
        return (
            self.fuel_cost + self.fuel_surcharge +
            self.driver_wages + self.driver_allowances + self.night_halt_charges + self.overtime_charges +
            self.toll_charges + self.state_border_taxes + self.entry_permits + self.parking_charges +
            self.vehicle_maintenance + self.tire_wear + self.insurance_per_trip + self.vehicle_depreciation +
            self.loading_unloading + self.documentation_charges + self.gst_applicable + self.emergency_fund
        )

class IndianLogisticsCostCalculator:
    """
    Comprehensive cost calculator for Indian logistics market
    Considers all real-world factors affecting transportation costs
    """
    
    # Current Indian market rates (₹)
    FUEL_PRICE_DIESEL = 95.0  # per liter
    DRIVER_WAGE_PER_DAY = {
        'LCV': 800,
        'MCV': 1200, 
        'HCV': 1500
    }
    
    TOLL_RATE_PER_KM = {
        'LCV': 1.2,
        'MCV': 2.8,
        'HCV': 4.5
    }
    
    STATE_BORDER_TAX_RATES = {
        'inter_state': 500,  # Average border tax
        'intra_state': 0
    }
    
    NIGHT_HALT_CHARGES = {
        'LCV': 300,
        'MCV': 500,
        'HCV': 800
    }
    
    def __init__(self):
        self.regional_multipliers = {
            'north': 1.0,
            'south': 1.1,
            'east': 0.9,
            'west': 1.2,
            'northeast': 1.3
        }
    
    def calculate_comprehensive_cost(
        self, 
        route: RouteDetails, 
        truck: TruckSpecs,
        cargo_weight_kg: float = 0,
        cargo_value: float = 0,
        is_return_trip: bool = False,
        urgency_factor: float = 1.0,  # 1.0 = normal, 1.5 = urgent
        season: str = "normal"  # normal, peak, lean
    ) -> IndianLogisticsCostBreakdown:
        """
        Calculate comprehensive logistics cost considering all Indian market factors
        """
        
        cost_breakdown = IndianLogisticsCostBreakdown()
        
        # 1. FUEL COSTS
        fuel_needed = route.distance_km / truck.mileage_kmpl
        cost_breakdown.fuel_cost = fuel_needed * self.FUEL_PRICE_DIESEL
        
        # Fuel surcharge for long routes or fuel price volatility
        if route.distance_km > 500:
            cost_breakdown.fuel_surcharge = cost_breakdown.fuel_cost * 0.05  # 5%
        
        # 2. DRIVER COSTS
        travel_days = math.ceil(route.estimated_travel_time_hours / truck.max_daily_driving_hours)
        cost_breakdown.driver_wages = self.DRIVER_WAGE_PER_DAY[truck.truck_category] * travel_days
        
        # Driver allowances (food, accommodation)
        cost_breakdown.driver_allowances = travel_days * 400  # ₹400 per day DA
        
        # Night halt charges if journey > 1 day
        if travel_days > 1:
            night_halts = travel_days - 1
            cost_breakdown.night_halt_charges = night_halts * self.NIGHT_HALT_CHARGES[truck.truck_category]
        
        # Overtime charges for urgent deliveries
        if urgency_factor > 1.2:
            cost_breakdown.overtime_charges = cost_breakdown.driver_wages * 0.5
        
        # 3. ROUTE COSTS
        if route.toll_roads:
            cost_breakdown.toll_charges = route.distance_km * self.TOLL_RATE_PER_KM[truck.truck_category]
        
        # State border taxes (estimate based on route)
        if route.distance_km > 300:  # Likely inter-state
            cost_breakdown.state_border_taxes = self.STATE_BORDER_TAX_RATES['inter_state']
            cost_breakdown.entry_permits = 200  # Entry permit fees
        
        # Parking charges for long routes
        if travel_days > 1:
            cost_breakdown.parking_charges = (travel_days - 1) * 150
        
        # 4. VEHICLE COSTS
        # Maintenance cost per km
        maintenance_rate_per_km = {
            'LCV': 2.5,
            'MCV': 4.0,
            'HCV': 6.0
        }
        cost_breakdown.vehicle_maintenance = route.distance_km * maintenance_rate_per_km[truck.truck_category]
        
        # Tire wear cost
        tire_cost_per_km = {
            'LCV': 1.0,
            'MCV': 2.0,
            'HCV': 3.5
        }
        cost_breakdown.tire_wear = route.distance_km * tire_cost_per_km[truck.truck_category]
        
        # Insurance per trip (based on cargo value)
        if cargo_value > 0:
            cost_breakdown.insurance_per_trip = cargo_value * 0.001  # 0.1% of cargo value
        else:
            cost_breakdown.insurance_per_trip = 500  # Minimum insurance
        
        # Vehicle depreciation
        cost_breakdown.vehicle_depreciation = route.distance_km * 1.5  # ₹1.5 per km
        
        # 5. ADDITIONAL COSTS
        # Loading/unloading charges
        if cargo_weight_kg > 0:
            cost_breakdown.loading_unloading = max(500, cargo_weight_kg * 2)  # ₹2 per kg, min ₹500
        else:
            cost_breakdown.loading_unloading = 800  # Standard rate
        
        # Documentation charges
        cost_breakdown.documentation_charges = 300
        
        # GST (18% on taxable services)
        taxable_amount = (
            cost_breakdown.toll_charges + cost_breakdown.loading_unloading + 
            cost_breakdown.documentation_charges
        )
        cost_breakdown.gst_applicable = taxable_amount * 0.18
        
        # Emergency fund (3% of total for contingencies)
        subtotal = (
            cost_breakdown.fuel_cost + cost_breakdown.fuel_surcharge +
            cost_breakdown.driver_wages + cost_breakdown.driver_allowances + 
            cost_breakdown.night_halt_charges + cost_breakdown.overtime_charges +
            cost_breakdown.toll_charges + cost_breakdown.state_border_taxes + 
            cost_breakdown.entry_permits + cost_breakdown.parking_charges +
            cost_breakdown.vehicle_maintenance + cost_breakdown.tire_wear + 
            cost_breakdown.insurance_per_trip + cost_breakdown.vehicle_depreciation +
            cost_breakdown.loading_unloading + cost_breakdown.documentation_charges + 
            cost_breakdown.gst_applicable
        )
        cost_breakdown.emergency_fund = subtotal * 0.03
        
        # Apply seasonal and urgency multipliers
        seasonal_multiplier = {
            "peak": 1.2,    # Festival season, harvest time
            "normal": 1.0,
            "lean": 0.9     # Off-season
        }
        
        final_multiplier = urgency_factor * seasonal_multiplier.get(season, 1.0)
        
        # Apply multiplier to variable costs only (not fixed costs like permits)
        variable_costs = [
            'fuel_cost', 'fuel_surcharge', 'driver_wages', 'driver_allowances',
            'overtime_charges', 'vehicle_maintenance', 'tire_wear', 'loading_unloading'
        ]
        
        for cost_type in variable_costs:
            current_value = getattr(cost_breakdown, cost_type)
            setattr(cost_breakdown, cost_type, current_value * final_multiplier)
        
        return cost_breakdown
    
    def get_cost_factors_summary(self, route: RouteDetails, truck: TruckSpecs) -> Dict:
        """
        Get summary of all factors affecting cost calculation
        """
        factors = {
            "route_factors": {
                "distance_km": route.distance_km,
                "estimated_time_hours": route.estimated_travel_time_hours,
                "highway_percentage": f"{route.highway_percentage * 100:.0f}%",
                "toll_roads": "Yes" if route.toll_roads else "No",
                "route_difficulty": route.route_difficulty.title(),
                "likely_interstate": "Yes" if route.distance_km > 300 else "No"
            },
            "truck_factors": {
                "category": truck.truck_category,
                "fuel_efficiency": f"{truck.mileage_kmpl} km/l",
                "driver_requirement": f"{truck.driver_capacity} driver(s)",
                "sleeper_cabin": "Yes" if truck.sleeper_cabin else "No",
                "max_daily_hours": f"{truck.max_daily_driving_hours} hours"
            },
            "cost_components": {
                "fuel_and_surcharge": "Diesel price + long route surcharge",
                "driver_costs": "Wages + allowances + night halt + overtime",
                "route_costs": "Tolls + border tax + permits + parking",
                "vehicle_costs": "Maintenance + tires + insurance + depreciation",
                "additional_costs": "Loading/unloading + documentation + GST + emergency fund"
            },
            "market_factors": {
                "fuel_price_per_liter": f"₹{self.FUEL_PRICE_DIESEL}",
                "driver_wage_per_day": f"₹{self.DRIVER_WAGE_PER_DAY[truck.truck_category]}",
                "toll_rate_per_km": f"₹{self.TOLL_RATE_PER_KM[truck.truck_category]}",
                "night_halt_charges": f"₹{self.NIGHT_HALT_CHARGES[truck.truck_category]}/night"
            }
        }
        
        return factors
    
    def validate_cost_inputs(self, route: RouteDetails, truck: TruckSpecs) -> List[str]:
        """
        Validate that all required inputs are available for accurate costing
        """
        missing_factors = []
        
        if not route.distance_km or route.distance_km <= 0:
            missing_factors.append("Route distance in kilometers")
        
        if not route.origin or not route.destination:
            missing_factors.append("Origin and destination details")
        
        if not truck.mileage_kmpl or truck.mileage_kmpl <= 0:
            missing_factors.append("Truck fuel efficiency (km/l)")
        
        if not truck.truck_category or truck.truck_category not in ['LCV', 'MCV', 'HCV']:
            missing_factors.append("Valid truck category (LCV/MCV/HCV)")
        
        if route.estimated_travel_time_hours <= 0:
            missing_factors.append("Estimated travel time")
        
        return missing_factors

# Global instance for easy access
indian_cost_calculator = IndianLogisticsCostCalculator()