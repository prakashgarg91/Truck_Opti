import webbrowser
import socket
import signal
import sys
import os
import atexit
from threading import Timer
from app_instant import create_app

# Optimized version for instant startup
APP_VERSION = "3.7.3"

def find_available_port(start_port=5000):
    """Find available port quickly"""
    port = start_port
    while port < start_port + 10:  # Limit search range for speed
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1
    return start_port  # Fallback

# Create app instance immediately
app = create_app()
port = find_available_port()

browser_opened = False

def open_browser():
    """Open browser with minimal delay"""
    global browser_opened
    if not browser_opened:
        try:
            # Reduced wait time for faster startup
            import time
            time.sleep(0.5)  # Reduced from 2 seconds
            webbrowser.open_new(f"http://127.0.0.1:{port}/")
            browser_opened = True
            print(f"TruckOpti opened at http://127.0.0.1:{port}/")
        except Exception as e:
            print(f"Browser auto-open failed: {e}")

def signal_handler(sig, frame):
    """Quick shutdown handler"""
    sys.exit(0)

def cleanup():
    """Minimal cleanup"""
    pass

# Minimal signal handling for speed
signal.signal(signal.SIGINT, signal_handler)
if sys.platform == "win32":
    signal.signal(signal.SIGBREAK, signal_handler)

atexit.register(cleanup)

if __name__ == '__main__':
    # Determine execution mode
    is_executable = hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS')
    
    if is_executable:
        # INSTANT PRODUCTION MODE - Minimal overhead
        print(f"TruckOpti Enterprise v{APP_VERSION} - Starting...")
        
        # Start browser immediately in background
        Timer(0.1, open_browser).start()
        
        # Start Flask with maximum performance settings
        app.run(
            debug=False,
            port=port,
            use_reloader=False,
            threaded=True,
            host='127.0.0.1',
            use_debugger=False,  # Explicitly disable debugger
            use_evalex=False,    # Disable interactive debugger
            passthrough_errors=False,  # Don't propagate errors for speed
        )
    else:
        # Development mode with minimal delay
        print(f"TruckOpti Development v{APP_VERSION}")
        Timer(0.1, open_browser).start()
        app.run(debug=True, port=port)