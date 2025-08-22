"""
Minimal Debug Runner - Target the 1.588s app import bottleneck
"""

from startup_profiler import startup_profiler, log_checkpoint, log_import_time, timed_operation
import time

log_checkpoint("PYTHON_STARTED", "Python interpreter started")

# Profile each import to find the 1.5s bottleneck
import_start = time.time()
import webbrowser, socket, signal, sys, os, atexit
log_import_time("standard_libs", time.time() - import_start)

import_start = time.time()
from threading import Timer
log_import_time("threading", time.time() - import_start)

# This is where the 1.588s delay happens - let's profile it step by step
log_checkpoint("IMPORTING_APP", "Starting app import - BOTTLENECK ANALYSIS")

import_start = time.time()
try:
    # Use minimal app instead of full app
    from app_minimal import create_app
    log_import_time("app_minimal.create_app", time.time() - import_start)
    log_checkpoint("APP_IMPORTED", "Minimal app imported successfully")
except Exception as e:
    startup_profiler.log_error("Failed to import minimal app", e)
    # Fallback to original app
    log_checkpoint("FALLBACK_TO_ORIGINAL", "Trying original app")
    import_start = time.time()
    from app import create_app
    log_import_time("app.create_app_FALLBACK", time.time() - import_start)

def find_available_port(start_port=5000):
    with timed_operation("port_discovery"):
        for port in range(start_port, start_port + 10):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('127.0.0.1', port))
                    return port
            except OSError:
                continue
        return start_port

if __name__ == '__main__':
    try:
        log_checkpoint("MAIN_START", "Main execution started")
        
        # Signal handlers
        def signal_handler(sig, frame):
            startup_profiler.print_summary()
            startup_profiler.generate_performance_report()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        if sys.platform == "win32":
            signal.signal(signal.SIGBREAK, signal_handler)
        
        # Find port
        port = find_available_port()
        
        # Create app with detailed timing
        log_checkpoint("CREATING_APP", "Creating Flask app")
        with timed_operation("app_creation"):
            app = create_app()
        
        # Browser setup
        def open_browser():
            try:
                time.sleep(0.1)
                webbrowser.open_new(f"http://127.0.0.1:{port}/")
                log_checkpoint("BROWSER_OPENED", f"Browser opened to port {port}")
            except Exception as e:
                startup_profiler.log_error("Browser failed", e)
        
        total_startup = time.time() - startup_profiler.start_time
        
        print(f"\n{'='*60}")
        print(f"TruckOpti Minimal Debug v3.7.5")
        print(f"Port: {port}")
        print(f"Startup Time: {total_startup:.3f} seconds")
        print(f"Improvement: {2.082 - total_startup:.3f} seconds faster")
        print(f"{'='*60}\n")
        
        log_checkpoint("READY_TO_START", f"Ready to start after {total_startup:.3f}s")
        
        Timer(0.1, open_browser).start()
        
        log_checkpoint("STARTING_SERVER", "Starting Flask server")
        app.run(debug=False, port=port, use_reloader=False, threaded=True, host='127.0.0.1')
        
    except Exception as e:
        startup_profiler.log_error("Critical error", e)
        print(f"Error: {e}")
    finally:
        startup_profiler.print_summary()
        startup_profiler.generate_performance_report()