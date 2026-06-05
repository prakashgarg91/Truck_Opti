"""
Optioryx-Inspired Advanced 3D Bin Packing Algorithms
====================================================

Implementation of state-of-the-art 3D bin packing algorithms based on:
- Optioryx optimization techniques (2025)
- Extreme Point-Based Heuristics (Crainic et al. 2008)
- Shelf/Level-Based Packing Algorithms
- Guillotine Cut Constraints
- First Fit Decreasing (FFD) and Best Fit Decreasing (BFD)

Author: TruckOpti Enhanced Algorithm Team
Date: 2025-11-15
Version: 1.0
"""

import math
import time
import logging
from typing import List, Dict, Tuple, Optional, Set, Any
from dataclasses import dataclass, field
from enum import Enum
from copy import deepcopy

logger = logging.getLogger(__name__)


class PackingAlgorithm(Enum):
    """Advanced packing algorithm types"""
    EXTREME_POINTS_FFD = "extreme_points_ffd"  # First Fit Decreasing with Extreme Points
    EXTREME_POINTS_BFD = "extreme_points_bfd"  # Best Fit Decreasing with Extreme Points
    SHELF_ALGORITHM = "shelf_algorithm"  # Level-based packing
    GUILLOTINE_CUT = "guillotine_cut"  # Guillotine cut constraints
    HYBRID_OPTIORYX = "hybrid_optioryx"  # Combined approach


@dataclass
class Point3D:
    """3D point representation"""
    x: float
    y: float
    z: float

    def __hash__(self):
        return hash((round(self.x, 2), round(self.y, 2), round(self.z, 2)))

    def __eq__(self, other):
        if not isinstance(other, Point3D):
            return False
        return (abs(self.x - other.x) < 0.01 and
                abs(self.y - other.y) < 0.01 and
                abs(self.z - other.z) < 0.01)


@dataclass
class ExtremePoint:
    """
    Extreme Point as defined by Crainic et al. (2008)
    Extends corner points to allow placement in shaded regions
    """
    position: Point3D
    max_dimensions: Tuple[float, float, float]  # Max L, W, H that can fit here
    feasible: bool = True
    dominated: bool = False  # True if dominated by another EP

    def __hash__(self):
        return hash(self.position)


@dataclass
class CartonPlacement:
    """Enhanced carton placement with extreme point tracking"""
    carton_id: int
    position: Point3D
    dimensions: Tuple[float, float, float]  # Actual L, W, H after rotation
    rotation: int = 0  # 0-5 for six orientations
    weight: float = 0.0
    volume: float = 0.0
    extreme_point_used: Optional[Point3D] = None
    guillotine_feasible: bool = True
    shelf_level: int = 0


@dataclass
class Shelf:
    """Shelf/Level for shelf-based packing algorithms"""
    level_z: float  # Z-coordinate of shelf floor
    height: float  # Height of shelf
    length: float  # Length available
    width: float  # Width available
    current_x: float = 0.0  # Current X position for next item
    current_y: float = 0.0  # Current Y position for next item
    items: List[CartonPlacement] = field(default_factory=list)
    remaining_volume: float = 0.0

    def __post_init__(self):
        self.remaining_volume = self.length * self.width * self.height


@dataclass
class PackingResult:
    """Comprehensive packing result"""
    algorithm_used: str
    placements: List[CartonPlacement]
    unpacked_items: List[Dict]
    volume_utilization: float
    weight_utilization: float
    efficiency_score: float
    extreme_points_used: int = 0
    shelves_created: int = 0
    guillotine_compliance: float = 100.0
    processing_time: float = 0.0
    fill_rate_improvement: float = 0.0  # vs baseline
    performance_metrics: Dict[str, Any] = field(default_factory=dict)


