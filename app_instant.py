"""
Instant Startup App Factory - Optimized for fastest possible startup
Removes all unnecessary initialization, monitoring, and debug code
"""
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os
import sys

db = SQLAlchemy()

def create_app():
    """Create Flask app with minimal overhead for instant startup"""
    
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

    app = Flask(
        __name__,
        template_folder=template_folder,
        static_folder=static_folder
    )
    
    # MINIMAL configuration - only essentials
    if getattr(sys, 'frozen', False):
        # Executable mode - use local database
        db_path = os.path.join(os.path.dirname(sys.executable), 'app_data', 'truck_opti.db')
    else:
        # Development mode
        db_path = os.path.join(os.path.dirname(__file__), 'truck_opti.db')
    
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    app.config.update({
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}',
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'SECRET_KEY': 'truckopti-instant-key',
        'TESTING': False
    })

    db.init_app(app)

    # SKIP all initialization that causes delays
    # Only create tables, no seeding
    from app import models
    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            print(f"Database error: {e}")

    # Register ONLY essential routes
    from app import routes
    app.register_blueprint(routes.bp)
    app.register_blueprint(routes.api, url_prefix='/api')

    # MINIMAL version info - no imports
    @app.context_processor
    def inject_version_info():
        return dict(version_info={
            'VERSION': 'v3.7.3-INSTANT',
            'BUILD_DATE': '2025-08-21',
            'BUILD_NAME': 'Instant Startup',
        })

    # Simple health check only
    @app.route('/api/health')
    def health_check():
        from flask import jsonify
        return jsonify({'status': 'ready', 'version': 'v3.7.3-INSTANT'}), 200

    return app