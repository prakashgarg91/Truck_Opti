"""
Minimal App Factory - Removes heavy import bottlenecks
Based on debug analysis showing app.create_app taking 1.588 seconds
"""
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os
import sys

db = SQLAlchemy()

def create_app():
    """Create Flask app with MINIMAL imports to eliminate 1.5s delay"""
    
    # Handle PyInstaller executable paths
    if getattr(sys, 'frozen', False):
        application_path = sys._MEIPASS
        template_folder = os.path.join(application_path, 'app', 'templates')
        static_folder = os.path.join(application_path, 'app', 'static')
    else:
        template_folder = 'templates'
        static_folder = 'static'

    app = Flask(
        __name__,
        template_folder=template_folder,
        static_folder=static_folder
    )
    
    # Database setup
    if getattr(sys, 'frozen', False):
        db_path = os.path.join(os.path.dirname(sys.executable), 'app_data', 'truck_opti.db')
    else:
        db_path = os.path.join(os.path.dirname(__file__), 'truck_opti.db')
    
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    app.config.update({
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}',
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'SECRET_KEY': 'truckopti-minimal-key',
    })

    db.init_app(app)

    # Import models ONLY - no heavy processing
    from app import models
    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            print(f"Database error: {e}")

    # Register routes - this is where the delay might be
    print("[DEBUG] Importing routes...")
    from app import routes
    app.register_blueprint(routes.bp)
    app.register_blueprint(routes.api, url_prefix='/api')
    print("[DEBUG] Routes imported successfully")

    # Simple version info
    @app.context_processor
    def inject_version_info():
        return dict(version_info={
            'VERSION': 'v3.7.5-MINIMAL',
            'BUILD_DATE': '2025-08-21',
            'BUILD_NAME': 'Minimal Fast Loading',
        })

    # Health check
    @app.route('/api/health')
    def health_check():
        from flask import jsonify
        return jsonify({'status': 'ready', 'version': 'v3.7.5-MINIMAL'}), 200

    print("[DEBUG] App creation completed")
    return app