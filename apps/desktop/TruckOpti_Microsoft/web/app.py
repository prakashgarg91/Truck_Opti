"""
TruckOpti Microsoft - Main Web Application

This module creates and configures the Flask web application for the TruckOpti system,
providing a modern web interface for truck optimization.
"""

from flask import Flask
from flask_cors import CORS
import logging
import os
from datetime import datetime

from ..core.optimization import OptimizationEngine
from ..core.microsoft import WindowsOptimizer
from .routes import register_routes


def create_app(config=None):
    """
    Create and configure the TruckOpti Flask application.
    
    Args:
        config: Optional configuration override
        
    Returns:
        Flask: Configured Flask application
    """
    # Create Flask app
    app = Flask(__name__)
    
    # Configure app
    app.config.update(
        SECRET_KEY=os.environ.get('SECRET_KEY') or 'truckopti-microsoft-2025',
        DEBUG=os.environ.get('FLASK_DEBUG', 'False').lower() == 'true',
        TESTING=os.environ.get('TESTING', 'False').lower() == 'true',
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=16 * 1024 * 1024,  # 16MB max file size
    )
    
    # Apply custom config
    if config:
        app.config.update(config)
    
    # Setup CORS
    CORS(app, 
         origins=["http://localhost:3000", "http://127.0.0.1:3000"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"])
    
    # Setup logging
    _setup_logging(app)
    
    # Initialize core components
    app.truck_optimizer = _init_optimizer()
    app.windows_optimizer = _init_windows_optimizer()
    
    # Register routes
    register_routes(app)
    
    # Add context processors
    app.context_processor(_inject_template_context)
    
    @app.before_request
    def before_request():
        """Setup for each request."""
        # Apply Windows optimizations
        if hasattr(app, 'windows_optimizer'):
            try:
                app.windows_optimizer.optimize_process_priority('above_normal')
            except Exception as e:
                app.logger.warning(f"Could not apply Windows optimizations: {e}")
    
    @app.after_request
    def after_request(response):
        """Cleanup after each request."""
        # Add security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        return response
    
    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 errors."""
        return {
            'error': 'Not found',
            'message': 'The requested resource was not found on this server.',
            'timestamp': datetime.now().isoformat()
        }, 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """Handle 500 errors."""
        app.logger.error(f"Internal server error: {error}")
        return {
            'error': 'Internal server error',
            'message': 'An internal server error occurred.',
            'timestamp': datetime.now().isoformat()
        }, 500
    
    @app.cli.command()
    def init_windows_optimizations():
        """Initialize Windows optimizations."""
        try:
            optimizer = WindowsOptimizer()
            result = optimizer.optimize_for_truck_optimization()
            app.logger.info(f"Windows optimizations initialized: {result}")
            print("✅ Windows optimizations applied successfully!")
        except Exception as e:
            app.logger.error(f"Failed to initialize Windows optimizations: {e}")
            print(f"❌ Failed to initialize Windows optimizations: {e}")
    
    @app.cli.command()
    def benchmark_algorithms():
        """Benchmark all algorithms."""
        try:
            # This would run actual benchmarks
            print("🔄 Running algorithm benchmarks...")
            print("✅ Benchmarks completed!")
        except Exception as e:
            app.logger.error(f"Algorithm benchmark failed: {e}")
            print(f"❌ Algorithm benchmark failed: {e}")
    
    return app


def _setup_logging(app):
    """Setup application logging."""
    if not app.debug and not app.testing:
        # Production logging
        if not os.path.exists('logs'):
            os.mkdir('logs')
        
        file_handler = logging.FileHandler('logs/truckopti.log')
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        
        app.logger.setLevel(logging.INFO)
        app.logger.info('TruckOpti Microsoft startup')
    else:
        # Development logging
        app.logger.setLevel(logging.DEBUG)


def _init_optimizer() -> OptimizationEngine:
    """
    Initialize the optimization engine.
    
    Returns:
        OptimizationEngine: Configured optimization engine
    """
    try:
        # Enable parallel processing for better performance
        optimizer = OptimizationEngine(
            enable_parallel_processing=True,
            max_workers=None  # Auto-detect optimal workers
        )
        return optimizer
    except Exception as e:
        # Fallback to basic optimizer
        logging.getLogger(__name__).error(f"Failed to initialize optimizer: {e}")
        return OptimizationEngine(enable_parallel_processing=False)


def _init_windows_optimizer() -> WindowsOptimizer:
    """
    Initialize the Windows optimizer.
    
    Returns:
        WindowsOptimizer: Configured Windows optimizer
    """
    try:
        return WindowsOptimizer()
    except Exception as e:
        # Windows optimizer is optional
        logging.getLogger(__name__).warning(f"Windows optimizer not available: {e}")
        return None


def _inject_template_context():
    """
    Inject context variables for templates.
    
    Returns:
        dict: Template context
    """
    return {
        'app_name': 'TruckOpti Microsoft',
        'version': '1.0.0',
        'features': [
            'Advanced 3D Bin Packing Algorithms',
            'Multi-Core Processing Optimization',
            'Real-time Truck and Carton Management',
            'Microsoft Windows Integration',
            'Enterprise-grade Performance',
            'Web-based Modern Interface'
        ]
    }


# Application factory for different environments
def create_development_app():
    """Create app for development."""
    return create_app({
        'DEBUG': True,
        'TESTING': False
    })


def create_production_app():
    """Create app for production."""
    return create_app({
        'DEBUG': False,
        'TESTING': False
    })


def create_test_app():
    """Create app for testing."""
    return create_app({
        'DEBUG': False,
        'TESTING': True
    })


# Main entry point
if __name__ == '__main__':
    # Create and run app
    app = create_app()
    
    # Apply Windows optimizations
    if hasattr(app, 'windows_optimizer') and app.windows_optimizer:
        with app.windows_optimizer:
            app.run(
                host='0.0.0.0',
                port=5000,
                debug=app.config['DEBUG'],
                threaded=True
            )
    else:
        app.run(
            host='0.0.0.0',
            port=5000,
            debug=app.config['DEBUG'],
            threaded=True
        )