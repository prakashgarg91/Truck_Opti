#!/usr/bin/env python3
"""
Test script to verify fleet optimization functionality works independently
This tests our fixed frontend form submission without the broken routes.py
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, render_template, redirect, url_for
from app import create_app, db
from app.models import TruckType, CartonType

app = create_app()

@app.route('/test-fleet-optimization', methods=['GET', 'POST'])
def test_fleet_optimization():
    """Test route for fleet optimization with our fixes"""
    trucks = TruckType.query.all()
    cartons = CartonType.query.all()
    fit_results = None
    additional_recommendations = None
    
    if request.method == 'POST':
        print("=== FLEET OPTIMIZATION TEST ===")
        print("Form data received:")
        for key, value in request.form.items():
            print(f"  {key}: {value}")
        
        # Test our new field format
        truck_quantities = {}
        for truck in trucks:
            qty = request.form.get(f'truck_{truck.id}', 0)
            if qty and int(qty) > 0:
                truck_quantities[truck] = int(qty)
                print(f"Found truck: {truck.name} with quantity: {qty}")
        
        carton_quantities = {}
        i = 1
        while True:
            carton_type_id = request.form.get(f'carton_type_{i}')
            qty = request.form.get(f'carton_qty_{i}')
            if not carton_type_id or not qty:
                break
            carton_type = CartonType.query.get(int(carton_type_id))
            if carton_type and int(qty) > 0:
                carton_quantities[carton_type] = int(qty)
                print(f"Found carton: {carton_type.name} with quantity: {qty}")
            i += 1
        
        print(f"Total trucks configured: {len(truck_quantities)}")
        print(f"Total carton types: {len(carton_quantities)}")
        
        if truck_quantities and carton_quantities:
            try:
                from app import packer
                fit_results = packer.pack_cartons(truck_quantities, carton_quantities, 'space')
                print("✅ Fleet optimization completed successfully!")
                print(f"Results: {len(fit_results) if fit_results else 0} packing results generated")
            except Exception as e:
                print(f"❌ Error during packing: {str(e)}")
                import traceback
                traceback.print_exc()
        else:
            print("❌ Missing truck or carton data")
    
    return render_template('fleet_optimization.html', 
                         trucks=trucks, 
                         cartons=cartons, 
                         fit_results=fit_results,
                         additional_recommendations=additional_recommendations)

if __name__ == '__main__':
    with app.app_context():
        print("Starting Fleet Optimization Test Server...")
        print("Access test at: http://localhost:5001/test-fleet-optimization")
        app.run(debug=True, port=5001)