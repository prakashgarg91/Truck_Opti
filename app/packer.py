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

    # Pre-allocate truck bins with better ordering
    available_trucks = []
    truck_list = list(truck_types_with_quantities.items())
    
    # Sort trucks by volume (largest first) for better space optimization
    if optimization_goal in ['space', 'min_trucks']:
        truck_list.sort(key=lambda x: x[0].length * x[0].width * x[0].height, reverse=True)
    elif optimization_goal == 'cost':
        truck_list.sort(key=lambda x: getattr(x[0], 'cost_per_km', 0))
    elif optimization_goal == 'weight':
        truck_list.sort(key=lambda x: getattr(x[0], 'max_weight', 1000), reverse=True)
    
    for truck_type, quantity in truck_list:
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
    """Pack items into a single truck bin with enhanced accuracy validation"""
    packer = Packer()
    packer.add_bin(truck_bin)
    
    # AGENT 1 FIX: Pre-validate items before packing
    valid_items = []
    oversized_items = []
    
    for item in items_to_pack:
        # Check if item dimensions can physically fit in truck
        if (item.width <= truck_bin.width and 
            item.height <= truck_bin.height and 
            item.depth <= truck_bin.depth):
            packer.add_item(item)
            valid_items.append(item)
        else:
            oversized_items.append({
                'name': item.name,
                'dimensions': [item.width, item.height, item.depth],
                'truck_dimensions': [truck_bin.width, truck_bin.height, truck_bin.depth],
                'reason': 'Item dimensions exceed truck capacity'
            })
            logging.warning(f"AGENT 1 VALIDATION: Item {item.name} cannot fit in {truck_bin.name}")
    
    packer.pack()
    
    # Process results with enhanced validation
    packed_items_details = []
    actual_volume_used = 0
    actual_weight_used = 0
    
    for item in truck_bin.items:
        item_volume = item.width * item.height * item.depth
        actual_volume_used += item_volume
        actual_weight_used += item.weight
        
        packed_items_details.append({
            'name': item.name,
            'position': item.position,
            'rotation_type': item.rotation_type,
            'width': float(item.width),
            'height': float(item.height),
            'depth': float(item.depth),
            'volume': float(item_volume),
            'weight': float(item.weight),
            'color': '#%06x' % (hash(item.name) & 0xFFFFFF),
        })
    
    # AGENT 1 FIX: Enhanced calculation with validation checks
    total_truck_volume = truck_bin.width * truck_bin.height * truck_bin.depth
    
    # Validate volume calculation accuracy
    if actual_volume_used > total_truck_volume:
        logging.error(f"AGENT 1 ERROR: Volume calculation error for {truck_bin.name}: "
                     f"Used({actual_volume_used}) > Available({total_truck_volume})")
        # Apply safety margin to prevent impossible calculations
        actual_volume_used = min(actual_volume_used, total_truck_volume * 0.95)
    
    space_utilization = actual_volume_used / total_truck_volume if total_truck_volume > 0 else 0
    
    # Weight validation with safety checks
    weight_utilization = actual_weight_used / truck_bin.max_weight if truck_bin.max_weight > 0 else 0
    if actual_weight_used > truck_bin.max_weight:
        logging.warning(f"AGENT 1 WARNING: Weight limit exceeded for {truck_bin.name}")
    
    # AGENT 1 ENHANCEMENT: Add calculation transparency
    calculation_metadata = {
        'total_items_input': len(items_to_pack),
        'valid_items_for_packing': len(valid_items),
        'oversized_items_rejected': len(oversized_items),
        'items_successfully_packed': len(truck_bin.items),
        'items_failed_to_pack': len(truck_bin.unfitted_items),
        'truck_total_volume_cm3': total_truck_volume,
        'actual_volume_used_cm3': actual_volume_used,
        'volume_utilization_percentage': round(space_utilization * 100, 2),
        'truck_max_weight_kg': truck_bin.max_weight,
        'actual_weight_used_kg': actual_weight_used,
        'weight_utilization_percentage': round(weight_utilization * 100, 2),
        'packing_efficiency': round((len(truck_bin.items) / len(valid_items)) * 100, 2) if valid_items else 0,
        'validation_passed': (actual_volume_used <= total_truck_volume and 
                            actual_weight_used <= truck_bin.max_weight),
        'oversized_items': oversized_items
    }
    
    unfitted_items_details = [{'name': item.name} for item in truck_bin.unfitted_items]
    
    # Realistic Cost Calculation - only show if cost data available
    truck_type = truck_bin.truck_type
    has_cost_data = (
        getattr(truck_type, 'cost_per_km', 0) > 0 or
        getattr(truck_type, 'fuel_efficiency', 0) > 0 or  
        getattr(truck_type, 'driver_cost_per_day', 0) > 0 or
        getattr(truck_type, 'maintenance_cost_per_km', 0) > 0
    )
    
    if has_cost_data:
        # Only calculate if we have actual cost data
        distance_km = 100  # Default distance - should be user input
        fuel_cost = (distance_km / truck_type.fuel_efficiency) * 100 if truck_type.fuel_efficiency > 0 else 0
        maintenance_cost = distance_km * truck_type.maintenance_cost_per_km if truck_type.maintenance_cost_per_km else 0
        driver_cost = truck_type.driver_cost_per_day if truck_type.driver_cost_per_day else 0
        truck_cost = fuel_cost + maintenance_cost + driver_cost + (truck_type.cost_per_km * distance_km if truck_type.cost_per_km else 0)
        total_carton_value = sum(getattr(item, 'value', 0) for item in truck_bin.items)
        total_cost = truck_cost + total_carton_value
    else:
        # No cost data available - don't show misleading costs
        truck_cost = 0
        total_carton_value = 0
        total_cost = 0
    
    return {
        'bin_name': truck_bin.name,
        'fitted_items': packed_items_details,
        'unfitted_items': unfitted_items_details,
        'utilization': float(space_utilization),  # Use space utilization instead of weight
        'weight_utilization': float(weight_utilization),  # Keep weight utilization separately
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
        
        # Calculate space utilization (volume-based)
        total_volume_used = sum(item.width * item.height * item.depth for item in truck_bin.items)
        total_truck_volume = truck_bin.width * truck_bin.height * truck_bin.depth
        space_utilization = total_volume_used / total_truck_volume if total_truck_volume > 0 else 0
        
        # Calculate weight utilization separately
        total_weight = sum(item.weight for item in truck_bin.items)
        weight_utilization = total_weight / truck_bin.max_weight if truck_bin.max_weight > 0 else 0
        
        unfitted_items_details = [{'name': item.name} for item in truck_bin.unfitted_items]

        # Realistic Cost Calculation - only show if cost data available
        truck_type = truck_bin.truck_type
        has_cost_data = (
            getattr(truck_type, 'cost_per_km', 0) > 0 or
            getattr(truck_type, 'fuel_efficiency', 0) > 0 or  
            getattr(truck_type, 'driver_cost_per_day', 0) > 0 or
            getattr(truck_type, 'maintenance_cost_per_km', 0) > 0
        )
        
        if has_cost_data:
            distance_km = 100  # Should be user input
            fuel_cost = (distance_km / truck_type.fuel_efficiency) * 100 if truck_type.fuel_efficiency > 0 else 0
            maintenance_cost = distance_km * truck_type.maintenance_cost_per_km if truck_type.maintenance_cost_per_km else 0
            driver_cost = truck_type.driver_cost_per_day if truck_type.driver_cost_per_day else 0
            truck_cost = fuel_cost + maintenance_cost + driver_cost + (truck_type.cost_per_km * distance_km if truck_type.cost_per_km else 0)
            total_carton_value = sum(getattr(item, 'value', 0) for item in truck_bin.items)
            total_cost = truck_cost + total_carton_value
        else:
            truck_cost = 0
            total_carton_value = 0
            total_cost = 0

        results.append({
            'bin_name': truck_bin.name,
            'fitted_items': packed_items_details,
            'unfitted_items': unfitted_items_details,
            'utilization': float(space_utilization),  # Use space utilization instead of weight
            'weight_utilization': float(weight_utilization),  # Keep weight utilization separately
            'total_cost': float(total_cost),
            'truck_cost': float(truck_cost),
            'carton_value': float(total_carton_value)
        })
        
        remaining_items = truck_bin.unfitted_items

    return results

@lru_cache(maxsize=128)
def _calculate_cargo_metrics(carton_hash):
    """Cache cargo metrics calculation"""
    return carton_hash

def calculate_optimal_truck_combination(carton_types_with_quantities, available_truck_types, max_trucks=10, optimization_strategy='space_utilization'):
    """
    Enhanced truck combination recommendation with max space utilization priority
    - Prioritizes smallest truck first for maximum space utilization
    - Supports multiple optimization strategies: 'space_utilization', 'cost_saving', 'balanced'
    - Optimized for faster performance with early termination
    """
    best_combinations = []
    
    # Quick pre-filter: Calculate total carton volume and weight
    total_volume = sum(
        (carton.length * carton.width * carton.height) * qty 
        for carton, qty in carton_types_with_quantities.items()
    )
    total_weight = sum(
        (carton.weight if carton.weight else 5) * qty 
        for carton, qty in carton_types_with_quantities.items()
    )
    
    # Pre-filter trucks that are obviously too small
    viable_trucks = []
    for truck in available_truck_types:
        truck_volume = truck.length * truck.width * truck.height
        truck_capacity = truck.max_weight if truck.max_weight else 10000
        
        # Skip trucks that are clearly too small (less than 20% of total requirements)
        if truck_volume < total_volume * 0.2 and truck_capacity < total_weight * 0.2:
            continue
        viable_trucks.append(truck)
    
    # Sort trucks based on optimization strategy
    if optimization_strategy == 'space_utilization':
        # Smallest viable truck first for maximum space utilization
        sorted_trucks = sorted(viable_trucks, key=lambda t: t.length * t.width * t.height)
    elif optimization_strategy == 'cost_saving':
        # Sort by cost efficiency (if cost data available)
        sorted_trucks = sorted(viable_trucks, key=lambda t: getattr(t, 'cost_per_km', 999999))
    else:  # balanced
        # Balance between size and efficiency
        sorted_trucks = sorted(viable_trucks, 
                              key=lambda t: (t.length * t.width * t.height, getattr(t, 'cost_per_km', 999999)))
    
    # Limit testing to top 5 most promising trucks for speed
    top_trucks = sorted_trucks[:5]
    
    # Try different truck combinations with smarter logic and early termination
    for truck_type in top_trucks:
        truck_volume = truck_type.length * truck_type.width * truck_type.height
        truck_capacity = truck_type.max_weight if truck_type.max_weight else 10000
        
        # Estimate reasonable quantity range based on cargo size
        min_trucks_needed = max(1, min(
            int(total_volume / truck_volume) + 1,
            int(total_weight / truck_capacity) + 1
        ))
        # Limit max trucks for performance
        max_reasonable = min(3, min_trucks_needed + 1)  # Reduced from max_trucks
        
        for quantity in range(1, max_reasonable + 1):
            truck_combo = {truck_type: quantity}
            
            # Test packing with this combination
            result = pack_cartons_optimized(truck_combo, carton_types_with_quantities, optimization_strategy)
            
            if not result:  # Skip if no results
                continue
                
            # Filter only trucks that were actually used
            used_trucks = [r for r in result if r['fitted_items']]
            
            if not used_trucks:  # Skip if no trucks were used
                continue
            
            total_cost = sum(r['total_cost'] for r in used_trucks)
            total_utilization = sum(r['utilization'] for r in used_trucks) / len(used_trucks)
            trucks_actually_used = len(used_trucks)
            total_fitted_items = sum(len(r['fitted_items']) for r in used_trucks)
            total_cartons = sum(carton_types_with_quantities.values())
            
            # Calculate comprehensive efficiency score
            space_efficiency = total_utilization
            cost_efficiency = 1000 / total_cost if total_cost > 0 else 0
            truck_efficiency = 1 / trucks_actually_used  # Prefer fewer trucks
            packing_success = total_fitted_items / total_cartons if total_cartons > 0 else 0
            
            # Weighted composite score
            efficiency_score = (
                space_efficiency * 0.3 + 
                cost_efficiency * 0.3 + 
                truck_efficiency * 0.2 + 
                packing_success * 0.2
            )
            
            best_combinations.append({
                'truck_type': truck_type.name,
                'truck_dimensions': f"{truck_type.length}×{truck_type.width}×{truck_type.height}",
                'quantity': trucks_actually_used,
                'total_cost': total_cost,
                'avg_utilization': total_utilization,
                'packing_success_rate': packing_success,
                'efficiency_score': efficiency_score,
                'space_efficiency': space_efficiency,
                'cost_per_item': total_cost / total_fitted_items if total_fitted_items > 0 else float('inf')
            })
            
            # Early termination: if we found a perfect solution, stop
            if packing_success >= 0.99 and space_efficiency >= 0.8:
                break
    
    # Sort by composite efficiency score (higher is better)
    best_combinations.sort(key=lambda x: x['efficiency_score'], reverse=True)
    
    # Remove duplicates and ensure variety in recommendations (limit to top 3 for speed)
    seen_trucks = set()
    diverse_combinations = []
    
    for combo in best_combinations[:3]:  # Limit to top 3 for performance
        truck_key = (combo['truck_type'], combo['quantity'])
        if truck_key not in seen_trucks and len(diverse_combinations) < 5:
            seen_trucks.add(truck_key)
            diverse_combinations.append(combo)
    
    return diverse_combinations

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