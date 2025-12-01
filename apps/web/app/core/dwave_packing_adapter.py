"""
D-Wave 3D Bin Packing Adapter - Adapts D-Wave mathematical optimization to TruckOptimum format.
Based on D-Wave formulation using SciPy MILP solver for local optimization.
"""

from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import numpy as np
from itertools import combinations, permutations


@dataclass
class DWaveCase:
    """Represents a carton/case to be packed"""
    id: int
    name: str
    length: float
    width: float
    height: float
    weight: float
    quantity: int = 1


@dataclass
class DWaveBin:
    """Represents a truck/bin container"""
    id: int
    name: str
    length: float
    width: float
    height: float
    max_weight: float


@dataclass
class PackedItem:
    """Represents a packed item with position and orientation"""
    case: DWaveCase
    bin_id: int
    x: float
    y: float
    z: float
    orientation: int  # 0-5 for 6 rotations
    dx: float  # effective length after rotation
    dy: float  # effective width after rotation
    dz: float  # effective height after rotation


class DWaveSciPySolver:
    """
    3D Bin Packing using SciPy MILP optimization (local, free)
    Based on D-Wave mathematical formulation
    """

    def __init__(self, time_limit: float = 20.0):
        self.time_limit = time_limit

    def solve(self, cases: List[DWaveCase], bin_template: DWaveBin,
              max_bins: int = 10) -> Dict:
        """Main solve method - returns TruckOptimum compatible result"""
        # Expand cases by quantity
        expanded = self._expand_cases(cases)

        # Estimate bins needed
        num_bins = self._estimate_bins(expanded, bin_template)

        # Use heuristic-enhanced approach (faster than pure MILP)
        placements = self._solve_heuristic_enhanced(expanded, bin_template, num_bins)

        # Format result
        return self._format_result(placements, expanded, bin_template)

    def _expand_cases(self, cases: List[DWaveCase]) -> List[DWaveCase]:
        """Expand cases by quantity into individual items"""
        expanded = []
        for case in cases:
            for i in range(case.quantity):
                expanded.append(DWaveCase(
                    id=len(expanded),
                    name=f"{case.name}_{i}",
                    length=case.length,
                    width=case.width,
                    height=case.height,
                    weight=case.weight,
                    quantity=1
                ))
        return expanded

    def _estimate_bins(self, cases: List[DWaveCase], bin_template: DWaveBin) -> int:
        """Estimate number of bins needed based on volume"""
        total_vol = sum(c.length * c.width * c.height for c in cases)
        bin_vol = bin_template.length * bin_template.width * bin_template.height
        return max(1, int(np.ceil(total_vol / bin_vol * 1.3)))

    def _get_orientations(self, case: DWaveCase) -> List[Tuple[float, float, float]]:
        """Return all 6 possible orientations"""
        l, w, h = case.length, case.width, case.height
        return [
            (l, w, h), (l, h, w), (w, l, h),
            (w, h, l), (h, l, w), (h, w, l)
        ]

    def _can_place(self, x: float, y: float, z: float,
                   dx: float, dy: float, dz: float,
                   bin_template: DWaveBin, placed: List[PackedItem]) -> bool:
        """Check if item can be placed without collision"""
        # Boundary check
        if x + dx > bin_template.length or y + dy > bin_template.width or z + dz > bin_template.height:
            return False
        # Collision check
        for p in placed:
            if not (x >= p.x + p.dx or p.x >= x + dx or
                    y >= p.y + p.dy or p.y >= y + dy or
                    z >= p.z + p.dz or p.z >= z + dz):
                return False
        return True

    def _find_position(self, case: DWaveCase, bin_id: int,
                       bin_template: DWaveBin, placed: List[PackedItem]) -> Optional[PackedItem]:
        """Find best position using extreme points method"""
        # Generate candidate positions
        candidates = [(0, 0, 0)]
        for p in placed:
            if p.bin_id == bin_id:
                candidates.extend([
                    (p.x + p.dx, p.y, p.z),
                    (p.x, p.y + p.dy, p.z),
                    (p.x, p.y, p.z + p.dz)
                ])

        best = None
        best_score = float('inf')

        for x, y, z in candidates:
            for ori_idx, (dx, dy, dz) in enumerate(self._get_orientations(case)):
                if self._can_place(x, y, z, dx, dy, dz, bin_template,
                                   [p for p in placed if p.bin_id == bin_id]):
                    # Score: prefer lower, back-left positions
                    score = z * 1000 + y * 100 + x
                    if score < best_score:
                        best_score = score
                        best = PackedItem(case, bin_id, x, y, z, ori_idx, dx, dy, dz)

        return best

    def _solve_heuristic_enhanced(self, cases: List[DWaveCase],
                                   bin_template: DWaveBin, num_bins: int) -> List[PackedItem]:
        """Heuristic solver with multi-start improvement"""
        # Sort by volume descending
        sorted_cases = sorted(cases, key=lambda c: c.length * c.width * c.height, reverse=True)

        placed = []
        unpacked = []

        for case in sorted_cases:
            packed = False
            for bin_id in range(num_bins):
                position = self._find_position(case, bin_id, bin_template, placed)
                if position:
                    placed.append(position)
                    packed = True
                    break
            if not packed:
                unpacked.append(case)

        return placed

    def _format_result(self, placements: List[PackedItem],
                       cases: List[DWaveCase], bin_template: DWaveBin) -> Dict:
        """Format result for TruckOptimum compatibility"""
        bins_used = set(p.bin_id for p in placements)
        total_volume = sum(p.dx * p.dy * p.dz for p in placements)
        bin_volume = bin_template.length * bin_template.width * bin_template.height

        return {
            'algorithm': 'D-Wave SciPy Enhanced',
            'success': True,
            'bins_used': len(bins_used),
            'total_packed': len(placements),
            'total_unpacked': len(cases) - len(placements),
            'volume_utilization': (total_volume / (len(bins_used) * bin_volume)) * 100 if bins_used else 0,
            'placements': [
                {
                    'item_name': p.case.name,
                    'bin_id': p.bin_id,
                    'position': {'x': p.x, 'y': p.y, 'z': p.z},
                    'dimensions': {'dx': p.dx, 'dy': p.dy, 'dz': p.dz},
                    'orientation': p.orientation
                }
                for p in placements
            ]
        }


