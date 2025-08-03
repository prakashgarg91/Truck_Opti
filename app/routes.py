from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from .models import TruckType, CartonType, PackingJob, PackingResult, Shipment, db

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    # Placeholder stats and chart data
    stats = {
        'total_trucks': TruckType.query.count(),
        'total_shipments': Shipment.query.count(),
        'avg_utilization': db.session.query(db.func.avg(PackingResult.space_utilization)).scalar() or 0,
        'total_cost': db.session.query(db.func.sum(PackingResult.total_cost)).scalar() or 0,
        'avg_delivery_time': 0,
        'avg_weight_utilization': db.session.query(db.func.avg(PackingResult.weight_utilization)).scalar() or 0
    }
    
    charts = {
        'shipments': {
            'labels': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            'data': [12, 19, 3, 5, 2, 3]  # Example data, replace with real stats
        },
        'trucks': {
            'labels': ['Light', 'Medium', 'Heavy'],
            'data': [
                TruckType.query.filter_by(truck_category='Light').count(),
                TruckType.query.filter_by(truck_category='Medium').count(),
                TruckType.query.filter_by(truck_category='Heavy').count()
            ]
        }
    }
    
    return render_template('index.html', stats=stats, charts=charts)

@bp.route('/truck-types')
def truck_types():
    trucks = TruckType.query.all()
    return render_template('truck_types.html', trucks=trucks)

@bp.route('/add-truck-type', methods=['GET', 'POST'])
def add_truck_type():
    if request.method == 'POST':
        name = request.form['name']
        length = request.form['length']
        width = request.form['width']
        height = request.form['height']
        max_weight = request.form['max_weight'] or None
        
        new_truck = TruckType(name=name, length=length, width=width, height=height, max_weight=max_weight)
        db.session.add(new_truck)
        db.session.commit()
        flash('Truck type added successfully!', 'success')
        return redirect(url_for('main.truck_types'))
    return render_template('add_truck_type.html')

@bp.route('/carton-types')
def carton_types():
    cartons = CartonType.query.all()
    return render_template('carton_types.html', cartons=cartons)

@bp.route('/add-carton-type', methods=['GET', 'POST'])
def add_carton_type():
    if request.method == 'POST':
        name = request.form['name']
        length = request.form['length']
        width = request.form['width']
        height = request.form['height']
        weight = request.form['weight'] or None
        can_rotate = 'can_rotate' in request.form
        
        new_carton = CartonType(name=name, length=length, width=width, height=height, weight=weight, can_rotate=can_rotate)
        db.session.add(new_carton)
        db.session.commit()
        flash('Carton type added successfully!', 'success')
        return redirect(url_for('main.carton_types'))
    return render_template('add_carton_type.html')

@bp.route('/packing-jobs')
def packing_jobs():
    jobs = PackingJob.query.all()
    return render_template('packing_jobs.html', jobs=jobs)

@bp.route('/add-packing-job', methods=['GET', 'POST'])
def add_packing_job():
    if request.method == 'POST':
        job_name = request.form['name']
        truck_type_id = request.form['truck_type']
        
        # Create a new packing job
        new_job = PackingJob(name=job_name, truck_type_id=truck_type_id, status='in_progress')
        db.session.add(new_job)
        db.session.commit()

        # Get carton types and quantities from the form
        carton_types_with_quantities = {}
        i = 1
        while f'carton_type_{i}' in request.form:
            carton_type_id = request.form[f'carton_type_{i}']
            quantity = int(request.form[f'quantity_{i}'])
            carton_type = CartonType.query.get(carton_type_id)
            if carton_type:
                carton_types_with_quantities[carton_type] = quantity
            i += 1

        # Check if any cartons were provided
        if not carton_types_with_quantities:
            new_job.status = 'failed'
            # Create a PackingResult record even for failed jobs
            new_job.packing_result = PackingResult(
                job_id=new_job.id,
                truck_count=0,
                space_utilization=0.0,
                weight_utilization=0.0,
                total_cost=0.0,
                estimated_fuel_cost=0.0,
                estimated_delivery_time=0.0,
                co2_emissions=0.0,
                result_data=[],
                optimization_score=0.0
            )
            db.session.commit()
            flash('Packing job failed - no cartons were specified!', 'warning')
            return redirect(url_for('main.packing_jobs'))
            
        # Run the packing algorithm
        from . import packer
        truck_type = TruckType.query.get(truck_type_id)
        results = packer.pack_cartons(truck_type, carton_types_with_quantities)

        # Save the results
        new_job.status = 'completed'
        new_job.packing_result = PackingResult(
            job_id=new_job.id,
            truck_count=len(results),
            space_utilization=results[0]['utilization'] if results else 0,
            result_data=results
        )
        db.session.commit()

        flash('Packing job created and completed successfully!', 'success')
        return redirect(url_for('main.packing_jobs'))

    truck_types = TruckType.query.all()
    carton_types = CartonType.query.all()
    return render_template('add_packing_job.html', truck_types=truck_types, carton_types=carton_types)

@bp.route('/packing-job/<int:job_id>')
def packing_result(job_id):
    job = PackingJob.query.get_or_404(job_id)
    result = PackingResult.query.filter_by(job_id=job.id).first()
    if result is None:
        flash('No result found for this packing job.', 'warning')
        return redirect(url_for('main.packing_jobs'))
    return render_template('packing_result.html', job=job, result=result)