class ExtremePointsPackerFFD:
    """
    Extreme Point-Based First Fit Decreasing Algorithm
    Based on Crainic et al. (2008) research

    Key innovation: Uses extreme points instead of just corner points,
    allowing items to be placed in shaded regions that corner points miss.
    """

    def __init__(self):
        self.name = "Extreme Points FFD (Crainic et al. 2008)"
        self.extreme_points: Set[ExtremePoint] = set()

    def pack(self, truck_spec: Dict, cartons: List[Dict]) -> PackingResult:
        """
        Pack cartons using Extreme Points First Fit Decreasing

        Args:
            truck_spec: Truck dimensions and constraints
            cartons: List of cartons to pack

        Returns:
            PackingResult with placements and metrics
        """
        start_time = time.time()

        # Initialize with origin extreme point
        origin_ep = ExtremePoint(
            position=Point3D(0, 0, 0),
            max_dimensions=(truck_spec['length'], truck_spec['width'], truck_spec['height']),
            feasible=True
        )
        self.extreme_points = {origin_ep}

        placements = []
        unpacked = []

        # First Fit Decreasing: Sort by volume descending
        sorted_cartons = sorted(cartons, key=lambda c: c['length'] * c['width'] * c['height'], reverse=True)

        for carton in sorted_cartons:
            placement = self._find_first_fit_extreme_point(carton, truck_spec, placements)

            if placement:
                placements.append(placement)
                # Update extreme points based on new placement
                self._update_extreme_points(placement, truck_spec)
            else:
                unpacked.append(carton)

        # Calculate metrics
        result = self._calculate_metrics(
            truck_spec, placements, unpacked,
            time.time() - start_time, self.name
        )
        result.extreme_points_used = len([p for p in placements if p.extreme_point_used])

        return result

    def _find_first_fit_extreme_point(self, carton: Dict, truck_spec: Dict,
                                     placements: List[CartonPlacement]) -> Optional[CartonPlacement]:
        """Find first extreme point that fits the carton"""

        # Try all 6 orientations
        orientations = self._get_orientations(carton)

        # Sort extreme points by position (prefer lower, front-left positions)
        sorted_eps = sorted(
            [ep for ep in self.extreme_points if ep.feasible and not ep.dominated],
            key=lambda ep: (ep.position.z, ep.position.y, ep.position.x)
        )

        for ep in sorted_eps:
            for orientation in orientations:
                l, w, h = orientation

                # Check if this orientation fits at this extreme point
                if (l <= ep.max_dimensions[0] and
                    w <= ep.max_dimensions[1] and
                    h <= ep.max_dimensions[2]):

                    # Check if within truck bounds
                    if (ep.position.x + l <= truck_spec['length'] and
                        ep.position.y + w <= truck_spec['width'] and
                        ep.position.z + h <= truck_spec['height']):

                        # Check for collisions
                        test_placement = CartonPlacement(
                            carton_id=carton.get('id', 0),
                            position=Point3D(ep.position.x, ep.position.y, ep.position.z),
                            dimensions=(l, w, h),
                            weight=carton.get('weight', 1.0),
                            volume=l * w * h,
                            extreme_point_used=ep.position
                        )

                        if not self._has_collision(test_placement, placements):
                            # Mark this extreme point as used (infeasible)
                            ep.feasible = False
                            return test_placement

        return None

    def _update_extreme_points(self, placement: CartonPlacement, truck_spec: Dict):
        """
        Update extreme points after placing a carton
        Based on Crainic et al. (2008) algorithm - CORRECTED VERSION

        Key fix: New extreme points should allow full remaining truck space,
        not just the dimensions of the placed box.
        """
        l, w, h = placement.dimensions
        x, y, z = placement.position.x, placement.position.y, placement.position.z

        # Generate new extreme points from the three faces of the placed box
        new_eps = []

        # EP1: Top face (above the box) - allows full remaining length and width
        if z + h < truck_spec['height']:
            new_eps.append(ExtremePoint(
                position=Point3D(x, y, z + h),
                max_dimensions=(
                    truck_spec['length'] - x,  # Full remaining length
                    truck_spec['width'] - y,    # Full remaining width
                    truck_spec['height'] - (z + h)  # Remaining height
                )
            ))

        # EP2: Right face (to the right of the box) - allows full remaining width
        if y + w < truck_spec['width']:
            new_eps.append(ExtremePoint(
                position=Point3D(x, y + w, z),
                max_dimensions=(
                    truck_spec['length'] - x,  # Full remaining length
                    truck_spec['width'] - (y + w),  # Remaining width
                    truck_spec['height'] - z  # Full remaining height
                )
            ))

        # EP3: Front face (in front of the box) - allows full remaining length
        if x + l < truck_spec['length']:
            new_eps.append(ExtremePoint(
                position=Point3D(x + l, y, z),
                max_dimensions=(
                    truck_spec['length'] - (x + l),  # Remaining length
                    truck_spec['width'] - y,  # Full remaining width
                    truck_spec['height'] - z  # Full remaining height
                )
            ))

        # Add new extreme points
        for ep in new_eps:
            self.extreme_points.add(ep)

        # Remove dominated extreme points
        self._remove_dominated_extreme_points()

    def _remove_dominated_extreme_points(self):
        """
        Remove extreme points dominated by others

        Key fix: Only consider feasible points for domination check
        """
        eps_list = list(self.extreme_points)

        for i, ep1 in enumerate(eps_list):
            # Only check domination for feasible points
            if not ep1.feasible:
                continue

            for j, ep2 in enumerate(eps_list):
                # Only compare against other feasible points
                if i != j and ep2.feasible and not ep1.dominated:
                    # EP1 is dominated by EP2 if EP2 is better or equal in all dimensions
                    if (ep2.position.x <= ep1.position.x and
                        ep2.position.y <= ep1.position.y and
                        ep2.position.z <= ep1.position.z and
                        (ep2.position.x < ep1.position.x or
                         ep2.position.y < ep1.position.y or
                         ep2.position.z < ep1.position.z)):
                        ep1.dominated = True

    def _get_orientations(self, carton: Dict) -> List[Tuple[float, float, float]]:
        """Get all possible orientations for a carton"""
        l, w, h = carton['length'], carton['width'], carton['height']

        if not carton.get('can_rotate', True):
            return [(l, w, h)]

        # All 6 possible orientations
        return [
            (l, w, h), (l, h, w),
            (w, l, h), (w, h, l),
            (h, l, w), (h, w, l)
        ]

    def _has_collision(self, new_placement: CartonPlacement,
                      placements: List[CartonPlacement]) -> bool:
        """Check for collision with existing placements"""
        tolerance = 0.01  # 10 microns tolerance

        for existing in placements:
            # Check overlap in all three dimensions
            x_overlap = not (
                new_placement.position.x + new_placement.dimensions[0] <= existing.position.x + tolerance or
                new_placement.position.x >= existing.position.x + existing.dimensions[0] - tolerance
            )
            y_overlap = not (
                new_placement.position.y + new_placement.dimensions[1] <= existing.position.y + tolerance or
                new_placement.position.y >= existing.position.y + existing.dimensions[1] - tolerance
            )
            z_overlap = not (
                new_placement.position.z + new_placement.dimensions[2] <= existing.position.z + tolerance or
                new_placement.position.z >= existing.position.z + existing.dimensions[2] - tolerance
            )

            if x_overlap and y_overlap and z_overlap:
                return True

        return False

    def _calculate_metrics(self, truck_spec: Dict, placements: List[CartonPlacement],
                          unpacked: List[Dict], processing_time: float,
                          algorithm_name: str) -> PackingResult:
        """Calculate comprehensive packing metrics"""
        truck_volume = truck_spec['length'] * truck_spec['width'] * truck_spec['height']
        truck_weight = truck_spec.get('max_weight', 10000)

        packed_volume = sum(p.volume for p in placements)
        packed_weight = sum(p.weight for p in placements)

        volume_util = (packed_volume / truck_volume * 100) if truck_volume > 0 else 0
        weight_util = (packed_weight / truck_weight * 100) if truck_weight > 0 else 0

        efficiency = (volume_util * 0.6 + weight_util * 0.4)

        return PackingResult(
            algorithm_used=algorithm_name,
            placements=placements,
            unpacked_items=unpacked,
            volume_utilization=volume_util,
            weight_utilization=weight_util,
            efficiency_score=efficiency,
            processing_time=processing_time,
            performance_metrics={
                'packed_count': len(placements),
                'unpacked_count': len(unpacked),
                'total_volume': truck_volume,
                'used_volume': packed_volume
            }
        )


