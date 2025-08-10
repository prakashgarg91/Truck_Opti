from flask import request, jsonify, Blueprint, flash, render_template, redirect, url_for
from app.models import db, TruckType, CartonType, PackingJob, PackingResult, Shipment, SaleOrder, SaleOrderItem, SaleOrderBatch, TruckRecommendation
import json
import time
from decimal import Decimal
from datetime import datetime
from app.packer import INDIAN_TRUCKS, INDIAN_CARTONS, pack_cartons, pack_cartons_optimized, calculate_optimal_truck_combination
from app.cost_engine import cost_engine

def convert_decimals_to_floats(obj):
    """Recursively convert Decimal objects to float for JSON serialization"""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {key: convert_decimals_to_floats(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals_to_floats(item) for item in obj]
    else:
        return obj
bp = Blueprint('main', __name__)
api = Blueprint('api', __name__)
@bp.route('/recommend-truck', methods=['GET', 'POST'])
def recommend_truck():
    cartons = CartonType.query.all()
    recommended = None
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
            return redirect(url_for('main.recommend_truck'))

        # Use improved recommendation algorithm
        trucks = TruckType.query.all()
        
        from . import packer
        # Use the improved recommendation algorithm instead of simple packing
        recommendations = packer.calculate_optimal_truck_combination(
            carton_quantities, trucks, max_trucks=5
        )
        
        # Convert recommendations to the expected format for display
        results = []
        for rec in recommendations:
            # Find the truck type
            truck_type = next((t for t in trucks if t.name == rec['truck_type']), None)
            if truck_type:
                truck_combo = {truck_type: rec['quantity']}
                pack_result = packer.pack_cartons_optimized(truck_combo, carton_quantities, 'cost')
                if pack_result:
                    results.extend(pack_result)
        
        # Get cost analysis for each result
        route_info = {'distance_km': 100, 'route_type': 'highway'}
        for result in results:
            truck_type = next((t for t in trucks if t.name in result['bin_name']), None)
            if truck_type:
                cost_breakdown = cost_engine.calculate_comprehensive_cost(truck_type, route_info)
                result['detailed_cost'] = cost_breakdown

        # Filter out unused trucks and format for display
        recommended = [r for r in results if r['fitted_items']]
        
    return render_template('recommend_truck.html', cartons=cartons, recommended=recommended)
# Redirect deprecated route to fleet optimization
@bp.route('/fit-cartons', methods=['GET', 'POST'])
def fit_cartons():
    """Deprecated: Redirect to fleet packing optimization"""
    return redirect(url_for('main.fleet_optimization'))


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
        
        # Convert all Decimal objects to floats for JSON serialization
        results = convert_decimals_to_floats(results)

        total_trucks_used = len([r for r in results if r['fitted_items']])
        total_utilization = sum(r['utilization'] for r in results)
        avg_utilization = float(total_utilization / total_trucks_used) if total_trucks_used > 0 else 0.0
        total_cost = float(sum(r['total_cost'] for r in results))

        new_job.status = 'completed'
        packing_result = PackingResult(
            job_id=new_job.id,
            truck_count=total_trucks_used,
            space_utilization=avg_utilization,
            weight_utilization=avg_utilization, # Assuming space and weight utilization are the same for now
            total_cost=total_cost,
            result_data=results
        )
        db.session.add(packing_result)
        db.session.commit()

        flash('Packing job created and completed successfully!', 'success')
        return redirect(url_for('main.packing_result', job_id=new_job.id))

    truck_types = TruckType.query.all()
    carton_types = CartonType.query.all()
    return render_template('add_packing_job.html', truck_types=truck_types, carton_types=carton_types)

# Redirect deprecated route to main recommendation system
@bp.route('/calculate-truck-requirements', methods=['GET', 'POST'])
def calculate_truck_requirements():
    """Deprecated: Redirect to smart truck recommendations"""
    return redirect(url_for('main.recommend_truck'))

@bp.route('/fleet-optimization', methods=['GET', 'POST'])
def fleet_optimization():
    trucks = TruckType.query.all()
    cartons = CartonType.query.all()
    fit_results = None
    additional_recommendations = None
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
        
        # Check for remaining items and recommend additional trucks
        if fit_results:
            total_unfitted = []
            for result in fit_results:
                total_unfitted.extend(result.get('unfitted_items', []))
            
            if total_unfitted:
                # Create carton quantities for unfitted items
                unfitted_quantities = {}
                for item in total_unfitted:
                    carton_name = item['name'].rsplit('_', 1)[0]  # Remove the _0, _1 suffix
                    carton_type = CartonType.query.filter_by(name=carton_name).first()
                    if carton_type:
                        unfitted_quantities[carton_type] = unfitted_quantities.get(carton_type, 0) + 1
                
                if unfitted_quantities:
                    # Get recommendations for remaining items
                    all_trucks = TruckType.query.all()
                    additional_recommendations = packer.calculate_optimal_truck_combination(
                        unfitted_quantities, all_trucks, max_trucks=3
                    )

    return render_template('fleet_optimization.html', 
                         trucks=trucks, 
                         cartons=cartons, 
                         fit_results=fit_results,
                         additional_recommendations=additional_recommendations)

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
            
            # Convert all Decimal objects to floats for JSON serialization
            results = convert_decimals_to_floats(results)

            total_trucks_used = len([r for r in results if r['fitted_items']])
            total_utilization = sum(r['utilization'] for r in results)
            avg_utilization = float(total_utilization / total_trucks_used) if total_trucks_used > 0 else 0.0
            total_cost = float(sum(r['total_cost'] for r in results))

            new_job.status = 'completed'
            packing_result = PackingResult(
                job_id=new_job.id,
                truck_count=total_trucks_used,
                space_utilization=avg_utilization,
                weight_utilization=avg_utilization,
                total_cost=total_cost,
                result_data=results
            )
            db.session.add(packing_result)
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

# --- Enhanced Cost Calculation APIs ---
@api.route('/cost-analysis', methods=['POST'])
def api_cost_analysis():
    """API endpoint for comprehensive cost analysis"""
    data = request.get_json()
    truck_ids = data.get('truck_ids', [])
    route_info = data.get('route_info', {'distance_km': 100, 'route_type': 'highway'})
    
    if not truck_ids:
        return jsonify({'error': 'No trucks provided for analysis'}), 400
    
    trucks = TruckType.query.filter(TruckType.id.in_(truck_ids)).all()
    
    cost_optimization = cost_engine.optimize_cost_strategy(trucks, route_info)
    
    return jsonify({
        'analysis': cost_optimization,
        'fuel_prices': cost_engine.get_fuel_prices().__dict__,
        'route_info': route_info
    })

@api.route('/fleet-cost-optimization', methods=['POST'])
def api_fleet_cost_optimization():
    """Advanced fleet cost optimization with multiple objectives"""
    data = request.get_json()
    truck_data = data.get('trucks', [])
    carton_data = data.get('cartons', [])
    route_info = data.get('route_info', {'distance_km': 100, 'route_type': 'highway'})
    optimization_goals = data.get('optimization_goals', ['cost', 'space'])
    
    # Process truck quantities
    truck_quantities = {}
    fleet_allocation = []
    for item in truck_data:
        truck_type = TruckType.query.get(item['id'])
        if truck_type:
            quantity = item.get('quantity', 1)
            truck_quantities[truck_type] = quantity
            fleet_allocation.append({'truck_type': truck_type, 'quantity': quantity})
    
    # Process carton quantities
    carton_quantities = {}
    for item in carton_data:
        carton_type = CartonType.query.get(item['id'])
        if carton_type:
            carton_quantities[carton_type] = item.get('quantity', 1)
    
    if not truck_quantities or not carton_quantities:
        return jsonify({'error': 'Both trucks and cartons must be provided'}), 400
    
    # Get optimized packing results
    from app.packer import optimize_fleet_distribution
    optimization_results = optimize_fleet_distribution(
        carton_quantities, truck_quantities, optimization_goals
    )
    
    # Calculate comprehensive fleet costs
    fleet_costs = cost_engine.calculate_multi_truck_fleet_cost(fleet_allocation, route_info)
    
    return jsonify({
        'optimization_results': optimization_results,
        'fleet_costs': fleet_costs,
        'recommendations': {
            'best_strategy': optimization_results['recommended_strategy'],
            'cost_savings_potential': fleet_costs['total_costs']['total_cost'] * 0.15,  # Estimated 15% savings
            'efficiency_improvements': optimization_results['results']
        }
    })

@api.route('/truck-recommendation-ai', methods=['POST'])
def api_truck_recommendation_ai():
    """AI-powered truck recommendation based on carton requirements"""
    from datetime import datetime
    data = request.get_json()
    carton_data = data.get('cartons', [])
    max_trucks = data.get('max_trucks', 10)
    
    # Process carton quantities
    carton_quantities = {}
    for item in carton_data:
        carton_type = CartonType.query.get(item['id'])
        if carton_type:
            carton_quantities[carton_type] = item.get('quantity', 1)
    
    if not carton_quantities:
        return jsonify({'error': 'No cartons provided'}), 400
    
    # Get all available truck types
    available_trucks = TruckType.query.filter_by(availability=True).all()
    
    # Use AI-powered recommendation
    from app.packer import calculate_optimal_truck_combination
    recommendations = calculate_optimal_truck_combination(
        carton_quantities, available_trucks, max_trucks
    )
    
    return jsonify({
        'recommendations': recommendations,
        'total_cartons': sum(carton_quantities.values()),
        'analysis_timestamp': datetime.now().isoformat()
    })

@api.route('/fuel-prices', methods=['GET'])
def api_get_fuel_prices():
    """Get current fuel prices"""
    location = request.args.get('location', 'India')
    
    fuel_prices = cost_engine.get_fuel_prices(location)
    
    return jsonify({
        'prices': fuel_prices.__dict__,
        'location': location,
        'last_updated': fuel_prices.last_updated.isoformat() if fuel_prices.last_updated else None
    })

@api.route('/performance-metrics', methods=['GET'])
def api_performance_metrics():
    """Get system performance metrics"""
    from app.packer import estimate_packing_time
    
    # Get sample metrics
    total_trucks = TruckType.query.count()
    total_cartons = CartonType.query.count()
    
    estimated_time = estimate_packing_time(1000, 10)  # For 1000 cartons and 10 trucks
    
    return jsonify({
        'system_stats': {
            'total_truck_types': total_trucks,
            'total_carton_types': total_cartons,
            'estimated_packing_time_1000_cartons': f"{estimated_time:.2f} seconds"
        },
        'performance_tips': [
            "Use optimized algorithms for datasets > 500 cartons",
            "Enable parallel processing for better performance",
            "Cache frequently used truck combinations",
            "Consider batch processing for large operations"
        ]
    })

# --- Complete RESTful API Extensions ---
@api.route('/truck-types/<int:truck_id>', methods=['GET'])
def api_get_truck_type(truck_id):
    """Get specific truck type by ID"""
    truck = TruckType.query.get_or_404(truck_id)
    return jsonify(truck.as_dict())

@api.route('/truck-types/<int:truck_id>', methods=['PUT'])
def api_update_truck_type(truck_id):
    """Update existing truck type"""
    truck = TruckType.query.get_or_404(truck_id)
    data = request.get_json()
    
    # Update truck attributes
    for key, value in data.items():
        if hasattr(truck, key) and key != 'id':
            setattr(truck, key, value)
    
    db.session.commit()
    return jsonify({
        'message': 'Truck type updated successfully',
        'truck': truck.as_dict()
    })

@api.route('/truck-types/<int:truck_id>', methods=['DELETE'])
def api_delete_truck_type(truck_id):
    """Delete truck type"""
    truck = TruckType.query.get_or_404(truck_id)
    truck_name = truck.name
    
    db.session.delete(truck)
    db.session.commit()
    
    return jsonify({
        'message': f'Truck type "{truck_name}" deleted successfully'
    })

@api.route('/carton-types/<int:carton_id>', methods=['GET'])
def api_get_carton_type(carton_id):
    """Get specific carton type by ID"""
    carton = CartonType.query.get_or_404(carton_id)
    return jsonify(carton.as_dict())

@api.route('/carton-types/<int:carton_id>', methods=['PUT'])
def api_update_carton_type(carton_id):
    """Update existing carton type"""
    carton = CartonType.query.get_or_404(carton_id)
    data = request.get_json()
    
    # Update carton attributes
    for key, value in data.items():
        if hasattr(carton, key) and key != 'id':
            setattr(carton, key, value)
    
    db.session.commit()
    return jsonify({
        'message': 'Carton type updated successfully',
        'carton': carton.as_dict()
    })

@api.route('/carton-types/<int:carton_id>', methods=['DELETE'])
def api_delete_carton_type(carton_id):
    """Delete carton type"""
    carton = CartonType.query.get_or_404(carton_id)
    carton_name = carton.name
    
    db.session.delete(carton)
    db.session.commit()
    
    return jsonify({
        'message': f'Carton type "{carton_name}" deleted successfully'
    })

# Packing Jobs API
@api.route('/packing-jobs', methods=['POST'])
def api_create_packing_job():
    """Create new packing job"""
    data = request.get_json()
    
    job = PackingJob(
        name=data.get('name', f'Job_{int(time.time())}'),
        truck_type_id=data.get('truck_type_id'),
        shipment_id=data.get('shipment_id'),
        optimization_goal=data.get('optimization_goal', 'space')
    )
    
    db.session.add(job)
    db.session.commit()
    
    return jsonify({
        'message': 'Packing job created successfully',
        'job_id': job.id,
        'job': {
            'id': job.id,
            'name': job.name,
            'status': job.status,
            'optimization_goal': job.optimization_goal,
            'date_created': job.date_created.isoformat()
        }
    }), 201

@api.route('/packing-jobs/<int:job_id>', methods=['GET'])
def api_get_packing_job(job_id):
    """Get specific packing job with results"""
    job = PackingJob.query.get_or_404(job_id)
    results = PackingResult.query.filter_by(job_id=job.id).all()
    
    return jsonify({
        'job': {
            'id': job.id,
            'name': job.name,
            'status': job.status,
            'optimization_goal': job.optimization_goal,
            'date_created': job.date_created.isoformat(),
            'truck_type_id': job.truck_type_id,
            'shipment_id': job.shipment_id
        },
        'results': [
            {
                'id': result.id,
                'truck_count': result.truck_count,
                'space_utilization': result.space_utilization,
                'weight_utilization': result.weight_utilization,
                'total_cost': result.total_cost,
                'result_data': result.result_data,
                'date_calculated': result.date_calculated.isoformat()
            }
            for result in results
        ]
    })

@api.route('/packing-jobs/<int:job_id>', methods=['PUT'])
def api_update_packing_job(job_id):
    """Update packing job"""
    job = PackingJob.query.get_or_404(job_id)
    data = request.get_json()
    
    # Update job attributes
    for key, value in data.items():
        if hasattr(job, key) and key not in ['id', 'date_created']:
            setattr(job, key, value)
    
    db.session.commit()
    return jsonify({
        'message': 'Packing job updated successfully',
        'job_id': job.id
    })

@api.route('/packing-jobs/<int:job_id>', methods=['DELETE'])
def api_delete_packing_job(job_id):
    """Delete packing job and its results"""
    job = PackingJob.query.get_or_404(job_id)
    job_name = job.name
    
    # Delete associated results first
    PackingResult.query.filter_by(job_id=job.id).delete()
    
    db.session.delete(job)
    db.session.commit()
    
    return jsonify({
        'message': f'Packing job "{job_name}" deleted successfully'
    })

# Shipments API
@api.route('/shipments', methods=['GET'])
def api_get_shipments():
    """Get all shipments"""
    shipments = Shipment.query.all()
    return jsonify([
        {
            'id': s.id,
            'shipment_number': s.shipment_number,
            'customer_id': s.customer_id,
            'route_id': s.route_id,
            'priority': s.priority,
            'delivery_date': s.delivery_date.isoformat() if s.delivery_date else None,
            'status': s.status,
            'total_value': s.total_value,
            'date_created': s.date_created.isoformat()
        }
        for s in shipments
    ])

@api.route('/shipments', methods=['POST'])
def api_create_shipment():
    """Create new shipment"""
    from app.models import Shipment
    data = request.get_json()
    
    shipment = Shipment(
        shipment_number=data.get('shipment_number', f'SH_{int(time.time())}'),
        customer_id=data.get('customer_id'),
        route_id=data.get('route_id'),
        priority=data.get('priority', 1),
        delivery_date=datetime.fromisoformat(data['delivery_date']) if data.get('delivery_date') else None,
        status=data.get('status', 'pending'),
        total_value=data.get('total_value', 0.0),
        special_instructions=data.get('special_instructions', '')
    )
    
    db.session.add(shipment)
    db.session.commit()
    
    return jsonify({
        'message': 'Shipment created successfully',
        'shipment_id': shipment.id
    }), 201

@api.route('/shipments/<int:shipment_id>', methods=['GET'])
def api_get_shipment(shipment_id):
    """Get specific shipment with items"""
    from app.models import ShipmentItem
    shipment = Shipment.query.get_or_404(shipment_id)
    items = ShipmentItem.query.filter_by(shipment_id=shipment.id).all()
    
    return jsonify({
        'shipment': {
            'id': shipment.id,
            'shipment_number': shipment.shipment_number,
            'customer_id': shipment.customer_id,
            'route_id': shipment.route_id,
            'priority': shipment.priority,
            'delivery_date': shipment.delivery_date.isoformat() if shipment.delivery_date else None,
            'status': shipment.status,
            'total_value': shipment.total_value,
            'special_instructions': shipment.special_instructions,
            'date_created': shipment.date_created.isoformat()
        },
        'items': [
            {
                'id': item.id,
                'carton_type_id': item.carton_type_id,
                'quantity': item.quantity,
                'carton_name': item.carton_type.name if item.carton_type else None
            }
            for item in items
        ]
    })

# Customers API
@api.route('/customers', methods=['GET'])
def api_get_customers():
    """Get all customers"""
    from app.models import Customer
    customers = Customer.query.all()
    return jsonify([
        {
            'id': c.id,
            'name': c.name,
            'email': c.email,
            'phone': c.phone,
            'address': c.address,
            'city': c.city,
            'postal_code': c.postal_code,
            'country': c.country
        }
        for c in customers
    ])

@api.route('/customers', methods=['POST'])
def api_create_customer():
    """Create new customer"""
    from app.models import Customer
    data = request.get_json()
    
    customer = Customer(
        name=data.get('name'),
        email=data.get('email'),
        phone=data.get('phone'),
        address=data.get('address'),
        city=data.get('city'),
        postal_code=data.get('postal_code'),
        country=data.get('country', 'India')
    )
    
    db.session.add(customer)
    db.session.commit()
    
    return jsonify({
        'message': 'Customer created successfully',
        'customer_id': customer.id
    }), 201

# Routes API
@api.route('/routes', methods=['GET'])
def api_get_routes():
    """Get all routes"""
    from app.models import Route
    routes = Route.query.all()
    return jsonify([
        {
            'id': r.id,
            'name': r.name,
            'origin': r.origin,
            'destination': r.destination,
            'distance_km': r.distance_km,
            'estimated_time_hours': r.estimated_time_hours,
            'toll_cost': r.toll_cost,
            'fuel_cost': r.fuel_cost
        }
        for r in routes
    ])

@api.route('/routes', methods=['POST'])
def api_create_route():
    """Create new route"""
    from app.models import Route
    data = request.get_json()
    
    route = Route(
        name=data.get('name'),
        origin=data.get('origin'),
        destination=data.get('destination'),
        distance_km=data.get('distance_km', 0),
        estimated_time_hours=data.get('estimated_time_hours'),
        toll_cost=data.get('toll_cost', 0.0),
        fuel_cost=data.get('fuel_cost', 0.0)
    )
    
    db.session.add(route)
    db.session.commit()
    
    return jsonify({
        'message': 'Route created successfully',
        'route_id': route.id
    }), 201

# Bulk operations
@api.route('/bulk/truck-types', methods=['POST'])
def api_bulk_create_truck_types():
    """Bulk create truck types"""
    data = request.get_json()
    truck_types = data.get('truck_types', [])
    
    created_trucks = []
    for truck_data in truck_types:
        truck = TruckType(
            name=truck_data.get('name'),
            length=truck_data.get('length'),
            width=truck_data.get('width'),
            height=truck_data.get('height'),
            max_weight=truck_data.get('max_weight'),
            cost_per_km=truck_data.get('cost_per_km', 0.0),
            fuel_efficiency=truck_data.get('fuel_efficiency', 0.0),
            driver_cost_per_day=truck_data.get('driver_cost_per_day', 0.0),
            maintenance_cost_per_km=truck_data.get('maintenance_cost_per_km', 0.0),
            truck_category=truck_data.get('truck_category', 'Standard'),
            availability=truck_data.get('availability', True),
            description=truck_data.get('description', '')
        )
        db.session.add(truck)
        created_trucks.append(truck)
    
    db.session.commit()
    
    return jsonify({
        'message': f'{len(created_trucks)} truck types created successfully',
        'created_ids': [truck.id for truck in created_trucks]
    }), 201

@api.route('/bulk/carton-types', methods=['POST'])
def api_bulk_create_carton_types():
    """Bulk create carton types"""
    data = request.get_json()
    carton_types = data.get('carton_types', [])
    
    created_cartons = []
    for carton_data in carton_types:
        carton = CartonType(
            name=carton_data.get('name'),
            length=carton_data.get('length'),
            width=carton_data.get('width'),
            height=carton_data.get('height'),
            weight=carton_data.get('weight'),
            can_rotate=carton_data.get('can_rotate', True),
            fragile=carton_data.get('fragile', False),
            stackable=carton_data.get('stackable', True),
            max_stack_height=carton_data.get('max_stack_height', 5),
            priority=carton_data.get('priority', 1),
            value=carton_data.get('value', 0.0),
            category=carton_data.get('category', 'General'),
            description=carton_data.get('description', '')
        )
        db.session.add(carton)
        created_cartons.append(carton)
    
    db.session.commit()
    
    return jsonify({
        'message': f'{len(created_cartons)} carton types created successfully',
        'created_ids': [carton.id for carton in created_cartons]
    }), 201

# Search API
@api.route('/search', methods=['GET'])
def api_search():
    """Global search across all entities"""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Search query is required'}), 400
    
    results = {
        'trucks': [],
        'cartons': [],
        'jobs': [],
        'shipments': []
    }
    
    # Search trucks
    trucks = TruckType.query.filter(
        TruckType.name.contains(query) | 
        TruckType.description.contains(query)
    ).limit(10).all()
    results['trucks'] = [{'id': t.id, 'name': t.name, 'type': 'truck'} for t in trucks]
    
    # Search cartons
    cartons = CartonType.query.filter(
        CartonType.name.contains(query) | 
        CartonType.description.contains(query)
    ).limit(10).all()
    results['cartons'] = [{'id': c.id, 'name': c.name, 'type': 'carton'} for c in cartons]
    
    # Search jobs
    jobs = PackingJob.query.filter(PackingJob.name.contains(query)).limit(10).all()
    results['jobs'] = [{'id': j.id, 'name': j.name, 'type': 'job'} for j in jobs]
    
    return jsonify({
        'query': query,
        'results': results,
        'total_results': sum(len(r) for r in results.values())
    })

import time
from app.route_optimizer import route_optimizer, Location

# --- Route Optimization APIs ---
@api.route('/optimize-route', methods=['POST'])
def api_optimize_route():
    """Optimize route for multiple destinations"""
    data = request.get_json()
    
    start_address = data.get('start_location')
    destinations = data.get('destinations', [])
    optimization_goal = data.get('optimization_goal', 'distance')
    return_to_start = data.get('return_to_start', True)
    
    if not start_address or not destinations:
        return jsonify({'error': 'Start location and destinations are required'}), 400
    
    # Geocode locations
    start_location = route_optimizer.geocode_address(start_address)
    destination_locations = [
        route_optimizer.geocode_address(dest) for dest in destinations
    ]
    
    # Optimize route
    optimized_route = route_optimizer.optimize_multi_destination_route(
        start_location, destination_locations, return_to_start, optimization_goal
    )
    
    # Get time windows
    time_windows = route_optimizer.calculate_delivery_time_windows(optimized_route)
    
    return jsonify({
        'optimized_route': {
            'waypoints': [
                {
                    'name': wp.name,
                    'address': wp.address,
                    'latitude': wp.latitude,
                    'longitude': wp.longitude
                }
                for wp in optimized_route.waypoints
            ],
            'segments': [
                {
                    'from': seg.from_location.name,
                    'to': seg.to_location.name,
                    'distance_km': seg.distance_km,
                    'duration_minutes': seg.duration_minutes,
                    'traffic_factor': seg.traffic_factor,
                    'road_type': seg.road_type,
                    'toll_cost': seg.toll_cost
                }
                for seg in optimized_route.segments
            ],
            'summary': {
                'total_distance_km': optimized_route.total_distance_km,
                'total_duration_minutes': optimized_route.total_duration_minutes,
                'total_cost': optimized_route.total_cost,
                'optimization_score': optimized_route.optimization_score
            }
        },
        'time_windows': time_windows,
        'optimization_goal': optimization_goal
    })

@api.route('/traffic-updates', methods=['POST'])
def api_get_traffic_updates():
    """Get real-time traffic updates for a route"""
    data = request.get_json()
    
    # This is a simplified implementation
    # In reality, you'd reconstruct the route from the data
    mock_route_data = {
        'waypoints': data.get('waypoints', []),
        'segments': data.get('segments', []),
        'total_distance_km': data.get('total_distance_km', 0),
        'total_duration_minutes': data.get('total_duration_minutes', 0),
        'total_cost': data.get('total_cost', 0),
        'optimization_score': data.get('optimization_score', 0)
    }
    
    # Create mock OptimizedRoute object
    from app.route_optimizer import OptimizedRoute
    route = OptimizedRoute([], [], 0, 0, 0, 0)
    route.total_duration_minutes = mock_route_data['total_duration_minutes']
    
    traffic_updates = route_optimizer.get_real_time_traffic_updates(route)
    
    return jsonify(traffic_updates)

@api.route('/alternative-routes', methods=['POST'])
def api_get_alternative_routes():
    """Get alternative routes between two locations"""
    data = request.get_json()
    
    origin_address = data.get('origin')
    destination_address = data.get('destination')
    
    if not origin_address or not destination_address:
        return jsonify({'error': 'Origin and destination are required'}), 400
    
    origin = route_optimizer.geocode_address(origin_address)
    destination = route_optimizer.geocode_address(destination_address)
    
    # Create main route
    main_route = route_optimizer.optimize_multi_destination_route(
        origin, [destination], False
    )
    
    # Get alternatives
    alternatives = route_optimizer.suggest_alternative_routes(origin, destination, main_route)
    
    def route_to_dict(route):
        return {
            'total_distance_km': route.total_distance_km,
            'total_duration_minutes': route.total_duration_minutes,
            'total_cost': route.total_cost,
            'optimization_score': route.optimization_score,
            'waypoints': [
                {
                    'name': wp.name,
                    'latitude': wp.latitude,
                    'longitude': wp.longitude
                }
                for wp in route.waypoints
            ]
        }
    
    return jsonify({
        'main_route': route_to_dict(main_route),
        'alternative_routes': [route_to_dict(alt) for alt in alternatives],
        'comparison': {
            'fastest': min([main_route] + alternatives, key=lambda r: r.total_duration_minutes),
            'shortest': min([main_route] + alternatives, key=lambda r: r.total_distance_km),
            'cheapest': min([main_route] + alternatives, key=lambda r: r.total_cost)
        }
    })

@api.route('/fleet-route-optimization', methods=['POST'])
def api_optimize_fleet_routes():
    """Optimize routes for multiple vehicles and orders"""
    data = request.get_json()
    
    vehicles = data.get('vehicles', [])
    orders = data.get('orders', [])
    
    if not vehicles or not orders:
        return jsonify({'error': 'Vehicles and orders are required'}), 400
    
    optimization_result = route_optimizer.optimize_fleet_routes(vehicles, orders)
    
    # Convert routes to JSON-serializable format
    serialized_routes = {}
    for vehicle_id, route_info in optimization_result['optimized_routes'].items():
        route = route_info['route']
        serialized_routes[vehicle_id] = {
            'vehicle': route_info['vehicle'],
            'route_summary': {
                'total_distance_km': route.total_distance_km,
                'total_duration_minutes': route.total_duration_minutes,
                'total_cost': route.total_cost,
                'optimization_score': route.optimization_score
            },
            'waypoints': [
                {
                    'name': wp.name,
                    'latitude': wp.latitude,
                    'longitude': wp.longitude
                }
                for wp in route.waypoints
            ],
            'assigned_orders': route_info['assigned_orders'],
            'time_windows': route_info['time_windows'],
            'total_orders': route_info['total_orders'],
            'vehicle_utilization': route_info['vehicle_utilization']
        }
    
    return jsonify({
        'optimized_routes': serialized_routes,
        'unassigned_orders': optimization_result['unassigned_orders'],
        'summary': {
            'total_vehicles_used': optimization_result['total_vehicles_used'],
            'total_distance': optimization_result['total_distance'],
            'total_cost': optimization_result['total_cost'],
            'optimization_timestamp': optimization_result['optimization_timestamp']
        }
    })

@api.route('/geocode', methods=['POST'])
def api_geocode_address():
    """Convert address to coordinates"""
    data = request.get_json()
    address = data.get('address')
    
    if not address:
        return jsonify({'error': 'Address is required'}), 400
    
    location = route_optimizer.geocode_address(address)
    
    if location:
        return jsonify({
            'latitude': location.latitude,
            'longitude': location.longitude,
            'name': location.name,
            'address': location.address
        })
    else:
        return jsonify({'error': 'Address not found'}), 404

@api.route('/distance-matrix', methods=['POST'])
def api_distance_matrix():
    """Calculate distance matrix between multiple locations"""
    data = request.get_json()
    locations = data.get('locations', [])
    
    if len(locations) < 2:
        return jsonify({'error': 'At least 2 locations are required'}), 400
    
    # Geocode all locations
    geo_locations = [route_optimizer.geocode_address(addr) for addr in locations]
    
    # Calculate distance matrix
    matrix = []
    for i, loc1 in enumerate(geo_locations):
        row = []
        for j, loc2 in enumerate(geo_locations):
            if i == j:
                row.append(0)
            else:
                distance = route_optimizer.calculate_distance(loc1, loc2)
                row.append(round(distance, 2))
        matrix.append(row)
    
    return jsonify({
        'locations': [
            {
                'address': loc.address,
                'name': loc.name,
                'latitude': loc.latitude,
                'longitude': loc.longitude
            }
            for loc in geo_locations
        ],
        'distance_matrix': matrix,
        'units': 'kilometers'
    })

# --- Sale Order Processing Routes ---
@bp.route('/sale-orders', methods=['GET', 'POST'])
def sale_orders():
    """Sale Order upload and truck recommendation page"""
    from app.models import SaleOrder, SaleOrderBatch
    
    if request.method == 'POST':
        # Handle file upload and processing
        if 'file' not in request.files:
            flash('No file selected', 'error')
            return redirect(request.url)
        
        file = request.files['file']
        if file.filename == '':
            flash('No file selected', 'error')
            return redirect(request.url)
        
        if file and (file.filename.endswith('.xlsx') or file.filename.endswith('.csv')):
            # Process the uploaded file
            batch_name = request.form.get('batch_name', f'Batch_{int(time.time())}')
            processing_result = process_sale_order_file(file, batch_name)
            
            if processing_result['success']:
                flash(f'Successfully processed {processing_result["processed_orders"]} sale orders', 'success')
                return redirect(url_for('main.sale_order_results', batch_id=processing_result['batch_id']))
            else:
                flash(f'Error processing file: {processing_result["error"]}', 'error')
        else:
            flash('Please upload a valid Excel (.xlsx) or CSV (.csv) file', 'error')
    
    # Get recent batches for display
    recent_batches = SaleOrderBatch.query.order_by(SaleOrderBatch.date_created.desc()).limit(10).all()
    
    return render_template('sale_orders.html', recent_batches=recent_batches, current_time=datetime.now())

@bp.route('/sale-order-results/<int:batch_id>')
def sale_order_results(batch_id):
    """Display sale order processing results and truck recommendations"""
    from app.models import SaleOrderBatch, SaleOrder, TruckRecommendation
    
    batch = SaleOrderBatch.query.get_or_404(batch_id)
    sale_orders = SaleOrder.query.filter_by(batch_id=batch_id).all()
    
    # Get truck recommendations for each order
    order_recommendations = {}
    for order in sale_orders:
        recommendations = TruckRecommendation.query.filter_by(
            sale_order_id=order.id
        ).order_by(TruckRecommendation.ranking).limit(3).all()
        order_recommendations[order.id] = recommendations
    
    return render_template('sale_order_results.html', 
                         batch=batch, 
                         sale_orders=sale_orders,
                         order_recommendations=order_recommendations)

def process_sale_order_file(file, batch_name):
    """Process uploaded Excel/CSV file and generate truck recommendations"""
    import pandas as pd
    from app.models import SaleOrder, SaleOrderItem, SaleOrderBatch, TruckRecommendation, TruckType, CartonType
    from datetime import datetime, date
    import io
    
    try:
        # Read the file
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(file.read()))
        else:
            df = pd.read_csv(io.StringIO(file.read().decode('utf-8')))
        
        # Create batch record
        batch = SaleOrderBatch(
            batch_name=batch_name,
            filename=file.filename,
            total_orders=0,
            status='processing'
        )
        db.session.add(batch)
        db.session.flush()  # Get batch ID
        
        processed_orders = 0
        failed_orders = 0
        
        # Expected columns: sale_order_number, carton_name, carton_code, quantity, customer_name, delivery_address
        required_columns = ['sale_order_number', 'carton_name', 'carton_code', 'quantity']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            return {'success': False, 'error': f'Missing required columns: {missing_columns}'}
        
        # Group by sale order number
        orders_dict = {}
        for _, row in df.iterrows():
            order_num = str(row['sale_order_number']).strip()
            if order_num not in orders_dict:
                orders_dict[order_num] = {
                    'customer_name': row.get('customer_name', ''),
                    'delivery_address': row.get('delivery_address', ''),
                    'order_date': row.get('order_date', date.today()),
                    'items': []
                }
            
            # Add carton to order
            orders_dict[order_num]['items'].append({
                'carton_code': str(row['carton_code']).strip(),
                'carton_name': str(row['carton_name']).strip(),
                'quantity': int(row['quantity'])
            })
        
        # Process each sale order
        for order_num, order_data in orders_dict.items():
            try:
                # Create sale order
                sale_order = SaleOrder(
                    sale_order_number=order_num,
                    batch_id=batch.id,
                    customer_name=order_data['customer_name'],
                    delivery_address=order_data['delivery_address'],
                    order_date=order_data['order_date'] if isinstance(order_data['order_date'], date) else date.today(),
                    total_items=len(order_data['items'])
                )
                db.session.add(sale_order)
                db.session.flush()  # Get sale order ID
                
                total_volume = 0
                total_weight = 0
                
                # Create sale order items with actual carton mapping
                for carton_data in order_data['items']:
                    # Find matching carton type by name or code
                    carton_type = CartonType.query.filter(
                        db.or_(
                            CartonType.name.ilike(f"%{carton_data['carton_name']}%"),
                            CartonType.name.ilike(f"%{carton_data['carton_code']}%")
                        )
                    ).first()
                    
                    # If no exact match, try partial matching
                    if not carton_type:
                        carton_type = CartonType.query.filter(
                            db.or_(
                                CartonType.name.contains(carton_data['carton_name'].split()[0]),
                                CartonType.description.ilike(f"%{carton_data['carton_name']}%")
                            )
                        ).first()
                    
                    # Create sale order item with carton dimensions
                    sale_order_item = SaleOrderItem(
                        sale_order_id=sale_order.id,
                        item_code=carton_data['carton_code'],
                        item_name=carton_data['carton_name'],
                        quantity=carton_data['quantity'],
                        unit_length=carton_type.length if carton_type else 30.0,
                        unit_width=carton_type.width if carton_type else 20.0,
                        unit_height=carton_type.height if carton_type else 15.0,
                        unit_weight=carton_type.weight if carton_type else 2.0,
                        fragile=carton_type.fragile if carton_type else False,
                        stackable=carton_type.stackable if carton_type else True,
                        notes=f"Mapped to carton: {carton_type.name}" if carton_type else "No matching carton found - using defaults"
                    )
                    
                    # Calculate totals
                    item_volume = (sale_order_item.unit_length * sale_order_item.unit_width * 
                                 sale_order_item.unit_height * carton_data['quantity']) / 1000000  # Convert to cubic meters
                    item_weight = sale_order_item.unit_weight * carton_data['quantity']
                    
                    sale_order_item.total_volume = item_volume
                    sale_order_item.total_weight = item_weight
                    
                    total_volume += item_volume
                    total_weight += item_weight
                    
                    db.session.add(sale_order_item)
                
                # Update sale order totals
                sale_order.total_volume = total_volume
                sale_order.total_weight = total_weight
                
                # Generate truck recommendations for this sale order
                generate_truck_recommendations(sale_order)
                
                processed_orders += 1
                
            except Exception as e:
                failed_orders += 1
                print(f"Error processing order {order_num}: {str(e)}")
                continue
        
        # Update batch statistics
        batch.total_orders = len(orders_dict)
        batch.processed_orders = processed_orders
        batch.failed_orders = failed_orders
        batch.status = 'completed' if failed_orders == 0 else 'completed_with_errors'
        batch.date_completed = datetime.utcnow()
        
        db.session.commit()
        
        return {
            'success': True,
            'batch_id': batch.id,
            'processed_orders': processed_orders,
            'failed_orders': failed_orders
        }
        
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'error': str(e)}

