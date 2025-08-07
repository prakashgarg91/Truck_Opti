"""
Enhanced Cost Calculation Engine for TruckOpti
Provides real-time fuel prices, comprehensive cost analysis, and optimization strategies
"""

import requests
import logging
import time
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import json

@dataclass
class FuelPrices:
    """Data class for fuel price information"""
    diesel: float
    petrol: float
    currency: str = "INR"
    last_updated: datetime = None
    source: str = "API"

@dataclass
class RouteCost:
    """Data class for route-specific costs"""
    distance_km: float
    fuel_cost: float
    toll_cost: float
    maintenance_cost: float
    driver_cost: float
    time_cost: float
    total_cost: float

class CostCalculationEngine:
    """Advanced cost calculation engine with real-time data integration"""
    
    def __init__(self):
        self.fuel_price_cache = {}
        self.cache_duration = timedelta(hours=6)  # Cache fuel prices for 6 hours
        self.default_fuel_prices = FuelPrices(diesel=85.0, petrol=105.0)  # Fallback prices in INR
        
    @lru_cache(maxsize=128)
    def get_fuel_prices(self, location: str = "India") -> FuelPrices:
        """
        Get current fuel prices with caching
        Tries multiple APIs and falls back to default prices
        """
        cache_key = f"{location}_{datetime.now().date()}"
        
        # Check cache first
        if cache_key in self.fuel_price_cache:
            cached_data = self.fuel_price_cache[cache_key]
            if datetime.now() - cached_data['timestamp'] < self.cache_duration:
                return cached_data['prices']
        
        try:
            # Try to get real-time fuel prices (mock implementation)
            prices = self._fetch_fuel_prices_api(location)
            
            # Cache the result
            self.fuel_price_cache[cache_key] = {
                'prices': prices,
                'timestamp': datetime.now()
            }
            
            logging.info(f"Updated fuel prices for {location}: Diesel={prices.diesel}, Petrol={prices.petrol}")
            return prices
            
        except Exception as e:
            logging.warning(f"Failed to fetch fuel prices, using defaults: {e}")
            return self.default_fuel_prices
    
    def _fetch_fuel_prices_api(self, location: str) -> FuelPrices:
        """
        Fetch fuel prices from external APIs
        This is a mock implementation - replace with actual API calls
        """
        # Mock API response with some variation
        import random
        base_diesel = 85.0
        base_petrol = 105.0
        
        # Add some realistic variation (+/- 5%)
        diesel_price = base_diesel + random.uniform(-4, 4)
        petrol_price = base_petrol + random.uniform(-5, 5)
        
        return FuelPrices(
            diesel=round(diesel_price, 2),
            petrol=round(petrol_price, 2),
            last_updated=datetime.now(),
            source="Mock_API"
        )
    
    def calculate_fuel_cost(self, distance_km: float, fuel_efficiency_kmpl: float, 
                          fuel_type: str = "diesel", location: str = "India") -> float:
        """Calculate fuel cost for a given distance and vehicle efficiency"""
        if fuel_efficiency_kmpl <= 0:
            return 0.0
            
        fuel_prices = self.get_fuel_prices(location)
        
        fuel_price_per_liter = fuel_prices.diesel if fuel_type == "diesel" else fuel_prices.petrol
        liters_needed = distance_km / fuel_efficiency_kmpl
        
        return round(liters_needed * fuel_price_per_liter, 2)
    
    def calculate_toll_cost(self, distance_km: float, route_type: str = "highway") -> float:
        """Calculate toll costs based on distance and route type"""
        toll_rates = {
            "highway": 2.5,    # INR per km for highways
            "expressway": 4.0, # INR per km for expressways  
            "city": 0.0,       # No tolls for city routes
            "rural": 0.5       # Minimal tolls for rural routes
        }
        
        rate = toll_rates.get(route_type, toll_rates["highway"])
        return round(distance_km * rate, 2)
    
    def calculate_maintenance_cost(self, distance_km: float, truck_type: str, 
                                 truck_age_years: int = 3) -> float:
        """Calculate maintenance costs based on truck type and age"""
        base_rates = {
            "light": 1.2,    # INR per km
            "medium": 2.5,   # INR per km
            "heavy": 4.0     # INR per km
        }
        
        # Age factor (older trucks cost more to maintain)
        age_multiplier = 1.0 + (truck_age_years - 3) * 0.1 if truck_age_years > 3 else 1.0
        
        base_rate = base_rates.get(truck_type.lower(), base_rates["medium"])
        return round(distance_km * base_rate * age_multiplier, 2)
    
    def calculate_driver_cost(self, distance_km: float, avg_speed_kmh: float = 60, 
                            hourly_rate: float = 150) -> float:
        """Calculate driver costs based on time and rates"""
        travel_time_hours = distance_km / avg_speed_kmh
        
        # Add rest time for long distances (mandatory rest every 4 hours)
        if travel_time_hours > 4:
            rest_hours = int(travel_time_hours / 4) * 0.5  # 30 min rest every 4 hours
            travel_time_hours += rest_hours
        
        return round(travel_time_hours * hourly_rate, 2)
    
    def calculate_comprehensive_cost(self, truck_type, route_info: Dict, 
                                   carton_details: List = None) -> RouteCost:
        """
        Calculate comprehensive costs for a route including all factors
        """
        distance = route_info.get('distance_km', 100)
        route_type = route_info.get('route_type', 'highway')
        location = route_info.get('location', 'India')
        
        # Fuel cost
        fuel_efficiency = getattr(truck_type, 'fuel_efficiency', 10)
        fuel_cost = self.calculate_fuel_cost(distance, fuel_efficiency, "diesel", location)
        
        # Toll cost
        toll_cost = self.calculate_toll_cost(distance, route_type)
        
        # Maintenance cost
        truck_category = getattr(truck_type, 'truck_category', 'medium').lower()
        maintenance_cost = self.calculate_maintenance_cost(distance, truck_category)
        
        # Driver cost
        driver_cost = self.calculate_driver_cost(distance)
        
        # Time-based costs (vehicle depreciation, insurance per day)
        time_cost = getattr(truck_type, 'cost_per_km', 1.0) * distance
        
        # Total cost
        total_cost = fuel_cost + toll_cost + maintenance_cost + driver_cost + time_cost
        
        return RouteCost(
            distance_km=distance,
            fuel_cost=fuel_cost,
            toll_cost=toll_cost,
            maintenance_cost=maintenance_cost,
            driver_cost=driver_cost,
            time_cost=time_cost,
            total_cost=total_cost
        )
    
    def optimize_cost_strategy(self, available_trucks: List, route_info: Dict) -> Dict:
        """
        Analyze different truck options and recommend the most cost-effective
        """
        cost_analysis = []
        
        for truck in available_trucks:
            cost_breakdown = self.calculate_comprehensive_cost(truck, route_info)
            
            # Calculate cost efficiency metrics
            payload_capacity = truck.length * truck.width * truck.height / 1000000  # m³
            cost_per_cubic_meter = cost_breakdown.total_cost / payload_capacity
            cost_per_kg = cost_breakdown.total_cost / truck.max_weight if truck.max_weight > 0 else float('inf')
            
            cost_analysis.append({
                'truck_name': truck.name,
                'truck_id': truck.id,
                'cost_breakdown': cost_breakdown,
                'cost_per_m3': round(cost_per_cubic_meter, 2),
                'cost_per_kg': round(cost_per_kg, 2),
                'efficiency_score': round(payload_capacity / cost_breakdown.total_cost * 1000, 2)
            })
        
        # Sort by efficiency score (higher is better)
        cost_analysis.sort(key=lambda x: x['efficiency_score'], reverse=True)
        
        return {
            'recommended_truck': cost_analysis[0] if cost_analysis else None,
            'all_options': cost_analysis,
            'total_trucks_analyzed': len(cost_analysis),
            'cost_savings': cost_analysis[0]['cost_breakdown'].total_cost - cost_analysis[-1]['cost_breakdown'].total_cost if len(cost_analysis) > 1 else 0
        }
    
    def calculate_multi_truck_fleet_cost(self, fleet_allocation: List[Dict], 
                                       route_info: Dict) -> Dict:
        """
        Calculate total costs for a multi-truck fleet allocation
        """
        total_costs = {
            'fuel_cost': 0,
            'toll_cost': 0,
            'maintenance_cost': 0,
            'driver_cost': 0,
            'time_cost': 0,
            'total_cost': 0
        }
        
        truck_details = []
        
        for allocation in fleet_allocation:
            truck_type = allocation['truck_type']
            quantity = allocation.get('quantity', 1)
            
            for i in range(quantity):
                cost_breakdown = self.calculate_comprehensive_cost(truck_type, route_info)
                
                truck_details.append({
                    'truck_name': f"{truck_type.name}_{i+1}",
                    'cost_breakdown': cost_breakdown
                })
                
                # Add to totals
                total_costs['fuel_cost'] += cost_breakdown.fuel_cost
                total_costs['toll_cost'] += cost_breakdown.toll_cost
                total_costs['maintenance_cost'] += cost_breakdown.maintenance_cost
                total_costs['driver_cost'] += cost_breakdown.driver_cost
                total_costs['time_cost'] += cost_breakdown.time_cost
                total_costs['total_cost'] += cost_breakdown.total_cost
        
        # Calculate fleet-wide metrics
        avg_cost_per_truck = total_costs['total_cost'] / len(truck_details) if truck_details else 0
        
        return {
            'total_costs': total_costs,
            'truck_details': truck_details,
            'fleet_size': len(truck_details),
            'average_cost_per_truck': round(avg_cost_per_truck, 2),
            'cost_breakdown_percentage': {
                'fuel': round((total_costs['fuel_cost'] / total_costs['total_cost']) * 100, 1) if total_costs['total_cost'] > 0 else 0,
                'toll': round((total_costs['toll_cost'] / total_costs['total_cost']) * 100, 1) if total_costs['total_cost'] > 0 else 0,
                'maintenance': round((total_costs['maintenance_cost'] / total_costs['total_cost']) * 100, 1) if total_costs['total_cost'] > 0 else 0,
                'driver': round((total_costs['driver_cost'] / total_costs['total_cost']) * 100, 1) if total_costs['total_cost'] > 0 else 0,
                'other': round((total_costs['time_cost'] / total_costs['total_cost']) * 100, 1) if total_costs['total_cost'] > 0 else 0
            }
        }
    
    def generate_cost_report(self, analysis_results: Dict) -> str:
        """Generate a detailed cost analysis report"""
        report = []
        report.append("=== TRUCKOPTI COST ANALYSIS REPORT ===")
        report.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        
        if 'recommended_truck' in analysis_results:
            truck = analysis_results['recommended_truck']
            report.append(f"RECOMMENDED TRUCK: {truck['truck_name']}")
            report.append(f"Total Cost: ₹{truck['cost_breakdown'].total_cost:,.2f}")
            report.append(f"Efficiency Score: {truck['efficiency_score']}")
            report.append("")
            
            report.append("COST BREAKDOWN:")
            breakdown = truck['cost_breakdown']
            report.append(f"  Fuel Cost:        ₹{breakdown.fuel_cost:>8,.2f}")
            report.append(f"  Toll Cost:        ₹{breakdown.toll_cost:>8,.2f}")
            report.append(f"  Maintenance:      ₹{breakdown.maintenance_cost:>8,.2f}")
            report.append(f"  Driver Cost:      ₹{breakdown.driver_cost:>8,.2f}")
            report.append(f"  Other Costs:      ₹{breakdown.time_cost:>8,.2f}")
            report.append(f"  TOTAL:            ₹{breakdown.total_cost:>8,.2f}")
        
        return "\n".join(report)

# Global instance for use throughout the application
cost_engine = CostCalculationEngine()