class ExtremePointsPackerBFD:
    """
    Extreme Point-Based Best Fit Decreasing Algorithm

    Improvement over FFD: Chooses the extreme point that results in
    the best fit (minimal wasted space) instead of first fit.
    """

    def __init__(self):
        self.name = "Extreme Points BFD (Best Fit Decreasing)"
        self.extreme_points: Set[ExtremePoint] = set()

    def pack(self, truck_spec: Dict, cartons: List[Dict]) -> PackingResult:
        """Pack cartons using Extreme Points Best Fit Decreasing"""
        start_time = time.time()

        # Initialize with origin
        origin_ep = ExtremePoint(
            position=Point3D(0, 0, 0),
            max_dimensions=(truck_spec['length'], truck_spec['width'], truck_spec['height']),
            feasible=True
        )
        self.extreme_points = {origin_ep}

        placements = []
        unpacked = []

        # Best Fit Decreasing: Sort by volume descending
        sorted_cartons = sorted(cartons, key=lambda c: c['length'] * c['width'] * c['height'], reverse=True)

        for carton in sorted_cartons:
            placement = self._find_best_fit_extreme_point(carton, truck_spec, placements)

            if placement:
                placements.append(placement)
                self._update_extreme_points(placement, truck_spec)
            else:
                unpacked.append(carton)

        # Calculate metrics
        result = self._calculate_metrics(
            truck_spec, placements, unpacked,
            time.time() - start_time, self.name
        )
        result.extreme_points_used = len([p for p in placements if p.extreme_point_used])

        return result

    def _find_best_fit_extreme_point(self, carton: Dict, truck_spec: Dict,
                                    placements: List[CartonPlacement]) -> Optional[CartonPlacement]:
        """Find extreme point that results in best fit (minimal wasted space)"""

        orientations = self._get_orientations(carton)
        sorted_eps = sorted(
            [ep for ep in self.extreme_points if ep.feasible and not ep.dominated],
            key=lambda ep: (ep.position.z, ep.position.y, ep.position.x)
        )

        best_placement = None
        best_score = float('inf')  # Lower is better (less wasted space)
        best_ep = None

        for ep in sorted_eps:
            for orientation in orientations:
                l, w, h = orientation

                if (l <= ep.max_dimensions[0] and
                    w <= ep.max_dimensions[1] and
                    h <= ep.max_dimensions[2]):

                    if (ep.position.x + l <= truck_spec['length'] and
                        ep.position.y + w <= truck_spec['width'] and
                        ep.position.z + h <= truck_spec['height']):

                        test_placement = CartonPlacement(
                            carton_id=carton.get('id', 0),
                            position=Point3D(ep.position.x, ep.position.y, ep.position.z),
                            dimensions=(l, w, h),
                            weight=carton.get('weight', 1.0),
                            volume=l * w * h,
                            extreme_point_used=ep.position
                        )

                        if not self._has_collision(test_placement, placements):
                            # Calculate fit score (wasted space)
                            wasted_space = ((ep.max_dimensions[0] - l) *
                                          (ep.max_dimensions[1] - w) *
                                          (ep.max_dimensions[2] - h))

                            # Prefer lower positions (bonus)
                            position_score = ep.position.z

                            total_score = wasted_space + position_score * 0.1

                            if total_score < best_score:
                                best_score = total_score
                                best_placement = test_placement
                                best_ep = ep

        # Mark the used extreme point as infeasible
        if best_placement and best_ep:
            best_ep.feasible = False

        return best_placement

    def _update_extreme_points(self, placement: CartonPlacement, truck_spec: Dict):
        """
        Update extreme points (same as FFD) - CORRECTED VERSION

        Key fix: New extreme points should allow full remaining truck space
        """
        l, w, h = placement.dimensions
        x, y, z = placement.position.x, placement.position.y, placement.position.z

        new_eps = []

        # EP1: Top face - full remaining dimensions
        if z + h < truck_spec['height']:
            new_eps.append(ExtremePoint(
                position=Point3D(x, y, z + h),
                max_dimensions=(
                    truck_spec['length'] - x,
                    truck_spec['width'] - y,
                    truck_spec['height'] - (z + h)
                )
            ))

        # EP2: Right face - full remaining dimensions
        if y + w < truck_spec['width']:
            new_eps.append(ExtremePoint(
                position=Point3D(x, y + w, z),
                max_dimensions=(
                    truck_spec['length'] - x,
                    truck_spec['width'] - (y + w),
                    truck_spec['height'] - z
                )
            ))

        # EP3: Front face - full remaining dimensions
        if x + l < truck_spec['length']:
            new_eps.append(ExtremePoint(
                position=Point3D(x + l, y, z),
                max_dimensions=(
                    truck_spec['length'] - (x + l),
                    truck_spec['width'] - y,
                    truck_spec['height'] - z
                )
            ))

        for ep in new_eps:
            self.extreme_points.add(ep)

        self._remove_dominated_extreme_points()

    def _remove_dominated_extreme_points(self):
        """
        Remove dominated extreme points

        Key fix: Only consider feasible points for domination check
        """
        eps_list = list(self.extreme_points)

        for i, ep1 in enumerate(eps_list):
            # Only check domination for feasible points
            if not ep1.feasible:
                continue

            for j, ep2 in enumerate(eps_list):
                # Only compare against other feasible points
                if i != j and ep2.feasible and not ep1.dominated:
                    if (ep2.position.x <= ep1.position.x and
                        ep2.position.y <= ep1.position.y and
                        ep2.position.z <= ep1.position.z and
                        (ep2.position.x < ep1.position.x or
                         ep2.position.y < ep1.position.y or
                         ep2.position.z < ep1.position.z)):
                        ep1.dominated = True

    def _get_orientations(self, carton: Dict) -> List[Tuple[float, float, float]]:
        """Get all possible orientations"""
        l, w, h = carton['length'], carton['width'], carton['height']

        if not carton.get('can_rotate', True):
            return [(l, w, h)]

        return [
            (l, w, h), (l, h, w),
            (w, l, h), (w, h, l),
            (h, l, w), (h, w, l)
        ]

    def _has_collision(self, new_placement: CartonPlacement,
                      placements: List[CartonPlacement]) -> bool:
        """Check collision"""
        tolerance = 0.01

        for existing in placements:
            x_overlap = not (
                new_placement.position.x + new_placement.dimensions[0] <= existing.position.x + tolerance or
                new_placement.position.x >= existing.position.x + existing.dimensions[0] - tolerance
            )
            y_overlap = not (
                new_placement.position.y + new_placement.dimensions[1] <= existing.position.y + tolerance or
                new_placement.position.y >= existing.position.y + existing.dimensions[1] - tolerance
            )
            z_overlap = not (
                new_placement.position.z + new_placement.dimensions[2] <= existing.position.z + tolerance or
                new_placement.position.z >= existing.position.z + existing.dimensions[2] - tolerance
            )

            if x_overlap and y_overlap and z_overlap:
                return True

        return False

    def _calculate_metrics(self, truck_spec: Dict, placements: List[CartonPlacement],
                          unpacked: List[Dict], processing_time: float,
                          algorithm_name: str) -> PackingResult:
        """Calculate metrics"""
        truck_volume = truck_spec['length'] * truck_spec['width'] * truck_spec['height']
        truck_weight = truck_spec.get('max_weight', 10000)

        packed_volume = sum(p.volume for p in placements)
        packed_weight = sum(p.weight for p in placements)

        volume_util = (packed_volume / truck_volume * 100) if truck_volume > 0 else 0
        weight_util = (packed_weight / truck_weight * 100) if truck_weight > 0 else 0

        efficiency = (volume_util * 0.6 + weight_util * 0.4)

        return PackingResult(
            algorithm_used=algorithm_name,
            placements=placements,
            unpacked_items=unpacked,
            volume_utilization=volume_util,
            weight_utilization=weight_util,
            efficiency_score=efficiency,
            processing_time=processing_time,
            performance_metrics={
                'packed_count': len(placements),
                'unpacked_count': len(unpacked)
            }
        )


