"""
Health Check API Endpoints
System health and status monitoring
"""

from flask import Blueprint, jsonify
from app.models import db, TruckType, CartonType, PackingJob
from app.core.logging import get_logger
from datetime import datetime
import sys

logger = get_logger(__name__)

health_bp = Blueprint('health', __name__, url_prefix='/health')


@health_bp.route('', methods=['GET'])
def health_check():
    """Basic health check endpoint"""
    try:
        # Test database connection
        db.session.execute(db.text('SELECT 1'))

        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0',
            'environment': 'production' if not sys.flags.debug else 'development'
        }), 200

    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e)
        }), 503


@health_bp.route('/detailed', methods=['GET'])
def detailed_health_check():
    """Detailed health check with component status"""
    try:
        health_status = {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'components': {}
        }

        # Database health
        try:
            db.session.execute(db.text('SELECT 1'))
            truck_count = TruckType.query.count()
            carton_count = CartonType.query.count()
            job_count = PackingJob.query.count()

            health_status['components']['database'] = {
                'status': 'healthy',
                'trucks': truck_count,
                'cartons': carton_count,
                'jobs': job_count
            }
        except Exception as e:
            health_status['components']['database'] = {
                'status': 'unhealthy',
                'error': str(e)
            }
            health_status['status'] = 'degraded'

        # Check data integrity
        try:
            available_trucks = TruckType.query.filter_by(availability=True).count()
            health_status['components']['data_integrity'] = {
                'status': 'healthy',
                'available_trucks': available_trucks
            }
        except Exception as e:
            health_status['components']['data_integrity'] = {
                'status': 'unhealthy',
                'error': str(e)
            }

        # Overall status
        if any(comp.get('status') == 'unhealthy' for comp in health_status['components'].values()):
            health_status['status'] = 'unhealthy'
            status_code = 503
        elif any(comp.get('status') == 'degraded' for comp in health_status['components'].values()):
            health_status['status'] = 'degraded'
            status_code = 200
        else:
            status_code = 200

        return jsonify(health_status), status_code

    except Exception as e:
        logger.error(f"Detailed health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e)
        }), 503


@health_bp.route('/ready', methods=['GET'])
def readiness_check():
    """Readiness check for load balancers"""
    try:
        # Check if database is ready
        db.session.execute(db.text('SELECT 1'))

        # Check if required data exists
        truck_count = TruckType.query.count()

        if truck_count == 0:
            return jsonify({
                'ready': False,
                'reason': 'No trucks configured'
            }), 503

        return jsonify({
            'ready': True,
            'timestamp': datetime.utcnow().isoformat()
        }), 200

    except Exception as e:
        logger.error(f"Readiness check failed: {str(e)}")
        return jsonify({
            'ready': False,
            'error': str(e)
        }), 503


@health_bp.route('/live', methods=['GET'])
def liveness_check():
    """Liveness check for orchestrators"""
    return jsonify({
        'alive': True,
        'timestamp': datetime.utcnow().isoformat()
    }), 200


__all__ = ['health_bp']
