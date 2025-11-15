#!/usr/bin/env python3
"""
Debug script to understand extreme points packing issue
"""

import sys
import os
import importlib.util

def load_module_from_file(module_name, file_path):
    """Load a Python module directly from file"""
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

# Load the algorithm module
base_dir = os.path.dirname(__file__)
optioryx_advanced = load_module_from_file(
    "optioryx_advanced_algorithms",
    os.path.join(base_dir, "app", "optioryx_advanced_algorithms.py")
)

ExtremePointsPackerFFD = optioryx_advanced.ExtremePointsPackerFFD

# Simple test case
truck = {
    'length': 6000,
    'width': 2400,
    'height': 2400,
    'max_weight': 5000
}

# Just 3 boxes
cartons = [
    {'id': 1, 'name': 'Box1', 'length': 1200, 'width': 800, 'height': 800, 'weight': 150, 'can_rotate': True},
    {'id': 2, 'name': 'Box2', 'length': 1200, 'width': 800, 'height': 800, 'weight': 150, 'can_rotate': True},
    {'id': 3, 'name': 'Box3', 'length': 1200, 'width': 800, 'height': 800, 'weight': 150, 'can_rotate': True},
]

print("=" * 80)
print("DEBUGGING EXTREME POINTS PACKING")
print("=" * 80)
print(f"\nTruck: {truck['length']} x {truck['width']} x {truck['height']} mm")
print(f"Boxes: 3 identical boxes of 1200 x 800 x 800 mm")
print(f"Theoretical capacity: {(truck['length'] * truck['width'] * truck['height']) / (1200 * 800 * 800):.1f} boxes\n")

packer = ExtremePointsPackerFFD()

# Manually pack to see what happens
print("-" * 80)
print("PACKING PROCESS:")
print("-" * 80)

# Initialize
from optioryx_advanced_algorithms import ExtremePoint, Point3D
origin_ep = ExtremePoint(
    position=Point3D(0, 0, 0),
    max_dimensions=(truck['length'], truck['width'], truck['height']),
    feasible=True
)
packer.extreme_points = {origin_ep}

placements = []

print(f"\nInitial extreme points: {len(packer.extreme_points)}")
for ep in packer.extreme_points:
    print(f"  EP at ({ep.position.x}, {ep.position.y}, {ep.position.z}) - max dims: {ep.max_dimensions}")

# Try to pack each carton
for i, carton in enumerate(sorted(cartons, key=lambda c: c['length'] * c['width'] * c['height'], reverse=True)):
    print(f"\n--- Packing Carton {i+1}: {carton['name']} ---")
    print(f"Dimensions: {carton['length']} x {carton['width']} x {carton['height']}")
    print(f"Available extreme points: {len([ep for ep in packer.extreme_points if ep.feasible and not ep.dominated])}")

    placement = packer._find_first_fit_extreme_point(carton, truck, placements)

    if placement:
        print(f"✓ Placed at ({placement.position.x}, {placement.position.y}, {placement.position.z})")
        print(f"  Dimensions: {placement.dimensions}")
        placements.append(placement)
        packer._update_extreme_points(placement, truck)

        print(f"  Total extreme points: {len(packer.extreme_points)}")
        print(f"  Feasible+Non-dominated: {len([ep for ep in packer.extreme_points if ep.feasible and not ep.dominated])}")
        for ep in packer.extreme_points:
            status = []
            if not ep.feasible:
                status.append("INFEASIBLE")
            if ep.dominated:
                status.append("DOMINATED")
            status_str = f" [{', '.join(status)}]" if status else ""
            print(f"    EP at ({ep.position.x}, {ep.position.y}, {ep.position.z}) - max dims: {ep.max_dimensions}{status_str}")
    else:
        print(f"✗ Could not find valid placement")
        print(f"  Current extreme points:")
        for ep in packer.extreme_points:
            if ep.feasible and not ep.dominated:
                print(f"    EP at ({ep.position.x}, {ep.position.y}, {ep.position.z}) - max dims: {ep.max_dimensions}")

print("\n" + "=" * 80)
print(f"RESULT: Packed {len(placements)}/3 boxes")
print("=" * 80)

# Show detailed placement info
if placements:
    print("\nPlaced boxes:")
    for p in placements:
        print(f"  Box at ({p.position.x}, {p.position.y}, {p.position.z}) - dims: {p.dimensions}")

# Try to understand why second box fails
if len(placements) < 3:
    print("\n" + "=" * 80)
    print("DEBUGGING WHY BOXES DON'T FIT:")
    print("=" * 80)

    # Check the extreme points after first placement
    if len(placements) >= 1:
        print(f"\nAfter placing box 1:")
        print(f"Extreme points available: {len([ep for ep in packer.extreme_points if ep.feasible and not ep.dominated])}")

        # Check if box 2 should fit
        box2 = cartons[1]
        print(f"\nTrying to fit box 2: {box2['length']} x {box2['width']} x {box2['height']}")

        for ep in packer.extreme_points:
            if not ep.feasible or ep.dominated:
                continue

            print(f"\n  Checking EP at ({ep.position.x}, {ep.position.y}, {ep.position.z}):")
            print(f"    Max dimensions: {ep.max_dimensions}")

            # Check each orientation
            orientations = packer._get_orientations(box2)
            print(f"    Trying {len(orientations)} orientations")

            for j, (l, w, h) in enumerate(orientations):
                fits_max_dims = (l <= ep.max_dimensions[0] and
                                w <= ep.max_dimensions[1] and
                                h <= ep.max_dimensions[2])

                fits_truck = (ep.position.x + l <= truck['length'] and
                             ep.position.y + w <= truck['width'] and
                             ep.position.z + h <= truck['height'])

                # Create test placement
                from optioryx_advanced_algorithms import CartonPlacement
                test_placement = CartonPlacement(
                    carton_id=box2['id'],
                    position=Point3D(ep.position.x, ep.position.y, ep.position.z),
                    dimensions=(l, w, h),
                    weight=box2['weight'],
                    volume=l * w * h,
                    extreme_point_used=ep.position
                )

                has_collision = packer._has_collision(test_placement, placements)

                print(f"      Orient {j+1} ({l}x{w}x{h}): max_dims={fits_max_dims}, truck={fits_truck}, collision={has_collision}")

                if fits_max_dims and fits_truck and not has_collision:
                    print(f"      ✓ THIS SHOULD WORK!")
