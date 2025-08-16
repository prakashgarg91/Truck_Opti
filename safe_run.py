import sys
import os
import traceback
import sqlite3

def safe_main():
    try:
        from app import create_app, db
        from app.config.settings import Config
        
        # Detailed path debugging
        app_data_dir = Config.get_app_data_directory()
        db_path = os.path.join(app_data_dir, 'truck_opti.db')
        
        print("Python version:", sys.version)
        print("System platform:", sys.platform)
        print("Current working directory:", os.getcwd())
        print("App Data Directory:", app_data_dir)
        print("Database Path:", db_path)
        
        # Ensure directory exists
        os.makedirs(app_data_dir, exist_ok=True)
        
        # Manually create database if needed
        try:
            conn = sqlite3.connect(db_path)
            conn.execute('''CREATE TABLE IF NOT EXISTS alembic_version 
                            (version_num VARCHAR(32) NOT NULL)''')
            conn.close()
            print("SQLite database initialized successfully")
        except Exception as sqlite_err:
            print(f"SQLite initialization error: {sqlite_err}")
            raise
        
        # Set database URI to absolute path
        from flask import Flask
        from flask_sqlalchemy import SQLAlchemy
        
        app = Flask(__name__)
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        
        db = SQLAlchemy(app)
        
        # Create tables
        with app.app_context():
            try:
                db.create_all()
                print("Database tables created successfully")
            except Exception as db_error:
                print(f"Database table creation error: {db_error}")
                print(traceback.format_exc())
        
        return app
    except Exception as e:
        print(f"Fatal error during application initialization: {e}")
        print(traceback.format_exc())
        sys.exit(1)

if __name__ == '__main__':
    app = safe_main()
    
    # Optional: Run server if needed
    try:
        app.run(debug=True, port=5000)
    except Exception as e:
        print(f"Server startup error: {e}")
        print(traceback.format_exc())