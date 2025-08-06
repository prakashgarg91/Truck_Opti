from flask import request, jsonify, Blueprint, flash, render_template, redirect, url_for
from app.models import db, TruckType, CartonType, PackingJob, PackingResult, Shipment
import json
from app.packer import INDIAN_TRUCKS, INDIAN_CARTONS, pack_cartons
bp = Blueprint('main', __name__)
api = Blueprint('api', __name__)
@bp.route('/recommend-truck', methods=['GET', 'POST'])
def recommend_truck():
    cartons = CartonType.query.all()
    recommended = None
    if request.method == 'POST':
        carton_quantities = {}
        for carton in cartons:
            qty = int(request.form.get(f'carton_{carton.id}', 0))
            if qty > 0:
                carton_quantities[carton] = qty

        if not carton_quantities:
            flash('Please add at least one carton type.', 'warning')
            return redirect(url_for('main.recommend_truck'))

        # Use all available trucks with a large quantity to find the optimal fleet
        trucks = TruckType.query.all()
        truck_quantities = {truck: 100 for truck in trucks}  # Simulate a large fleet

        from . import packer
        results = packer.pack_cartons(truck_quantities, carton_quantities, 'cost') # Optimize for cost

        # Filter out unused trucks and format for display
        recommended = [r for r in results if r['fitted_items']]
        
    return render_template('recommend_truck.html', cartons=cartons, recommended=recommended)
@bp.route('/fit-cartons', methods=['GET', 'POST'])
def fit_cartons():
    trucks = TruckType.query.all()
    cartons = CartonType.query.all()
    fit_results = None
    if request.method == 'POST':
        truck_quantities = {}
        for truck in trucks:
            qty = int(request.form.get(f'truck_{truck.id}', 0))
            if qty > 0:
                truck_quantities[truck] = qty

        carton_quantities = {}
        i = 1
        while True:
            carton_type_id = request.form.get(f'carton_type_{i}')
            qty = request.form.get(f'carton_qty_{i}')
            if not carton_type_id or not qty:
                break
            carton_type = CartonType.query.get(int(carton_type_id))
            if carton_type and int(qty) > 0:
                carton_quantities[carton_type] = int(qty)
            i += 1

        from . import packer
        fit_results = packer.pack_cartons(truck_quantities, carton_quantities, 'space')

    return render_template('fit_cartons.html', trucks=trucks, cartons=cartons, fit_results=fit_results)


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
        optimization_goal = request.form.get('optimization_goal', 'space')

        truck_quantities = {}
        trucks = TruckType.query.all()
        for truck in trucks:
            qty = int(request.form.get(f'truck_{truck.id}', 0))
            if qty > 0:
                truck_quantities[truck] = qty

        carton_quantities = {}
        i = 1
        while True:
            carton_type_id = request.form.get(f'carton_type_{i}')
            qty = request.form.get(f'quantity_{i}')
            if not carton_type_id or not qty:
                break
            carton_type = CartonType.query.get(int(carton_type_id))
            if carton_type and int(qty) > 0:
                carton_quantities[carton_type] = int(qty)
            i += 1
        
        if not truck_quantities:
            flash('Please select at least one truck.', 'warning')
            return redirect(url_for('main.add_packing_job'))
        
        if not carton_quantities:
            flash('Please add at least one carton type.', 'warning')
            return redirect(url_for('main.add_packing_job'))

        new_job = PackingJob(name=job_name, status='in_progress', optimization_goal=optimization_goal)
        db.session.add(new_job)
        db.session.commit()

        from . import packer
        results = packer.pack_cartons(truck_quantities, carton_quantities, optimization_goal)

        total_trucks_used = len([r for r in results if r['fitted_items']])
        total_utilization = sum(r['utilization'] for r in results)
        avg_utilization = total_utilization / total_trucks_used if total_trucks_used > 0 else 0
        total_cost = sum(r['total_cost'] for r in results)

        new_job.status = 'completed'
        new_job.packing_result = PackingResult(
            job_id=new_job.id,
            truck_count=total_trucks_used,
            space_utilization=avg_utilization,
            weight_utilization=avg_utilization, # Assuming space and weight utilization are the same for now
            total_cost=total_cost,
            result_data=results
        )
        db.session.commit()

        flash('Packing job created and completed successfully!', 'success')
        return redirect(url_for('main.packing_result', job_id=new_job.id))

    truck_types = TruckType.query.all()
    carton_types = CartonType.query.all()
    return render_template('add_packing_job.html', truck_types=truck_types, carton_types=carton_types)

