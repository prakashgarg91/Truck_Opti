from . import db

class TruckType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    length = db.Column(db.Float, nullable=False)
    width = db.Column(db.Float, nullable=False)
    height = db.Column(db.Float, nullable=False)
    max_weight = db.Column(db.Float)
    description = db.Column(db.Text)

class CartonType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    length = db.Column(db.Float, nullable=False)
    width = db.Column(db.Float, nullable=False)
    height = db.Column(db.Float, nullable=False)
    weight = db.Column(db.Float)
    can_rotate = db.Column(db.Boolean, default=True)
    description = db.Column(db.Text)

class PackingJob(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    date_created = db.Column(db.DateTime, default=db.func.current_timestamp())
    truck_type_id = db.Column(db.Integer, db.ForeignKey('truck_type.id'))
    status = db.Column(db.String(20), default='pending')

class PackingResult(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('packing_job.id'))
    truck_count = db.Column(db.Integer)
    space_utilization = db.Column(db.Float)
    result_data = db.Column(db.JSON)  # Stores packing positions