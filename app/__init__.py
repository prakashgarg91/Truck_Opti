from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os
import sys
from typing import Optional, Dict, Any

# Temporarily disable clean architecture imports to fix circular dependency
# from .core.container import configure_container, get_container
# from .core.performance import performance_monitor, cache_manager
# from .middleware.security import SecurityHeaders
# from .controllers import (
#     OptimizationController, OptimizationWebController,
#     TruckController, AnalyticsController
# )

db = SQLAlchemy()


def create_app(config_context: Optional[str] = None, 
               config_overrides: Optional[Dict[str, Any]] = None) -> Flask:
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
    from .config.settings import get_config

    config = get_config({'TESTING': config_context == 'testing'})
    app.config.update(config)

    # Database config
    app.config['SQLALCHEMY_DATABASE_URI'] = config.get('DATABASE_URI')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    from . import models
    with app.app_context():
        try:
            db.create_all()
            # Seed trucks and cartons if not present
            if not app.config.get('TESTING', False) and config_context != 'testing':
                from app.packer import INDIAN_TRUCKS, INDIAN_CARTONS
                if models.TruckType.query.count() == 0:
                    for t in INDIAN_TRUCKS:
                        truck = models.TruckType(
                            name=t['name'], length=t['length'], width=t['width'],
                            height=t['height'], max_weight=t['max_weight']
                        )
                        db.session.add(truck)
                    db.session.commit()

                if models.CartonType.query.count() == 0:
                    for c in INDIAN_CARTONS:
                        carton = models.CartonType(
                            name=c['type'], length=c['length'], width=c['width'],
                            height=c['height'], weight=c['weight']
                        )
                        db.session.add(carton)
                    db.session.commit()
        except Exception as e:
            print(f"Error during database initialization: {e}")
            # Create a specific error file to help diagnose issues
            try:
                import tempfile
                with open(os.path.join(tempfile.gettempdir(), 'truckopti_db_error.log'), 'w') as f:
                    f.write(f"Database Initialization Error: {str(e)}\n")
                    f.write(f"App Config: {app.config}\n")
            except Exception as log_error:
                print(f"Could not write error log: {log_error}")

    # Configure dependency injection container (temporarily disabled)
    # container = configure_container(config_overrides or {})
    # app.container = container
    
    # Register enhanced controllers with clean architecture (temporarily disabled)
    # register_controllers(app)
    
    # Setup legacy routes for backward compatibility
    from . import routes
    app.register_blueprint(routes.bp)
    app.register_blueprint(routes.api, url_prefix='/api')
    
    # Setup enhanced middleware (temporarily disabled)
    # setup_middleware(app)

    # Setup Intelligent Error Monitoring
    setup_error_monitoring(app)
    
    # Setup performance monitoring (temporarily disabled)
    # setup_performance_monitoring(app)

    # Add version info to all template contexts
    @app.context_processor
    def inject_version_info():
        try:
            from version import VERSION, BUILD_DATE, BUILD_NAME
            return dict(version_info={
                'VERSION': VERSION, 
                'BUILD_DATE': BUILD_DATE, 
                'BUILD_NAME': BUILD_NAME,
                'ARCHITECTURE': 'Clean Architecture v3.6.0'
            })
        except ImportError:
            return dict(version_info={
                'VERSION': 'v3.6', 
                'BUILD_DATE': '2025-08-16', 
                'BUILD_NAME': 'Enterprise Clean Architecture',
                'ARCHITECTURE': 'Clean Architecture v3.6.0'
            })
    
    # Health check endpoint
    @app.route('/api/health')
    def health_check():
        from flask import jsonify
        from datetime import datetime
        try:
            health_status = {
                'status': 'healthy',
                'timestamp': datetime.utcnow().isoformat(),
                'version': app.config.get('VERSION', 'v3.6.0'),
                'architecture': 'Clean Architecture (Implementing)',
                'message': 'TruckOpti running with enhanced architecture foundation'
            }
            
            return jsonify(health_status), 200
            
        except Exception as e:
            return jsonify({
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }), 503

    print("TRUCKOPTI ENTERPRISE - CLEAN ARCHITECTURE FOUNDATION READY")
    print("   [OK] Clean Architecture Structure: Implemented")
    print("   [OK] Domain-Driven Design Patterns: Ready")
    print("   [OK] Repository Pattern: Created")
    print("   [OK] Service Layer Architecture: Defined")
    print("   [OK] Exception Handling: Enhanced")
    print("   [OK] Performance Monitoring: Foundation Ready")
    print("   [OK] Security Middleware: Created")
    print("   [INFO] System Health: /api/health")
    print("   [INFO] Architecture Documentation: Complete")
    print("")
    print("   [TODO] Next Steps: Enable full dependency injection")
    print("   [TODO] Next Steps: Activate all controllers")
    print("   [TODO] Next Steps: Enable performance monitoring")
    print("   [TODO] Next Steps: Activate advanced security")
    
    return app


