"""
Truck Management Web Routes
UI for managing truck types
"""

from flask import Blueprint, render_template, request, redirect, url_for, flash
from app.models import db, TruckType

truck_mgmt_bp = Blueprint('truck_management', __name__, url_prefix='/trucks')


@truck_mgmt_bp.route('')
@truck_mgmt_bp.route('/')
def list_trucks():
    """List all trucks page"""
    try:
        trucks = TruckType.query.order_by(TruckType.name).all()
        return render_template('trucks/list.html', trucks=trucks)

    except Exception as e:
        flash(f'Error loading trucks: {str(e)}', 'error')
        return redirect(url_for('web.dashboard.index'))


@truck_mgmt_bp.route('/add', methods=['GET', 'POST'])
def add_truck():
    """Add new truck page"""
    if request.method == 'GET':
        return render_template('trucks/add.html')

    try:
        # Create truck from form data
        truck = TruckType(
            name=request.form['name'],
            length=float(request.form['length']),
            width=float(request.form['width']),
            height=float(request.form['height']),
            max_weight=float(request.form.get('max_weight', 0)),
            cost_per_km=float(request.form.get('cost_per_km', 0)),
            fuel_efficiency=float(request.form.get('fuel_efficiency', 0)),
            driver_cost_per_day=float(request.form.get('driver_cost_per_day', 0)),
            maintenance_cost_per_km=float(request.form.get('maintenance_cost_per_km', 0)),
            truck_category=request.form.get('truck_category', 'Standard'),
            availability=request.form.get('availability', 'true').lower() == 'true',
            description=request.form.get('description', '')
        )

        db.session.add(truck)
        db.session.commit()

        flash(f'Truck {truck.name} added successfully!', 'success')
        return redirect(url_for('web.truck_management.list_trucks'))

    except Exception as e:
        db.session.rollback()
        flash(f'Error adding truck: {str(e)}', 'error')
        return render_template('trucks/add.html')


@truck_mgmt_bp.route('/edit/<int:truck_id>', methods=['GET', 'POST'])
def edit_truck(truck_id):
    """Edit truck page"""
    truck = TruckType.query.get_or_404(truck_id)

    if request.method == 'GET':
        return render_template('trucks/edit.html', truck=truck)

    try:
        # Update truck from form data
        truck.name = request.form['name']
        truck.length = float(request.form['length'])
        truck.width = float(request.form['width'])
        truck.height = float(request.form['height'])
        truck.max_weight = float(request.form.get('max_weight', 0))
        truck.cost_per_km = float(request.form.get('cost_per_km', 0))
        truck.fuel_efficiency = float(request.form.get('fuel_efficiency', 0))
        truck.driver_cost_per_day = float(request.form.get('driver_cost_per_day', 0))
        truck.maintenance_cost_per_km = float(request.form.get('maintenance_cost_per_km', 0))
        truck.truck_category = request.form.get('truck_category', 'Standard')
        truck.availability = request.form.get('availability', 'true').lower() == 'true'
        truck.description = request.form.get('description', '')

        db.session.commit()

        flash(f'Truck {truck.name} updated successfully!', 'success')
        return redirect(url_for('web.truck_management.list_trucks'))

    except Exception as e:
        db.session.rollback()
        flash(f'Error updating truck: {str(e)}', 'error')
        return render_template('trucks/edit.html', truck=truck)


@truck_mgmt_bp.route('/delete/<int:truck_id>', methods=['POST'])
def delete_truck(truck_id):
    """Delete truck"""
    try:
        truck = TruckType.query.get_or_404(truck_id)
        truck_name = truck.name

        db.session.delete(truck)
        db.session.commit()

        flash(f'Truck {truck_name} deleted successfully!', 'success')

    except Exception as e:
        db.session.rollback()
        flash(f'Error deleting truck: {str(e)}', 'error')

    return redirect(url_for('web.truck_management.list_trucks'))


__all__ = ['truck_mgmt_bp']
