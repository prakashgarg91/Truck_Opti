from py3dbp import Packer, Bin, Item
import json

# Common Indian Truck Types
INDIAN_TRUCKS = [
    # City/LCV
    {"name": "Tata Ace (Chhota Hathi)", "length": 220, "width": 150, "height": 120, "max_weight": 750},
    {"name": "Mahindra Jeeto", "length": 225, "width": 150, "height": 120, "max_weight": 700},
    {"name": "Ashok Leyland Dost", "length": 250, "width": 160, "height": 120, "max_weight": 1250},
    # MCV
    {"name": "Eicher 14 ft", "length": 430, "width": 200, "height": 190, "max_weight": 10000},
    {"name": "Tata 14 ft", "length": 430, "width": 200, "height": 190, "max_weight": 10000},
    {"name": "Ashok Leyland 17 ft", "length": 515, "width": 208, "height": 215, "max_weight": 12000},
    {"name": "Eicher 17 ft", "length": 515, "width": 208, "height": 215, "max_weight": 12000},
    {"name": "BharatBenz 19 ft", "length": 575, "width": 208, "height": 215, "max_weight": 14000},
    {"name": "Tata 19 ft", "length": 575, "width": 208, "height": 215, "max_weight": 14000},
    {"name": "Ashok Leyland 20 ft", "length": 600, "width": 230, "height": 230, "max_weight": 16000},
    # HCV/Long Haul
    {"name": "Eicher 32 ft XL", "length": 960, "width": 240, "height": 240, "max_weight": 25000},
    {"name": "Tata 32 ft XL", "length": 960, "width": 240, "height": 240, "max_weight": 25000},
    {"name": "Ashok Leyland 32 ft XL", "length": 960, "width": 240, "height": 240, "max_weight": 25000},
    {"name": "BharatBenz 32 ft XL", "length": 960, "width": 240, "height": 240, "max_weight": 25000},
    # Container/Closed Body
    {"name": "Tata 20 ft Container", "length": 600, "width": 230, "height": 230, "max_weight": 16000},
    {"name": "Eicher 20 ft Container", "length": 600, "width": 230, "height": 230, "max_weight": 16000},
    # Refrigerated/White Goods
    {"name": "Eicher Reefer 20 ft", "length": 600, "width": 230, "height": 230, "max_weight": 16000},
    # Add more as needed
]

# Sample Indian Carton Types
INDIAN_CARTONS = [
    # Electronics
    {"type": "LED TV 32", "length": 80, "width": 15, "height": 55, "weight": 10, "qty": 100},
    {"type": "LED TV 43", "length": 105, "width": 18, "height": 65, "weight": 15, "qty": 80},
    {"type": "LED TV 55", "length": 135, "width": 20, "height": 85, "weight": 22, "qty": 40},
    {"type": "Microwave", "length": 55, "width": 45, "height": 35, "weight": 12, "qty": 60},
    {"type": "AC Split Indoor", "length": 95, "width": 30, "height": 35, "weight": 18, "qty": 50},
    {"type": "AC Split Outdoor", "length": 85, "width": 40, "height": 55, "weight": 28, "qty": 50},
    # White Goods
    {"type": "Washing Machine Front Load", "length": 65, "width": 65, "height": 90, "weight": 60, "qty": 30},
    {"type": "Washing Machine Top Load", "length": 60, "width": 60, "height": 95, "weight": 55, "qty": 30},
    {"type": "Refrigerator Single Door", "length": 60, "width": 65, "height": 130, "weight": 45, "qty": 20},
    {"type": "Refrigerator Double Door", "length": 70, "width": 75, "height": 175, "weight": 70, "qty": 20},
    {"type": "Refrigerator Side by Side", "length": 90, "width": 80, "height": 180, "weight": 95, "qty": 10},
    # Small Appliances
    {"type": "Mixer Grinder", "length": 35, "width": 25, "height": 30, "weight": 5, "qty": 100},
    {"type": "Toaster", "length": 30, "width": 20, "height": 20, "weight": 3, "qty": 100},
    {"type": "Iron", "length": 30, "width": 15, "height": 15, "weight": 2, "qty": 100},
    # General Cartons
    {"type": "A", "length": 60, "width": 40, "height": 40, "weight": 5, "qty": 240},
    {"type": "B", "length": 50, "width": 50, "height": 45, "weight": 6, "qty": 160},
    {"type": "C", "length": 70, "width": 60, "height": 50, "weight": 8, "qty": 80},
    {"type": "D", "length": 30, "width": 30, "height": 30, "weight": 2, "qty": 40},
    {"type": "E", "length": 90, "width": 70, "height": 50, "weight": 10, "qty": 50}
]

