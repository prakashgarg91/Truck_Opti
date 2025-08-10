#!/usr/bin/env python3
"""
Show the actual database path used by Flask app
"""
import sys
import os
sys.path.append('/workspaces/Truck_Opti')

from app import create_app

def show_db_path():
    """Show the database path"""
    app = create_app()
    
    with app.app_context():
        db_uri = app.config['SQLALCHEMY_DATABASE_URI']
        print(f"Database URI: {db_uri}")
        
        # Extract the actual file path
        if 'sqlite:///' in db_uri:
            db_path = db_uri.replace('sqlite:///', '')
            print(f"Database file path: {db_path}")
            
            # Check if file exists
            if os.path.exists(db_path):
                print(f"✅ Database file exists")
                print(f"📊 File size: {os.path.getsize(db_path)} bytes")
            else:
                print(f"❌ Database file does not exist")
                
            return db_path
    
    return None

if __name__ == "__main__":
    show_db_path()