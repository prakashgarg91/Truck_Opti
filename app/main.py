#!/usr/bin/env python3
"""
TruckOpti Enterprise - Main Application Entry Point

This file serves as the main entry point for the TruckOpti Enterprise application.
Run this to start the web interface.
"""

import os
import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import the Flask app factory
from app import create_app

def main():
    """Main entry point for the application."""
    try:
        print("🚀 Starting TruckOpti Enterprise...")
        print("📦 Loading application components...")
        
        # Create the Flask application
        app = create_app()
        
        # Configuration
        host = os.environ.get('HOST', '0.0.0.0')
        port = int(os.environ.get('PORT', 5000))
        debug = os.environ.get('DEBUG', 'False').lower() in ('true', '1', 'yes', 'on')
        
        print("🌐 Web interface starting...")
        print(f"📍 URL: http://{host}:{port}")
        print("🛑 Press Ctrl+C to stop the server")
        print("-" * 50)
        
        # Start the Flask development server
        app.run(
            host=host,
            port=port,
            debug=debug,
            threaded=True,
            use_reloader=False  # Disable reloader to prevent double execution
        )
        
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Error starting application: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()