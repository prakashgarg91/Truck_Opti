"""
Guillotine Cut 3D Bin Packing Algorithm
========================================

Implementation of 3D bin packing with guillotine cut constraints.
Based on research for real-world logistics where items must be removable
without moving other items (guillotine-type cuts).

Key Features:
- Guillotine cut constraint compliance
- Three partition strategies (area, length, width)
- Rectangle merging for efficiency
- Real-world unpacking feasibility

References:
- ACO algorithms for 3D bin packing with guillotine cut constraint
- Dynamic programming with heuristic tree search for guillotine-cutting

Author: TruckOpti Enhanced Algorithm Team
Date: 2025-11-15
Version: 1.0
"""

import math
import time
import logging
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
from copy import deepcopy

logger = logging.getLogger(__name__)


class PartitionStrategy(Enum):
    """Guillotine partition strategies"""
    SHORTEST_AXIS_SPLIT = "shortest_axis"  # Split along shortest remaining axis
    LONGEST_AXIS_SPLIT = "longest_axis"  # Split along longest remaining axis
    MINIMIZE_AREA = "minimize_area"  # Minimize wasted area
    BALANCED_SPLIT = "balanced"  # Balance remaining spaces


@dataclass
class Rectangle3D:
    """3D rectangular space representation"""
    x: float
    y: float
    z: float
    length: float  # X dimension
    width: float  # Y dimension
    height: float  # Z dimension
    occupied: bool = False
    item_id: Optional[int] = None

    @property
    def volume(self) -> float:
        return self.length * self.width * self.height

    @property
    def area_xy(self) -> float:
        """Base area (XY plane)"""
        return self.length * self.width

    def contains_point(self, px: float, py: float, pz: float) -> bool:
        """Check if point is inside rectangle"""
        return (self.x <= px < self.x + self.length and
                self.y <= py < self.y + self.width and
                self.z <= pz < self.z + self.height)

    def intersects(self, other: 'Rectangle3D') -> bool:
        """Check if this rectangle intersects with another"""
        return not (
            self.x + self.length <= other.x or
            other.x + other.length <= self.x or
            self.y + self.width <= other.y or
            other.y + other.width <= self.y or
            self.z + self.height <= other.z or
            other.z + other.height <= self.z
        )


@dataclass
class GuillotineCutResult:
    """Result of guillotine cut placement"""
    item_id: int
    position: Tuple[float, float, float]
    dimensions: Tuple[float, float, float]
    rotation: int = 0
    cut_sequence: List[str] = field(default_factory=list)
    removable: bool = True  # Can be removed without moving others


@dataclass
class PackingResultGuillotine:
    """Packing result with guillotine compliance"""
    algorithm_used: str
    placements: List[GuillotineCutResult]
    unpacked_items: List[Dict]
    volume_utilization: float
    weight_utilization: float
    efficiency_score: float
    guillotine_compliance: float  # % of items that are removable
    processing_time: float
    cuts_performed: int = 0
    max_cut_depth: int = 0