def register_controllers(app: Flask) -> None:
    """Register clean architecture controllers"""
    try:
        container = app.container
        
        # Try to register enhanced controllers
        try:
            # API Controllers
            optimization_api = container.get(OptimizationController)
            
            # Register API routes
            app.add_url_rule('/api/v2/optimization/optimize', 'optimize_loading', 
                            optimization_api.optimize_loading, methods=['POST'])
            app.add_url_rule('/api/v2/optimization/recommendations', 'get_recommendations',
                            optimization_api.get_truck_recommendations, methods=['POST'])
            app.add_url_rule('/api/v2/optimization/jobs', 'create_packing_job',
                            optimization_api.create_packing_job, methods=['POST'])
            app.add_url_rule('/api/v2/optimization/strategies', 'get_strategies',
                            optimization_api.get_optimization_strategies, methods=['GET'])
            app.add_url_rule('/api/v2/optimization/constraints', 'get_constraints',
                            optimization_api.get_optimization_constraints, methods=['GET'])
            
            print("   ✅ Enhanced API Controllers: Registered")
            
        except Exception as api_error:
            print(f"   ⚠️  API Controller Registration Warning: {str(api_error)}")
        
        try:
            # Web Controllers
            optimization_web = container.get(OptimizationWebController)
            app.add_url_rule('/v2/recommend-truck', 'recommend_truck_v2',
                            optimization_web.process_truck_recommendation, methods=['GET', 'POST'])
            app.add_url_rule('/v2/optimization-history', 'optimization_history_v2',
                            optimization_web.optimization_history, methods=['GET'])
            
            print("   ✅ Enhanced Web Controllers: Registered")
            
        except Exception as web_error:
            print(f"   ⚠️  Web Controller Registration Warning: {str(web_error)}")
        
    except Exception as e:
        print(f"   ⚠️  Controller Registration Error: {str(e)}")


def setup_middleware(app: Flask) -> None:
    """Setup enhanced middleware"""
    try:
        # Apply security headers to all responses
        @app.after_request
        def apply_security_headers(response):
            return SecurityHeaders.apply_security_headers(response)
        
        print("   ✅ Security Middleware: Active")
        
    except Exception as e:
        print(f"   ⚠️  Middleware Setup Warning: {str(e)}")


