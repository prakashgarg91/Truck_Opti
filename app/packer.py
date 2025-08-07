from py3dbp import Packer, Bin, Item
import json
import time
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from typing import List, Dict, Tuple, Optional

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

@lru_cache(maxsize=128)
def _calculate_item_sort_key(name: str, weight: float, value: float, priority: int, fragile: bool, stackable: bool, optimization_goal: str) -> Tuple:
    """Cached function to calculate sorting key for items"""
    if optimization_goal == 'space':
        return (not stackable, -priority, -value)
    elif optimization_goal == 'weight':
        return (-weight,)
    elif optimization_goal == 'cost':
        return (-value,)
    else:  # min_trucks or default
        return (-priority, -value, -weight)

def pack_cartons_optimized(truck_types_with_quantities, carton_types_with_quantities, optimization_goal='space', use_parallel=True, max_workers=4):
    """
    Optimized 3D packing algorithm for TruckOpti with performance improvements.
    - Handles large datasets (>1000 cartons) efficiently
    - Uses caching and parallel processing for better performance
    - Supports optimization_goal: 'space', 'cost', 'weight', 'min_trucks'
    - Added logging and performance monitoring
    """
    start_time = time.time()
    logging.info(f"Starting packing optimization with goal: {optimization_goal}")
    
    def create_bin_optimized(truck_type, idx=0):
        bin_obj = Bin(
            f"{truck_type.name}_{idx}",
            truck_type.length,
            truck_type.width,
            truck_type.height,
            truck_type.max_weight if truck_type.max_weight else float('inf')
        )
        bin_obj.truck_type = truck_type
        return bin_obj

    # Pre-process items for better performance
    items = []
    item_cache = {}  # Cache for similar items
    
    for carton_type, quantity in carton_types_with_quantities.items():
        # Cache key for identical carton types
        cache_key = f"{carton_type.name}_{carton_type.length}_{carton_type.width}_{carton_type.height}_{carton_type.weight}"
        
        if cache_key not in item_cache:
            base_item = Item(
                carton_type.name,
                carton_type.length,
                carton_type.width,
                carton_type.height,
                carton_type.weight if carton_type.weight else 0
            )
            # Add custom attributes
            base_item.fragile = getattr(carton_type, 'fragile', False)
            base_item.stackable = getattr(carton_type, 'stackable', True)
            base_item.max_stack_height = getattr(carton_type, 'max_stack_height', 5)
            base_item.value = getattr(carton_type, 'value', 0)
            base_item.priority = getattr(carton_type, 'priority', 1)
            base_item.can_rotate = getattr(carton_type, 'can_rotate', True)
            item_cache[cache_key] = base_item
        
        # Create multiple instances efficiently
        base_item = item_cache[cache_key]
        for i in range(quantity):
            item_copy = Item(
                f"{base_item.name}_{i}",
                base_item.width, base_item.height, base_item.depth,
                base_item.weight
            )
            # Copy attributes
            for attr in ['fragile', 'stackable', 'max_stack_height', 'value', 'priority', 'can_rotate']:
                setattr(item_copy, attr, getattr(base_item, attr))
            items.append(item_copy)

    # Optimized sorting using cached function
    items.sort(key=lambda x: _calculate_item_sort_key(
        x.name, x.weight, x.value, x.priority, 
        x.fragile, x.stackable, optimization_goal
    ))

    # Pre-allocate truck bins
    available_trucks = []
    for truck_type, quantity in truck_types_with_quantities.items():
        for i in range(quantity):
            available_trucks.append(create_bin_optimized(truck_type, i))

    if use_parallel and len(items) > 500:  # Use parallel processing for large datasets
        results = _pack_parallel(available_trucks, items, max_workers)
    else:
        results = _pack_sequential(available_trucks, items)
    
    end_time = time.time()
    logging.info(f"Packing completed in {end_time - start_time:.2f} seconds")
    
    return results

def _pack_sequential(available_trucks, items):
    """Sequential packing implementation"""
    results = []
    remaining_items = items.copy()
    
    for truck_bin in available_trucks:
        if not remaining_items:
            break
            
        result = _pack_single_truck(truck_bin, remaining_items)
        if result['fitted_items']:
            results.append(result)
            remaining_items = [item for item in remaining_items if item.name not in [fit['name'] for fit in result['fitted_items']]]
    
    return results

