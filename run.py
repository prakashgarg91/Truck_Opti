import webbrowser
import socket
import signal
import sys
import os
import atexit
import time
from threading import Timer
from app import create_app

def find_available_port(start_port=5000):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1

app = create_app()
port = find_available_port()

browser_opened = False

def open_browser():
    global browser_opened
    if not browser_opened:
        try:
            # Wait for server to be ready
            time.sleep(2)
            # Check if port is actually serving before opening browser
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                if s.connect_ex(('127.0.0.1', port)) == 0:
                    webbrowser.open_new(f"http://127.0.0.1:{port}/")
                    browser_opened = True
                    print(f"Browser opened to http://127.0.0.1:{port}/")
                else:
                    print(f"Server not ready yet on port {port}")
        except Exception as e:
            print(f"Failed to open browser: {e}")

def signal_handler(sig, frame):
    """Handle shutdown signals to properly close the application"""
    print(f"Received signal {sig}, shutting down gracefully...")
    sys.exit(0)

def cleanup():
    """Cleanup function called on exit"""
    print("TruckOpti shutting down...")

# Register signal handlers for graceful shutdown
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)
if sys.platform == "win32":
    signal.signal(signal.SIGBREAK, signal_handler)

# Register cleanup function
atexit.register(cleanup)

if __name__ == '__main__':
    # Determine if we're running as executable or development
    is_executable = hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS')
    
    if is_executable:
        # Production mode for executable
        print(f"TruckOpti Enterprise starting on http://127.0.0.1:{port}/")
        Timer(1, open_browser).start()
        
        try:
            app.run(
                debug=False,           # CRITICAL: No debug mode in production
                port=port,
                use_reloader=False,    # No reloader in production
                threaded=True,         # Enable threading for better performance
                host='127.0.0.1'       # Only localhost access
            )
        except KeyboardInterrupt:
            print("Application interrupted by user")
        except Exception as e:
            print(f"Application error: {e}")
        finally:
            print("TruckOpti Enterprise shutting down...")
            sys.exit(0)
    else:
        # Development mode
        print(f"TruckOpti Development starting on http://127.0.0.1:{port}/")
        Timer(1, open_browser).start()
        app.run(debug=True, port=port)