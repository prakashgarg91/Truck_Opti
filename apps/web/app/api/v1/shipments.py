"""
Shipments API Endpoints
RESTful API for shipment management
"""

from flask import Blueprint, request, jsonify
from app.middleware.authentication import require_auth
from app.models import db, Shipment
from app.core.logging import get_logger
from datetime import datetime

logger = get_logger(__name__)

shipments_bp = Blueprint('shipments', __name__, url_prefix='/shipments')


def parse_optional_datetime(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value

    if isinstance(value, str):
        normalized = value.replace('Z', '+00:00')
        return datetime.fromisoformat(normalized)

    raise ValueError('Invalid datetime format')


@shipments_bp.route('', methods=['GET'])
def list_shipments():
    """
    List all shipments
    Query params:
        - status: Filter by status
        - page: Page number (default: 1)
        - per_page: Items per page (default: 20)
    """
    try:
        status = request.args.get('status')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        query = Shipment.query

        if status:
            query = query.filter_by(status=status)

        pagination = query.order_by(
            Shipment.created_at.desc()
        ).paginate(page=page, per_page=per_page, error_out=False)

        shipments = [shipment.as_dict() for shipment in pagination.items]

        return jsonify({
            'success': True,
            'data': shipments,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        }), 200

    except Exception as e:
        logger.error(f"Error listing shipments: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to list shipments',
            'message': str(e)
        }), 500


@shipments_bp.route('/<int:shipment_id>', methods=['GET'])
def get_shipment(shipment_id: int):
    """Get a specific shipment by ID"""
    try:
        shipment = Shipment.query.get_or_404(shipment_id)

        return jsonify({
            'success': True,
            'data': shipment.as_dict()
        }), 200

    except Exception as e:
        logger.error(f"Error getting shipment {shipment_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Shipment not found',
            'message': str(e)
        }), 404


@shipments_bp.route('', methods=['POST'])
@require_auth
def create_shipment():
    """Create a new shipment"""
    try:
        data = request.get_json()

        if not data or 'customer_id' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: customer_id'
            }), 400

        # Create shipment
        shipment = Shipment(
            shipment_number=data.get('shipment_number', f'SHP-{datetime.utcnow().timestamp()}'),
            customer_id=int(data['customer_id']),
            truck_id=data.get('truck_id'),
            route_id=data.get('route_id'),
            origin_address=data.get('origin_address', data.get('origin', '')),
            destination_address=data.get('destination_address', data.get('destination', '')),
            status=data.get('status', 'pending'),
            priority=int(data.get('priority', 1)),
            estimated_delivery=parse_optional_datetime(data.get('estimated_delivery', data.get('delivery_date'))),
            total_value=float(data.get('total_value', 0.0)),
            total_weight=float(data.get('total_weight', 0.0)),
            total_volume=float(data.get('total_volume', 0.0)),
            special_instructions=data.get('special_instructions', data.get('notes', '')),
        )

        db.session.add(shipment)
        db.session.commit()

        logger.info(f"Created shipment: {shipment.shipment_number} (ID: {shipment.id})")

        return jsonify({
            'success': True,
            'message': 'Shipment created successfully',
            'data': shipment.as_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating shipment: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create shipment',
            'message': str(e)
        }), 500


@shipments_bp.route('/<int:shipment_id>', methods=['PUT'])
@require_auth
def update_shipment(shipment_id: int):
    """Update an existing shipment"""
    try:
        shipment = Shipment.query.get_or_404(shipment_id)
        data = request.get_json()

        # Update fields
        if 'shipment_number' in data:
            shipment.shipment_number = data['shipment_number']
        if 'customer_id' in data:
            shipment.customer_id = int(data['customer_id'])
        if 'truck_id' in data:
            shipment.truck_id = data['truck_id']
        if 'route_id' in data:
            shipment.route_id = data['route_id']
        if 'origin' in data:
            shipment.origin_address = data['origin']
        if 'origin_address' in data:
            shipment.origin_address = data['origin_address']
        if 'destination' in data:
            shipment.destination_address = data['destination']
        if 'destination_address' in data:
            shipment.destination_address = data['destination_address']
        if 'status' in data:
            shipment.status = data['status']
        if 'priority' in data:
            shipment.priority = int(data['priority'])
        if 'estimated_delivery' in data or 'delivery_date' in data:
            shipment.estimated_delivery = parse_optional_datetime(data.get('estimated_delivery', data.get('delivery_date')))
        if 'total_value' in data:
            shipment.total_value = float(data['total_value'])
        if 'total_weight' in data:
            shipment.total_weight = float(data['total_weight'])
        if 'total_volume' in data:
            shipment.total_volume = float(data['total_volume'])
        if 'notes' in data:
            shipment.special_instructions = data['notes']
        if 'special_instructions' in data:
            shipment.special_instructions = data['special_instructions']

        db.session.commit()

        logger.info(f"Updated shipment: {shipment.shipment_number} (ID: {shipment.id})")

        return jsonify({
            'success': True,
            'message': 'Shipment updated successfully',
            'data': shipment.as_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating shipment {shipment_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update shipment',
            'message': str(e)
        }), 500


@shipments_bp.route('/<int:shipment_id>', methods=['DELETE'])
@require_auth
def delete_shipment(shipment_id: int):
    """Delete a shipment"""
    try:
        shipment = Shipment.query.get_or_404(shipment_id)
        shipment_number = shipment.shipment_number

        db.session.delete(shipment)
        db.session.commit()

        logger.info(f"Deleted shipment: {shipment_number} (ID: {shipment_id})")

        return jsonify({
            'success': True,
            'message': f'Shipment {shipment_number} deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting shipment {shipment_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete shipment',
            'message': str(e)
        }), 500


__all__ = ['shipments_bp']
