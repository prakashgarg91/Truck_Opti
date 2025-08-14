from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os
import sys

db = SQLAlchemy()

def create_app():
    # Handle PyInstaller executable paths
    if getattr(sys, 'frozen', False):
        # Running in a PyInstaller bundle
        application_path = sys._MEIPASS
        template_folder = os.path.join(application_path, 'app', 'templates')
        static_folder = os.path.join(application_path, 'app', 'static')
    else:
        # Running in normal Python environment
        template_folder = 'templates'
        static_folder = 'static'
    
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
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
        if not app.config.get('TESTING', False):
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
                        name=c['type'], length=c['length'], width=c['width'], height=c['height'], weight=c['weight']
                    )
                    db.session.add(carton)
                db.session.commit()

    from . import routes
    app.register_blueprint(routes.bp)
    app.register_blueprint(routes.api, url_prefix='/api')
    
    # Add version info to all template contexts
    @app.context_processor
    def inject_version_info():
        try:
            from version import VERSION, BUILD_DATE, BUILD_NAME
            return dict(version_info={'VERSION': VERSION, 'BUILD_DATE': BUILD_DATE, 'BUILD_NAME': BUILD_NAME})
        except ImportError:
            return dict(version_info={'VERSION': 'v3.2', 'BUILD_DATE': '2025-08-14', 'BUILD_NAME': 'Stability & UI Enhancement'})

    return app