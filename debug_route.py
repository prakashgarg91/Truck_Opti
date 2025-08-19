#!/usr/bin/env python
"""
Debug version of the recommendation route to find the issue
"""

from flask import request, render_template
from app.models import CartonType, TruckType

def debug_recommend_truck():
    """
    Minimal debug version of recommend_truck route
    """
    print("[DEBUG] Route called")
    
    try:
        cartons = CartonType.query.all()
        trucks = TruckType.query.all()
        print(f"[DEBUG] Found {len(cartons)} cartons, {len(trucks)} trucks")
        
        if request.method == 'POST':
            print("[DEBUG] POST request received")
            
            # Get form data
            carton_type_id = request.form.get('carton_type_1')
            qty = request.form.get('carton_qty_1')
            optimization_goal = request.form.get('optimization_goal', 'balanced')
            
            print(f"[DEBUG] Form data: carton_type_id={carton_type_id}, qty={qty}, goal={optimization_goal}")
            
            if carton_type_id and qty:
                # Get carton type
                carton_type = CartonType.query.get(int(carton_type_id))
                print(f"[DEBUG] Carton type: {carton_type.name if carton_type else 'None'}")
                
                if carton_type:
                    # Calculate basic metrics
                    qty = int(qty)
                    carton_volume = carton_type.length * carton_type.width * carton_type.height / 1000000
                    total_volume = carton_volume * qty
                    
                    print(f"[DEBUG] Calculated volume: {total_volume:.2f} m³")
                    
                    # Simple recommendations - just return top 3 trucks
                    recommended = []
                    
                    for i, truck in enumerate(trucks[:3]):
                        truck_volume = truck.length * truck.width * truck.height / 1000000
                        utilization = total_volume / truck_volume if truck_volume > 0 else 0
                        
                        recommended.append({
                            'truck_type': truck.name,
                            'truck_dimensions': f"{truck.length}×{truck.width}×{truck.height} cm",
                            'quantity_needed': 1,
                            'utilization': min(utilization, 1.0),
                            'total_cost': 5000 + i * 1000,  # Simple cost estimate
                            'cost_per_item': (5000 + i * 1000) / qty,
                            'confidence': 0.8 + i * 0.05,
                            'recommendation_reason': f"Simple test recommendation #{i+1}",
                            'bin_name': truck.name,
                            'fitted_items': [],
                            'unfitted_items': [],
                            'bin_width': truck.width,
                            'bin_length': truck.length,
                            'bin_height': truck.height,
                            'efficiency_score': utilization
                        })
                    
                    print(f"[DEBUG] Generated {len(recommended)} recommendations")
                    
                    return render_template(
                        'recommend_truck.html',
                        cartons=cartons,
                        trucks=trucks,
                        recommended=recommended,
                        total_items=qty,
                        total_vol=total_volume,
                        original_requirements=[{
                            'name': carton_type.name,
                            'length': carton_type.length,
                            'width': carton_type.width,
                            'height': carton_type.height,
                            'quantity': qty
                        }],
                        optimization_strategy=optimization_goal
                    )
            
            print("[DEBUG] Invalid form data, showing form")
        
        print("[DEBUG] Showing GET form")
        return render_template('recommend_truck.html', cartons=cartons, trucks=trucks)
        
    except Exception as e:
        print(f"[ERROR] Exception in debug route: {e}")
        import traceback
        traceback.print_exc()
        return f"Error: {e}", 500

# Test the function
if __name__ == "__main__":
    print("Debug route function created")
    print("Use this to replace the existing route temporarily")