def pack_cartons(truck_types_with_quantities, carton_types_with_quantities, optimization_goal='space'):
    """
    Enhanced 3D packing algorithm for TruckOpti.
    - Handles multiple truck types and quantities.
    - Supports optimization_goal: 'space', 'cost', 'weight', 'min_trucks'
    """
    def create_bin(truck_type, idx=0):
        return Bin(
            f"{truck_type.name}_{idx}",
            truck_type.length,
            truck_type.width,
            truck_type.height,
            truck_type.max_weight if truck_type.max_weight else float('inf')
        )

    items = []
    for carton_type, quantity in carton_types_with_quantities.items():
        for _ in range(quantity):
            item = Item(
                carton_type.name,
                carton_type.length,
                carton_type.width,
                carton_type.height,
                carton_type.weight if carton_type.weight else 0
            )
            item.fragile = getattr(carton_type, 'fragile', False)
            item.stackable = getattr(carton_type, 'stackable', True)
            item.max_stack_height = getattr(carton_type, 'max_stack_height', 5)
            item.value = getattr(carton_type, 'value', 0)
            item.priority = getattr(carton_type, 'priority', 1)
            item.can_rotate = getattr(carton_type, 'can_rotate', True)
            items.append(item)

    if optimization_goal == 'space':
        items.sort(key=lambda x: (not x.stackable, -x.priority, -x.value))
    elif optimization_goal == 'weight':
        items.sort(key=lambda x: x.weight, reverse=True)
    elif optimization_goal == 'cost':
        items.sort(key=lambda x: x.value, reverse=True)
    else: # min_trucks or default
        items.sort(key=lambda x: (-x.priority, -x.value, -x.weight))

    results = []
    remaining_items = items.copy()
    
    available_trucks = []
    for truck_type, quantity in truck_types_with_quantities.items():
        for i in range(quantity):
            # Pass the full truck_type object to be able to access its attributes later
            bin_instance = create_bin(truck_type, i)
            bin_instance.truck_type = truck_type
            available_trucks.append(bin_instance)

    for truck_bin in available_trucks:
        if not remaining_items:
            break

        packer = Packer()
        packer.add_bin(truck_bin)
        
        for item in remaining_items:
            packer.add_item(item)
            
        packer.pack()

        packed_items_details = []
        for item in truck_bin.items:
            packed_items_details.append({
                'name': item.name,
                'position': item.position,
                'rotation_type': item.rotation_type,
                'width': float(item.width),
                'height': float(item.height),
                'depth': float(item.depth),
                'color': '#%06x' % (hash(item.name) & 0xFFFFFF),
            })
        
        total_weight = sum(item.weight for item in truck_bin.items)
        weight_utilization = total_weight / truck_bin.max_weight if truck_bin.max_weight > 0 else 0
        
        unfitted_items_details = [{'name': item.name} for item in truck_bin.unfitted_items]

        # Enhanced Cost Calculation
        truck_type = truck_bin.truck_type
        # Assuming a fixed distance for now, this can be an input later
        distance_km = 100
        fuel_cost = (distance_km / truck_type.fuel_efficiency) * 100 if truck_type.fuel_efficiency > 0 else 0 # Assuming fuel price of 100
        maintenance_cost = distance_km * truck_type.maintenance_cost_per_km
        driver_cost = truck_type.driver_cost_per_day # Assuming a single day trip
        truck_cost = fuel_cost + maintenance_cost + driver_cost + (truck_type.cost_per_km * distance_km)
        total_carton_value = sum(item.value for item in truck_bin.items)
        total_cost = truck_cost + total_carton_value

        results.append({
            'bin_name': truck_bin.name,
            'fitted_items': packed_items_details,
            'unfitted_items': unfitted_items_details,
            'utilization': float(weight_utilization),
            'total_cost': float(total_cost),
            'truck_cost': float(truck_cost),
            'carton_value': float(total_carton_value)
        })
        
        remaining_items = truck_bin.unfitted_items

    return results