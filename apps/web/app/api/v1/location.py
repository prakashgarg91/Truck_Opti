"""
Location API Endpoints for TruckOpti
Real-time driver/shipment tracking for Indian logistics

Endpoints:
- POST /location/update - Driver updates their location
- GET /location/track/:id - Track a shipment/driver
- POST /location/geofence - Create geofence alerts
- GET /location/history - Get location history
- GET /location/eta - Calculate ETA to destination
"""

from flask import Blueprint, request, jsonify, g
from app.middleware.authentication import require_auth
from app.middleware.validation import validate_request
from app.middleware.rate_limiting import rate_limit
from app.services.location_service import location_service, Location, Geofence
from app.core.logging import get_logger
from datetime import datetime
import uuid

logger = get_logger(__name__)

location_bp = Blueprint('location', __name__, url_prefix='/location')


@location_bp.route('/update', methods=['POST'])
@require_auth
@rate_limit(max_requests=120, window_seconds=60)  # 2 updates per second max
@validate_request({
    'latitude': {'type': 'float', 'required': True},
    'longitude': {'type': 'float', 'required': True},
    'accuracy': {'type': 'float', 'required': False},
    'speed': {'type': 'float', 'required': False},
    'heading': {'type': 'float', 'required': False},
    'shipment_id': {'type': 'string', 'required': False}
})
def update_location():
    """
    Update current location (for drivers/delivery personnel)
    
    Request body:
    {
        "latitude": 19.0760,
        "longitude": 72.8777,
        "accuracy": 10.5,
        "speed": 45.0,
        "heading": 90.0,
        "shipment_id": "SHIP-ABC123" (optional)
    }
    
    Response:
    {
        "success": true,
        "data": {
            "location": {...},
            "geofence_events": [...]
        }
    }
    """
    try:
        data = request.validated_data
        user_id = str(g.current_user['user_id'])
        
        # Validate coordinates are within India bounds
        lat = data['latitude']
        lng = data['longitude']
        
        if not (6.0 <= lat <= 37.0 and 68.0 <= lng <= 97.5):
            return jsonify({
                'success': False,
                'error': 'Invalid coordinates',
                'message': 'Location must be within India'
            }), 400
        
        # Update location
        location = location_service.update_location(
            entity_id=user_id,
            latitude=lat,
            longitude=lng,
            accuracy=data.get('accuracy', 0),
            speed=data.get('speed', 0),
            heading=data.get('heading', 0)
        )
        
        # Also update for shipment if provided
        shipment_id = data.get('shipment_id')
        if shipment_id:
            location_service.update_location(
                entity_id=shipment_id,
                latitude=lat,
                longitude=lng,
                accuracy=data.get('accuracy', 0),
                speed=data.get('speed', 0),
                heading=data.get('heading', 0)
            )
        
        logger.debug(f"Location updated for user {user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Location updated',
            'data': {
                'location': location.to_dict(),
                'tracked_entities': [user_id] + ([shipment_id] if shipment_id else [])
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Location update error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Location update failed',
            'message': str(e)
        }), 500


