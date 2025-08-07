"""
Route Optimization Module for TruckOpti
Advanced route planning with GPS integration, traffic data, and multi-destination optimization
"""

import requests
import logging
import time
import json
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
import math
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

@dataclass
class Location:
    """Represents a geographic location"""
    latitude: float
    longitude: float
    address: str = ""
    name: str = ""
    
    def __post_init__(self):
        if not self.name:
            self.name = f"Location ({self.latitude:.4f}, {self.longitude:.4f})"

@dataclass
class RouteSegment:
    """Represents a segment of a route between two points"""
    from_location: Location
    to_location: Location
    distance_km: float
    duration_minutes: float
    traffic_factor: float = 1.0
    road_type: str = "highway"
    toll_cost: float = 0.0
    
@dataclass
class OptimizedRoute:
    """Optimized route with all details"""
    waypoints: List[Location]
    segments: List[RouteSegment]
    total_distance_km: float
    total_duration_minutes: float
    total_cost: float
    optimization_score: float
    traffic_delays_minutes: float = 0.0
    alternative_routes: List = None

class RouteOptimizer:
    """Advanced route optimization with multiple algorithms and data sources"""
    
    def __init__(self):
        self.api_cache = {}
        self.cache_duration = timedelta(hours=1)
        
        # Mock API keys (replace with real ones in production)
        self.google_maps_api_key = "YOUR_GOOGLE_MAPS_API_KEY"
        self.openroute_api_key = "YOUR_OPENROUTE_API_KEY"
        
        # Rate limiting
        self.last_api_call = {}
        self.api_rate_limit = 1.0  # seconds between calls
        
    @lru_cache(maxsize=256)
    def geocode_address(self, address: str) -> Optional[Location]:
        """
        Convert address to geographic coordinates
        Uses mock geocoding for demonstration
        """
        # Mock geocoding - replace with actual service
        mock_locations = {
            "Mumbai": Location(19.0760, 72.8777, "Mumbai, Maharashtra", "Mumbai"),
            "Delhi": Location(28.7041, 77.1025, "New Delhi, Delhi", "Delhi"),
            "Bangalore": Location(12.9716, 77.5946, "Bangalore, Karnataka", "Bangalore"),
            "Chennai": Location(13.0827, 80.2707, "Chennai, Tamil Nadu", "Chennai"),
            "Kolkata": Location(22.5726, 88.3639, "Kolkata, West Bengal", "Kolkata"),
            "Hyderabad": Location(17.3850, 78.4867, "Hyderabad, Telangana", "Hyderabad"),
            "Pune": Location(18.5204, 73.8567, "Pune, Maharashtra", "Pune"),
            "Ahmedabad": Location(23.0225, 72.5714, "Ahmedabad, Gujarat", "Ahmedabad")
        }
        
        # Simple fuzzy matching
        for city, location in mock_locations.items():
            if city.lower() in address.lower():
                return location
        
        # Generate a random location for unknown addresses
        import random
        return Location(
            latitude=random.uniform(8.0, 37.0),  # India's latitude range
            longitude=random.uniform(68.0, 97.0),  # India's longitude range
            address=address,
            name=address
        )
    
    def calculate_distance(self, loc1: Location, loc2: Location) -> float:
        """
        Calculate distance between two locations using Haversine formula
        """
        # Convert to radians
        lat1, lon1 = math.radians(loc1.latitude), math.radians(loc1.longitude)
        lat2, lon2 = math.radians(loc2.latitude), math.radians(loc2.longitude)
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        # Earth's radius in kilometers
        R = 6371
        return R * c
    
    def get_route_with_traffic(self, origin: Location, destination: Location, 
                              departure_time: datetime = None) -> RouteSegment:
        """
        Get route information with traffic data
        Mock implementation - replace with actual traffic API
        """
        if departure_time is None:
            departure_time = datetime.now()
        
        # Calculate base distance and duration
        distance = self.calculate_distance(origin, destination)
        base_duration = distance / 60 * 60  # Assume 60 km/h average speed
        
        # Mock traffic factor based on time of day
        hour = departure_time.hour
        if 7 <= hour <= 9 or 17 <= hour <= 19:  # Rush hours
            traffic_factor = 1.5
        elif 10 <= hour <= 16:  # Business hours
            traffic_factor = 1.2
        elif 20 <= hour <= 23 or 6 <= hour <= 7:  # Light traffic
            traffic_factor = 1.1
        else:  # Night time
            traffic_factor = 0.9
        
        # Calculate toll costs based on distance
        toll_cost = self._estimate_toll_cost(distance)
        
        return RouteSegment(
            from_location=origin,
            to_location=destination,
            distance_km=round(distance, 2),
            duration_minutes=round(base_duration * traffic_factor, 1),
            traffic_factor=traffic_factor,
            road_type=self._determine_road_type(distance),
            toll_cost=toll_cost
        )
    
    def _estimate_toll_cost(self, distance_km: float) -> float:
        """Estimate toll costs based on distance"""
        if distance_km < 50:
            return 0  # Local routes, no tolls
        elif distance_km < 200:
            return distance_km * 2.5  # State highways
        else:
            return distance_km * 4.0  # National highways/expressways
    
    def _determine_road_type(self, distance_km: float) -> str:
        """Determine road type based on distance"""
        if distance_km < 20:
            return "city"
        elif distance_km < 100:
            return "highway"
        else:
            return "expressway"
    
    def optimize_multi_destination_route(self, start_location: Location, 
                                       destinations: List[Location],
                                       return_to_start: bool = True,
                                       optimization_goal: str = "distance") -> OptimizedRoute:
        """
        Optimize route for multiple destinations using various algorithms
        """
        if not destinations:
            return OptimizedRoute([], [], 0, 0, 0, 0)
        
        # Create distance matrix
        all_locations = [start_location] + destinations
        if return_to_start:
            all_locations.append(start_location)
        
        distance_matrix = self._create_distance_matrix(all_locations)
        
        # Apply optimization algorithm based on goal
        if optimization_goal == "distance":
            optimized_order = self._nearest_neighbor_tsp(distance_matrix, 0)
        elif optimization_goal == "time":
            optimized_order = self._time_optimized_route(all_locations)
        elif optimization_goal == "cost":
            optimized_order = self._cost_optimized_route(all_locations)
        else:
            optimized_order = self._balanced_optimization(all_locations)
        
        # Build optimized route
        waypoints = [all_locations[i] for i in optimized_order]
        segments = []
        total_distance = 0
        total_duration = 0
        total_cost = 0
        
        for i in range(len(waypoints) - 1):
            segment = self.get_route_with_traffic(waypoints[i], waypoints[i + 1])
            segments.append(segment)
            total_distance += segment.distance_km
            total_duration += segment.duration_minutes
            total_cost += segment.toll_cost
        
        # Calculate optimization score
        optimization_score = self._calculate_optimization_score(
            segments, optimization_goal
        )
        
        return OptimizedRoute(
            waypoints=waypoints,
            segments=segments,
            total_distance_km=round(total_distance, 2),
            total_duration_minutes=round(total_duration, 1),
            total_cost=round(total_cost, 2),
            optimization_score=round(optimization_score, 2)
        )
    
    def _create_distance_matrix(self, locations: List[Location]) -> List[List[float]]:
        """Create distance matrix between all locations"""
        n = len(locations)
        matrix = [[0.0] * n for _ in range(n)]
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    matrix[i][j] = self.calculate_distance(locations[i], locations[j])
        
        return matrix
    
    def _nearest_neighbor_tsp(self, distance_matrix: List[List[float]], 
                             start_index: int = 0) -> List[int]:
        """
        Solve TSP using nearest neighbor heuristic
        """
        n = len(distance_matrix)
        unvisited = set(range(n))
        current = start_index
        path = [current]
        unvisited.remove(current)
        
        while unvisited:
            nearest = min(unvisited, key=lambda x: distance_matrix[current][x])
            path.append(nearest)
            unvisited.remove(nearest)
            current = nearest
        
        return path
    
    def _time_optimized_route(self, locations: List[Location]) -> List[int]:
        """
        Optimize route for minimum travel time considering traffic
        """
        # For simplicity, using nearest neighbor with time-based weights
        n = len(locations)
        time_matrix = [[0.0] * n for _ in range(n)]
        
        current_time = datetime.now()
        for i in range(n):
            for j in range(n):
                if i != j:
                    segment = self.get_route_with_traffic(
                        locations[i], locations[j], current_time
                    )
                    time_matrix[i][j] = segment.duration_minutes
                    current_time += timedelta(minutes=segment.duration_minutes)
        
        return self._nearest_neighbor_tsp(time_matrix, 0)
    
    def _cost_optimized_route(self, locations: List[Location]) -> List[int]:
        """
        Optimize route for minimum cost (fuel + tolls)
        """
        n = len(locations)
        cost_matrix = [[0.0] * n for _ in range(n)]
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    segment = self.get_route_with_traffic(locations[i], locations[j])
                    # Assume fuel cost of ₹8 per km
                    fuel_cost = segment.distance_km * 8
                    cost_matrix[i][j] = fuel_cost + segment.toll_cost
        
        return self._nearest_neighbor_tsp(cost_matrix, 0)
    
    def _balanced_optimization(self, locations: List[Location]) -> List[int]:
        """
        Balanced optimization considering distance, time, and cost
        """
        n = len(locations)
        score_matrix = [[0.0] * n for _ in range(n)]
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    segment = self.get_route_with_traffic(locations[i], locations[j])
                    
                    # Normalize and weight different factors
                    distance_score = segment.distance_km / 100  # Normalize to 100km
                    time_score = segment.duration_minutes / 120  # Normalize to 2 hours
                    cost_score = (segment.distance_km * 8 + segment.toll_cost) / 1000
                    
                    # Weighted combination (40% distance, 30% time, 30% cost)
                    score_matrix[i][j] = (
                        0.4 * distance_score + 
                        0.3 * time_score + 
                        0.3 * cost_score
                    )
        
        return self._nearest_neighbor_tsp(score_matrix, 0)
    
    def _calculate_optimization_score(self, segments: List[RouteSegment], 
                                    goal: str) -> float:
        """
        Calculate optimization score based on the goal
        """
        if not segments:
            return 0.0
        
        if goal == "distance":
            # Score based on distance efficiency
            total_distance = sum(s.distance_km for s in segments)
            # Assume ideal distance is 80% of total (some inefficiency expected)
            ideal_distance = total_distance * 0.8
            return min(100, (ideal_distance / total_distance) * 100)
        
        elif goal == "time":
            # Score based on time efficiency considering traffic
            base_time = sum(s.distance_km / 60 * 60 for s in segments)  # 60 km/h
            actual_time = sum(s.duration_minutes for s in segments)
            return min(100, (base_time / actual_time) * 100)
        
        elif goal == "cost":
            # Score based on cost efficiency
            total_cost = sum(s.toll_cost + s.distance_km * 8 for s in segments)
            # Assume there's always room for 10% improvement
            return min(100, 90 + (1000 / max(total_cost, 100)) * 10)
        
        else:
            # Balanced score
            return 85.0  # Default balanced score
    
    def get_real_time_traffic_updates(self, route: OptimizedRoute) -> Dict:
        """
        Get real-time traffic updates for the planned route
        """
        traffic_updates = []
        total_delay = 0
        
        for i, segment in enumerate(route.segments):
            # Mock traffic incidents
            import random
            
            if random.random() < 0.1:  # 10% chance of traffic incident
                incident_types = ["construction", "accident", "heavy_traffic", "road_closure"]
                incident = {
                    "segment_index": i,
                    "type": random.choice(incident_types),
                    "delay_minutes": random.randint(5, 30),
                    "description": f"Traffic incident on route from {segment.from_location.name} to {segment.to_location.name}",
                    "alternative_available": random.choice([True, False])
                }
                traffic_updates.append(incident)
                total_delay += incident["delay_minutes"]
        
        return {
            "updates": traffic_updates,
            "total_additional_delay": total_delay,
            "updated_eta": route.total_duration_minutes + total_delay,
            "last_updated": datetime.now().isoformat()
        }
    
    def suggest_alternative_routes(self, origin: Location, destination: Location, 
                                 current_route: OptimizedRoute) -> List[OptimizedRoute]:
        """
        Suggest alternative routes
        """
        alternatives = []
        
        # Generate alternative waypoints (mock)
        import random
        
        for i in range(2):  # Generate 2 alternatives
            # Add a random intermediate waypoint
            intermediate_lat = (origin.latitude + destination.latitude) / 2 + random.uniform(-0.5, 0.5)
            intermediate_lon = (origin.longitude + destination.longitude) / 2 + random.uniform(-0.5, 0.5)
            
            intermediate = Location(
                intermediate_lat, 
                intermediate_lon, 
                f"Via Point {i+1}",
                f"Alternative Route {i+1}"
            )
            
            # Create alternative route
            alt_route = self.optimize_multi_destination_route(
                origin, [intermediate, destination], False
            )
            
            # Add some variation to make it realistic
            alt_route.total_distance_km *= random.uniform(1.05, 1.2)
            alt_route.total_duration_minutes *= random.uniform(0.9, 1.15)
            alt_route.optimization_score *= random.uniform(0.85, 0.95)
            
            alternatives.append(alt_route)
        
        return alternatives
    
    def calculate_delivery_time_windows(self, route: OptimizedRoute, 
                                      service_times: List[int] = None) -> List[Dict]:
        """
        Calculate delivery time windows for each stop
        """
        if service_times is None:
            service_times = [30] * len(route.waypoints)  # 30 minutes default
        
        time_windows = []
        current_time = datetime.now()
        
        for i, waypoint in enumerate(route.waypoints):
            if i > 0:  # Skip start location
                # Add travel time from previous location
                if i - 1 < len(route.segments):
                    current_time += timedelta(minutes=route.segments[i-1].duration_minutes)
                
                # Add service time
                service_time = service_times[min(i, len(service_times)-1)]
                
                arrival_time = current_time
                departure_time = current_time + timedelta(minutes=service_time)
                
                time_windows.append({
                    "location": waypoint.name,
                    "arrival_time": arrival_time.isoformat(),
                    "departure_time": departure_time.isoformat(),
                    "service_duration_minutes": service_time,
                    "sequence_number": i
                })
                
                current_time = departure_time
        
        return time_windows
    
    def optimize_fleet_routes(self, vehicles: List[Dict], orders: List[Dict]) -> Dict:
        """
        Optimize routes for multiple vehicles and orders
        Vehicle Routing Problem (VRP) solver
        """
        # This is a simplified VRP solver
        # In production, you'd use specialized algorithms like Clarke-Wright, Genetic Algorithm, etc.
        
        optimized_routes = {}
        unassigned_orders = orders.copy()
        
        for vehicle in vehicles:
            vehicle_id = vehicle['id']
            vehicle_capacity = vehicle.get('capacity', float('inf'))
            start_location = self.geocode_address(vehicle['start_location'])
            
            # Greedy assignment: assign orders to this vehicle
            assigned_orders = []
            current_load = 0
            
            # Sort orders by distance from vehicle start location
            unassigned_orders.sort(
                key=lambda order: self.calculate_distance(
                    start_location, 
                    self.geocode_address(order['delivery_address'])
                )
            )
            
            for order in unassigned_orders.copy():
                order_weight = order.get('weight', 0)
                if current_load + order_weight <= vehicle_capacity:
                    assigned_orders.append(order)
                    current_load += order_weight
                    unassigned_orders.remove(order)
            
            if assigned_orders:
                # Create optimized route for this vehicle
                destinations = [
                    self.geocode_address(order['delivery_address']) 
                    for order in assigned_orders
                ]
                
                route = self.optimize_multi_destination_route(
                    start_location, destinations, True, "distance"
                )
                
                time_windows = self.calculate_delivery_time_windows(route)
                
                optimized_routes[vehicle_id] = {
                    'vehicle': vehicle,
                    'route': route,
                    'assigned_orders': assigned_orders,
                    'time_windows': time_windows,
                    'total_orders': len(assigned_orders),
                    'vehicle_utilization': (current_load / vehicle_capacity) * 100
                }
        
        return {
            'optimized_routes': optimized_routes,
            'unassigned_orders': unassigned_orders,
            'total_vehicles_used': len(optimized_routes),
            'total_distance': sum(r['route'].total_distance_km for r in optimized_routes.values()),
            'total_cost': sum(r['route'].total_cost for r in optimized_routes.values()),
            'optimization_timestamp': datetime.now().isoformat()
        }

# Global route optimizer instance
route_optimizer = RouteOptimizer()