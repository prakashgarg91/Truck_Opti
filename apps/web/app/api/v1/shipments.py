"""
Shipments API Endpoints
RESTful API for shipment management
"""

from flask import Blueprint, request, jsonify
from app.models import db, Shipment
from app.core.logging import get_logger
from datetime import datetime

logger = get_logger(__name__)

shipments_bp = Blueprint('shipments', __name__, url_prefix='/shipments')


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
def create_shipment():
    """Create a new shipment"""
    try:
        data = request.get_json()

        # Create shipment
        shipment = Shipment(
            shipment_number=data.get('shipment_number', f'SHP-{datetime.utcnow().timestamp()}'),
            origin=data.get('origin', ''),
            destination=data.get('destination', ''),
            status=data.get('status', 'pending'),
            estimated_distance=data.get('estimated_distance', 0.0),
            notes=data.get('notes', '')
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
def update_shipment(shipment_id: int):
    """Update an existing shipment"""
    try:
        shipment = Shipment.query.get_or_404(shipment_id)
        data = request.get_json()

        # Update fields
        if 'shipment_number' in data:
            shipment.shipment_number = data['shipment_number']
        if 'origin' in data:
            shipment.origin = data['origin']
        if 'destination' in data:
            shipment.destination = data['destination']
        if 'status' in data:
            shipment.status = data['status']
        if 'estimated_distance' in data:
            shipment.estimated_distance = data['estimated_distance']
        if 'notes' in data:
            shipment.notes = data['notes']

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