def generate_truck_recommendations(sale_order):
    """Generate single truck recommendations prioritizing maximum space utilization"""
    from app.models import TruckType, TruckRecommendation, CartonType
    from app.packer import pack_cartons_optimized
    
    # Get all available trucks sorted by volume (smallest first for cost efficiency)
    trucks = TruckType.query.filter_by(availability=True).order_by(
        (TruckType.length * TruckType.width * TruckType.height).asc()
    ).all()
    
    recommendations = []
    
    # Convert sale order items to actual carton types for packing algorithm
    carton_quantities = {}
    for item in sale_order.sale_order_items:
        # Try to find matching carton type from database
        carton_type = CartonType.query.filter(
            db.or_(
                CartonType.name.ilike(f"%{item.item_name}%"),
                CartonType.name.ilike(f"%{item.item_code}%")
            )
        ).first()
        
        if carton_type:
            # Use existing carton type
            if carton_type in carton_quantities:
                carton_quantities[carton_type] += item.quantity
            else:
                carton_quantities[carton_type] = item.quantity
        else:
            # Create temporary carton with actual dimensions
            temp_carton = type('TempCarton', (), {
                'length': item.unit_length,
                'width': item.unit_width, 
                'height': item.unit_height,
                'weight': item.unit_weight,
                'name': item.item_name,
                'can_rotate': not item.fragile,
                'stackable': item.stackable
            })()
            carton_quantities[temp_carton] = item.quantity
    
    # Find the most space-efficient single truck solution
    best_utilization = 0
    best_truck_result = None
    
    for truck in trucks:
        try:
            truck_combo = {truck: 1}  # Single truck only
            pack_results = pack_cartons_optimized(truck_combo, carton_quantities, 'space')
            
            if pack_results:
                result = pack_results[0]
                space_utilization = result.get('utilization', 0)
                fits_completely = len(result.get('unfitted_items', [])) == 0
                overflow_items = len(result.get('unfitted_items', []))
                
                # Only consider trucks that can fit everything
                if fits_completely and space_utilization > best_utilization:
                    best_utilization = space_utilization
                    best_truck_result = (truck, result, space_utilization, overflow_items)
                
                # Still save all results for comparison, but prioritize complete fits
                cost_calculation = truck.cost_per_km * 100  # 100km default route
                if truck.driver_cost_per_day:
                    cost_calculation += truck.driver_cost_per_day
                
                # Heavy penalty for incomplete fits to prioritize single-truck solutions
                utilization_score = space_utilization * 100
                completeness_bonus = 50 if fits_completely else -100  # Heavy penalty for multi-truck needs
                space_priority_score = utilization_score + completeness_bonus
                
                recommendation = TruckRecommendation(
                    sale_order_id=sale_order.id,
                    truck_type_id=truck.id,
                    utilization_score=utilization_score,
                    cost_score=100 - (cost_calculation / 1000) * 10,  # Lower cost = higher score
                    efficiency_score=space_priority_score,
                    overall_score=space_priority_score,
                    space_utilization=space_utilization,
                    weight_utilization=min(1.0, sum(getattr(item, 'weight', 2.0) * item.quantity for item in sale_order.sale_order_items) / truck.max_weight if truck.max_weight else 0.8),
                    estimated_cost=cost_calculation,
                    fits_completely=fits_completely,
                    overflow_items=overflow_items,
                    recommendation_reason=f"{'✅ BEST CHOICE: ' if fits_completely and space_utilization == best_utilization else ''}Space utilization: {space_utilization:.1%}{'• Single truck solution' if fits_completely else '• Requires multiple trucks (not recommended)'}"
                )
                recommendations.append(recommendation)
                
        except Exception as e:
            print(f"Error testing truck {truck.name}: {str(e)}")
            continue
    
    # Sort by overall score (prioritizing complete fits and high utilization)
    recommendations.sort(key=lambda x: (x.fits_completely, x.overall_score), reverse=True)
    
    # Assign rankings with emphasis on complete single-truck solutions
    complete_fits = [r for r in recommendations if r.fits_completely]
    incomplete_fits = [r for r in recommendations if not r.fits_completely]
    
    # Rank complete fits first (by utilization), then incomplete fits
    ranking = 1
    for rec in complete_fits:
        rec.ranking = ranking
        db.session.add(rec)
        ranking += 1
    
    for rec in incomplete_fits:
        rec.ranking = ranking
        db.session.add(rec)
        ranking += 1
    
    # Update sale order with best recommendation (prioritizing complete fits)
    if recommendations:
        best_recommendation = recommendations[0]
        sale_order.recommended_truck_id = best_recommendation.truck_type_id
        sale_order.optimization_score = best_recommendation.overall_score
        sale_order.estimated_utilization = best_recommendation.space_utilization
        sale_order.estimated_cost = best_recommendation.estimated_cost
        sale_order.status = 'optimized'
        sale_order.date_processed = datetime.utcnow()
        
        # Add processing note about optimization strategy
        if best_recommendation.fits_completely:
            sale_order.processing_notes = f"Single truck solution found with {best_recommendation.space_utilization:.1%} space utilization - COST OPTIMAL"
        else:
            sale_order.processing_notes = f"Warning: No single truck can fit all cartons. Best option has {best_recommendation.overflow_items} overflow items."

