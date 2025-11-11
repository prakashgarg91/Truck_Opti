"""
Analytics API Endpoints
RESTful API for analytics and reporting
"""

from flask import Blueprint, request, jsonify
from app.models import db, PackingJob, PackingResult, TruckType, CartonType
from app.core.logging import get_logger
from sqlalchemy import func
from datetime import datetime, timedelta

logger = get_logger(__name__)

analytics_bp = Blueprint('analytics', __name__, url_prefix='/analytics')


@analytics_bp.route('/dashboard', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        # Total counts
        total_trucks = TruckType.query.count()
        total_cartons = CartonType.query.count()
        total_jobs = PackingJob.query.count()

        # Available trucks
        available_trucks = TruckType.query.filter_by(availability=True).count()

        # Average utilization
        avg_utilization = db.session.query(
            func.avg(PackingResult.space_utilization)
        ).filter(
            PackingResult.space_utilization.isnot(None)
        ).scalar() or 0.0

        # Recent jobs (last 7 days)
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_jobs = PackingJob.query.filter(
            PackingJob.created_at >= week_ago
        ).count()

        return jsonify({
            'success': True,
            'data': {
                'overview': {
                    'total_trucks': total_trucks,
                    'available_trucks': available_trucks,
                    'total_carton_types': total_cartons,
                    'total_packing_jobs': total_jobs,
                    'recent_jobs_7d': recent_jobs
                },
                'performance': {
                    'avg_space_utilization': round(float(avg_utilization), 2)
                }
            }
        }), 200

    except Exception as e:
        logger.error(f"Error getting dashboard stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get dashboard statistics',
            'message': str(e)
        }), 500


@analytics_bp.route('/utilization', methods=['GET'])
def get_utilization_stats():
    """Get space utilization statistics"""
    try:
        # Get utilization by truck type
        utilization_stats = db.session.query(
            TruckType.name,
            func.avg(PackingResult.space_utilization).label('avg_utilization'),
            func.count(PackingResult.id).label('total_jobs')
        ).join(
            PackingJob, PackingJob.truck_type_id == TruckType.id
        ).join(
            PackingResult, PackingResult.packing_job_id == PackingJob.id
        ).group_by(
            TruckType.name
        ).all()

        results = []
        for truck_name, avg_util, job_count in utilization_stats:
            results.append({
                'truck_name': truck_name,
                'avg_utilization': round(float(avg_util or 0), 2),
                'total_jobs': job_count
            })

        return jsonify({
            'success': True,
            'data': results
        }), 200

    except Exception as e:
        logger.error(f"Error getting utilization stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get utilization statistics',
            'message': str(e)
        }), 500


@analytics_bp.route('/trends', methods=['GET'])
def get_trends():
    """Get trends over time"""
    try:
        days = request.args.get('days', 30, type=int)
        start_date = datetime.utcnow() - timedelta(days=days)

        # Jobs per day
        daily_jobs = db.session.query(
            func.date(PackingJob.created_at).label('date'),
            func.count(PackingJob.id).label('job_count')
        ).filter(
            PackingJob.created_at >= start_date
        ).group_by(
            func.date(PackingJob.created_at)
        ).order_by('date').all()

        trends = []
        for date, count in daily_jobs:
            trends.append({
                'date': str(date),
                'job_count': count
            })

        return jsonify({
            'success': True,
            'data': {
                'period_days': days,
                'trends': trends
            }
        }), 200

    except Exception as e:
        logger.error(f"Error getting trends: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get trends',
            'message': str(e)
        }), 500


@analytics_bp.route('/truck-performance', methods=['GET'])
def get_truck_performance():
    """Get performance metrics for each truck type"""
    try:
        truck_stats = db.session.query(
            TruckType.id,
            TruckType.name,
            func.count(PackingJob.id).label('times_used'),
            func.avg(PackingResult.space_utilization).label('avg_utilization'),
            func.avg(PackingResult.total_cost).label('avg_cost')
        ).outerjoin(
            PackingJob, PackingJob.truck_type_id == TruckType.id
        ).outerjoin(
            PackingResult, PackingResult.packing_job_id == PackingJob.id
        ).group_by(
            TruckType.id, TruckType.name
        ).all()

        results = []
        for truck_id, name, times_used, avg_util, avg_cost in truck_stats:
            results.append({
                'truck_id': truck_id,
                'truck_name': name,
                'times_used': times_used or 0,
                'avg_utilization': round(float(avg_util or 0), 2),
                'avg_cost': round(float(avg_cost or 0), 2)
            })

        return jsonify({
            'success': True,
            'data': results
        }), 200

    except Exception as e:
        logger.error(f"Error getting truck performance: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get truck performance',
            'message': str(e)
        }), 500


__all__ = ['analytics_bp']
