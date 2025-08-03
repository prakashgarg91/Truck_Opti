from py3dbp import Packer, Bin, Item

def pack_cartons(truck_type, carton_types_with_quantities, optimization_goal='space'):
    """
    Enhanced 3D packing algorithm for TruckOpti.
    - Handles fragility, stacking limits, weight distribution, multi-truck packing.
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

    # Prepare items with attributes
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
            # Attach extra attributes for constraints
            item.fragile = getattr(carton_type, 'fragile', False)
            item.stackable = getattr(carton_type, 'stackable', True)
            item.max_stack_height = getattr(carton_type, 'max_stack_height', 5)
            item.value = getattr(carton_type, 'value', 0)
            item.priority = getattr(carton_type, 'priority', 1)
            item.can_rotate = getattr(carton_type, 'can_rotate', True)
            items.append(item)

    # Sort items for optimization goals
    if optimization_goal == 'space':
        items.sort(key=lambda x: (not x.stackable, -x.priority, -x.value))
    elif optimization_goal == 'weight':
        items.sort(key=lambda x: x.weight, reverse=True)
    elif optimization_goal == 'cost':
        items.sort(key=lambda x: x.value, reverse=True)
    elif optimization_goal == 'min_trucks':
        items.sort(key=lambda x: (-x.priority, -x.value, -x.weight))
    else:
        items.sort(key=lambda x: (-x.priority, -x.value))

    # Multi-truck packing loop
    results = []
    remaining_items = items.copy()
    truck_idx = 0
    while remaining_items:
        packer = Packer()
        truck_bin = create_bin(truck_type, truck_idx)
        packer.add_bin(truck_bin)

        # Add items to packer
        for item in remaining_items:
            packer.add_item(item)

        packer.pack()

        # Constraint enforcement: stacking & fragility
        packed_items = []
        stack_heights = {}
        for item in truck_bin.items:
            # Fragile: cannot be at bottom (z==0)
            if getattr(item, 'fragile', False) and item.position[2] == 0:
                truck_bin.unfitted_items.append(item)
                continue
            # Stacking limit
            pos_key = (item.position[0], item.position[1])
            stack_heights[pos_key] = stack_heights.get(pos_key, 0) + 1
            if getattr(item, 'stackable', True) and stack_heights[pos_key] > getattr(item, 'max_stack_height', 5):
                truck_bin.unfitted_items.append(item)
                continue
            packed_items.append({
                'name': item.name,
                'position': item.position,
                'rotation_type': item.rotation_type,
                'width': item.width,
                'height': item.height,
                'depth': item.depth,
                'color': '#%06x' % (hash(item.name) & 0xFFFFFF),
                'carton_id': getattr(item, 'carton_id', None),
                'fragile': getattr(item, 'fragile', False),
                'stackable': getattr(item, 'stackable', True),
                'max_stack_height': getattr(item, 'max_stack_height', 5),
                'value': getattr(item, 'value', 0),
                'priority': getattr(item, 'priority', 1)
            })

        # Weight distribution check (simple: total weight per bin)
        total_weight = sum(item.weight for item in truck_bin.items)
        weight_utilization = total_weight / truck_bin.max_weight if truck_bin.max_weight > 0 else 0

        unfitted_items = []
        for item in truck_bin.unfitted_items:
            unfitted_items.append({
                'name': item.name
            })

        # Cost calculation
        truck_cost = getattr(truck_type, 'cost_per_km', 0) * getattr(truck_type, 'fuel_efficiency', 1) * getattr(truck_type, 'maintenance_cost_per_km', 0)
        total_carton_value = sum(getattr(item, 'value', 0) for item in truck_bin.items)
        total_cost = truck_cost + total_carton_value

        results.append({
            'bin_name': truck_bin.name,
            'fitted_items': packed_items,
            'unfitted_items': unfitted_items,
            'utilization': weight_utilization,
            'total_cost': total_cost,
            'truck_cost': truck_cost,
            'carton_value': total_carton_value
        })

        # Prepare for next truck if needed
        # Remove packed items from remaining_items
        packed_names = set(i['name'] for i in packed_items)
        remaining_items = [item for item in truck_bin.unfitted_items]

        truck_idx += 1

        # If no items packed, break to avoid infinite loop
        if not packed_items:
            break

    return results