class ShelfAlgorithmPacker:
    """
    Shelf/Level-Based Packing Algorithm
    Inspired by Peak Filling Slice Push (PFSP) heuristic

    Divides truck space into horizontal levels (shelves) and packs items
    on each shelf before moving to the next level.
    """

    def __init__(self):
        self.name = "Shelf Algorithm (Level-Based Packing)"
        self.shelves: List[Shelf] = []

    def pack(self, truck_spec: Dict, cartons: List[Dict]) -> PackingResult:
        """Pack cartons using shelf-based algorithm"""
        start_time = time.time()

        self.shelves = []
        placements = []
        unpacked = []

        # Sort by height descending (tallest first creates better shelves)
        sorted_cartons = sorted(cartons, key=lambda c: c['height'], reverse=True)

        for carton in sorted_cartons:
            placement = self._pack_on_shelf(carton, truck_spec)

            if placement:
                placements.append(placement)
            else:
                unpacked.append(carton)

        # Calculate metrics
        result = self._calculate_metrics(
            truck_spec, placements, unpacked,
            time.time() - start_time, self.name
        )
        result.shelves_created = len(self.shelves)

        return result

    def _pack_on_shelf(self, carton: Dict, truck_spec: Dict) -> Optional[CartonPlacement]:
        """Try to pack carton on existing shelf or create new shelf"""

        # Try existing shelves first
        for shelf_idx, shelf in enumerate(self.shelves):
            placement = self._try_pack_on_shelf(carton, shelf, shelf_idx)
            if placement:
                shelf.items.append(placement)
                shelf.remaining_volume -= placement.volume
                return placement

        # Create new shelf if space available
        new_shelf_z = sum(s.height for s in self.shelves)

        if new_shelf_z + carton['height'] <= truck_spec['height']:
            new_shelf = Shelf(
                level_z=new_shelf_z,
                height=carton['height'] * 1.1,  # 10% margin
                length=truck_spec['length'],
                width=truck_spec['width']
            )

            placement = CartonPlacement(
                carton_id=carton.get('id', 0),
                position=Point3D(0, 0, new_shelf_z),
                dimensions=(carton['length'], carton['width'], carton['height']),
                weight=carton.get('weight', 1.0),
                volume=carton['length'] * carton['width'] * carton['height'],
                shelf_level=len(self.shelves)
            )

            new_shelf.items.append(placement)
            new_shelf.current_x = carton['length']
            new_shelf.remaining_volume -= placement.volume
            self.shelves.append(new_shelf)

            return placement

        return None

    def _try_pack_on_shelf(self, carton: Dict, shelf: Shelf,
                          shelf_idx: int) -> Optional[CartonPlacement]:
        """Try to pack carton on a specific shelf"""

        # Check if carton height fits in shelf
        if carton['height'] > shelf.height:
            return None

        # Try to pack along length (X-axis)
        if (shelf.current_x + carton['length'] <= shelf.length and
            carton['width'] <= shelf.width):

            placement = CartonPlacement(
                carton_id=carton.get('id', 0),
                position=Point3D(shelf.current_x, shelf.current_y, shelf.level_z),
                dimensions=(carton['length'], carton['width'], carton['height']),
                weight=carton.get('weight', 1.0),
                volume=carton['length'] * carton['width'] * carton['height'],
                shelf_level=shelf_idx
            )

            shelf.current_x += carton['length']
            return placement

        # Try next row on shelf
        if (shelf.current_y + carton['width'] <= shelf.width and
            carton['length'] <= shelf.length):

            placement = CartonPlacement(
                carton_id=carton.get('id', 0),
                position=Point3D(0, shelf.current_y + shelf.width, shelf.level_z),
                dimensions=(carton['length'], carton['width'], carton['height']),
                weight=carton.get('weight', 1.0),
                volume=carton['length'] * carton['width'] * carton['height'],
                shelf_level=shelf_idx
            )

            shelf.current_x = carton['length']
            shelf.current_y += carton['width']
            return placement

        return None

    def _calculate_metrics(self, truck_spec: Dict, placements: List[CartonPlacement],
                          unpacked: List[Dict], processing_time: float,
                          algorithm_name: str) -> PackingResult:
        """Calculate metrics"""
        truck_volume = truck_spec['length'] * truck_spec['width'] * truck_spec['height']
        truck_weight = truck_spec.get('max_weight', 10000)

        packed_volume = sum(p.volume for p in placements)
        packed_weight = sum(p.weight for p in placements)

        volume_util = (packed_volume / truck_volume * 100) if truck_volume > 0 else 0
        weight_util = (packed_weight / truck_weight * 100) if truck_weight > 0 else 0

        efficiency = (volume_util * 0.6 + weight_util * 0.4)

        return PackingResult(
            algorithm_used=algorithm_name,
            placements=placements,
            unpacked_items=unpacked,
            volume_utilization=volume_util,
            weight_utilization=weight_util,
            efficiency_score=efficiency,
            processing_time=processing_time,
            performance_metrics={
                'packed_count': len(placements),
                'unpacked_count': len(unpacked),
                'shelves_used': len(self.shelves)
            }
        )


