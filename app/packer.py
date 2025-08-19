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
    # Ensure safe values
    weight = weight or 0
    value = value or 0
    priority = priority or 1
    
    if optimization_goal == 'space':
        return (not stackable, -priority, -value)
    elif optimization_goal == 'weight':
        return (-weight,)
    elif optimization_goal == 'cost':
        return (-value,)
    else:  # min_trucks or default
        return (-priority, -value, -weight)

def calculate_performance_score(packing_result, optimization_goal='space'):
    """
    Calculate transparent performance score with detailed explanation.
    Returns a score (A+, A, B+, B, C, D, F) with breakdown.
    """
    metadata = packing_result.get('calculation_metadata', {})
    
    # Extract key metrics
    space_utilization = metadata.get('volume_utilization_percentage', 0) / 100
    weight_utilization = metadata.get('weight_utilization_percentage', 0) / 100
    packing_efficiency = metadata.get('packing_efficiency', 0) / 100
    validation_passed = metadata.get('validation_passed', False)
    
    # Calculate score components based on optimization goal
    if optimization_goal == 'space':
        # Space optimization prioritizes volume utilization
        space_score = min(100, space_utilization * 100)  # 0-100
        efficiency_score = min(100, packing_efficiency * 100)  # 0-100
        weight_score = min(100, weight_utilization * 50)  # Lower weight for space optimization
        
        # Weighted average: 50% space, 30% efficiency, 20% weight
        raw_score = (space_score * 0.5) + (efficiency_score * 0.3) + (weight_score * 0.2)
        
    elif optimization_goal == 'cost':
        # Cost optimization prioritizes efficient use of truck capacity
        cost_efficiency = space_utilization * weight_utilization  # Combined efficiency
        cost_score = min(100, cost_efficiency * 150)  # Boost for dual efficiency
        efficiency_score = min(100, packing_efficiency * 100)
        
        # Weighted average: 60% cost efficiency, 40% packing efficiency
        raw_score = (cost_score * 0.6) + (efficiency_score * 0.4)
        
    elif optimization_goal == 'weight':
        # Weight optimization prioritizes weight utilization
        weight_score = min(100, weight_utilization * 100)  # 0-100
        space_score = min(100, space_utilization * 70)  # Lower weight for space
        efficiency_score = min(100, packing_efficiency * 100)
        
        # Weighted average: 50% weight, 25% space, 25% efficiency
        raw_score = (weight_score * 0.5) + (space_score * 0.25) + (efficiency_score * 0.25)
        
    else:  # min_trucks or balanced
        # Balanced approach
        space_score = min(100, space_utilization * 100)
        weight_score = min(100, weight_utilization * 100)
        efficiency_score = min(100, packing_efficiency * 100)
        
        # Equal weights: 33.33% each
        raw_score = (space_score + weight_score + efficiency_score) / 3
    
    # Apply validation penalty
    if not validation_passed:
        raw_score *= 0.5  # 50% penalty for validation failures
    
    # Convert to letter grade
    if raw_score >= 95:
        grade = "A+"
        description = "Exceptional"
    elif raw_score >= 90:
        grade = "A"
        description = "Excellent"
    elif raw_score >= 85:
        grade = "B+"
        description = "Very Good"
    elif raw_score >= 80:
        grade = "B"
        description = "Good"
    elif raw_score >= 70:
        grade = "C+"
        description = "Above Average"
    elif raw_score >= 60:
        grade = "C"
        description = "Average"
    elif raw_score >= 50:
        grade = "D"
        description = "Below Average"
    else:
        grade = "F"
        description = "Poor"
    
    return {
        'grade': grade,
        'score': round(raw_score, 1),
        'description': description,
        'optimization_goal': optimization_goal,
        'breakdown': {
            'space_utilization_pct': round(space_utilization * 100, 1),
            'weight_utilization_pct': round(weight_utilization * 100, 1),
            'packing_efficiency_pct': round(packing_efficiency * 100, 1),
            'validation_passed': validation_passed
        },
        'calculation_formula': _get_score_formula(optimization_goal),
        'improvement_suggestions': _get_improvement_suggestions(space_utilization, weight_utilization, packing_efficiency, optimization_goal)
    }

def _get_score_formula(optimization_goal):
    """Return the formula used for score calculation"""
    if optimization_goal == 'space':
        return "Score = (Space Utilization × 0.5) + (Packing Efficiency × 0.3) + (Weight Utilization × 0.2)"
    elif optimization_goal == 'cost':
        return "Score = (Cost Efficiency × 0.6) + (Packing Efficiency × 0.4), where Cost Efficiency = Space × Weight"
    elif optimization_goal == 'weight':
        return "Score = (Weight Utilization × 0.5) + (Space Utilization × 0.25) + (Packing Efficiency × 0.25)"
    else:
        return "Score = (Space Utilization + Weight Utilization + Packing Efficiency) ÷ 3"

