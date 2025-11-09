"""
Indian Toll Cost Calculation System
Comprehensive toll calculator for Indian highways and expressways
"""

from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import logging


class VehicleCategory(Enum):
    """Vehicle categories as per Indian toll classification"""
    CAR_JEEP_VAN = "car_jeep_van"  # Up to 3 ton
    LCV = "lcv"  # Light Commercial Vehicle (3-12 ton)
    TRUCK_BUS = "truck_bus"  # 2 axle, 12-40 ton
    TRUCK_3_AXLE = "truck_3_axle"  # 3 axle
    TRUCK_4_6_AXLE = "truck_4_6_axle"  # 4-6 axle
    TRUCK_7_PLUS_AXLE = "truck_7_plus_axle"  # 7+ axle
    EARTH_MOVER = "earth_mover"  # Heavy equipment


@dataclass
class TollPlaza:
    """Represents an Indian toll plaza"""
    name: str
    highway: str  # e.g., "NH-1", "NH-44", "Mumbai-Pune Expressway"
    km_marker: float
    rates: Dict[VehicleCategory, float]  # Rates in INR
    location: str  # City/State
    coordinates: Optional[Tuple[float, float]] = None  # (lat, lon)


@dataclass
class TollRoute:
    """Represents a route segment with toll plazas"""
    origin: str
    destination: str
    distance_km: float
    toll_plazas: List[TollPlaza]
    highway_name: str