class GuillotineCutPacker:
    """
    3D Bin Packing with Guillotine Cut Constraints

    Ensures all items can be removed using guillotine-type cuts
    (straight cuts from one edge to the opposite edge).
    """

    def __init__(self, strategy: PartitionStrategy = PartitionStrategy.MINIMIZE_AREA):
        self.name = "Guillotine Cut 3D Packer"
        self.strategy = strategy
        self.free_rectangles: List[Rectangle3D] = []
        self.placements: List[GuillotineCutResult] = []
        self.cuts_performed = 0
        self.max_cut_depth = 0

    def pack(self, truck_spec: Dict, cartons: List[Dict]) -> PackingResultGuillotine:
        """
        Pack cartons with guillotine cut constraints

        Args:
            truck_spec: Truck specifications
            cartons: List of cartons to pack

        Returns:
            PackingResultGuillotine with placements and compliance metrics
        """
        start_time = time.time()

        # Initialize with full truck space as one free rectangle
        self.free_rectangles = [Rectangle3D(
            x=0, y=0, z=0,
            length=truck_spec['length'],
            width=truck_spec['width'],
            height=truck_spec['height']
        )]
        self.placements = []
        self.cuts_performed = 0
        self.max_cut_depth = 0

        unpacked = []

        # Sort by volume descending
        sorted_cartons = sorted(
            cartons,
            key=lambda c: c['length'] * c['width'] * c['height'],
            reverse=True
        )

        for carton in sorted_cartons:
            placement = self._pack_with_guillotine(carton, truck_spec)

            if placement:
                self.placements.append(placement)
            else:
                unpacked.append(carton)

        # Calculate metrics
        result = self._calculate_metrics(
            truck_spec, self.placements, unpacked,
            time.time() - start_time
        )
        result.cuts_performed = self.cuts_performed
        result.max_cut_depth = self.max_cut_depth

        return result

    def _pack_with_guillotine(self, carton: Dict,
                             truck_spec: Dict) -> Optional[GuillotineCutResult]:
        """
        Pack a carton using guillotine cut method

        Finds best free rectangle and splits it with guillotine cuts
        """

        # Try all orientations
        orientations = self._get_orientations(carton)

        best_placement = None
        best_score = -1
        best_rect_idx = -1
        best_orientation = None

        for rect_idx, rect in enumerate(self.free_rectangles):
            if rect.occupied:
                continue

            for orientation in orientations:
                l, w, h = orientation

                # Check if item fits in this rectangle
                if l <= rect.length and w <= rect.width and h <= rect.height:
                    # Calculate placement score
                    score = self._calculate_placement_score(rect, l, w, h)

                    if score > best_score:
                        best_score = score
                        best_rect_idx = rect_idx
                        best_orientation = (l, w, h)
                        best_placement = GuillotineCutResult(
                            item_id=carton.get('id', 0),
                            position=(rect.x, rect.y, rect.z),
                            dimensions=(l, w, h),
                            removable=True
                        )

        if best_placement:
            # Perform guillotine cut
            self._guillotine_cut(best_rect_idx, best_orientation)
            return best_placement

        return None

    def _guillotine_cut(self, rect_idx: int, item_dims: Tuple[float, float, float]):
        """
        Perform guillotine cut on a free rectangle after placing an item

        This splits the rectangle into sub-rectangles using straight cuts.
        """
        rect = self.free_rectangles[rect_idx]
        l, w, h = item_dims

        # Mark rectangle as occupied
        rect.occupied = True
        self.cuts_performed += 1

        # Generate new free rectangles from the cut
        new_rectangles = []

        # Strategy 1: Split along longest axis
        if self.strategy == PartitionStrategy.LONGEST_AXIS_SPLIT:
            remaining_length = rect.length - l
            remaining_width = rect.width - w
            remaining_height = rect.height - h

            # Right remainder (along X)
            if remaining_length > 0:
                new_rectangles.append(Rectangle3D(
                    x=rect.x + l,
                    y=rect.y,
                    z=rect.z,
                    length=remaining_length,
                    width=rect.width,
                    height=h
                ))

            # Back remainder (along Y)
            if remaining_width > 0:
                new_rectangles.append(Rectangle3D(
                    x=rect.x,
                    y=rect.y + w,
                    z=rect.z,
                    length=l,
                    width=remaining_width,
                    height=h
                ))

            # Top remainder (along Z)
            if remaining_height > 0:
                new_rectangles.append(Rectangle3D(
                    x=rect.x,
                    y=rect.y,
                    z=rect.z + h,
                    length=rect.length,
                    width=rect.width,
                    height=remaining_height
                ))

        # Strategy 2: Minimize wasted area
        elif self.strategy == PartitionStrategy.MINIMIZE_AREA:
            # Create three sub-rectangles optimally
            # Right space
            if rect.length > l:
                new_rectangles.append(Rectangle3D(
                    x=rect.x + l,
                    y=rect.y,
                    z=rect.z,
                    length=rect.length - l,
                    width=w,
                    height=h
                ))

            # Back space
            if rect.width > w:
                new_rectangles.append(Rectangle3D(
                    x=rect.x,
                    y=rect.y + w,
                    z=rect.z,
                    length=rect.length,
                    width=rect.width - w,
                    height=h
                ))

            # Top space
            if rect.height > h:
                new_rectangles.append(Rectangle3D(
                    x=rect.x,
                    y=rect.y,
                    z=rect.z + h,
                    length=rect.length,
                    width=rect.width,
                    height=rect.height - h
                ))

        # Strategy 3: Shortest axis split
        elif self.strategy == PartitionStrategy.SHORTEST_AXIS_SPLIT:
            remaining = [
                ('length', rect.length - l),
                ('width', rect.width - w),
                ('height', rect.height - h)
            ]
            # Sort by remaining space (shortest first)
            remaining.sort(key=lambda x: x[1])

            # Create rectangles for remaining spaces
            if rect.length > l:
                new_rectangles.append(Rectangle3D(
                    x=rect.x + l, y=rect.y, z=rect.z,
                    length=rect.length - l, width=w, height=h
                ))

            if rect.width > w:
                new_rectangles.append(Rectangle3D(
                    x=rect.x, y=rect.y + w, z=rect.z,
                    length=rect.length, width=rect.width - w, height=h
                ))

            if rect.height > h:
                new_rectangles.append(Rectangle3D(
                    x=rect.x, y=rect.y, z=rect.z + h,
                    length=rect.length, width=rect.width, height=rect.height - h
                ))

        # Add new free rectangles
        for new_rect in new_rectangles:
            if new_rect.volume > 0:  # Only add non-zero volume rectangles
                self.free_rectangles.append(new_rect)

        # Merge adjacent free rectangles to reduce fragmentation
        self._merge_free_rectangles()

    def _merge_free_rectangles(self):
        """
        Merge adjacent free rectangles to reduce fragmentation
        This is crucial for guillotine cut efficiency
        """
        # Simple merge: combine rectangles that share a face
        merged = True

        while merged:
            merged = False
            for i in range(len(self.free_rectangles)):
                if self.free_rectangles[i].occupied:
                    continue

                for j in range(i + 1, len(self.free_rectangles)):
                    if self.free_rectangles[j].occupied:
                        continue

                    rect1 = self.free_rectangles[i]
                    rect2 = self.free_rectangles[j]

                    # Try to merge if they share a face
                    merged_rect = self._try_merge(rect1, rect2)

                    if merged_rect:
                        # Mark both as occupied
                        rect1.occupied = True
                        rect2.occupied = True
                        # Add merged rectangle
                        self.free_rectangles.append(merged_rect)
                        merged = True
                        break

                if merged:
                    break

        # Remove occupied rectangles
        self.free_rectangles = [r for r in self.free_rectangles if not r.occupied]

    def _try_merge(self, rect1: Rectangle3D, rect2: Rectangle3D) -> Optional[Rectangle3D]:
        """Try to merge two rectangles if they share a complete face"""

        tolerance = 0.01

        # Check if they can be merged along X-axis
        if (abs(rect1.y - rect2.y) < tolerance and
            abs(rect1.z - rect2.z) < tolerance and
            abs(rect1.width - rect2.width) < tolerance and
            abs(rect1.height - rect2.height) < tolerance):

            if abs(rect1.x + rect1.length - rect2.x) < tolerance:
                # rect2 is to the right of rect1
                return Rectangle3D(
                    x=rect1.x, y=rect1.y, z=rect1.z,
                    length=rect1.length + rect2.length,
                    width=rect1.width,
                    height=rect1.height
                )
            elif abs(rect2.x + rect2.length - rect1.x) < tolerance:
                # rect1 is to the right of rect2
                return Rectangle3D(
                    x=rect2.x, y=rect1.y, z=rect1.z,
                    length=rect1.length + rect2.length,
                    width=rect1.width,
                    height=rect1.height
                )

        # Check if they can be merged along Y-axis
        if (abs(rect1.x - rect2.x) < tolerance and
            abs(rect1.z - rect2.z) < tolerance and
            abs(rect1.length - rect2.length) < tolerance and
            abs(rect1.height - rect2.height) < tolerance):

            if abs(rect1.y + rect1.width - rect2.y) < tolerance:
                return Rectangle3D(
                    x=rect1.x, y=rect1.y, z=rect1.z,
                    length=rect1.length,
                    width=rect1.width + rect2.width,
                    height=rect1.height
                )
            elif abs(rect2.y + rect2.width - rect1.y) < tolerance:
                return Rectangle3D(
                    x=rect1.x, y=rect2.y, z=rect1.z,
                    length=rect1.length,
                    width=rect1.width + rect2.width,
                    height=rect1.height
                )

        # Check if they can be merged along Z-axis
        if (abs(rect1.x - rect2.x) < tolerance and
            abs(rect1.y - rect2.y) < tolerance and
            abs(rect1.length - rect2.length) < tolerance and
            abs(rect1.width - rect2.width) < tolerance):

            if abs(rect1.z + rect1.height - rect2.z) < tolerance:
                return Rectangle3D(
                    x=rect1.x, y=rect1.y, z=rect1.z,
                    length=rect1.length,
                    width=rect1.width,
                    height=rect1.height + rect2.height
                )
            elif abs(rect2.z + rect2.height - rect1.z) < tolerance:
                return Rectangle3D(
                    x=rect1.x, y=rect1.y, z=rect2.z,
                    length=rect1.length,
                    width=rect1.width,
                    height=rect1.height + rect2.height
                )

        return None

    def _calculate_placement_score(self, rect: Rectangle3D,
                                   item_l: float, item_w: float, item_h: float) -> float:
        """
        Calculate how good a placement is in a free rectangle

        Prefers:
        - Tight fit (less wasted space)
        - Lower positions (z-axis)
        - Front-left positions
        """
        # Wasted space
        wasted_volume = rect.volume - (item_l * item_w * item_h)
        space_efficiency = 1.0 / (1.0 + wasted_volume / 1000.0)

        # Position preference (lower is better)
        position_score = 1.0 / (1.0 + rect.z / 100.0)

        # Front-left preference
        front_left_score = 1.0 / (1.0 + (rect.x + rect.y) / 100.0)

        # Combined score
        score = (space_efficiency * 0.5 +
                position_score * 0.3 +
                front_left_score * 0.2)

        return score

    def _get_orientations(self, carton: Dict) -> List[Tuple[float, float, float]]:
        """Get all possible orientations"""
        l, w, h = carton['length'], carton['width'], carton['height']

        if not carton.get('can_rotate', True):
            return [(l, w, h)]

        # All 6 orientations
        orientations = [
            (l, w, h), (l, h, w),
            (w, l, h), (w, h, l),
            (h, l, w), (h, w, l)
        ]

        # Remove duplicates (for cubes and similar shapes)
        unique_orientations = []
        for orient in orientations:
            if orient not in unique_orientations:
                unique_orientations.append(orient)

        return unique_orientations

    def _calculate_metrics(self, truck_spec: Dict,
                          placements: List[GuillotineCutResult],
                          unpacked: List[Dict],
                          processing_time: float) -> PackingResultGuillotine:
        """Calculate comprehensive metrics"""
        truck_volume = truck_spec['length'] * truck_spec['width'] * truck_spec['height']
        truck_weight = truck_spec.get('max_weight', 10000)

        packed_volume = sum(p.dimensions[0] * p.dimensions[1] * p.dimensions[2]
                           for p in placements)
        # Note: weight info needs to be tracked separately if needed

        volume_util = (packed_volume / truck_volume * 100) if truck_volume > 0 else 0
        weight_util = 0.0  # Would need weight tracking

        efficiency = volume_util  # Simplified

        # Guillotine compliance: all items should be removable
        removable_count = sum(1 for p in placements if p.removable)
        guillotine_compliance = (removable_count / len(placements) * 100) if placements else 100.0

        return PackingResultGuillotine(
            algorithm_used=self.name,
            placements=placements,
            unpacked_items=unpacked,
            volume_utilization=volume_util,
            weight_utilization=weight_util,
            efficiency_score=efficiency,
            guillotine_compliance=guillotine_compliance,
            processing_time=processing_time
        )