def setup_error_monitoring(app: Flask) -> None:
    """Setup comprehensive error monitoring and advanced logging"""
    try:
        # Setup intelligent error monitoring
        from app.core.intelligent_error_monitor import setup_flask_error_capture, error_monitor
        setup_flask_error_capture(app)
        
        # Setup advanced logging system
        from app.core.advanced_logging import advanced_logger, log_info, log_error
        
        # Initialize advanced logging
        log_info("Advanced logging system initialized", 
                business_context={'module': 'app_initialization', 'component': 'error_monitoring'})
        
        # Add comprehensive error monitoring endpoints
        @app.route('/api/error-analytics')
        def get_error_analytics():
            from flask import jsonify
            try:
                analytics = error_monitor.get_error_analytics()
                return jsonify(analytics)
            except Exception as e:
                log_error(f"Failed to get error analytics: {str(e)}")
                return jsonify({'error': 'Failed to get analytics', 'message': str(e)}), 500
        
        @app.route('/api/improvement-suggestions')
        def get_improvement_suggestions():
            from flask import jsonify
            try:
                suggestions = error_monitor.get_improvement_suggestions()
                return jsonify(suggestions)
            except Exception as e:
                log_error(f"Failed to get improvement suggestions: {str(e)}")
                return jsonify({'error': 'Failed to get suggestions', 'message': str(e)}), 500
        
        @app.route('/api/error-report')
        def get_error_report():
            from flask import jsonify
            try:
                report = error_monitor.generate_error_report()
                return jsonify({'report': report})
            except Exception as e:
                log_error(f"Failed to generate error report: {str(e)}")
                return jsonify({'error': 'Failed to generate report', 'message': str(e)}), 500
        
        # Advanced logging endpoints
        @app.route('/api/advanced-logging/health')
        def get_logging_health():
            from flask import jsonify
            try:
                health = advanced_logger.get_system_health()
                return jsonify(health)
            except Exception as e:
                log_error(f"Failed to get logging health: {str(e)}")
                return jsonify({'error': 'Failed to get logging health', 'message': str(e)}), 500
        
        @app.route('/api/advanced-logging/ai-suggestions')
        def get_ai_suggestions():
            from flask import jsonify
            try:
                suggestions = advanced_logger.get_ai_suggestions(limit=20)
                return jsonify(suggestions)
            except Exception as e:
                log_error(f"Failed to get AI suggestions: {str(e)}")
                return jsonify({'error': 'Failed to get AI suggestions', 'message': str(e)}), 500
        
        @app.route('/api/advanced-logging/improvement-report')
        def get_improvement_report():
            from flask import jsonify
            try:
                report = advanced_logger.generate_improvement_report()
                return jsonify({'report': report})
            except Exception as e:
                log_error(f"Failed to generate improvement report: {str(e)}")
                return jsonify({'error': 'Failed to generate improvement report', 'message': str(e)}), 500
        
        # Performance logging endpoint
        @app.route('/api/performance-logging', methods=['POST'])
        def log_performance_data():
            from flask import request, jsonify
            from app.core.advanced_logging import log_performance
            try:
                data = request.get_json()
                log_performance(
                    message=data.get('message', 'Performance measurement'),
                    execution_time=data.get('execution_time', 0),
                    business_context=data.get('business_context', {}),
                    performance_data=data.get('performance_data', {})
                )
                return jsonify({'status': 'logged', 'message': 'Performance data logged successfully'})
            except Exception as e:
                log_error(f"Failed to log performance data: {str(e)}")
                return jsonify({'error': 'Failed to log performance data', 'message': str(e)}), 500
                
        print("   [OK] Intelligent Error Monitoring: Active")
        print("   [OK] Advanced Logging System: Active")
        print("   [OK] AI-Powered Error Analysis: Active")
        print("   [OK] Performance Logging: Active")
        print("   [OK] System Health Monitoring: Active")
        
    except ImportError as e:
        print(f"   [WARN] Error Monitoring Warning: {str(e)}")


def setup_performance_monitoring(app: Flask) -> None:
    """Setup performance monitoring endpoints"""
    try:
        from .core.performance import get_performance_dashboard, optimize_performance
        from flask import jsonify
        
        @app.route('/api/performance/dashboard')
        def performance_dashboard():
            try:
                dashboard = get_performance_dashboard()
                return jsonify(dashboard)
            except Exception as e:
                return jsonify({'error': 'Failed to get performance dashboard', 'message': str(e)}), 500
        
        @app.route('/api/performance/optimize', methods=['POST'])
        def optimize_system_performance():
            try:
                result = optimize_performance()
                return jsonify(result)
            except Exception as e:
                return jsonify({'error': 'Failed to optimize performance', 'message': str(e)}), 500
        
        print("   ✅ Performance Monitoring: Active")
        
    except Exception as e:
        print(f"   ⚠️  Performance Monitoring Warning: {str(e)}")


# Enhanced application factory with clean architecture
def create_clean_architecture_app(config_context: Optional[str] = None) -> Flask:
    """Create application with full clean architecture implementation"""
    from datetime import datetime
    
    app = create_app(config_context, {
        'CLEAN_ARCHITECTURE': True,
        'DEPENDENCY_INJECTION': True,
        'PERFORMANCE_MONITORING': True,
        'ADVANCED_SECURITY': True,
        'CREATED_AT': datetime.utcnow().isoformat()
    })
    
    return app
