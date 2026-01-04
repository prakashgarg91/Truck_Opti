"""
Location Sharing Service for TruckOpti
Real-time driver tracking and geofencing for Indian logistics

Features:
- Real-time location updates via WebSocket
- Geofencing for delivery zones
- ETA calculations with traffic
- Google Maps integration
"""

import math
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, field
import requests
import logging

logger = logging.getLogger(__name__)


@dataclass
class Location:
    """Geographic location with metadata"""
    latitude: float
    longitude: float
    accuracy: float = 0.0
    timestamp: datetime = field(default_factory=datetime.utcnow)
    speed: float = 0.0  # km/h
    heading: float = 0.0  # degrees from north
    
    def to_dict(self) -> Dict:
        return {
            'latitude': self.latitude,
            'longitude': self.longitude,
            'accuracy': self.accuracy,
            'timestamp': self.timestamp.isoformat(),
            'speed': self.speed,
            'heading': self.heading
        }


@dataclass 
class Geofence:
    """Circular geofence definition"""
    id: str
    name: str
    center_lat: float
    center_lng: float
    radius_meters: float
    type: str = "delivery_zone"  # delivery_zone, pickup_point, warehouse
    
    def contains(self, lat: float, lng: float) -> bool:
        """Check if point is inside geofence"""
        distance = haversine_distance(
            self.center_lat, self.center_lng, lat, lng
        )
        return distance <= self.radius_meters