@bp.route('/edit-carton-type/<int:carton_id>', methods=['GET', 'POST'])
def edit_carton_type(carton_id):
    carton = CartonType.query.get_or_404(carton_id)
    if request.method == 'POST':
        carton.name = request.form['name']
        carton.length = request.form['length']
        carton.width = request.form['width']
        carton.height = request.form['height']
        carton.weight = request.form['weight'] or None
        carton.can_rotate = 'can_rotate' in request.form
        db.session.commit()
        flash('Carton type updated successfully!', 'success')
        return redirect(url_for('main.carton_types'))
    return render_template('add_carton_type.html', carton=carton)

@bp.route('/delete-carton-type/<int:carton_id>', methods=['POST'])
def delete_carton_type(carton_id):
    carton = CartonType.query.get_or_404(carton_id)
    db.session.delete(carton)
    db.session.commit()
    flash('Carton type deleted successfully!', 'success')
    return redirect(url_for('main.carton_types'))
@bp.route('/edit-truck-type/<int:truck_id>', methods=['GET', 'POST'])
def edit_truck_type(truck_id):
    truck = TruckType.query.get_or_404(truck_id)
    if request.method == 'POST':
        truck.name = request.form['name']
        truck.length = request.form['length']
        truck.width = request.form['width']
        truck.height = request.form['height']
        truck.max_weight = request.form['max_weight'] or None
        db.session.commit()
        flash('Truck type updated successfully!', 'success')
        return redirect(url_for('main.truck_types'))
    return render_template('add_truck_type.html', truck=truck)

@bp.route('/delete-truck-type/<int:truck_id>', methods=['POST'])
def delete_truck_type(truck_id):
    truck = TruckType.query.get_or_404(truck_id)
    db.session.delete(truck)
    db.session.commit()
    flash('Truck type deleted successfully!', 'success')
    return redirect(url_for('main.truck_types'))
@bp.route('/delete-packing-job/<int:job_id>', methods=['POST'])
def delete_packing_job(job_id):
    job = PackingJob.query.get_or_404(job_id)
    db.session.delete(job)
    db.session.commit()
    flash('Packing job deleted successfully!', 'success')
    return redirect(url_for('main.packing_jobs'))

# --- RESTful TruckType API ---
@bp.route('/api/truck-types', methods=['GET'])
def api_truck_types():
    trucks = TruckType.query.all()
    return jsonify([{
        'id': t.id,
        'name': t.name,
        'length': t.length,
        'width': t.width,
        'height': t.height,
        'max_weight': t.max_weight,
        'cost_per_km': t.cost_per_km,
        'fuel_efficiency': t.fuel_efficiency,
        'driver_cost_per_day': t.driver_cost_per_day,
        'maintenance_cost_per_km': t.maintenance_cost_per_km,
        'truck_category': t.truck_category,
        'availability': t.availability,
        'description': t.description
    } for t in trucks])

@bp.route('/api/truck-types', methods=['POST'])
def api_add_truck_type():
    data = request.get_json()
    truck = TruckType(
        name=data.get('name'),
        length=data.get('length'),
        width=data.get('width'),
        height=data.get('height'),
        max_weight=data.get('max_weight'),
        cost_per_km=data.get('cost_per_km', 0.0),
        fuel_efficiency=data.get('fuel_efficiency', 0.0),
        driver_cost_per_day=data.get('driver_cost_per_day', 0.0),
        maintenance_cost_per_km=data.get('maintenance_cost_per_km', 0.0),
        truck_category=data.get('truck_category', 'Standard'),
        availability=data.get('availability', True),
        description=data.get('description', '')
    )
    db.session.add(truck)
    db.session.commit()
    return jsonify({'message': 'Truck type added', 'id': truck.id}), 201

# --- RESTful CartonType API ---
@bp.route('/api/carton-types', methods=['GET'])
def api_carton_types():
    cartons = CartonType.query.all()
    return jsonify([{
        'id': c.id,
        'name': c.name,
        'length': c.length,
        'width': c.width,
        'height': c.height,
        'weight': c.weight,
        'can_rotate': c.can_rotate,
        'fragile': c.fragile,
        'stackable': c.stackable,
        'max_stack_height': c.max_stack_height,
        'priority': c.priority,
        'value': c.value,
        'category': c.category,
        'description': c.description
    } for c in cartons])

@bp.route('/api/carton-types', methods=['POST'])
def api_add_carton_type():
    data = request.get_json()
    carton = CartonType(
        name=data.get('name'),
        length=data.get('length'),
        width=data.get('width'),
        height=data.get('height'),
        weight=data.get('weight'),
        can_rotate=data.get('can_rotate', True),
        fragile=data.get('fragile', False),
        stackable=data.get('stackable', True),
        max_stack_height=data.get('max_stack_height', 5),
        priority=data.get('priority', 1),
        value=data.get('value', 0.0),
        category=data.get('category', 'General'),
        description=data.get('description', '')
    )
    db.session.add(carton)
    db.session.commit()
    return jsonify({'message': 'Carton type added', 'id': carton.id}), 201

@bp.route('/api/packing_jobs', methods=['GET'])
def api_packing_jobs():
    jobs = PackingJob.query.all()
    return jsonify([{
        'id': j.id,
        'name': j.name,
        'truck_type_id': j.truck_type_id,
        'status': j.status,
        'date_created': j.date_created.isoformat()
    } for j in jobs])

@bp.route('/api/analytics', methods=['GET'])
def api_analytics():
    stats = {
        'total_trucks': TruckType.query.count(),
        'total_shipments': Shipment.query.count(),
        'avg_utilization': db.session.query(db.func.avg(PackingResult.space_utilization)).scalar() or 0,
        'total_cost': db.session.query(db.func.sum(PackingResult.total_cost)).scalar() or 0
    }
    return jsonify(stats)