@bp.route('/calculate-truck-requirements', methods=['GET', 'POST'])
def calculate_truck_requirements():
    cartons = CartonType.query.all()
    results = None
    if request.method == 'POST':
        carton_quantities = {}
        i = 1
        while True:
            carton_type_id = request.form.get(f'carton_type_{i}')
            qty = request.form.get(f'carton_qty_{i}')
            if not carton_type_id or not qty:
                break
            carton_type = CartonType.query.get(int(carton_type_id))
            if carton_type and int(qty) > 0:
                carton_quantities[carton_type] = int(qty)
            i += 1

        if not carton_quantities:
            flash('Please add at least one carton type.', 'warning')
            return redirect(url_for('main.calculate_truck_requirements'))

        # For truck requirement calculation, we assume an "infinite" supply of all truck types
        trucks = TruckType.query.all()
        truck_quantities = {truck: 100 for truck in trucks} # A large number to simulate infinite supply

        from . import packer
        results = packer.pack_cartons(truck_quantities, carton_quantities, 'min_trucks')

    return render_template('calculate_truck_requirements.html', cartons=cartons, results=results)

@bp.route('/fleet-optimization', methods=['GET', 'POST'])
def fleet_optimization():
    trucks = TruckType.query.all()
    cartons = CartonType.query.all()
    fit_results = None
    if request.method == 'POST':
        truck_quantities = {}
        for truck in trucks:
            qty = int(request.form.get(f'truck_{truck.id}', 0))
            if qty > 0:
                truck_quantities[truck] = qty

        carton_quantities = {}
        i = 1
        while True:
            carton_type_id = request.form.get(f'carton_type_{i}')
            qty = request.form.get(f'carton_qty_{i}')
            if not carton_type_id or not qty:
                break
            carton_type = CartonType.query.get(int(carton_type_id))
            if carton_type and int(qty) > 0:
                carton_quantities[carton_type] = int(qty)
            i += 1

        from . import packer
        fit_results = packer.pack_cartons(truck_quantities, carton_quantities, 'space')

    return render_template('fleet_optimization.html', trucks=trucks, cartons=cartons, fit_results=fit_results)

@bp.route('/batch-processing', methods=['GET', 'POST'])
def batch_processing():
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file part', 'warning')
            return redirect(request.url)
        file = request.files['file']
        if file.filename == '':
            flash('No selected file', 'warning')
            return redirect(request.url)
        if file and file.filename.endswith('.csv'):
            # Process the CSV file
            import csv
            import io
            stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_input = csv.reader(stream)
            carton_quantities = {}
            for row in csv_input:
                carton_name, qty = row
                carton_type = CartonType.query.filter_by(name=carton_name).first()
                if carton_type:
                    carton_quantities[carton_type] = int(qty)
            
            # For simplicity, using all trucks with a large quantity
            trucks = TruckType.query.all()
            truck_quantities = {truck: 100 for truck in trucks}

            new_job = PackingJob(name="Batch Job", status='in_progress', optimization_goal='cost')
            db.session.add(new_job)
            db.session.commit()

            from . import packer
            results = packer.pack_cartons(truck_quantities, carton_quantities, 'cost')

            total_trucks_used = len([r for r in results if r['fitted_items']])
            total_utilization = sum(r['utilization'] for r in results)
            avg_utilization = total_utilization / total_trucks_used if total_trucks_used > 0 else 0
            total_cost = sum(r['total_cost'] for r in results)

            new_job.status = 'completed'
            new_job.packing_result = PackingResult(
                job_id=new_job.id,
                truck_count=total_trucks_used,
                space_utilization=avg_utilization,
                weight_utilization=avg_utilization,
                total_cost=total_cost,
                result_data=results
            )
            db.session.commit()
            flash('Batch job processed successfully!', 'success')
            return redirect(url_for('main.packing_result', job_id=new_job.id))
        else:
            flash('Invalid file type. Please upload a CSV file.', 'warning')
            return redirect(request.url)

    return render_template('batch_processing.html')