@location_bp.route('/track/<entity_id>', methods=['GET'])
@require_auth
def track_entity(entity_id: str):
    """
    Get current location of a driver/shipment
    
    Path params:
        entity_id: Driver user ID or shipment number
    
    Response:
    {
        "success": true,
        "data": {
            "location": {...},
            "is_stale": false,
            "eta": {...}
        }
    }
    """
    try:
        location = location_service.get_location(entity_id)
        
        if not location:
            return jsonify({
                'success': False,
                'error': 'No location data',
                'message': f'No location data available for {entity_id}'
            }), 404
        
        is_stale = location_service.is_location_stale(entity_id)
        
        # Get destination from query params for ETA
        dest_lat = request.args.get('dest_lat', type=float)
        dest_lng = request.args.get('dest_lng', type=float)
        
        eta = None
        if dest_lat and dest_lng:
            eta = location_service.calculate_eta(entity_id, dest_lat, dest_lng)
        
        return jsonify({
            'success': True,
            'data': {
                'entity_id': entity_id,
                'location': location.to_dict(),
                'is_stale': is_stale,
                'eta': eta
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Track entity error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Tracking failed',
            'message': str(e)
        }), 500


@location_bp.route('/history/<entity_id>', methods=['GET'])
@require_auth
def get_location_history(entity_id: str):
    """
    Get location history for an entity
    
    Path params:
        entity_id: Driver user ID or shipment number
    
    Query params:
        since: ISO datetime to fetch from (optional)
        limit: Max number of points (default 50, max 200)
    
    Response:
    {
        "success": true,
        "data": {
            "entity_id": "...",
            "history": [...],
            "total_distance_km": 45.2
        }
    }
    """
    try:
        since = request.args.get('since')
        limit = min(request.args.get('limit', 50, type=int), 200)
        
        since_dt = None
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            except ValueError:
                pass
        
        history = location_service.get_location_history(entity_id, since=since_dt, limit=limit)
        
        # Calculate total distance traveled
        total_distance = 0
        if len(history) > 1:
            from app.services.location_service import haversine_distance
            for i in range(1, len(history)):
                total_distance += haversine_distance(
                    history[i-1].latitude, history[i-1].longitude,
                    history[i].latitude, history[i].longitude
                )
        
        return jsonify({
            'success': True,
            'data': {
                'entity_id': entity_id,
                'history': [loc.to_dict() for loc in history],
                'total_points': len(history),
                'total_distance_km': round(total_distance / 1000, 2)
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Location history error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get history',
            'message': str(e)
        }), 500


@location_bp.route('/eta', methods=['GET'])
@require_auth
def calculate_eta():
    """
    Calculate ETA from entity's current location to destination
    
    Query params:
        entity_id: Entity to track
        dest_lat: Destination latitude
        dest_lng: Destination longitude
        dest_city: Destination city name (alternative to lat/lng)
        use_traffic: Include traffic (default true)
    
    Response:
    {
        "success": true,
        "data": {
            "distance_km": 45.2,
            "duration_minutes": 75,
            "eta_datetime": "2026-01-04T15:30:00",
            "traffic_used": true
        }
    }
    """
    try:
        entity_id = request.args.get('entity_id')
        
        if not entity_id:
            return jsonify({
                'success': False,
                'error': 'entity_id required'
            }), 400
        
        # Get destination
        dest_lat = request.args.get('dest_lat', type=float)
        dest_lng = request.args.get('dest_lng', type=float)
        dest_city = request.args.get('dest_city')
        
        if dest_city and not (dest_lat and dest_lng):
            coords = location_service.geocode_city(dest_city)
            if coords:
                dest_lat, dest_lng = coords
        
        if not (dest_lat and dest_lng):
            return jsonify({
                'success': False,
                'error': 'Destination required',
                'message': 'Provide dest_lat/dest_lng or dest_city'
            }), 400
        
        use_traffic = request.args.get('use_traffic', 'true').lower() == 'true'
        
        eta = location_service.calculate_eta(entity_id, dest_lat, dest_lng, use_traffic)
        
        if not eta:
            return jsonify({
                'success': False,
                'error': 'ETA calculation failed',
                'message': 'No location data for entity'
            }), 404
        
        return jsonify({
            'success': True,
            'data': eta
        }), 200
        
    except Exception as e:
        logger.error(f"ETA calculation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'ETA calculation failed',
            'message': str(e)
        }), 500


@location_bp.route('/geofence', methods=['POST'])
@require_auth
@validate_request({
    'name': {'type': 'string', 'required': True},
    'latitude': {'type': 'float', 'required': True},
    'longitude': {'type': 'float', 'required': True},
    'radius_meters': {'type': 'float', 'required': True},
    'type': {'type': 'string', 'required': False}
})
def create_geofence():
    """
    Create a geofence for delivery zone alerts
    
    Request body:
    {
        "name": "Customer ABC Warehouse",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "radius_meters": 500,
        "type": "delivery_zone"
    }
    
    Response:
    {
        "success": true,
        "data": {
            "geofence_id": "gf_abc123",
            "name": "Customer ABC Warehouse"
        }
    }
    """
    try:
        data = request.validated_data
        
        geofence_id = f"gf_{uuid.uuid4().hex[:8]}"
        
        geofence = Geofence(
            id=geofence_id,
            name=data['name'],
            center_lat=data['latitude'],
            center_lng=data['longitude'],
            radius_meters=data['radius_meters'],
            type=data.get('type', 'delivery_zone')
        )
        
        location_service.add_geofence(geofence)
        
        logger.info(f"Geofence created: {geofence_id}")
        
        return jsonify({
            'success': True,
            'message': 'Geofence created',
            'data': {
                'geofence_id': geofence_id,
                'name': geofence.name,
                'center': {
                    'latitude': geofence.center_lat,
                    'longitude': geofence.center_lng
                },
                'radius_meters': geofence.radius_meters,
                'type': geofence.type
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Create geofence error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Geofence creation failed',
            'message': str(e)
        }), 500


@location_bp.route('/geofence/<geofence_id>', methods=['DELETE'])
@require_auth
def delete_geofence(geofence_id: str):
    """
    Delete a geofence
    """
    try:
        location_service.remove_geofence(geofence_id)
        
        return jsonify({
            'success': True,
            'message': 'Geofence deleted'
        }), 200
        
    except Exception as e:
        logger.error(f"Delete geofence error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Geofence deletion failed',
            'message': str(e)
        }), 500


@location_bp.route('/cities', methods=['GET'])
def get_indian_cities():
    """
    Get list of supported Indian cities with coordinates
    
    Response:
    {
        "success": true,
        "data": {
            "cities": [
                {"name": "Mumbai", "latitude": 19.0760, "longitude": 72.8777},
                ...
            ]
        }
    }
    """
    cities = [
        {"name": city.title(), "latitude": coords[0], "longitude": coords[1]}
        for city, coords in location_service.INDIAN_CITIES.items()
    ]
    
    return jsonify({
        'success': True,
        'data': {
            'cities': sorted(cities, key=lambda x: x['name']),
            'total': len(cities)
        }
    }), 200


__all__ = ['location_bp']
