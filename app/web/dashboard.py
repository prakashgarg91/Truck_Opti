"""
Dashboard Web Routes
Main dashboard UI
"""

from flask import Blueprint, render_template, jsonify
from app.models import db, TruckType, CartonType, PackingJob, PackingResult
from sqlalchemy import func
from datetime import datetime, timedelta

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/dashboard')


@dashboard_bp.route('')
@dashboard_bp.route('/')
def index():
    """Main dashboard page"""
    try:
        # Get summary stats
        total_trucks = TruckType.query.count()
        available_trucks = TruckType.query.filter_by(availability=True).count()
        total_cartons = CartonType.query.count()
        total_jobs = PackingJob.query.count()

        # Average utilization
        avg_utilization = db.session.query(
            func.avg(PackingResult.space_utilization)
        ).filter(
            PackingResult.space_utilization.isnot(None)
        ).scalar() or 0.0

        # Recent jobs
        recent_jobs = PackingJob.query.order_by(
            PackingJob.created_at.desc()
        ).limit(10).all()

        return render_template(
            'dashboard/index.html',
            total_trucks=total_trucks,
            available_trucks=available_trucks,
            total_cartons=total_cartons,
            total_jobs=total_jobs,
            avg_utilization=round(float(avg_utilization), 2),
            recent_jobs=recent_jobs
        )

    except Exception as e:
        return render_template('error.html', error=str(e)), 500


@dashboard_bp.route('/stats')
def get_stats():
    """Get dashboard statistics (AJAX endpoint)"""
    try:
        stats = {
            'trucks': {
                'total': TruckType.query.count(),
                'available': TruckType.query.filter_by(availability=True).count()
            },
            'cartons': {
                'total': CartonType.query.count()
            },
            'jobs': {
                'total': PackingJob.query.count(),
                'today': PackingJob.query.filter(
                    func.date(PackingJob.created_at) == datetime.utcnow().date()
                ).count()
            }
        }

        return jsonify({
            'success': True,
            'data': stats
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['dashboard_bp']
