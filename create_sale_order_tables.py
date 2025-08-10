#!/usr/bin/env python3
"""
Create sale order tables specifically
"""
import sys
import os
sys.path.append('/workspaces/Truck_Opti')

from app import create_app, db

def create_tables():
    """Create all database tables"""
    app = create_app()
    
    with app.app_context():
        try:
            # Import all models to ensure they're registered
            from app.models import (
                TruckType, CartonType, PackingJob, PackingResult, 
                SaleOrder, SaleOrderItem, SaleOrderBatch, TruckRecommendation, 
                Shipment
            )
            
            print("📋 Registered models:")
            for table_name in db.metadata.tables.keys():
                print(f"   - {table_name}")
            
            # Create all tables
            db.create_all()
            print("✅ All tables created successfully!")
            
            # Show tables in database
            result = db.engine.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row[0] for row in result.fetchall()]
            print(f"\n📊 Tables in database: {', '.join(tables)}")
            
        except Exception as e:
            print(f"❌ Error creating tables: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    create_tables()