"""
Optimization API Endpoints
RESTful API for truck loading optimization
"""

from flask import Blueprint, request, jsonify
from app.models import db, TruckType, CartonType, PackingJob, PackingResult
from app.packer import pack_cartons, calculate_optimal_truck_combination
from app.core.logging import get_logger
from datetime import datetime

logger = get_logger(__name__)

optimization_bp = Blueprint('optimization', __name__, url_prefix='/optimization')


@optimization_bp.route('/recommend-truck', methods=['POST'])
def recommend_truck():
    """
    Recommend optimal truck for given cartons
    Request body:
    {
        "cartons": [{"carton_type_id": 1, "quantity": 10}, ...],
        "optimization_goal": "space|cost|weight|truck_count"
    }
    """
    try:
        data = request.get_json()

        if not data or 'cartons' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: cartons'
            }), 400

        cartons_data = data['cartons']
        optimization_goal = data.get('optimization_goal', 'space')

        # Build carton list
        cartons_list = []
        for item in cartons_data:
            carton_type = CartonType.query.get(item['carton_type_id'])
            if not carton_type:
                return jsonify({
                    'success': False,
                    'error': f"Carton type {item['carton_type_id']} not found"
                }), 404

            quantity = item.get('quantity', 1)
            for _ in range(quantity):
                cartons_list.append({
                    'type': carton_type.name,
                    'length': carton_type.length,
                    'width': carton_type.width,
                    'height': carton_type.height,
                    'weight': carton_type.weight
                })

        # Get all available trucks
        available_trucks = TruckType.query.filter_by(availability=True).all()

        if not available_trucks:
            return jsonify({
                'success': False,
                'error': 'No available trucks found'
            }), 404

        # Calculate optimal truck combination
        result = calculate_optimal_truck_combination(
            cartons_list,
            available_trucks,
            optimization_goal
        )

        return jsonify({
            'success': True,
            'data': result
        }), 200

    except Exception as e:
        logger.error(f"Error in truck recommendation: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to recommend truck',
            'message': str(e)
        }), 500


@optimization_bp.route('/optimize-loading', methods=['POST'])
def optimize_loading():
    """
    Optimize loading of cartons into a specific truck
    Request body:
    {
        "truck_type_id": 1,
        "cartons": [{"carton_type_id": 1, "quantity": 10}, ...]
    }
    """
    try:
        data = request.get_json()

        if not data or 'truck_type_id' not in data or 'cartons' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: truck_type_id, cartons'
            }), 400

        truck = TruckType.query.get(data['truck_type_id'])
        if not truck:
            return jsonify({
                'success': False,
                'error': f"Truck type {data['truck_type_id']} not found"
            }), 404

        # Build carton list
        cartons_list = []
        for item in data['cartons']:
            carton_type = CartonType.query.get(item['carton_type_id'])
            if not carton_type:
                return jsonify({
                    'success': False,
                    'error': f"Carton type {item['carton_type_id']} not found"
                }), 404

            quantity = item.get('quantity', 1)
            for _ in range(quantity):
                cartons_list.append({
                    'type': carton_type.name,
                    'length': carton_type.length,
                    'width': carton_type.width,
                    'height': carton_type.height,
                    'weight': carton_type.weight
                })

        # Optimize packing
        packing_result = pack_cartons(truck, cartons_list)

        return jsonify({
            'success': True,
            'data': packing_result
        }), 200

    except Exception as e:
        logger.error(f"Error in loading optimization: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to optimize loading',
            'message': str(e)
        }), 500


@optimization_bp.route('/fleet-optimization', methods=['POST'])
def fleet_optimization():
    """
    Optimize packing across available fleet
    Request body:
    {
        "fleet": [{"truck_type_id": 1, "quantity": 2}, ...],
        "cartons": [{"carton_type_id": 1, "quantity": 10}, ...]
    }
    """
    try:
        data = request.get_json()

        if not data or 'fleet' not in data or 'cartons' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: fleet, cartons'
            }), 400

        # Build fleet list
        fleet_list = []
        for item in data['fleet']:
            truck = TruckType.query.get(item['truck_type_id'])
            if not truck:
                return jsonify({
                    'success': False,
                    'error': f"Truck type {item['truck_type_id']} not found"
                }), 404

            quantity = item.get('quantity', 1)
            for _ in range(quantity):
                fleet_list.append(truck)

        # Build carton list
        cartons_list = []
        for item in data['cartons']:
            carton_type = CartonType.query.get(item['carton_type_id'])
            if not carton_type:
                return jsonify({
                    'success': False,
                    'error': f"Carton type {item['carton_type_id']} not found"
                }), 404

            quantity = item.get('quantity', 1)
            for _ in range(quantity):
                cartons_list.append({
                    'type': carton_type.name,
                    'length': carton_type.length,
                    'width': carton_type.width,
                    'height': carton_type.height,
                    'weight': carton_type.weight
                })

        # Optimize fleet packing
        results = []
        remaining_cartons = cartons_list.copy()

        for truck in fleet_list:
            if not remaining_cartons:
                break

            packing_result = pack_cartons(truck, remaining_cartons)

            if packing_result.get('packed_cartons'):
                results.append({
                    'truck': truck.as_dict(),
                    'packing': packing_result
                })

                # Remove packed cartons from remaining
                packed_count = len(packing_result['packed_cartons'])
                remaining_cartons = remaining_cartons[packed_count:]

        return jsonify({
            'success': True,
            'data': {
                'packing_results': results,
                'remaining_cartons': len(remaining_cartons),
                'trucks_used': len(results)
            }
        }), 200

    except Exception as e:
        logger.error(f"Error in fleet optimization: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to optimize fleet',
            'message': str(e)
        }), 500


@optimization_bp.route('/jobs', methods=['GET'])
def list_packing_jobs():
    """List all packing jobs"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        pagination = PackingJob.query.order_by(
            PackingJob.created_at.desc()
        ).paginate(page=page, per_page=per_page, error_out=False)

        jobs = [job.as_dict() for job in pagination.items]

        return jsonify({
            'success': True,
            'data': jobs,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        }), 200

    except Exception as e:
        logger.error(f"Error listing packing jobs: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to list packing jobs',
            'message': str(e)
        }), 500


@optimization_bp.route('/jobs/<int:job_id>', methods=['GET'])
def get_packing_job(job_id: int):
    """Get a specific packing job with results"""
    try:
        job = PackingJob.query.get_or_404(job_id)

        return jsonify({
            'success': True,
            'data': job.as_dict()
        }), 200

    except Exception as e:
        logger.error(f"Error getting packing job {job_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Packing job not found',
            'message': str(e)
        }), 404


__all__ = ['optimization_bp']
