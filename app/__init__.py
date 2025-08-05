from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os
import sys

db = SQLAlchemy()

def create_app():
    app = Flask(__name__, template_folder='templates', static_folder='static')
    app.config['SECRET_KEY'] = 'dev-secret-key'

    # Database config
    db_dir = os.path.join(os.path.expanduser('~'), '.truckopti')
    if not os.path.exists(db_dir):
        os.makedirs(db_dir)
    db_path = os.path.join(db_dir, 'truck_opti.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    from . import models
    with app.app_context():
        db.create_all()
        # Seed trucks and cartons if not present
        from app.packer import INDIAN_TRUCKS, INDIAN_CARTONS
        if models.TruckType.query.count() == 0:
            for t in INDIAN_TRUCKS:
                truck = models.TruckType(
                    name=t['name'], length=t['length'], width=t['width'], height=t['height'], max_weight=t['max_weight']
                )
                db.session.add(truck)
            db.session.commit()
        if models.CartonType.query.count() == 0:
            for c in INDIAN_CARTONS:
                carton = models.CartonType(
                    name=c['type'], length=c['length'], width=c['width'], height=c['height'], weight=c['weight'], qty=c['qty']
                )
                db.session.add(carton)
            db.session.commit()

    from . import routes
    app.register_blueprint(routes.bp)
    if hasattr(routes, 'register_blueprints'):
        routes.register_blueprints(app)

    return app