@dataclass
class LocationConfig:
    """Configuration for location service"""
    google_maps_api_key: str = ""
    update_interval_seconds: int = 30
    stale_threshold_minutes: int = 5
    max_history_points: int = 100


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two points in meters using Haversine formula
    """
    R = 6371000  # Earth's radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi/2)**2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


class LocationService:
    """
    Real-time location tracking service
    
    Usage:
        location_service = LocationService(config)
        
        # Update driver location
        location_service.update_location(driver_id, lat, lng)
        
        # Get current location
        location = location_service.get_location(driver_id)
        
        # Calculate ETA
        eta = location_service.calculate_eta(driver_id, dest_lat, dest_lng)
    """
    
    def __init__(self, config: Optional[LocationConfig] = None):
        self.config = config or LocationConfig()
        self._locations: Dict[str, List[Location]] = {}  # driver_id -> location history
        self._geofences: Dict[str, Geofence] = {}
        self._subscribers: Dict[str, List[callable]] = {}  # shipment_id -> callbacks
    
    def update_location(self, entity_id: str, latitude: float, longitude: float,
                        accuracy: float = 0.0, speed: float = 0.0, 
                        heading: float = 0.0) -> Location:
        """
        Update location for an entity (driver, vehicle, shipment)
        
        Args:
            entity_id: Unique identifier
            latitude: GPS latitude
            longitude: GPS longitude
            accuracy: GPS accuracy in meters
            speed: Speed in km/h
            heading: Direction in degrees
            
        Returns:
            Location object
        """
        location = Location(
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy,
            timestamp=datetime.utcnow(),
            speed=speed,
            heading=heading
        )
        
        # Store location history
        if entity_id not in self._locations:
            self._locations[entity_id] = []
        
        self._locations[entity_id].append(location)
        
        # Trim history if needed
        if len(self._locations[entity_id]) > self.config.max_history_points:
            self._locations[entity_id] = self._locations[entity_id][-self.config.max_history_points:]
        
        # Check geofences
        self._check_geofences(entity_id, location)
        
        # Notify subscribers
        self._notify_subscribers(entity_id, location)
        
        logger.debug(f"Location updated for {entity_id}: {latitude}, {longitude}")
        
        return location
    
    def get_location(self, entity_id: str) -> Optional[Location]:
        """Get current location for an entity"""
        if entity_id not in self._locations or not self._locations[entity_id]:
            return None
        
        return self._locations[entity_id][-1]
    
    def get_location_history(self, entity_id: str, 
                             since: Optional[datetime] = None,
                             limit: int = 50) -> List[Location]:
        """Get location history for an entity"""
        if entity_id not in self._locations:
            return []
        
        history = self._locations[entity_id]
        
        if since:
            history = [loc for loc in history if loc.timestamp >= since]
        
        return history[-limit:]
    
    def is_location_stale(self, entity_id: str) -> bool:
        """Check if location data is stale"""
        location = self.get_location(entity_id)
        if not location:
            return True
        
        threshold = datetime.utcnow() - timedelta(minutes=self.config.stale_threshold_minutes)
        return location.timestamp < threshold
    
    def calculate_eta(self, entity_id: str, dest_lat: float, dest_lng: float,
                      use_traffic: bool = True) -> Optional[Dict]:
        """
        Calculate ETA to destination
        
        Args:
            entity_id: Entity to track
            dest_lat: Destination latitude
            dest_lng: Destination longitude
            use_traffic: Include traffic conditions
            
        Returns:
            Dict with distance_km, duration_minutes, eta_datetime
        """
        location = self.get_location(entity_id)
        if not location:
            return None
        
        # Calculate straight-line distance
        distance_m = haversine_distance(
            location.latitude, location.longitude,
            dest_lat, dest_lng
        )
        distance_km = distance_m / 1000
        
        # If Google Maps API is available, use it for accurate ETA
        if self.config.google_maps_api_key and use_traffic:
            try:
                eta_data = self._get_google_eta(
                    location.latitude, location.longitude,
                    dest_lat, dest_lng
                )
                if eta_data:
                    return eta_data
            except Exception as e:
                logger.warning(f"Google Maps ETA failed: {e}")
        
        # Fallback: estimate based on average speed (40 km/h for Indian roads)
        avg_speed = location.speed if location.speed > 5 else 40
        
        # Apply road factor (actual distance ~1.3x straight-line in India)
        road_distance_km = distance_km * 1.3
        duration_hours = road_distance_km / avg_speed
        duration_minutes = duration_hours * 60
        
        eta_datetime = datetime.utcnow() + timedelta(minutes=duration_minutes)
        
        return {
            'distance_km': round(road_distance_km, 2),
            'duration_minutes': round(duration_minutes),
            'eta_datetime': eta_datetime.isoformat(),
            'traffic_used': False,
            'current_speed_kmh': round(location.speed, 1)
        }
    
    def _get_google_eta(self, origin_lat: float, origin_lng: float,
                        dest_lat: float, dest_lng: float) -> Optional[Dict]:
        """Get ETA from Google Directions API"""
        try:
            url = "https://maps.googleapis.com/maps/api/directions/json"
            params = {
                "origin": f"{origin_lat},{origin_lng}",
                "destination": f"{dest_lat},{dest_lng}",
                "key": self.config.google_maps_api_key,
                "departure_time": "now",
                "traffic_model": "best_guess"
            }
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("routes"):
                    route = data["routes"][0]["legs"][0]
                    
                    distance_m = route["distance"]["value"]
                    duration_s = route.get("duration_in_traffic", route["duration"])["value"]
                    
                    return {
                        'distance_km': round(distance_m / 1000, 2),
                        'duration_minutes': round(duration_s / 60),
                        'eta_datetime': (datetime.utcnow() + timedelta(seconds=duration_s)).isoformat(),
                        'traffic_used': True,
                        'polyline': route.get("overview_polyline", {}).get("points")
                    }
            
            return None
            
        except requests.RequestException as e:
            logger.error(f"Google Directions API error: {e}")
            return None
    
    # Geofencing
    
    def add_geofence(self, geofence: Geofence):
        """Add a geofence"""
        self._geofences[geofence.id] = geofence
        logger.info(f"Geofence added: {geofence.name}")
    
    def remove_geofence(self, geofence_id: str):
        """Remove a geofence"""
        if geofence_id in self._geofences:
            del self._geofences[geofence_id]
    
    def _check_geofences(self, entity_id: str, location: Location):
        """Check if entity has entered/exited any geofences"""
        for geofence in self._geofences.values():
            is_inside = geofence.contains(location.latitude, location.longitude)
            
            # Get previous location
            history = self._locations.get(entity_id, [])
            if len(history) < 2:
                continue
            
            prev_location = history[-2]
            was_inside = geofence.contains(prev_location.latitude, prev_location.longitude)
            
            if is_inside and not was_inside:
                self._on_geofence_enter(entity_id, geofence, location)
            elif was_inside and not is_inside:
                self._on_geofence_exit(entity_id, geofence, location)
    
    def _on_geofence_enter(self, entity_id: str, geofence: Geofence, location: Location):
        """Handle geofence entry event"""
        logger.info(f"Entity {entity_id} entered geofence: {geofence.name}")
        # Emit event (implement WebSocket notification here)
    
    def _on_geofence_exit(self, entity_id: str, geofence: Geofence, location: Location):
        """Handle geofence exit event"""
        logger.info(f"Entity {entity_id} exited geofence: {geofence.name}")
        # Emit event
    
    # Subscription
    
    def subscribe(self, shipment_id: str, callback: callable):
        """Subscribe to location updates for a shipment"""
        if shipment_id not in self._subscribers:
            self._subscribers[shipment_id] = []
        self._subscribers[shipment_id].append(callback)
    
    def unsubscribe(self, shipment_id: str, callback: callable):
        """Unsubscribe from location updates"""
        if shipment_id in self._subscribers:
            self._subscribers[shipment_id] = [
                cb for cb in self._subscribers[shipment_id] if cb != callback
            ]
    
    def _notify_subscribers(self, entity_id: str, location: Location):
        """Notify subscribers of location update"""
        if entity_id in self._subscribers:
            for callback in self._subscribers[entity_id]:
                try:
                    callback(entity_id, location)
                except Exception as e:
                    logger.error(f"Subscriber callback error: {e}")
    
    # Indian city coordinates (major logistics hubs)
    
    INDIAN_CITIES = {
        "mumbai": (19.0760, 72.8777),
        "delhi": (28.6139, 77.2090),
        "bangalore": (12.9716, 77.5946),
        "hyderabad": (17.3850, 78.4867),
        "chennai": (13.0827, 80.2707),
        "kolkata": (22.5726, 88.3639),
        "pune": (18.5204, 73.8567),
        "ahmedabad": (23.0225, 72.5714),
        "jaipur": (26.9124, 75.7873),
        "surat": (21.1702, 72.8311),
        "lucknow": (26.8467, 80.9462),
        "kanpur": (26.4499, 80.3319),
        "nagpur": (21.1458, 79.0882),
        "indore": (22.7196, 75.8577),
        "bhopal": (23.2599, 77.4126),
        "visakhapatnam": (17.6868, 83.2185),
        "coimbatore": (11.0168, 76.9558),
        "kochi": (9.9312, 76.2673),
        "guwahati": (26.1445, 91.7362),
        "chandigarh": (30.7333, 76.7794)
    }
    
    def geocode_city(self, city_name: str) -> Optional[Tuple[float, float]]:
        """Get coordinates for major Indian cities"""
        city_lower = city_name.lower().strip()
        return self.INDIAN_CITIES.get(city_lower)


# Global instance
location_service = LocationService()


def init_location_service(app):
    """Initialize location service with Flask app config"""
    config = LocationConfig(
        google_maps_api_key=app.config.get('GOOGLE_MAPS_API_KEY', ''),
        update_interval_seconds=app.config.get('LOCATION_UPDATE_INTERVAL', 30),
        stale_threshold_minutes=app.config.get('LOCATION_STALE_MINUTES', 5)
    )
    global location_service
    location_service = LocationService(config)
    return location_service
