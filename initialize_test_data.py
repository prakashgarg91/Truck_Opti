#!/usr/bin/env python3
"""
Initialize TruckOpti database with sample test data
"""

import sys
import os
sys.path.append('/workspaces/Truck_Opti')

from app import create_app, db
from app.models import TruckType, CartonType, SaleOrder, SaleOrderItem, SaleOrderBatch, TruckRecommendation
from app.packer import INDIAN_TRUCKS, INDIAN_CARTONS

def initialize_database():
    """Initialize database with sample truck and carton data"""
    app = create_app()
    
    with app.app_context():
        try:
            # Create tables
            db.create_all()
            print("✅ Database tables created")
            
            # Clear existing data
            TruckType.query.delete()
            CartonType.query.delete()
            db.session.commit()
            print("✅ Existing data cleared")
            
            # Add truck types
            print("Adding truck types...")
            truck_count = 0
            for truck_data in INDIAN_TRUCKS:
                truck = TruckType(
                    name=truck_data['name'],
                    length=truck_data['length'],
                    width=truck_data['width'], 
                    height=truck_data['height'],
                    max_weight=truck_data['max_weight'],
                    cost_per_km=15.0,  # Rs per km
                    fuel_efficiency=6.0,  # km per liter
                    driver_cost_per_day=500.0,  # Rs per day
                    maintenance_cost_per_km=2.0,  # Rs per km
                    truck_category='Standard',
                    availability=True,
                    description=f"Indian truck - {truck_data['name']}"
                )
                db.session.add(truck)
                truck_count += 1
            
            print(f"✅ Added {truck_count} truck types")
            
            # Add carton types  
            print("Adding carton types...")
            carton_count = 0
            for carton_data in INDIAN_CARTONS:
                carton = CartonType(
                    name=carton_data['type'],
                    length=carton_data['length'],
                    width=carton_data['width'],
                    height=carton_data['height'], 
                    weight=carton_data['weight'],
                    can_rotate=True,
                    fragile=False,
                    stackable=True,
                    max_stack_height=5,
                    priority=1,
                    value=100.0,  # Default value
                    category='Electronics' if 'TV' in carton_data['type'] or 'AC' in carton_data['type'] else 'General',
                    description=f"Carton type - {carton_data['type']}"
                )
                db.session.add(carton)
                carton_count += 1
            
            print(f"✅ Added {carton_count} carton types")
            
            # Commit all changes
            db.session.commit()
            print("✅ Database initialization complete!")
            
            # Verify data
            truck_count_db = TruckType.query.count()
            carton_count_db = CartonType.query.count()
            print(f"📊 Database now contains:")
            print(f"   - {truck_count_db} truck types")
            print(f"   - {carton_count_db} carton types")
            
            return True
            
        except Exception as e:
            print(f"❌ Database initialization failed: {e}")
            db.session.rollback()
            return False

if __name__ == "__main__":
    print("TruckOpti Database Initialization")
    print("=" * 40)
    
    if initialize_database():
        print("\n✅ SUCCESS: Database ready for testing!")
    else:
        print("\n❌ FAILED: Database initialization failed!")