def _get_improvement_suggestions(space_util, weight_util, pack_eff, goal):
    """Provide specific improvement suggestions"""
    suggestions = []
    
    if space_util < 0.7:
        suggestions.append("Consider using smaller trucks or adding more items to improve space utilization")
    if weight_util < 0.5:
        suggestions.append("Add heavier items or use lighter truck options to optimize weight distribution")
    if pack_eff < 0.8:
        suggestions.append("Items may not fit efficiently - consider different item arrangements or truck types")
    
    if goal == 'space' and space_util < 0.8:
        suggestions.append("Focus on maximizing volume usage - consider stackable items")
    elif goal == 'weight' and weight_util < 0.7:
        suggestions.append("Optimize weight distribution - current load is underutilizing truck capacity")
    elif goal == 'cost' and (space_util * weight_util) < 0.6:
        suggestions.append("Improve cost efficiency by better utilizing both space and weight capacity")
    
    return suggestions if suggestions else ["Optimization looks good - no major improvements needed"]

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
            # Add custom attributes with safe defaults
            base_item.fragile = getattr(carton_type, 'fragile', False)
            base_item.stackable = getattr(carton_type, 'stackable', True)
            base_item.max_stack_height = getattr(carton_type, 'max_stack_height', 5)
            base_item.value = getattr(carton_type, 'value', 0) or 0
            base_item.priority = getattr(carton_type, 'priority', 1) or 1
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
            # Copy attributes with safe defaults
            item_copy.fragile = getattr(base_item, 'fragile', False)
            item_copy.stackable = getattr(base_item, 'stackable', True)
            item_copy.max_stack_height = getattr(base_item, 'max_stack_height', 5)
            item_copy.value = getattr(base_item, 'value', 0) or 0
            item_copy.priority = getattr(base_item, 'priority', 1) or 1
            item_copy.can_rotate = getattr(base_item, 'can_rotate', True)
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
    
    # CRITICAL FIX: Enhanced pre-validation with realistic constraints
    valid_items = []
    oversized_items = []
    rejected_by_constraints = []
    
    # Calculate realistic constraints
    truck_volume = truck_bin.width * truck_bin.height * truck_bin.depth
    truck_max_weight = truck_bin.max_weight
    
    # Pre-validation: Check physical constraints for each item type
    item_type_validation = {}
    for item in items_to_pack:
        item_key = f"{item.name.split('_')[0]}"  # Get base name without index
        
        if item_key not in item_type_validation:
            # Physical dimension check with rotation possibilities
            can_fit_physically = False
            item_volume = item.width * item.height * item.depth
            
            # ENHANCED DIMENSIONAL VALIDATION: Check all possible rotations with better logic
            rotations = []
            
            # Only add unique rotations to avoid redundant checks
            unique_dims = set()
            potential_rotations = [
                (item.width, item.height, item.depth),
                (item.width, item.depth, item.height),
                (item.height, item.width, item.depth),
                (item.height, item.depth, item.width),
                (item.depth, item.width, item.height),
                (item.depth, item.height, item.width)
            ]
            
            for rotation in potential_rotations:
                if rotation not in unique_dims:
                    unique_dims.add(rotation)
                    rotations.append(rotation)
            
            # ENHANCED VALIDATION: Check each rotation with detailed logging
            valid_rotations = []
            for w, h, d in rotations:
                # Validate dimensions are positive and reasonable
                if w <= 0 or h <= 0 or d <= 0:
                    logging.warning(f"DIMENSION ERROR: Invalid carton dimensions for {item.name}: {w}x{h}x{d}")
                    continue
                
                # Check if dimensions are unreasonably large (> 10 meters in any direction)
                if w > 1000 or h > 1000 or d > 1000:
                    logging.warning(f"DIMENSION WARNING: Very large carton {item.name}: {w}x{h}x{d} cm")
                
                # Check fit with tolerance for measurement precision
                tolerance = 0.1  # 1mm tolerance for measurement precision
                # Convert truck bin dimensions to float to handle Decimal type
                truck_width = float(truck_bin.width or 0)
                truck_height = float(truck_bin.height or 0)
                truck_depth = float(truck_bin.depth or 0)

                if (w <= truck_width + tolerance and 
                    h <= truck_height + tolerance and 
                    d <= truck_depth + tolerance):
                    valid_rotations.append((w, h, d))
                    can_fit_physically = True
                    logging.debug(f"DIMENSION OK: {item.name} fits as {w}x{h}x{d} in truck {truck_bin.name}")
            
            # If no valid rotations found, log detailed reason
            if not can_fit_physically:
                # Convert truck bin dimensions to float to handle Decimal type
                min_truck_dims = [float(truck_bin.width), float(truck_bin.height), float(truck_bin.depth)]
                max_item_dims = [item.width, item.height, item.depth]
                min_truck_dims.sort()
                max_item_dims.sort()
                
                logging.warning(f"DIMENSION ANALYSIS: {item.name} cannot fit in {truck_bin.name}")
                logging.warning(f"  Item dimensions (sorted): {max_item_dims}")
                logging.warning(f"  Truck dimensions (sorted): {min_truck_dims}")
                
                # Check which dimension is problematic
                for i in range(3):
                    if max_item_dims[i] > min_truck_dims[i]:
                        logging.warning(f"  Problematic dimension {i+1}: item={max_item_dims[i]} > truck={min_truck_dims[i]}")
                        break
            
            # ENHANCED VOLUME CALCULATION with validation
            if item_volume <= 0:
                logging.error(f"VOLUME ERROR: Invalid item volume for {item.name}: {item_volume}")
                max_by_volume = 0
            elif truck_volume <= 0:
                logging.error(f"VOLUME ERROR: Invalid truck volume for {truck_bin.name}: {truck_volume}")
                max_by_volume = 0
            else:
                max_by_volume = int(truck_volume // item_volume)
                
                # Validate reasonable volume ratio
                volume_ratio = item_volume / truck_volume
                if volume_ratio > 0.5:
                    logging.info(f"VOLUME ANALYSIS: Large item {item.name} takes {volume_ratio:.1%} of truck volume")
                elif volume_ratio < 0.001:
                    logging.info(f"VOLUME ANALYSIS: Very small item {item.name} - {max_by_volume} theoretical max")
            
            # ENHANCED WEIGHT CALCULATION with validation
            if item.weight <= 0:
                logging.warning(f"WEIGHT WARNING: Zero/negative weight for {item.name}, assuming 1kg")
                item_weight = 1.0
                max_by_weight = int(truck_max_weight // item_weight) if truck_max_weight > 0 else float('inf')
            elif truck_max_weight <= 0:
                logging.warning(f"WEIGHT WARNING: No weight limit for truck {truck_bin.name}")
                max_by_weight = float('inf')
            else:
                item_weight = item.weight
                max_by_weight = int(truck_max_weight // item_weight)
                
                # Validate weight distribution
                weight_ratio = item_weight / truck_max_weight
                if weight_ratio > 0.5:
                    logging.info(f"WEIGHT ANALYSIS: Heavy item {item.name} - {weight_ratio:.1%} of truck capacity")
            
            # ENHANCED PACKING EFFICIENCY CALCULATION
            # Different efficiency rates based on item size and complexity
            if max_by_volume <= 5:
                # Large items - higher efficiency possible
                packing_efficiency = 0.85
            elif max_by_volume <= 20:
                # Medium items - standard efficiency
                packing_efficiency = 0.70
            else:
                # Many small items - lower efficiency due to gaps
                packing_efficiency = 0.60
            
            realistic_max_by_volume = int(max_by_volume * packing_efficiency)
            
            # ENHANCED FINAL CALCULATION with safety checks
            if max_by_weight == float('inf'):
                realistic_max = realistic_max_by_volume
                limiting_factor = 'volume'
            else:
                realistic_max = min(realistic_max_by_volume, max_by_weight)
                limiting_factor = 'volume' if realistic_max_by_volume < max_by_weight else 'weight'
            
            # Additional safety constraints
            if realistic_max > 1000:
                logging.warning(f"CONSTRAINT WARNING: Very high capacity {realistic_max} for {item.name} - applying safety limit")
                realistic_max = min(realistic_max, 1000)  # Safety limit
            
            # Log calculation details for transparency
            logging.debug(f"CALCULATION SUMMARY for {item.name}:")
            logging.debug(f"  Max by volume: {max_by_volume} (efficiency: {packing_efficiency:.0%})")
            logging.debug(f"  Max by weight: {max_by_weight}")
            logging.debug(f"  Realistic max: {realistic_max} (limited by {limiting_factor})")
            
            item_type_validation[item_key] = {
                'can_fit_physically': can_fit_physically,
                'max_by_volume': max_by_volume,
                'max_by_weight': max_by_weight,
                'realistic_max': max(1, realistic_max) if can_fit_physically else 0,
                'item_volume': item_volume,
                'current_count': 0
            }
    
    # Apply validation constraints
    for item in items_to_pack:
        item_key = f"{item.name.split('_')[0]}"
        validation = item_type_validation[item_key]
        
        # Check if item type can fit at all
        if not validation['can_fit_physically']:
            oversized_items.append({
                'name': item.name,
                'dimensions': [item.width, item.height, item.depth],
                'truck_dimensions': [truck_bin.width, truck_bin.height, truck_bin.depth],
                'reason': 'Item dimensions exceed truck capacity in all rotations'
            })
            logging.warning(f"DIMENSION VALIDATION: Item {item.name} cannot fit in {truck_bin.name}")
            continue
        
        # Check realistic quantity constraints
        if validation['current_count'] >= validation['realistic_max']:
            rejected_by_constraints.append({
                'name': item.name,
                'reason': f"Realistic limit reached: {validation['realistic_max']} items of this type",
                'max_by_volume': validation['max_by_volume'],
                'max_by_weight': validation['max_by_weight'],
                'realistic_max': validation['realistic_max']
            })
            logging.info(f"QUANTITY VALIDATION: Item {item.name} rejected - realistic limit reached")
            continue
        
        # Item passes all validations
        packer.add_item(item)
        valid_items.append(item)
        validation['current_count'] += 1
    
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
    
    # ENHANCED POST-PACKING DIMENSIONAL VALIDATION
    validation_errors = []
    validation_warnings = []
    
    # Validate volume calculation accuracy with detailed checks
    if actual_volume_used > total_truck_volume:
        error_msg = f"Volume calculation error for {truck_bin.name}: Used({actual_volume_used:,.0f}) > Available({total_truck_volume:,.0f})"
        logging.error(f"DIMENSION ERROR: {error_msg}")
        validation_errors.append(error_msg)
        # Apply safety margin to prevent impossible calculations
        actual_volume_used = min(actual_volume_used, total_truck_volume * 0.95)
    
    # Check for unrealistic volume utilization
    theoretical_utilization = actual_volume_used / total_truck_volume if total_truck_volume > 0 else 0
    if theoretical_utilization > 0.95:
        warning_msg = f"Very high space utilization {theoretical_utilization:.1%} may be unrealistic for {truck_bin.name}"
        logging.warning(f"PACKING WARNING: {warning_msg}")
        validation_warnings.append(warning_msg)
    
    space_utilization = actual_volume_used / total_truck_volume if total_truck_volume > 0 else 0
    
    # ENHANCED WEIGHT VALIDATION with safety checks
    weight_utilization = actual_weight_used / truck_bin.max_weight if truck_bin.max_weight > 0 else 0
    if actual_weight_used > truck_bin.max_weight:
        error_msg = f"Weight limit exceeded for {truck_bin.name}: Used({actual_weight_used:.1f}kg) > Max({truck_bin.max_weight}kg)"
        logging.warning(f"WEIGHT WARNING: {error_msg}")
        validation_warnings.append(error_msg)
    
    # DETAILED DIMENSIONAL VALIDATION for each packed item
    dimensional_violations = []
    for item in truck_bin.items:
        # Check if item position + dimensions exceed truck bounds
        if hasattr(item, 'position') and item.position:
            # Ensure all dimensions are converted to float to prevent Decimal mixing
            end_x = float(item.position[0]) + float(item.width)
            end_y = float(item.position[1]) + float(item.height)  
            end_z = float(item.position[2]) + float(item.depth)
            
            tolerance = 0.1  # 1mm tolerance
            # Convert all dimensions to float explicitly
            truck_width = float(truck_bin.width or 0)
            truck_height = float(truck_bin.height or 0)
            truck_depth = float(truck_bin.depth or 0)
            
            if (end_x > truck_width + tolerance or 
                end_y > truck_height + tolerance or 
                end_z > truck_depth + tolerance):
                violation = {
                    'item_name': item.name,
                    'position': item.position,
                    'dimensions': [item.width, item.height, item.depth],
                    'end_position': [end_x, end_y, end_z],
                    'truck_bounds': [truck_bin.width, truck_bin.height, truck_bin.depth],
                    'violations': []
                }
                
                if end_x > float(truck_bin.width) + tolerance:
                    violation['violations'].append(f"X-axis: {end_x:.1f} > {truck_width}")
                if end_y > float(truck_bin.height) + tolerance:
                    violation['violations'].append(f"Y-axis: {end_y:.1f} > {truck_height}")
                if end_z > float(truck_bin.depth) + tolerance:
                    violation['violations'].append(f"Z-axis: {end_z:.1f} > {truck_depth}")
                
                dimensional_violations.append(violation)
                logging.error(f"POSITION ERROR: {item.name} exceeds truck bounds: {violation['violations']}")
    
    # Calculate actual packing efficiency based on positioned items
    if len(truck_bin.items) > 0:
        # Calculate the bounding box of all packed items
        min_x = min(item.position[0] for item in truck_bin.items if hasattr(item, 'position') and item.position)
        max_x = max(item.position[0] + item.width for item in truck_bin.items if hasattr(item, 'position') and item.position)
        min_y = min(item.position[1] for item in truck_bin.items if hasattr(item, 'position') and item.position)
        max_y = max(item.position[1] + item.height for item in truck_bin.items if hasattr(item, 'position') and item.position)
        min_z = min(item.position[2] for item in truck_bin.items if hasattr(item, 'position') and item.position)
        max_z = max(item.position[2] + item.depth for item in truck_bin.items if hasattr(item, 'position') and item.position)
        
        used_bounding_box = (max_x - min_x) * (max_y - min_y) * (max_z - min_z)
        bounding_box_efficiency = actual_volume_used / used_bounding_box if used_bounding_box > 0 else 0
        
        logging.debug(f"PACKING ANALYSIS: Bounding box efficiency: {bounding_box_efficiency:.1%}")
    
    # Final validation status
    validation_passed = (len(validation_errors) == 0 and 
                        actual_volume_used <= total_truck_volume and 
                        actual_weight_used <= truck_bin.max_weight)
    
    if not validation_passed:
        logging.error(f"VALIDATION FAILED for {truck_bin.name}: {len(validation_errors)} errors, {len(validation_warnings)} warnings")
    else:
        logging.info(f"VALIDATION PASSED for {truck_bin.name}: {len(truck_bin.items)} items packed successfully")
    
    # ENHANCED CALCULATION TRANSPARENCY
    calculation_metadata = {
        'total_items_input': len(items_to_pack),
        'valid_items_for_packing': len(valid_items),
        'oversized_items_rejected': len(oversized_items),
        'constraint_rejected_items': len(rejected_by_constraints),
        'items_successfully_packed': len(truck_bin.items),
        'items_failed_to_pack': len(truck_bin.unfitted_items),
        'truck_total_volume_cm3': total_truck_volume,
        'actual_volume_used_cm3': actual_volume_used,
        'volume_utilization_percentage': round(space_utilization * 100, 2),
        'truck_max_weight_kg': truck_bin.max_weight,
        'actual_weight_used_kg': actual_weight_used,
        'weight_utilization_percentage': round(weight_utilization * 100, 2),
        'packing_efficiency': round((len(truck_bin.items) / len(valid_items)) * 100, 2) if valid_items else 0,
        'validation_passed': validation_passed,
        'validation_errors': validation_errors,
        'validation_warnings': validation_warnings,
        'dimensional_violations': dimensional_violations,
        'oversized_items': oversized_items,
        'constraint_rejected_items': rejected_by_constraints,
        'item_type_validations': item_type_validation,
        'calculation_method': 'Enhanced 3D packing with adaptive efficiency factor',
        'validation_status': 'PASSED' if validation_passed else 'FAILED',
        'theoretical_utilization': theoretical_utilization,
        'bounding_box_efficiency': bounding_box_efficiency if len(truck_bin.items) > 0 else 0
    }
    
    unfitted_items_details = [{'name': item.name} for item in truck_bin.unfitted_items]
    
    # Realistic Cost Calculation - only show if cost data available
    truck_type = getattr(truck_bin, 'truck_type', None)
    has_cost_data = False
    
    if truck_type:
        has_cost_data = (
            (getattr(truck_type, 'cost_per_km', 0) or 0) > 0 or
            (getattr(truck_type, 'fuel_efficiency', 0) or 0) > 0 or  
            (getattr(truck_type, 'driver_cost_per_day', 0) or 0) > 0 or
            (getattr(truck_type, 'maintenance_cost_per_km', 0) or 0) > 0
        )
    
    if has_cost_data and truck_type:
        # Only calculate if we have actual cost data
        distance_km = 100  # Default distance - should be user input
        fuel_eff = getattr(truck_type, 'fuel_efficiency', 0) or 0
        maint_cost = getattr(truck_type, 'maintenance_cost_per_km', 0) or 0
        driver_cost_val = getattr(truck_type, 'driver_cost_per_day', 0) or 0
        cost_per_km = getattr(truck_type, 'cost_per_km', 0) or 0
        
        fuel_cost = (distance_km / fuel_eff) * 100 if fuel_eff > 0 else 0
        maintenance_cost = distance_km * maint_cost
        driver_cost = driver_cost_val
        truck_cost = fuel_cost + maintenance_cost + driver_cost + (cost_per_km * distance_km)
        total_carton_value = sum(getattr(item, 'value', 0) or 0 for item in truck_bin.items)
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
        'carton_value': float(total_carton_value),
        'calculation_metadata': calculation_metadata  # Include calculation transparency
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
        truck_type = getattr(truck_bin, 'truck_type', None)
        has_cost_data = False
        
        if truck_type:
            has_cost_data = (
                (getattr(truck_type, 'cost_per_km', 0) or 0) > 0 or
                (getattr(truck_type, 'fuel_efficiency', 0) or 0) > 0 or  
                (getattr(truck_type, 'driver_cost_per_day', 0) or 0) > 0 or
                (getattr(truck_type, 'maintenance_cost_per_km', 0) or 0) > 0
            )
        
        if has_cost_data and truck_type:
            distance_km = 100  # Should be user input
            fuel_eff = getattr(truck_type, 'fuel_efficiency', 0) or 0
            maint_cost = getattr(truck_type, 'maintenance_cost_per_km', 0) or 0
            driver_cost_val = getattr(truck_type, 'driver_cost_per_day', 0) or 0
            cost_per_km = getattr(truck_type, 'cost_per_km', 0) or 0
            
            fuel_cost = (distance_km / fuel_eff) * 100 if fuel_eff > 0 else 0
            maintenance_cost = distance_km * maint_cost
            driver_cost = driver_cost_val
            truck_cost = fuel_cost + maintenance_cost + driver_cost + (cost_per_km * distance_km)
            total_carton_value = sum(getattr(item, 'value', 0) or 0 for item in truck_bin.items)
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
    elif optimization_strategy == 'cost_value_optimized':
        # Calculate total carton value for value-based optimization
        total_carton_value = sum(
            getattr(carton, 'temp_value', carton.value or 0) * qty 
            for carton, qty in carton_types_with_quantities.items()
        )
        
        # Sort by value-to-cost ratio (prefer trucks that provide best value protection per cost)
        def value_efficiency(truck):
            truck_cost = getattr(truck, 'cost_per_km', 50) * 100  # Assume 100km default
            truck_volume = truck.length * truck.width * truck.height
            # Higher volume trucks get preference for valuable cargo
            value_efficiency_score = (truck_volume / 1000000) / max(truck_cost, 1)  # Volume in m³ per unit cost
            return -value_efficiency_score  # Negative for descending sort
        
        sorted_trucks = sorted(viable_trucks, key=value_efficiency)
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

class SpaceOptimizer:
    def __init__(self, truck=None, cartons=None):
        self.truck = truck
        self.cartons = cartons or []
        self.packer = Packer()
    
    def pack_cartons(self, truck, cartons):
        """Pack cartons into a single truck"""
        from py3dbp import Bin, Item, Packer
        from decimal import Decimal, InvalidOperation
        import math

        # Handle infinite or None max_weight
        max_weight = 10000 if math.isinf(truck.max_weight or float('inf')) else truck.max_weight

        # Create a Bin object from truck parameters
        bin_obj = Bin(
            name=truck.name if hasattr(truck, 'name') else 'TruckBin',
            width=truck.width,
            height=truck.height,
            depth=truck.length,
            max_weight=max_weight
        )

        packer = Packer()
        packer.add_bin(bin_obj)
        
        for carton in cartons:
            packer.add_item(Item(
                carton.name, 
                carton.width,  # Note the order of dimensions
                carton.height, 
                carton.length,  # py3dbp expects different dimension order
                carton.weight or 0
            ))
        
        packer.pack()
        
        # Convert packed cartons if possible
        return packer.bins[0].items if packer.bins and packer.bins[0].items else []
    
    def calculate_remaining_volume(self, truck, packed_cartons):
        """Calculate remaining volume after packing"""
        total_truck_volume = truck.width * truck.height * truck.depth
        total_packed_volume = sum(
            carton.width * carton.height * carton.depth 
            for carton in packed_cartons
        )
        return max(0, total_truck_volume - total_packed_volume)
    
    def optimize_remaining_space(self, truck, packed_cartons, remaining_volume):
        """Generate recommendations for remaining space"""
        # Analyze remaining volume and suggest optimal carton sizes
        remaining_space_suggestions = []
        
        # Basic heuristics for generating recommendations
        candidate_cartons = INDIAN_CARTONS  # Use predefined carton types
        
        for carton_type in candidate_cartons:
            carton_volume = carton_type['length'] * carton_type['width'] * carton_type['height']
            
            # Check if carton can potentially fit
            if carton_volume <= remaining_volume:
                max_cartons_possible = int(remaining_volume // carton_volume)
                
                if max_cartons_possible > 0:
                    remaining_space_suggestions.append({
                        'carton_type': carton_type['type'],
                        'dimensions': [carton_type['length'], carton_type['width'], carton_type['height']],
                        'max_possible': max_cartons_possible,
                        'volume_per_carton': carton_volume,
                        'weight_per_carton': carton_type.get('weight', 0)
                    })
        
        # Sort by most efficient space utilization
        remaining_space_suggestions.sort(key=lambda x: x['max_possible'], reverse=True)
        
        return remaining_space_suggestions[:5]  # Top 5 recommendations

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

# === COMPREHENSIVE DIMENSIONAL VALIDATION SYSTEM ===

def validate_dimensional_integrity(trucks=None, cartons=None, enable_logging=True):
    """
    Comprehensive dimensional validation system for TruckOpti
    Validates all trucks and cartons for dimensional integrity and realistic constraints
    
    Args:
        trucks: List of TruckType objects to validate (None = validate all)
        cartons: List of CartonType objects to validate (None = validate all)
        enable_logging: Whether to enable detailed logging
    
    Returns:
        dict: Comprehensive validation report
    """
    if enable_logging:
        logging.info("=== STARTING COMPREHENSIVE DIMENSIONAL VALIDATION ===")
    
    validation_report = {
        'validation_timestamp': time.time(),
        'truck_validations': [],
        'carton_validations': [],
        'compatibility_matrix': [],
        'critical_issues': [],
        'warnings': [],
        'recommendations': [],
        'overall_status': 'UNKNOWN'
    }
    
    # Import models here to avoid circular imports
    try:
        from app.models import TruckType, CartonType
        
        # Get trucks and cartons to validate
        if trucks is None:
            from app import create_app
            app = create_app()
            with app.app_context():
                trucks = TruckType.query.all()
        
        if cartons is None:
            from app import create_app
            app = create_app()
            with app.app_context():
                cartons = CartonType.query.all()
                
    except Exception as e:
        validation_report['critical_issues'].append(f"Failed to load data: {e}")
        validation_report['overall_status'] = 'ERROR'
        return validation_report
    
    # Validate trucks
    for truck in trucks:
        truck_validation = validate_truck_dimensions(truck)
        validation_report['truck_validations'].append(truck_validation)
        
        if truck_validation['has_errors']:
            validation_report['critical_issues'].extend(truck_validation['errors'])
        if truck_validation['has_warnings']:
            validation_report['warnings'].extend(truck_validation['warnings'])
    
    # Validate cartons
    for carton in cartons:
        carton_validation = validate_carton_dimensions(carton)
        validation_report['carton_validations'].append(carton_validation)
        
        if carton_validation['has_errors']:
            validation_report['critical_issues'].extend(carton_validation['errors'])
        if carton_validation['has_warnings']:
            validation_report['warnings'].extend(carton_validation['warnings'])
    
    # Build compatibility matrix
    validation_report['compatibility_matrix'] = build_compatibility_matrix(trucks, cartons)
    
    # Generate recommendations
    validation_report['recommendations'] = generate_dimensional_recommendations(validation_report)
    
    # Determine overall status
    if validation_report['critical_issues']:
        validation_report['overall_status'] = 'FAILED'
    elif validation_report['warnings']:
        validation_report['overall_status'] = 'WARNING'
    else:
        validation_report['overall_status'] = 'PASSED'
    
    if enable_logging:
        logging.info(f"DIMENSIONAL VALIDATION COMPLETED: {validation_report['overall_status']}")
        logging.info(f"Issues: {len(validation_report['critical_issues'])} critical, {len(validation_report['warnings'])} warnings")
    
    return validation_report

def validate_truck_dimensions(truck):
    """Validate individual truck dimensions"""
    validation = {
        'truck_id': truck.id,
        'truck_name': truck.name,
        'dimensions': [truck.length, truck.width, truck.height],
        'max_weight': truck.max_weight,
        'errors': [],
        'warnings': [],
        'has_errors': False,
        'has_warnings': False,
        'calculated_volume': 0,
        'realistic_capacity': 0
    }
    
    # Check for invalid dimensions
    if truck.length <= 0 or truck.width <= 0 or truck.height <= 0:
        validation['errors'].append(f"Invalid dimensions: {truck.length}x{truck.width}x{truck.height}")
        validation['has_errors'] = True
    
    # Check for unrealistic dimensions
    if truck.length > 2000 or truck.width > 500 or truck.height > 500:  # 20m x 5m x 5m max
        validation['warnings'].append(f"Very large truck dimensions: {truck.length}x{truck.width}x{truck.height} cm")
        validation['has_warnings'] = True
    
    # Check weight limits
    if truck.max_weight <= 0:
        validation['warnings'].append(f"No weight limit specified")
        validation['has_warnings'] = True
    elif truck.max_weight > 50000:  # 50 ton max
        validation['warnings'].append(f"Very high weight limit: {truck.max_weight}kg")
        validation['has_warnings'] = True
    
    # Calculate volume and realistic capacity
    if not validation['has_errors']:
        validation['calculated_volume'] = truck.length * truck.width * truck.height
        validation['realistic_capacity'] = validation['calculated_volume'] * 0.7  # 70% efficiency
    
    return validation

def validate_carton_dimensions(carton):
    """Validate individual carton dimensions"""
    validation = {
        'carton_id': carton.id,
        'carton_name': carton.name,
        'dimensions': [carton.length, carton.width, carton.height],
        'weight': carton.weight,
        'errors': [],
        'warnings': [],
        'has_errors': False,
        'has_warnings': False,
        'calculated_volume': 0,
        'density': 0
    }
    
    # Check for invalid dimensions
    if carton.length <= 0 or carton.width <= 0 or carton.height <= 0:
        validation['errors'].append(f"Invalid dimensions: {carton.length}x{carton.width}x{carton.height}")
        validation['has_errors'] = True
    
    # Check for unrealistic dimensions
    if carton.length > 300 or carton.width > 300 or carton.height > 300:  # 3m max
        validation['warnings'].append(f"Very large carton: {carton.length}x{carton.width}x{carton.height} cm")
        validation['has_warnings'] = True
    
    # Check weight
    if carton.weight <= 0:
        validation['warnings'].append(f"No weight specified, assuming 1kg")
        validation['has_warnings'] = True
    elif carton.weight > 1000:  # 1 ton max per carton
        validation['warnings'].append(f"Very heavy carton: {carton.weight}kg")
        validation['has_warnings'] = True
    
    # Calculate volume and density
    if not validation['has_errors']:
        validation['calculated_volume'] = carton.length * carton.width * carton.height
        if carton.weight > 0 and validation['calculated_volume'] > 0:
            # Density in kg/m³
            validation['density'] = (carton.weight / (validation['calculated_volume'] / 1000000))
            
            # Check for unrealistic density
            if validation['density'] > 2000:  # Very dense
                validation['warnings'].append(f"Very high density: {validation['density']:.0f} kg/m³")
                validation['has_warnings'] = True
            elif validation['density'] < 10:  # Very light
                validation['warnings'].append(f"Very low density: {validation['density']:.0f} kg/m³")
                validation['has_warnings'] = True
    
    return validation

def build_compatibility_matrix(trucks, cartons):
    """Build a compatibility matrix between trucks and cartons"""
    matrix = []
    
    for truck in trucks:
        for carton in cartons:
            # Check if carton can fit in truck
            can_fit = False
            best_rotation = None
            
            rotations = [
                (carton.length, carton.width, carton.height),
                (carton.length, carton.height, carton.width),
                (carton.width, carton.length, carton.height),
                (carton.width, carton.height, carton.length),
                (carton.height, carton.length, carton.width),
                (carton.height, carton.width, carton.length)
            ]
            
            for w, h, d in rotations:
                if w <= truck.length and h <= truck.width and d <= truck.height:
                    can_fit = True
                    best_rotation = (w, h, d)
                    break
            
            # Calculate theoretical maximums
            truck_volume = truck.length * truck.width * truck.height
            carton_volume = carton.length * carton.width * carton.height
            
            max_by_volume = int(truck_volume // carton_volume) if carton_volume > 0 else 0
            max_by_weight = int(truck.max_weight // carton.weight) if carton.weight > 0 and truck.max_weight > 0 else float('inf')
            
            realistic_max = min(max_by_volume, max_by_weight) if max_by_weight != float('inf') else max_by_volume
            realistic_max = int(realistic_max * 0.7)  # 70% efficiency
            
            matrix.append({
                'truck_name': truck.name,
                'carton_name': carton.name,
                'can_fit': can_fit,
                'best_rotation': best_rotation,
                'max_by_volume': max_by_volume,
                'max_by_weight': max_by_weight,
                'realistic_max': realistic_max,
                'compatibility_score': realistic_max if can_fit else 0
            })
    
    return matrix

def generate_dimensional_recommendations(validation_report):
    """Generate recommendations based on validation results"""
    recommendations = []
    
    # Check for trucks with no compatible cartons
    trucks_with_issues = []
    for truck_val in validation_report['truck_validations']:
        if truck_val['has_errors']:
            trucks_with_issues.append(truck_val['truck_name'])
    
    if trucks_with_issues:
        recommendations.append(f"Fix dimensional errors in trucks: {', '.join(trucks_with_issues)}")
    
    # Check for cartons that don't fit in any truck
    cartons_with_issues = []
    for carton_val in validation_report['carton_validations']:
        if carton_val['has_errors']:
            cartons_with_issues.append(carton_val['carton_name'])
    
    if cartons_with_issues:
        recommendations.append(f"Fix dimensional errors in cartons: {', '.join(cartons_with_issues)}")
    
    # Check compatibility matrix for orphaned items
    compatibility = validation_report['compatibility_matrix']
    orphaned_cartons = []
    
    carton_names = set(item['carton_name'] for item in compatibility)
    for carton_name in carton_names:
        carton_compatibilities = [item for item in compatibility if item['carton_name'] == carton_name]
        if not any(item['can_fit'] for item in carton_compatibilities):
            orphaned_cartons.append(carton_name)
    
    if orphaned_cartons:
        recommendations.append(f"Add larger trucks for cartons that don't fit anywhere: {', '.join(orphaned_cartons)}")
    
    # Performance recommendations
    if len(validation_report['warnings']) > 10:
        recommendations.append("Consider reviewing and standardizing dimensions to reduce warnings")
    
    if not recommendations:
        recommendations.append("All dimensional validations passed successfully")
    
    return recommendations