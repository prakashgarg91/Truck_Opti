"""
Ultra Minimal Runner - Sub-5 second startup target
Bypasses ALL heavy imports that cause 20+ second delays
"""

import time
import webbrowser
import socket
import sys
import os

print("TruckOpti Ultra Minimal - Starting...")
start_time = time.time()

# Ultra simple Flask app
from flask import Flask, render_template, jsonify

def create_minimal_app():
    app = Flask(__name__)
    
    # Minimal config
    app.config['SECRET_KEY'] = 'minimal'
    
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/recommend-truck')
    def recommend_truck():
        return render_template('recommend_truck.html')
    
    @app.route('/api/health')
    def health():
        return jsonify({'status': 'minimal', 'startup_time': time.time() - start_time})
    
    return app

def find_port():
    for port in range(5000, 5010):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    return 5000

if __name__ == '__main__':
    try:
        port = find_port()
        app = create_minimal_app()
        
        startup_time = time.time() - start_time
        print(f"Startup completed in {startup_time:.2f} seconds")
        print(f"Opening browser to http://127.0.0.1:{port}/")
        
        # Open browser quickly
        def open_browser():
            time.sleep(0.5)
            webbrowser.open(f"http://127.0.0.1:{port}/")
        
        import threading
        threading.Thread(target=open_browser, daemon=True).start()
        
        # Start minimal Flask
        app.run(debug=False, port=port, host='127.0.0.1', use_reloader=False)
        
    except Exception as e:
        print(f"Error: {e}")
        input("Press Enter to exit...")