@bp.route('/export-packing-result/<int:job_id>')
def export_packing_result(job_id):
    job = PackingJob.query.get_or_404(job_id)
    result = PackingResult.query.filter_by(job_id=job.id).first()
    if not result:
        flash('No result to export.', 'warning')
        return redirect(url_for('main.packing_jobs'))

    import csv
    import io
    from flask import Response

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(['Truck Name', 'Item Name', 'Position X', 'Position Y', 'Position Z', 'Rotation Type', 'Width', 'Height', 'Depth'])
    
    for bin_result in result.result_data:
        for item in bin_result['fitted_items']:
            writer.writerow([
                bin_result['bin_name'],
                item['name'],
                item['position'][0],
                item['position'][1],
                item['position'][2],
                item['rotation_type'],
                item['width'],
                item['height'],
                item['depth']
            ])

    output.seek(0)
    
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=packing_result_{job_id}.csv"}
    )

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
    return render_template('add_carton_type.html', carton=carton, edit_mode=True)

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
    return render_template('add_truck_type.html', truck=truck, edit_mode=True)

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


# --- Analytics UI Page ---
@bp.route('/analytics')
def analytics():
    return render_template('analytics.html')

@bp.route('/api/analytics', methods=['GET'])
def api_analytics():
    stats = {
        'total_trucks': TruckType.query.count(),
        'total_shipments': Shipment.query.count(),
        'avg_utilization': db.session.query(db.func.avg(PackingResult.space_utilization)).scalar() or 0,
        'total_cost': db.session.query(db.func.sum(PackingResult.total_cost)).scalar() or 0
    }
    return jsonify(stats)

@api.route('/calculate-truck-requirements', methods=['POST'])
def api_calculate_truck_requirements():
    data = request.get_json()
    carton_data = data.get('cartons', [])
    
    carton_quantities = {}
    for item in carton_data:
        carton_type = CartonType.query.get(item['id'])
        if carton_type:
            carton_quantities[carton_type] = item['quantity']

    if not carton_quantities:
        return jsonify({'error': 'No cartons provided'}), 400

    trucks = TruckType.query.all()
    truck_quantities = {truck: 100 for truck in trucks}

    from . import packer
    results = packer.pack_cartons(truck_quantities, carton_quantities, 'min_trucks')
    
    return jsonify(results)

@api.route('/fleet-optimization', methods=['POST'])
def api_fleet_optimization():
    data = request.get_json()
    truck_data = data.get('trucks', [])
    carton_data = data.get('cartons', [])

    truck_quantities = {}
    for item in truck_data:
        truck_type = TruckType.query.get(item['id'])
        if truck_type:
            truck_quantities[truck_type] = item['quantity']

    carton_quantities = {}
    for item in carton_data:
        carton_type = CartonType.query.get(item['id'])
        if carton_type:
            carton_quantities[carton_type] = item['quantity']

    if not truck_quantities or not carton_quantities:
        return jsonify({'error': 'Trucks and cartons must be provided'}), 400

    from . import packer
    results = packer.pack_cartons(truck_quantities, carton_quantities, 'space')

    return jsonify(results)