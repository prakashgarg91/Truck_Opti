"""
Optimization UI Web Routes
UI for truck optimization features
"""

from flask import Blueprint, render_template
from app.models import TruckType, CartonType

optimization_ui_bp = Blueprint('optimization_ui', __name__, url_prefix='/optimization')


@optimization_ui_bp.route('/recommend-truck')
def recommend_truck_page():
    """Truck recommendation page"""
    try:
        trucks = TruckType.query.filter_by(availability=True).all()
        cartons = CartonType.query.all()

        return render_template(
            'optimization/recommend_truck.html',
            trucks=trucks,
            cartons=cartons
        )

    except Exception as e:
        return render_template('error.html', error=str(e)), 500


@optimization_ui_bp.route('/fleet-optimization')
def fleet_optimization_page():
    """Fleet optimization page"""
    try:
        trucks = TruckType.query.filter_by(availability=True).all()
        cartons = CartonType.query.all()

        return render_template(
            'optimization/fleet_optimization.html',
            trucks=trucks,
            cartons=cartons
        )

    except Exception as e:
        return render_template('error.html', error=str(e)), 500


@optimization_ui_bp.route('/batch-processing')
def batch_processing_page():
    """Batch processing page"""
    try:
        return render_template('optimization/batch_processing.html')

    except Exception as e:
        return render_template('error.html', error=str(e)), 500


__all__ = ['optimization_ui_bp']