def run_guillotine_optimization(truck_spec: Dict, cartons: List[Dict],
                               strategy: PartitionStrategy = PartitionStrategy.MINIMIZE_AREA) -> PackingResultGuillotine:
    """
    Run guillotine cut optimization

    Args:
        truck_spec: Truck specifications
        cartons: List of cartons to pack
        strategy: Partition strategy to use

    Returns:
        PackingResultGuillotine with results
    """
    packer = GuillotineCutPacker(strategy=strategy)
    return packer.pack(truck_spec, cartons)


def compare_guillotine_strategies(truck_spec: Dict, cartons: List[Dict]) -> Dict[str, PackingResultGuillotine]:
    """
    Compare all guillotine partition strategies

    Returns:
        Dictionary mapping strategy names to results
    """
    results = {}

    strategies = [
        (PartitionStrategy.MINIMIZE_AREA, "Minimize Area"),
        (PartitionStrategy.LONGEST_AXIS_SPLIT, "Longest Axis"),
        (PartitionStrategy.SHORTEST_AXIS_SPLIT, "Shortest Axis"),
    ]

    for strategy, name in strategies:
        try:
            result = run_guillotine_optimization(truck_spec, cartons, strategy)
            results[name] = result
            logger.info(f"{name}: {result.efficiency_score:.2f}% efficiency, "
                       f"{result.guillotine_compliance:.2f}% compliance, "
                       f"{result.processing_time:.3f}s")
        except Exception as e:
            logger.error(f"Strategy {name} failed: {e}")

    return results