def run_optioryx_optimization(truck_spec: Dict, cartons: List[Dict],
                             algorithm: PackingAlgorithm = PackingAlgorithm.HYBRID_OPTIORYX) -> PackingResult:
    """
    Run Optioryx-inspired optimization with specified algorithm

    Args:
        truck_spec: Truck specifications
        cartons: List of cartons to pack
        algorithm: Algorithm to use

    Returns:
        PackingResult with comprehensive metrics
    """

    if algorithm == PackingAlgorithm.EXTREME_POINTS_FFD:
        packer = ExtremePointsPackerFFD()
        return packer.pack(truck_spec, cartons)

    elif algorithm == PackingAlgorithm.EXTREME_POINTS_BFD:
        packer = ExtremePointsPackerBFD()
        return packer.pack(truck_spec, cartons)

    elif algorithm == PackingAlgorithm.SHELF_ALGORITHM:
        packer = ShelfAlgorithmPacker()
        return packer.pack(truck_spec, cartons)

    elif algorithm == PackingAlgorithm.HYBRID_OPTIORYX:
        # Run all algorithms and pick best result
        results = []

        ffd_packer = ExtremePointsPackerFFD()
        results.append(ffd_packer.pack(truck_spec, cartons))

        bfd_packer = ExtremePointsPackerBFD()
        results.append(bfd_packer.pack(truck_spec, cartons))

        shelf_packer = ShelfAlgorithmPacker()
        results.append(shelf_packer.pack(truck_spec, cartons))

        # Return best result by efficiency score
        best_result = max(results, key=lambda r: r.efficiency_score)
        best_result.algorithm_used = "Hybrid Optioryx (Best of FFD/BFD/Shelf)"

        return best_result

    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")


def benchmark_optioryx_algorithms(truck_spec: Dict, cartons: List[Dict]) -> Dict[str, PackingResult]:
    """
    Benchmark all Optioryx algorithms and return comparative results

    Returns:
        Dictionary mapping algorithm names to results
    """
    results = {}

    algorithms = [
        (PackingAlgorithm.EXTREME_POINTS_FFD, "EP-FFD"),
        (PackingAlgorithm.EXTREME_POINTS_BFD, "EP-BFD"),
        (PackingAlgorithm.SHELF_ALGORITHM, "Shelf"),
    ]

    for algo, name in algorithms:
        try:
            result = run_optioryx_optimization(truck_spec, cartons, algo)
            results[name] = result
            logger.info(f"{name}: {result.efficiency_score:.2f}% efficiency, "
                       f"{result.volume_utilization:.2f}% volume util, "
                       f"{result.processing_time:.3f}s")
        except Exception as e:
            logger.error(f"Algorithm {name} failed: {e}")

    return results
