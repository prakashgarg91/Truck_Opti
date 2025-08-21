"""
TruckOpti Full Debug Runner - Comprehensive Performance Analysis
Deep debugging and profiling of startup performance with full functionality
"""

# Import profiler FIRST - before anything else
from startup_profiler import startup_profiler, log_checkpoint, log_import_time, log_error, timed_operation
import time

# Profile initial imports
log_checkpoint("PYTHON_STARTED", "Python interpreter started")

# Profile each critical import
import_start = time.time()
import webbrowser
log_import_time("webbrowser", time.time() - import_start)

import_start = time.time()
import socket
log_import_time("socket", time.time() - import_start)

import_start = time.time()
import signal
log_import_time("signal", time.time() - import_start)

import_start = time.time()
import sys
log_import_time("sys", time.time() - import_start)

import_start = time.time()
import os
log_import_time("os", time.time() - import_start)

import_start = time.time()
import atexit
log_import_time("atexit", time.time() - import_start)

import_start = time.time()
from threading import Timer
log_import_time("threading.Timer", time.time() - import_start)

# Profile Flask app creation - this is likely the bottleneck
log_checkpoint("IMPORTING_APP", "Starting app import")
import_start = time.time()
try:
    from app import create_app
    log_import_time("app.create_app", time.time() - import_start)
    log_checkpoint("APP_IMPORTED", "App module imported successfully")
except Exception as e:
    log_error("Failed to import app", e)
    raise

# Profile debug logger import
log_checkpoint("IMPORTING_DEBUG_LOGGER", "Starting debug logger import")
import_start = time.time()
try:
    from debug_logger import debug_logger
    log_import_time("debug_logger", time.time() - import_start)
    log_checkpoint("DEBUG_LOGGER_IMPORTED", "Debug logger imported successfully")
except Exception as e:
    log_error("Failed to import debug logger", e)
    # Continue without debug logger

APP_VERSION = "3.7.4-FULL-DEBUG"

def find_available_port(start_port=5000):
    """Find available port with timing"""
    with timed_operation("port_discovery"):
        port = start_port
        while port < start_port + 10:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(('127.0.0.1', port))
                    log_checkpoint("PORT_FOUND", f"Available port found: {port}")
                    return port
                except OSError:
                    port += 1
        return start_port

def create_flask_app():
    """Create Flask app with detailed timing"""
    log_checkpoint("CREATING_FLASK_APP", "Starting Flask app creation")
    
    with timed_operation("flask_app_creation"):
        try:
            app = create_app()
            log_checkpoint("FLASK_APP_CREATED", "Flask app created successfully", {
                'app_name': app.name,
                'config_keys': list(app.config.keys())
            })
            return app
        except Exception as e:
            log_error("Failed to create Flask app", e)
            raise

def setup_browser_opener(port):
    """Setup browser opener with timing"""
    browser_opened = False
    
    def open_browser():
        nonlocal browser_opened
        if not browser_opened:
            try:
                with timed_operation("browser_opening"):
                    # Minimal wait time for fastest startup
                    time.sleep(0.2)
                    webbrowser.open_new(f"http://127.0.0.1:{port}/")
                    browser_opened = True
                    log_checkpoint("BROWSER_OPENED", f"Browser opened to http://127.0.0.1:{port}/")
            except Exception as e:
                log_error("Browser auto-open failed", e)
    
    return open_browser

def setup_signal_handlers():
    """Setup signal handlers with timing"""
    with timed_operation("signal_handler_setup"):
        def signal_handler(sig, frame):
            log_checkpoint("SHUTDOWN_SIGNAL", f"Received signal {sig}")
            startup_profiler.print_summary()
            startup_profiler.generate_performance_report()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        if sys.platform == "win32":
            signal.signal(signal.SIGBREAK, signal_handler)
        
        atexit.register(lambda: startup_profiler.generate_performance_report())
        log_checkpoint("SIGNAL_HANDLERS_SETUP", "Signal handlers configured")

def run_flask_app(app, port):
    """Run Flask app with detailed monitoring"""
    log_checkpoint("STARTING_FLASK_SERVER", "Starting Flask development server")
    
    is_executable = hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS')
    
    try:
        if is_executable:
            log_checkpoint("EXECUTABLE_MODE", "Running in executable mode", {
                'executable_path': sys.executable,
                'meipass': getattr(sys, '_MEIPASS', None)
            })
            
            # Production mode settings for executable
            app.run(
                debug=False,
                port=port,
                use_reloader=False,
                threaded=True,
                host='127.0.0.1',
                use_debugger=False,
                use_evalex=False,
                passthrough_errors=False,
            )
        else:
            log_checkpoint("DEVELOPMENT_MODE", "Running in development mode")
            
            # Development mode
            app.run(
                debug=True,
                port=port,
                use_reloader=False,  # Disable reloader for profiling
            )
            
    except Exception as e:
        log_error("Flask server startup failed", e)
        raise

if __name__ == '__main__':
    try:
        log_checkpoint("MAIN_EXECUTION_START", "Main execution started")
        
        # Setup signal handlers first
        setup_signal_handlers()
        
        # Find available port
        port = find_available_port()
        
        # Create Flask app (this is likely where the delay occurs)
        app = create_flask_app()
        
        # Setup browser opener
        open_browser = setup_browser_opener(port)
        
        # Determine execution mode
        is_executable = hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS')
        
        log_checkpoint("READY_TO_START", f"TruckOpti Enterprise v{APP_VERSION} ready to start", {
            'port': port,
            'executable_mode': is_executable,
            'total_startup_time': time.time() - startup_profiler.start_time
        })
        
        print(f"\n{'='*60}")
        print(f"TruckOpti Enterprise Full Debug v{APP_VERSION}")
        print(f"Starting on http://127.0.0.1:{port}/")
        print(f"Startup Time: {time.time() - startup_profiler.start_time:.3f} seconds")
        print(f"Mode: {'Executable' if is_executable else 'Development'}")
        print(f"{'='*60}\n")
        
        # Start browser after minimal delay
        Timer(0.1, open_browser).start()
        
        # Start Flask server
        run_flask_app(app, port)
        
    except KeyboardInterrupt:
        log_checkpoint("USER_INTERRUPT", "Application interrupted by user")
        print("Application interrupted by user")
    except Exception as e:
        log_error("Critical startup error", e)
        print(f"Critical error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        log_checkpoint("APPLICATION_SHUTDOWN", "Application shutdown")
        startup_profiler.print_summary()
        startup_profiler.generate_performance_report()
        print("TruckOpti Enterprise shutting down...")