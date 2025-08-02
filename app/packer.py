from py3dbp import Packer, Bin, Item

def pack_cartons(truck_type, carton_types_with_quantities):
    """
    Packs cartons into a truck using py3dbp.
    """
    packer = Packer()

    # Add the truck (bin)
    truck_bin = Bin(
        truck_type.name,
        truck_type.length,
        truck_type.width,
        truck_type.height,
        truck_type.max_weight if truck_type.max_weight else float('inf')
    )
    packer.add_bin(truck_bin)

    # Add cartons (items)
    for carton_type, quantity in carton_types_with_quantities.items():
        for _ in range(quantity):
            packer.add_item(Item(
                carton_type.name,
                carton_type.length,
                carton_type.width,
                carton_type.height,
                carton_type.weight if carton_type.weight else 0
            ))

    # Pack
    packer.pack()

    # Process results
    results = []
    for b in packer.bins:
        packed_items = []
        for item in b.items:
            packed_items.append({
                'name': item.name,
                'position': item.position,
                'rotation_type': item.rotation_type,
                'width': item.width,
                'height': item.height,
                'depth': item.depth
            })
        
        unfitted_items = []
        for item in b.unfitted_items:
            unfitted_items.append({
                'name': item.name
            })

        results.append({
            'bin_name': b.name,
            'fitted_items': packed_items,
            'unfitted_items': unfitted_items,
            'utilization': b.get_total_weight() / b.max_weight if b.max_weight > 0 else 0
        })

    return results