class IndianTollCalculator:
    """
    Comprehensive toll cost calculator for Indian highways
    Based on NHAI (National Highways Authority of India) standards
    """

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.toll_plazas = self._initialize_toll_plazas()
        self.routes = self._initialize_common_routes()

    def _initialize_toll_plazas(self) -> List[TollPlaza]:
        """Initialize database of major Indian toll plazas with current rates"""

        # Standard NHAI toll rates (approximate, updated 2024-2025)
        # Rates vary by plaza, these are representative averages

        toll_plazas = [
            # Delhi-Mumbai Corridor (NH-48)
            TollPlaza(
                name="Kherki Daula Toll Plaza",
                highway="NH-48",
                km_marker=40.0,
                location="Gurugram, Haryana",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 70.0,
                    VehicleCategory.LCV: 115.0,
                    VehicleCategory.TRUCK_BUS: 235.0,
                    VehicleCategory.TRUCK_3_AXLE: 315.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 365.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 470.0
                }
            ),
            TollPlaza(
                name="Shahjahanpur Toll Plaza",
                highway="NH-48",
                km_marker=125.0,
                location="Rajasthan",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 55.0,
                    VehicleCategory.LCV: 90.0,
                    VehicleCategory.TRUCK_BUS: 180.0,
                    VehicleCategory.TRUCK_3_AXLE: 240.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 280.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 360.0
                }
            ),

            # Delhi-Agra NH-44 (Yamuna Expressway)
            TollPlaza(
                name="Yamuna Expressway Main Toll",
                highway="Yamuna Expressway",
                km_marker=15.0,
                location="Uttar Pradesh",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 195.0,
                    VehicleCategory.LCV: 310.0,
                    VehicleCategory.TRUCK_BUS: 635.0,
                    VehicleCategory.TRUCK_3_AXLE: 850.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 995.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 1280.0
                }
            ),

            # Mumbai-Pune Expressway
            TollPlaza(
                name="Khalapur Toll Plaza",
                highway="Mumbai-Pune Expressway",
                km_marker=30.0,
                location="Maharashtra",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 310.0,
                    VehicleCategory.LCV: 495.0,
                    VehicleCategory.TRUCK_BUS: 1015.0,
                    VehicleCategory.TRUCK_3_AXLE: 1360.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 1590.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 2045.0
                }
            ),

            # Bangalore-Chennai (NH-48)
            TollPlaza(
                name="Walajapet Toll Plaza",
                highway="NH-48",
                km_marker=110.0,
                location="Tamil Nadu",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 60.0,
                    VehicleCategory.LCV: 95.0,
                    VehicleCategory.TRUCK_BUS: 195.0,
                    VehicleCategory.TRUCK_3_AXLE: 260.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 305.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 390.0
                }
            ),

            # Golden Quadrilateral Segments
            TollPlaza(
                name="Pipavav Toll Plaza",
                highway="NH-8A",
                km_marker=75.0,
                location="Gujarat",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 50.0,
                    VehicleCategory.LCV: 80.0,
                    VehicleCategory.TRUCK_BUS: 165.0,
                    VehicleCategory.TRUCK_3_AXLE: 220.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 260.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 335.0
                }
            ),

            # Eastern Peripheral Expressway (Delhi)
            TollPlaza(
                name="Eastern Peripheral Expressway Toll",
                highway="EPE",
                km_marker=45.0,
                location="Haryana",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 100.0,
                    VehicleCategory.LCV: 160.0,
                    VehicleCategory.TRUCK_BUS: 325.0,
                    VehicleCategory.TRUCK_3_AXLE: 435.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 510.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 655.0
                }
            ),

            # Hyderabad-Bangalore (NH-44)
            TollPlaza(
                name="Jadcherla Toll Plaza",
                highway="NH-44",
                km_marker=85.0,
                location="Telangana",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 65.0,
                    VehicleCategory.LCV: 105.0,
                    VehicleCategory.TRUCK_BUS: 215.0,
                    VehicleCategory.TRUCK_3_AXLE: 285.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 335.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 430.0
                }
            ),

            # Kolkata-Delhi (NH-19)
            TollPlaza(
                name="Palsit Toll Plaza",
                highway="NH-19",
                km_marker=220.0,
                location="Uttar Pradesh",
                rates={
                    VehicleCategory.CAR_JEEP_VAN: 45.0,
                    VehicleCategory.LCV: 75.0,
                    VehicleCategory.TRUCK_BUS: 150.0,
                    VehicleCategory.TRUCK_3_AXLE: 200.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 235.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 305.0
                }
            ),
        ]

        return toll_plazas

    def _initialize_common_routes(self) -> Dict[str, TollRoute]:
        """Initialize commonly used routes with their toll plazas"""

        routes = {
            "delhi_mumbai": TollRoute(
                origin="Delhi",
                destination="Mumbai",
                distance_km=1400.0,
                highway_name="NH-48",
                toll_plazas=[
                    plaza for plaza in self.toll_plazas
                    if plaza.highway in ["NH-48", "NH-8A"]
                ][:4]  # First 4 toll plazas on route
            ),
            "mumbai_pune": TollRoute(
                origin="Mumbai",
                destination="Pune",
                distance_km=150.0,
                highway_name="Mumbai-Pune Expressway",
                toll_plazas=[
                    plaza for plaza in self.toll_plazas
                    if "Mumbai-Pune" in plaza.highway
                ]
            ),
            "delhi_agra": TollRoute(
                origin="Delhi",
                destination="Agra",
                distance_km=230.0,
                highway_name="Yamuna Expressway",
                toll_plazas=[
                    plaza for plaza in self.toll_plazas
                    if "Yamuna" in plaza.highway
                ]
            ),
        }

        return routes

    def categorize_truck(self, truck_weight_kg: float, truck_category: str = None) -> VehicleCategory:
        """
        Categorize truck based on weight and category for toll calculation

        Args:
            truck_weight_kg: Maximum truck weight in kg
            truck_category: Truck category string (LCV, MCV, HCV)

        Returns:
            VehicleCategory enum value
        """
        try:
            # Convert kg to ton
            weight_ton = truck_weight_kg / 1000.0

            # Categorize based on weight
            if weight_ton <= 3.0 or truck_category == "LCV":
                return VehicleCategory.LCV
            elif weight_ton <= 12.0:
                return VehicleCategory.TRUCK_BUS
            elif weight_ton <= 25.0:
                return VehicleCategory.TRUCK_3_AXLE
            elif weight_ton <= 40.0:
                return VehicleCategory.TRUCK_4_6_AXLE
            else:
                return VehicleCategory.TRUCK_7_PLUS_AXLE

        except Exception as e:
            self.logger.error(f"Error categorizing truck: {str(e)}")
            # Default to most common category
            return VehicleCategory.TRUCK_BUS

    def calculate_toll_for_route(
        self,
        origin: str,
        destination: str,
        truck_weight_kg: float,
        truck_category: str = None,
        route_name: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Calculate total toll cost for a route

        Args:
            origin: Starting city
            destination: Ending city
            truck_weight_kg: Truck weight in kg
            truck_category: Truck category (LCV, MCV, HCV)
            route_name: Specific route key (optional)

        Returns:
            Dictionary with toll breakdown
        """
        try:
            vehicle_cat = self.categorize_truck(truck_weight_kg, truck_category)

            # Try to find matching predefined route
            route = None
            if route_name and route_name in self.routes:
                route = self.routes[route_name]
            else:
                # Try to match by origin-destination
                route_key = f"{origin.lower().replace(' ', '_')}_{destination.lower().replace(' ', '_')}"
                route = self.routes.get(route_key)

            if not route:
                # Estimate toll based on distance
                return self._estimate_toll_by_distance(
                    origin, destination, vehicle_cat, truck_weight_kg
                )

            # Calculate toll for each plaza on route
            total_toll = 0.0
            plaza_breakdown = []

            for plaza in route.toll_plazas:
                toll_amount = plaza.rates.get(vehicle_cat, 0.0)
                total_toll += toll_amount

                plaza_breakdown.append({
                    'plaza_name': plaza.name,
                    'location': plaza.location,
                    'highway': plaza.highway,
                    'amount': toll_amount
                })

            return {
                'success': True,
                'total_toll_cost': round(total_toll, 2),
                'vehicle_category': vehicle_cat.value,
                'route': {
                    'origin': route.origin,
                    'destination': route.destination,
                    'distance_km': route.distance_km,
                    'highway': route.highway_name
                },
                'plaza_count': len(plaza_breakdown),
                'plaza_breakdown': plaza_breakdown,
                'currency': 'INR'
            }

        except Exception as e:
            self.logger.error(f"Error calculating toll for route: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'total_toll_cost': 0.0
            }

    def _estimate_toll_by_distance(
        self,
        origin: str,
        destination: str,
        vehicle_cat: VehicleCategory,
        truck_weight_kg: float
    ) -> Dict[str, any]:
        """
        Estimate toll based on distance when specific route is not found

        Uses average toll rates per km based on NHAI standards:
        - Expressways: ~2.65 INR per km for trucks
        - National Highways: ~2.00 INR per km for trucks
        """
        try:
            # Estimate distance (this would ideally come from a distance API)
            # For now, return a conservative estimate

            # Average toll per 100 km based on vehicle category
            toll_per_100km = {
                VehicleCategory.CAR_JEEP_VAN: 55.0,
                VehicleCategory.LCV: 90.0,
                VehicleCategory.TRUCK_BUS: 185.0,
                VehicleCategory.TRUCK_3_AXLE: 250.0,
                VehicleCategory.TRUCK_4_6_AXLE: 295.0,
                VehicleCategory.TRUCK_7_PLUS_AXLE: 380.0
            }

            # Assume average route distance
            estimated_distance = 500.0  # km (conservative estimate)
            toll_rate = toll_per_100km.get(vehicle_cat, 185.0)

            estimated_toll = (estimated_distance / 100.0) * toll_rate

            return {
                'success': True,
                'total_toll_cost': round(estimated_toll, 2),
                'vehicle_category': vehicle_cat.value,
                'route': {
                    'origin': origin,
                    'destination': destination,
                    'distance_km': estimated_distance,
                    'highway': 'Estimated Route'
                },
                'note': 'Estimated toll based on average rates. Actual toll may vary.',
                'estimation_method': 'distance_based',
                'currency': 'INR'
            }

        except Exception as e:
            self.logger.error(f"Error estimating toll: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'total_toll_cost': 0.0
            }

    def calculate_toll_by_distance(
        self,
        distance_km: float,
        truck_weight_kg: float,
        truck_category: str = None,
        highway_type: str = "national_highway"  # or "expressway"
    ) -> Dict[str, any]:
        """
        Calculate toll based purely on distance and highway type

        Args:
            distance_km: Distance to travel in km
            truck_weight_kg: Truck weight in kg
            truck_category: Truck category
            highway_type: "national_highway" or "expressway"

        Returns:
            Toll calculation result
        """
        try:
            vehicle_cat = self.categorize_truck(truck_weight_kg, truck_category)

            # Rates per 100 km (approximate as of 2024-2025)
            if highway_type == "expressway":
                rates_per_100km = {
                    VehicleCategory.CAR_JEEP_VAN: 65.0,
                    VehicleCategory.LCV: 105.0,
                    VehicleCategory.TRUCK_BUS: 215.0,
                    VehicleCategory.TRUCK_3_AXLE: 290.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 340.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 440.0
                }
            else:  # national_highway
                rates_per_100km = {
                    VehicleCategory.CAR_JEEP_VAN: 50.0,
                    VehicleCategory.LCV: 80.0,
                    VehicleCategory.TRUCK_BUS: 165.0,
                    VehicleCategory.TRUCK_3_AXLE: 220.0,
                    VehicleCategory.TRUCK_4_6_AXLE: 260.0,
                    VehicleCategory.TRUCK_7_PLUS_AXLE: 335.0
                }

            rate = rates_per_100km.get(vehicle_cat, 165.0)
            toll_cost = (distance_km / 100.0) * rate

            # Estimate number of toll plazas (roughly 1 per 60-80 km on highways)
            estimated_plazas = max(1, int(distance_km / 70.0))

            return {
                'success': True,
                'total_toll_cost': round(toll_cost, 2),
                'vehicle_category': vehicle_cat.value,
                'distance_km': distance_km,
                'highway_type': highway_type,
                'rate_per_100km': rate,
                'estimated_plaza_count': estimated_plazas,
                'currency': 'INR'
            }

        except Exception as e:
            self.logger.error(f"Error calculating toll by distance: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'total_toll_cost': 0.0
            }

    def get_available_routes(self) -> List[Dict[str, any]]:
        """Get list of available predefined routes"""
        return [
            {
                'route_key': key,
                'origin': route.origin,
                'destination': route.destination,
                'distance_km': route.distance_km,
                'highway': route.highway_name,
                'toll_plaza_count': len(route.toll_plazas)
            }
            for key, route in self.routes.items()
        ]


# Global instance
toll_calculator = IndianTollCalculator()
