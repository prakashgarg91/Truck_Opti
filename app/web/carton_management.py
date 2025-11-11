"""
Carton Management Web Routes
UI for managing carton types
"""

from flask import Blueprint, render_template, request, redirect, url_for, flash
from app.models import db, CartonType

carton_mgmt_bp = Blueprint('carton_management', __name__, url_prefix='/cartons')


@carton_mgmt_bp.route('')
@carton_mgmt_bp.route('/')
def list_cartons():
    """List all cartons page"""
    try:
        cartons = CartonType.query.order_by(CartonType.name).all()
        return render_template('cartons/list.html', cartons=cartons)

    except Exception as e:
        flash(f'Error loading cartons: {str(e)}', 'error')
        return redirect(url_for('web.dashboard.index'))


@carton_mgmt_bp.route('/add', methods=['GET', 'POST'])
def add_carton():
    """Add new carton page"""
    if request.method == 'GET':
        return render_template('cartons/add.html')

    try:
        # Create carton from form data
        carton = CartonType(
            name=request.form['name'],
            length=float(request.form['length']),
            width=float(request.form['width']),
            height=float(request.form['height']),
            weight=float(request.form['weight']),
            fragile=request.form.get('fragile', 'false').lower() == 'true',
            stackable=request.form.get('stackable', 'true').lower() == 'true',
            priority=int(request.form.get('priority', 1)),
            description=request.form.get('description', '')
        )

        db.session.add(carton)
        db.session.commit()

        flash(f'Carton {carton.name} added successfully!', 'success')
        return redirect(url_for('web.carton_management.list_cartons'))

    except Exception as e:
        db.session.rollback()
        flash(f'Error adding carton: {str(e)}', 'error')
        return render_template('cartons/add.html')


@carton_mgmt_bp.route('/edit/<int:carton_id>', methods=['GET', 'POST'])
def edit_carton(carton_id):
    """Edit carton page"""
    carton = CartonType.query.get_or_404(carton_id)

    if request.method == 'GET':
        return render_template('cartons/edit.html', carton=carton)

    try:
        # Update carton from form data
        carton.name = request.form['name']
        carton.length = float(request.form['length'])
        carton.width = float(request.form['width'])
        carton.height = float(request.form['height'])
        carton.weight = float(request.form['weight'])
        carton.fragile = request.form.get('fragile', 'false').lower() == 'true'
        carton.stackable = request.form.get('stackable', 'true').lower() == 'true'
        carton.priority = int(request.form.get('priority', 1))
        carton.description = request.form.get('description', '')

        db.session.commit()

        flash(f'Carton {carton.name} updated successfully!', 'success')
        return redirect(url_for('web.carton_management.list_cartons'))

    except Exception as e:
        db.session.rollback()
        flash(f'Error updating carton: {str(e)}', 'error')
        return render_template('cartons/edit.html', carton=carton)


@carton_mgmt_bp.route('/delete/<int:carton_id>', methods=['POST'])
def delete_carton(carton_id):
    """Delete carton"""
    try:
        carton = CartonType.query.get_or_404(carton_id)
        carton_name = carton.name

        db.session.delete(carton)
        db.session.commit()

        flash(f'Carton {carton_name} deleted successfully!', 'success')

    except Exception as e:
        db.session.rollback()
        flash(f'Error deleting carton: {str(e)}', 'error')

    return redirect(url_for('web.carton_management.list_cartons'))


__all__ = ['carton_mgmt_bp']
