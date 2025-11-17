"""
Cartons API Endpoints
RESTful API for carton type management
"""

from flask import Blueprint, request, jsonify
from app.models import db, CartonType
from app.core.logging import get_logger

logger = get_logger(__name__)

cartons_bp = Blueprint('cartons', __name__, url_prefix='/cartons')


@cartons_bp.route('', methods=['GET'])
def list_cartons():
    """
    List all carton types
    Query params:
        - fragile: Filter by fragility (true/false)
        - stackable: Filter by stackability (true/false)
        - page: Page number (default: 1)
        - per_page: Items per page (default: 50)
    """
    try:
        # Get query parameters
        fragile = request.args.get('fragile', type=lambda x: x.lower() == 'true')
        stackable = request.args.get('stackable', type=lambda x: x.lower() == 'true')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)

        # Build query
        query = CartonType.query

        if fragile is not None:
            query = query.filter_by(fragile=fragile)

        if stackable is not None:
            query = query.filter_by(stackable=stackable)

        # Paginate
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        cartons = [carton.as_dict() for carton in pagination.items]

        return jsonify({
            'success': True,
            'data': cartons,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        }), 200

    except Exception as e:
        logger.error(f"Error listing cartons: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to list cartons',
            'message': str(e)
        }), 500


@cartons_bp.route('/<int:carton_id>', methods=['GET'])
def get_carton(carton_id: int):
    """Get a specific carton by ID"""
    try:
        carton = CartonType.query.get_or_404(carton_id)

        return jsonify({
            'success': True,
            'data': carton.as_dict()
        }), 200

    except Exception as e:
        logger.error(f"Error getting carton {carton_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Carton not found',
            'message': str(e)
        }), 404


@cartons_bp.route('', methods=['POST'])
def create_carton():
    """Create a new carton type"""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['name', 'length', 'width', 'height', 'weight']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400

        # Create carton
        carton = CartonType(
            name=data['name'],
            length=float(data['length']),
            width=float(data['width']),
            height=float(data['height']),
            weight=float(data['weight']),
            fragile=data.get('fragile', False),
            stackable=data.get('stackable', True),
            priority=int(data.get('priority', 1)),
            description=data.get('description', '')
        )

        db.session.add(carton)
        db.session.commit()

        logger.info(f"Created carton: {carton.name} (ID: {carton.id})")

        return jsonify({
            'success': True,
            'message': 'Carton created successfully',
            'data': carton.as_dict()
        }), 201

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Invalid data format',
            'message': str(e)
        }), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating carton: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create carton',
            'message': str(e)
        }), 500


@cartons_bp.route('/<int:carton_id>', methods=['PUT'])
def update_carton(carton_id: int):
    """Update an existing carton type"""
    try:
        carton = CartonType.query.get_or_404(carton_id)
        data = request.get_json()

        # Update fields
        if 'name' in data:
            carton.name = data['name']
        if 'length' in data:
            carton.length = float(data['length'])
        if 'width' in data:
            carton.width = float(data['width'])
        if 'height' in data:
            carton.height = float(data['height'])
        if 'weight' in data:
            carton.weight = float(data['weight'])
        if 'fragile' in data:
            carton.fragile = data['fragile']
        if 'stackable' in data:
            carton.stackable = data['stackable']
        if 'priority' in data:
            carton.priority = int(data['priority'])
        if 'description' in data:
            carton.description = data['description']

        db.session.commit()

        logger.info(f"Updated carton: {carton.name} (ID: {carton.id})")

        return jsonify({
            'success': True,
            'message': 'Carton updated successfully',
            'data': carton.as_dict()
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Invalid data format',
            'message': str(e)
        }), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating carton {carton_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update carton',
            'message': str(e)
        }), 500


@cartons_bp.route('/<int:carton_id>', methods=['DELETE'])
def delete_carton(carton_id: int):
    """Delete a carton type"""
    try:
        carton = CartonType.query.get_or_404(carton_id)
        carton_name = carton.name

        db.session.delete(carton)
        db.session.commit()

        logger.info(f"Deleted carton: {carton_name} (ID: {carton_id})")

        return jsonify({
            'success': True,
            'message': f'Carton {carton_name} deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting carton {carton_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete carton',
            'message': str(e)
        }), 500


@cartons_bp.route('/bulk', methods=['POST'])
def bulk_create_cartons():
    """Bulk create cartons from list"""
    try:
        data = request.get_json()

        if not isinstance(data, list):
            return jsonify({
                'success': False,
                'error': 'Expected list of cartons'
            }), 400

        created_cartons = []
        errors = []

        for idx, carton_data in enumerate(data):
            try:
                carton = CartonType(
                    name=carton_data['name'],
                    length=float(carton_data['length']),
                    width=float(carton_data['width']),
                    height=float(carton_data['height']),
                    weight=float(carton_data['weight']),
                    fragile=carton_data.get('fragile', False),
                    stackable=carton_data.get('stackable', True),
                    priority=int(carton_data.get('priority', 1)),
                    description=carton_data.get('description', '')
                )
                db.session.add(carton)
                created_cartons.append(carton)
            except Exception as e:
                errors.append({
                    'index': idx,
                    'data': carton_data,
                    'error': str(e)
                })

        if created_cartons:
            db.session.commit()

        return jsonify({
            'success': len(errors) == 0,
            'created': len(created_cartons),
            'errors': errors,
            'data': [c.as_dict() for c in created_cartons]
        }), 201 if len(errors) == 0 else 207

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error bulk creating cartons: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to bulk create cartons',
            'message': str(e)
        }), 500


__all__ = ['cartons_bp']