def _pack_parallel(available_trucks, items, max_workers):
    """Parallel packing implementation for better performance"""
    results = []
    remaining_items = items.copy()
    
    # Process trucks in batches for better parallelization
    batch_size = min(max_workers, len(available_trucks))
    
    for i in range(0, len(available_trucks), batch_size):
        if not remaining_items:
            break
            
        truck_batch = available_trucks[i:i+batch_size]
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_truck = {
                executor.submit(_pack_single_truck, truck, remaining_items.copy()): truck 
                for truck in truck_batch
            }
            
            batch_results = []
            for future in as_completed(future_to_truck):
                try:
                    result = future.result()
                    if result['fitted_items']:
                        batch_results.append(result)
                except Exception as exc:
                    logging.error(f'Truck packing generated an exception: {exc}')
            
            # Sort by utilization and take the best result
            if batch_results:
                best_result = max(batch_results, key=lambda x: x['utilization'])
                results.append(best_result)
                # Update remaining items
                fitted_names = [fit['name'] for fit in best_result['fitted_items']]
                remaining_items = [item for item in remaining_items if item.name not in fitted_names]
    
    return results

def _pack_single_truck(truck_bin, items_to_pack):
    """Pack items into a single truck bin"""
    packer = Packer()
    packer.add_bin(truck_bin)
    
    for item in items_to_pack:
        packer.add_item(item)
    
    packer.pack()
    
    # Process results
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
    distance_km = 100  # Default distance, should be parameter
    
    fuel_cost = (distance_km / truck_type.fuel_efficiency) * 100 if truck_type.fuel_efficiency > 0 else 0
    maintenance_cost = distance_km * truck_type.maintenance_cost_per_km
    driver_cost = truck_type.driver_cost_per_day
    truck_cost = fuel_cost + maintenance_cost + driver_cost + (truck_type.cost_per_km * distance_km)
    total_carton_value = sum(getattr(item, 'value', 0) for item in truck_bin.items)
    total_cost = truck_cost + total_carton_value
    
    return {
        'bin_name': truck_bin.name,
        'fitted_items': packed_items_details,
        'unfitted_items': unfitted_items_details,
        'utilization': float(weight_utilization),
        'total_cost': float(total_cost),
        'truck_cost': float(truck_cost),
        'carton_value': float(total_carton_value)
    }

# Keep the original function for backward compatibility
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

def calculate_optimal_truck_combination(carton_types_with_quantities, available_truck_types, max_trucks=10):
    """
    AI-powered truck combination recommendation
    Returns the most cost-effective and efficient truck combination
    """
    best_combinations = []
    
    # Try different truck combinations
    for truck_type in available_truck_types:
        for quantity in range(1, max_trucks + 1):
            truck_combo = {truck_type: quantity}
            
            # Test packing with this combination
            result = pack_cartons_optimized(truck_combo, carton_types_with_quantities, 'cost')
            
            total_cost = sum(r['total_cost'] for r in result)
            total_utilization = sum(r['utilization'] for r in result) / len(result) if result else 0
            
            best_combinations.append({
                'truck_type': truck_type.name,
                'quantity': quantity,
                'total_cost': total_cost,
                'avg_utilization': total_utilization,
                'efficiency_score': total_utilization / total_cost if total_cost > 0 else 0
            })
    
    # Sort by efficiency score (higher is better)
    best_combinations.sort(key=lambda x: x['efficiency_score'], reverse=True)
    return best_combinations[:5]  # Return top 5 recommendations

def estimate_packing_time(num_cartons, num_trucks):
    """
    Estimate packing computation time based on dataset size
    """
    base_time = 0.1  # seconds
    complexity_factor = (num_cartons * num_trucks) / 1000
    return base_time + (complexity_factor * 0.05)

# Enhanced multi-truck fleet optimization
def optimize_fleet_distribution(carton_list, truck_fleet, optimization_goals=['cost', 'space']):
    """
    Advanced multi-objective fleet optimization
    """
    results = {}
    
    for goal in optimization_goals:
        start_time = time.time()
        result = pack_cartons_optimized(truck_fleet, carton_list, goal, use_parallel=True)
        processing_time = time.time() - start_time
        
        # Calculate fleet-wide metrics
        total_cost = sum(r['total_cost'] for r in result)
        avg_utilization = sum(r['utilization'] for r in result) / len(result) if result else 0
        trucks_used = len([r for r in result if r['fitted_items']])
        
        results[goal] = {
            'packing_results': result,
            'total_cost': total_cost,
            'average_utilization': avg_utilization,
            'trucks_used': trucks_used,
            'processing_time': processing_time,
            'efficiency_score': (avg_utilization * 100) / (total_cost / 1000) if total_cost > 0 else 0
        }
    
    # Recommend best strategy
    best_strategy = max(results.keys(), key=lambda k: results[k]['efficiency_score'])
    
    return {
        'results': results,
        'recommended_strategy': best_strategy,
        'strategy_comparison': results
    }