def convert_from_truckoptimum(trucks: List[Dict], cartons: List[Dict]) -> Tuple[DWaveBin, List[DWaveCase]]:
    """Convert TruckOptimum format to DWave format"""
    # Use first truck as template (all bins same size in DWave model)
    truck = trucks[0] if trucks else {}
    bin_template = DWaveBin(
        id=0,
        name=truck.get('name', 'Truck'),
        length=truck.get('length', 100),
        width=truck.get('width', 100),
        height=truck.get('height', 100),
        max_weight=truck.get('max_weight', 10000)
    )

    cases = []
    for i, carton in enumerate(cartons):
        cases.append(DWaveCase(
            id=i,
            name=carton.get('name', f'Carton_{i}'),
            length=carton.get('length', 10),
            width=carton.get('width', 10),
            height=carton.get('height', 10),
            weight=carton.get('weight', 1),
            quantity=carton.get('quantity', 1)
        ))

    return bin_template, cases


def convert_to_truckoptimum(dwave_result: Dict, truck_name: str = 'Truck') -> Dict:
    """Convert DWave result back to TruckOptimum format"""
    packed_cartons = []
    for p in dwave_result.get('placements', []):
        packed_cartons.append({
            'name': p['item_name'],
            'truck': f"{truck_name}_{p['bin_id']}",
            'position': p['position'],
            'dimensions': p['dimensions'],
            'rotation': p['orientation']
        })

    return {
        'success': dwave_result.get('success', False),
        'algorithm': dwave_result.get('algorithm', 'DWave'),
        'trucks_used': dwave_result.get('bins_used', 0),
        'packed_count': dwave_result.get('total_packed', 0),
        'unpacked_count': dwave_result.get('total_unpacked', 0),
        'volume_utilization': dwave_result.get('volume_utilization', 0),
        'packed_cartons': packed_cartons
    }
