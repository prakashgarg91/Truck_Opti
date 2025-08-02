from flask import Blueprint, render_template, request, redirect, url_for, flash
from .models import TruckType, CartonType, PackingJob, PackingResult, db

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    return render_template('index.html')

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
    return render_template('packing_result.html', job=job, result=result)