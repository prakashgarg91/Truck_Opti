"""
Analytics UI Web Routes
UI for analytics and reporting
"""

from flask import Blueprint, render_template
from app.models import TruckType

analytics_ui_bp = Blueprint('analytics_ui', __name__, url_prefix='/analytics')


@analytics_ui_bp.route('')
@analytics_ui_bp.route('/')
def analytics_dashboard():
    """Analytics dashboard page"""
    try:
        trucks = TruckType.query.all()

        return render_template(
            'analytics/dashboard.html',
            trucks=trucks
        )

    except Exception as e:
        return render_template('error.html', error=str(e)), 500


@analytics_ui_bp.route('/utilization')
def utilization_report():
    """Utilization report page"""
    try:
        return render_template('analytics/utilization.html')

    except Exception as e:
        return render_template('error.html', error=str(e)), 500


@analytics_ui_bp.route('/trends')
def trends_report():
    """Trends report page"""
    try:
        return render_template('analytics/trends.html')

    except Exception as e:
        return render_template('error.html', error=str(e)), 500


__all__ = ['analytics_ui_bp']
