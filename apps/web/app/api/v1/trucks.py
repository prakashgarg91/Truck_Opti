"""
Trucks API Endpoints
RESTful API for truck type management
"""

from flask import Blueprint, request, jsonify
from app.models import db, TruckType
from app.core.logging import get_logger

logger = get_logger(__name__)

trucks_bp = Blueprint('trucks', __name__, url_prefix='/trucks')


@trucks_bp.route('', methods=['GET'])
def list_trucks():
    """
    List all truck types
    Query params:
        - available: Filter by availability (true/false)
        - category: Filter by truck category
        - page: Page number (default: 1)
        - per_page: Items per page (default: 50)
    """
    try:
        # Get query parameters
        available = request.args.get('available', type=lambda x: x.lower() == 'true')
        category = request.args.get('category')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)

        # Build query
        query = TruckType.query

        if available is not None:
            query = query.filter_by(availability=available)

        if category:
            query = query.filter_by(truck_category=category)

        # Paginate
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        trucks = [truck.as_dict() for truck in pagination.items]

        return jsonify({
            'success': True,
            'data': trucks,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        }), 200

    except Exception as e:
        logger.error(f"Error listing trucks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to list trucks',
            'message': str(e)
        }), 500


@trucks_bp.route('/<int:truck_id>', methods=['GET'])
def get_truck(truck_id: int):
    """Get a specific truck by ID"""
    try:
        truck = TruckType.query.get_or_404(truck_id)

        return jsonify({
            'success': True,
            'data': truck.as_dict()
        }), 200

    except Exception as e:
        logger.error(f"Error getting truck {truck_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Truck not found',
            'message': str(e)
        }), 404


@trucks_bp.route('', methods=['POST'])
def create_truck():
    """Create a new truck type"""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['name', 'length', 'width', 'height']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400

        # BUG FIX #9: Validate dimensions are positive numbers
        try:
            length = float(data['length'])
            width = float(data['width'])
            height = float(data['height'])
            max_weight = float(data.get('max_weight', 0))

            if length <= 0 or width <= 0 or height <= 0:
                return jsonify({
                    'success': False,
                    'error': 'Dimensions (length, width, height) must be positive numbers'
                }), 400

            if max_weight < 0:
                return jsonify({
                    'success': False,
                    'error': 'Max weight cannot be negative'
                }), 400

        except ValueError as ve:
            return jsonify({
                'success': False,
                'error': f'Invalid number format: {str(ve)}'
            }), 400

        # Create truck with validated data
        truck = TruckType(
            name=data['name'],
            length=length,
            width=width,
            height=height,
            max_weight=max_weight,
            cost_per_km=float(data.get('cost_per_km', 0)),
            fuel_efficiency=float(data.get('fuel_efficiency', 0)),
            driver_cost_per_day=float(data.get('driver_cost_per_day', 0)),
            maintenance_cost_per_km=float(data.get('maintenance_cost_per_km', 0)),
            truck_category=data.get('truck_category', 'Standard'),
            availability=data.get('availability', True),
            description=data.get('description', '')
        )

        db.session.add(truck)
        db.session.commit()

        logger.info(f"Created truck: {truck.name} (ID: {truck.id})")

        return jsonify({
            'success': True,
            'message': 'Truck created successfully',
            'data': truck.as_dict()
        }), 201

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Invalid data format',
            'message': str(e)
        }), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating truck: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create truck',
            'message': str(e)
        }), 500


@trucks_bp.route('/<int:truck_id>', methods=['PUT'])
def update_truck(truck_id: int):
    """Update an existing truck type"""
    try:
        truck = TruckType.query.get_or_404(truck_id)
        data = request.get_json()

        # Update fields
        if 'name' in data:
            truck.name = data['name']
        if 'length' in data:
            truck.length = float(data['length'])
        if 'width' in data:
            truck.width = float(data['width'])
        if 'height' in data:
            truck.height = float(data['height'])
        if 'max_weight' in data:
            truck.max_weight = float(data['max_weight'])
        if 'cost_per_km' in data:
            truck.cost_per_km = float(data['cost_per_km'])
        if 'fuel_efficiency' in data:
            truck.fuel_efficiency = float(data['fuel_efficiency'])
        if 'driver_cost_per_day' in data:
            truck.driver_cost_per_day = float(data['driver_cost_per_day'])
        if 'maintenance_cost_per_km' in data:
            truck.maintenance_cost_per_km = float(data['maintenance_cost_per_km'])
        if 'truck_category' in data:
            truck.truck_category = data['truck_category']
        if 'availability' in data:
            truck.availability = data['availability']
        if 'description' in data:
            truck.description = data['description']

        db.session.commit()

        logger.info(f"Updated truck: {truck.name} (ID: {truck.id})")

        return jsonify({
            'success': True,
            'message': 'Truck updated successfully',
            'data': truck.as_dict()
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Invalid data format',
            'message': str(e)
        }), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating truck {truck_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update truck',
            'message': str(e)
        }), 500


@trucks_bp.route('/<int:truck_id>', methods=['DELETE'])
def delete_truck(truck_id: int):
    """Delete a truck type"""
    try:
        truck = TruckType.query.get_or_404(truck_id)
        truck_name = truck.name

        db.session.delete(truck)
        db.session.commit()

        logger.info(f"Deleted truck: {truck_name} (ID: {truck_id})")

        return jsonify({
            'success': True,
            'message': f'Truck {truck_name} deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting truck {truck_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete truck',
            'message': str(e)
        }), 500


@trucks_bp.route('/categories', methods=['GET'])
def list_categories():
    """List all available truck categories"""
    try:
        categories = db.session.query(
            TruckType.truck_category
        ).distinct().all()

        category_list = [cat[0] for cat in categories if cat[0]]

        return jsonify({
            'success': True,
            'data': category_list
        }), 200

    except Exception as e:
        logger.error(f"Error listing categories: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to list categories',
            'message': str(e)
        }), 500


__all__ = ['trucks_bp']
