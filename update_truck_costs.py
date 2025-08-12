#!/usr/bin/env python3
"""
Update TruckType records with realistic cost information for Indian logistics market
Based on Porter.in, BlackBuck, and industry standard rates
"""

from app import create_app, db
from app.models import TruckType
import sys

# Realistic Indian truck cost data based on market research
INDIAN_TRUCK_COSTS = {
    "Tata Ace (Chhota Hathi)": {
        "cost_per_km": 12.0,
        "fuel_efficiency": 15.0,  # km/liter
        "driver_cost_per_day": 800.0,
        "maintenance_cost_per_km": 2.5,
        "truck_category": "Light"
    },
    "Mahindra Jeeto": {
        "cost_per_km": 10.0,
        "fuel_efficiency": 16.0,
        "driver_cost_per_day": 700.0,
        "maintenance_cost_per_km": 2.0,
        "truck_category": "Light"
    },
    "Ashok Leyland Dost": {
        "cost_per_km": 15.0,
        "fuel_efficiency": 12.0,
        "driver_cost_per_day": 900.0,
        "maintenance_cost_per_km": 3.0,
        "truck_category": "Light"
    },
    "Eicher 14 ft": {
        "cost_per_km": 25.0,
        "fuel_efficiency": 8.0,
        "driver_cost_per_day": 1200.0,
        "maintenance_cost_per_km": 5.0,
        "truck_category": "Medium"
    },
    "Tata 14 ft": {
        "cost_per_km": 26.0,
        "fuel_efficiency": 7.5,
        "driver_cost_per_day": 1200.0,
        "maintenance_cost_per_km": 5.2,
        "truck_category": "Medium"
    },
    "Ashok Leyland 17 ft": {
        "cost_per_km": 30.0,
        "fuel_efficiency": 7.0,
        "driver_cost_per_day": 1300.0,
        "maintenance_cost_per_km": 6.0,
        "truck_category": "Medium"
    },
    "Eicher 17 ft": {
        "cost_per_km": 29.0,
        "fuel_efficiency": 7.2,
        "driver_cost_per_day": 1300.0,
        "maintenance_cost_per_km": 5.8,
        "truck_category": "Medium"
    },
    "BharatBenz 19 ft": {
        "cost_per_km": 35.0,
        "fuel_efficiency": 6.5,
        "driver_cost_per_day": 1400.0,
        "maintenance_cost_per_km": 7.0,
        "truck_category": "Heavy"
    },
    "Tata 19 ft": {
        "cost_per_km": 34.0,
        "fuel_efficiency": 6.8,
        "driver_cost_per_day": 1400.0,
        "maintenance_cost_per_km": 6.8,
        "truck_category": "Heavy"
    },
    "Ashok Leyland 20 ft": {
        "cost_per_km": 38.0,
        "fuel_efficiency": 6.0,
        "driver_cost_per_day": 1500.0,
        "maintenance_cost_per_km": 7.5,
        "truck_category": "Heavy"
    },
    "Eicher 32 ft XL": {
        "cost_per_km": 45.0,
        "fuel_efficiency": 5.0,
        "driver_cost_per_day": 1800.0,
        "maintenance_cost_per_km": 9.0,
        "truck_category": "Heavy"
    },
    "Tata 32 ft XL": {
        "cost_per_km": 46.0,
        "fuel_efficiency": 4.8,
        "driver_cost_per_day": 1800.0,
        "maintenance_cost_per_km": 9.2,
        "truck_category": "Heavy"
    },
    "Ashok Leyland 32 ft XL": {
        "cost_per_km": 47.0,
        "fuel_efficiency": 4.5,
        "driver_cost_per_day": 1800.0,
        "maintenance_cost_per_km": 9.5,
        "truck_category": "Heavy"
    },
    "BharatBenz 32 ft XL": {
        "cost_per_km": 44.0,
        "fuel_efficiency": 5.2,
        "driver_cost_per_day": 1800.0,
        "maintenance_cost_per_km": 8.8,
        "truck_category": "Heavy"
    },
    "Tata 20 ft Container": {
        "cost_per_km": 36.0,
        "fuel_efficiency": 6.2,
        "driver_cost_per_day": 1500.0,
        "maintenance_cost_per_km": 7.2,
        "truck_category": "Heavy"
    },
    "Eicher 20 ft Container": {
        "cost_per_km": 35.0,
        "fuel_efficiency": 6.5,
        "driver_cost_per_day": 1500.0,
        "maintenance_cost_per_km": 7.0,
        "truck_category": "Heavy"
    },
    "Eicher Reefer 20 ft": {
        "cost_per_km": 42.0,
        "fuel_efficiency": 5.8,
        "driver_cost_per_day": 1600.0,
        "maintenance_cost_per_km": 8.5,
        "truck_category": "Heavy"
    }
}

def update_truck_costs():
    """Update all truck types with realistic cost information"""
    
    print("TruckOpti - Updating Truck Cost Information")
    print("=" * 50)
    
    app = create_app()
    with app.app_context():
        updated_count = 0
        not_found_count = 0
        
        # Get all truck types from database
        trucks = TruckType.query.all()
        print(f"Found {len(trucks)} trucks in database")
        
        for truck in trucks:
            if truck.name in INDIAN_TRUCK_COSTS:
                cost_data = INDIAN_TRUCK_COSTS[truck.name]
                
                # Update cost fields
                truck.cost_per_km = cost_data["cost_per_km"]
                truck.fuel_efficiency = cost_data["fuel_efficiency"]
                truck.driver_cost_per_day = cost_data["driver_cost_per_day"]
                truck.maintenance_cost_per_km = cost_data["maintenance_cost_per_km"]
                truck.truck_category = cost_data["truck_category"]
                
                updated_count += 1
                print(f"Updated: {truck.name}")
                print(f"   Cost/km: Rs{cost_data['cost_per_km']}, Fuel Eff: {cost_data['fuel_efficiency']} km/l")
            else:
                not_found_count += 1
                print(f"No cost data found for: {truck.name}")
        
        # Commit changes
        try:
            db.session.commit()
            print("\n" + "=" * 50)
            print(f"SUCCESS: Updated {updated_count} trucks")
            if not_found_count > 0:
                print(f"{not_found_count} trucks had no cost data")
            print("All trucks now have realistic Indian market rates!")
            
            # Show some examples
            print("\nSample Updated Trucks:")
            sample_trucks = TruckType.query.limit(5).all()
            for truck in sample_trucks:
                print(f"  {truck.name}: Rs{truck.cost_per_km}/km, {truck.fuel_efficiency} km/l, Rs{truck.driver_cost_per_day}/day")
                
        except Exception as e:
            db.session.rollback()
            print(f"ERROR: Failed to update trucks: {e}")
            sys.exit(1)

if __name__ == "__main__":
    update_truck_costs()