# API Routes for Sale Orders
@api.route('/sale-orders', methods=['GET'])
def api_get_sale_orders():
    """Get all sale orders with optional filtering"""
    from app.models import SaleOrder
    
    batch_id = request.args.get('batch_id')
    status = request.args.get('status')
    
    query = SaleOrder.query
    if batch_id:
        query = query.filter_by(batch_id=batch_id)
    if status:
        query = query.filter_by(status=status)
    
    sale_orders = query.order_by(SaleOrder.date_created.desc()).all()
    
    return jsonify([
        {
            'id': order.id,
            'sale_order_number': order.sale_order_number,
            'customer_name': order.customer_name,
            'total_items': order.total_items,
            'total_volume': order.total_volume,
            'total_weight': order.total_weight,
            'status': order.status,
            'recommended_truck_id': order.recommended_truck_id,
            'estimated_utilization': order.estimated_utilization,
            'estimated_cost': order.estimated_cost,
            'date_created': order.date_created.isoformat(),
            'date_processed': order.date_processed.isoformat() if order.date_processed else None
        }
        for order in sale_orders
    ])

@api.route('/sale-orders/<int:order_id>/recommendations', methods=['GET'])
def api_get_order_recommendations(order_id):
    """Get truck recommendations for a specific sale order"""
    from app.models import TruckRecommendation
    
    recommendations = TruckRecommendation.query.filter_by(
        sale_order_id=order_id
    ).order_by(TruckRecommendation.ranking).all()
    
    return jsonify([
        {
            'id': rec.id,
            'truck_type_id': rec.truck_type_id,
            'truck_name': rec.truck_type.name,
            'ranking': rec.ranking,
            'overall_score': rec.overall_score,
            'space_utilization': rec.space_utilization,
            'estimated_cost': rec.estimated_cost,
            'fits_completely': rec.fits_completely,
            'overflow_items': rec.overflow_items,
            'recommendation_reason': rec.recommendation_reason
        }
        for rec in recommendations
    ])

@api.route('/sale-order-batches', methods=['GET'])
def api_get_sale_order_batches():
    """Get all sale order processing batches"""
    from app.models import SaleOrderBatch
    
    batches = SaleOrderBatch.query.order_by(SaleOrderBatch.date_created.desc()).all()
    
    return jsonify([
        {
            'id': batch.id,
            'batch_name': batch.batch_name,
            'filename': batch.filename,
            'total_orders': batch.total_orders,
            'processed_orders': batch.processed_orders,
            'failed_orders': batch.failed_orders,
            'status': batch.status,
            'date_created': batch.date_created.isoformat(),
            'date_completed': batch.date_completed.isoformat() if batch.date_completed else None
        }
        for batch in batches
    ])