"""
Packing Engine Bridge - Compatibility Layer
============================================
This module provides backward compatibility for code using the old packing_engine API
while internally delegating to the advanced_3d_algorithms module.

DEPRECATED: This is a compatibility bridge. New code should import directly from advanced_3d_algorithms.

Migration Guide:
  OLD: from packing_engine import Carton3D, Truck3D, get_packing_engine
  NEW: from advanced_3d_algorithms import Carton3D, Truck3D, Advanced3DPackingEngine

"""

import warnings
from typing import List, Dict
from advanced_3d_algorithms import (
    Carton3D as _Carton3DAdvanced,
    Truck3D as _Truck3DAdvanced,
    Advanced3DPackingEngine,
    Algorithm3DType,
    PlacedCarton
)

# Global singleton
_packing_engine = None


class Carton3D:
    """
    Compatibility wrapper for old Carton3D class.
    Internally uses advanced_3d_algorithms.Carton3D with default values.

    DEPRECATED: Use advanced_3d_algorithms.Carton3D directly.
    """

    def __init__(self, id: int, name: str, length: float, width: float, height: float, weight: float):
        # Issue deprecation warning on first use
        warnings.warn(
            "packing_engine.Carton3D is deprecated. Use advanced_3d_algorithms.Carton3D instead.",
            DeprecationWarning,
            stacklevel=2
        )

        self.id = id
        self.name = name
        self.length = length
        self.width = width
        self.height = height
        self.weight = weight
        self.volume = length * width * height

        # Create internal advanced carton with defaults
        self._advanced_carton = _Carton3DAdvanced(
            id=id,
            name=name,
            length=length,
            width=width,
            height=height,
            weight=weight,
            quantity=1,  # Default
            priority=1,  # Default
            fragile=False,  # Default
            stackable=True  # Default
        )

    def get_rotations(self):
        """Get all possible rotations"""
        return self._advanced_carton.get_orientations()

    def to_advanced(self) -> _Carton3DAdvanced:
        """Convert to advanced Carton3D"""
        return self._advanced_carton


class Truck3D:
    """
    Compatibility wrapper for old Truck3D class.
    Internally uses advanced_3d_algorithms.Truck3D.

    DEPRECATED: Use advanced_3d_algorithms.Truck3D directly.
    """

    def __init__(self, id: int, name: str, length: float, width: float, height: float,
                 max_weight: float, cost_per_km: float = 0):
        # Issue deprecation warning on first use
        warnings.warn(
            "packing_engine.Truck3D is deprecated. Use advanced_3d_algorithms.Truck3D instead.",
            DeprecationWarning,
            stacklevel=2
        )

        self.id = id
        self.name = name
        self.length = length
        self.width = width
        self.height = height
        self.max_weight = max_weight
        self.cost_per_km = cost_per_km
        self.volume = length * width * height

        # Create internal advanced truck
        self._advanced_truck = _Truck3DAdvanced(
            id=id,
            name=name,
            length=length,
            width=width,
            height=height,
            max_weight=max_weight,
            cost_per_km=cost_per_km
        )

    def to_advanced(self) -> _Truck3DAdvanced:
        """Convert to advanced Truck3D"""
        return self._advanced_truck


class PackingResult:
    """Compatibility wrapper for packing results"""

    def __init__(self, advanced_result: Dict = None):
        if advanced_result:
            self.success = advanced_result.get('total_unpacked', 0) == 0
            self.packed_cartons = advanced_result.get('packed_cartons', [])
            self.unpacked_cartons = advanced_result.get('unpacked_cartons', [])
            self.volume_utilization = advanced_result.get('volume_utilization', 0.0)
            self.weight_utilization = advanced_result.get('weight_utilization', 0.0)
            self.stability_score = advanced_result.get('stability_score', 0.0) * 100  # Convert to percentage
            self.packing_efficiency = advanced_result.get('efficiency_score', 0.0)
            self.algorithm_used = advanced_result.get('algorithm', 'Unknown')
            self.processing_time = advanced_result.get('execution_time', 0.0)
        else:
            self.success = False
            self.packed_cartons = []
            self.unpacked_cartons = []
            self.volume_utilization = 0.0
            self.weight_utilization = 0.0
            self.stability_score = 0.0
            self.packing_efficiency = 0.0
            self.algorithm_used = ""
            self.processing_time = 0.0


class Advanced3DPacker:
    """
    Compatibility wrapper that delegates to Advanced3DPackingEngine.

    DEPRECATED: Use Advanced3DPackingEngine directly.
    """

    def __init__(self):
        self.engine = Advanced3DPackingEngine()

    def pack_cartons_in_truck(self, truck: Truck3D, cartons: List[Carton3D],
                              algorithm: str = "auto") -> PackingResult:
        """Main packing function with algorithm selection"""

        # Convert legacy objects to advanced objects
        advanced_truck = truck.to_advanced() if isinstance(truck, Truck3D) else truck
        advanced_cartons = []

        for carton in cartons:
            if isinstance(carton, Carton3D):
                advanced_cartons.append(carton.to_advanced())
            else:
                advanced_cartons.append(carton)

        # Map algorithm names to Algorithm3DType
        algorithm_map = {
            "auto": Algorithm3DType.GENETIC_ALGORITHM,  # Use best algorithm
            "bottom_left_fill": Algorithm3DType.SKYLINE_BL,
            "best_fit_decreasing": Algorithm3DType.SKYLINE_BL,
            "first_fit_decreasing": Algorithm3DType.SKYLINE_BL,
            "skyline_extreme_points": Algorithm3DType.EXTREME_POINTS,
            "extreme_points": Algorithm3DType.EXTREME_POINTS,
            "physics_based_stability": Algorithm3DType.EXTREME_POINTS,
            "enhanced_extreme_points_2024": Algorithm3DType.EXTREME_POINTS,
            "genetic": Algorithm3DType.GENETIC_ALGORITHM,
            "simulated_annealing": Algorithm3DType.SIMULATED_ANNEALING,
            "tabu_search": Algorithm3DType.TABU_SEARCH,
            "ant_colony": Algorithm3DType.ANT_COLONY,
            "particle_swarm": Algorithm3DType.PARTICLE_SWARM,
            "hybrid_genetic": Algorithm3DType.HYBRID_GENETIC,
        }

        algo_type = algorithm_map.get(algorithm.lower(), Algorithm3DType.GENETIC_ALGORITHM)

        # Use advanced engine
        advanced_result = self.engine.pack_with_algorithm(
            advanced_truck, advanced_cartons, algo_type
        )

        # Convert back to legacy format
        return PackingResult(advanced_result)


class SmartTruckRecommendation:
    """
    Compatibility wrapper for smart truck recommendations.
    Delegates to Advanced3DPackingEngine.

    DEPRECATED: Use Advanced3DPackingEngine.compare_algorithms directly.
    """

    def __init__(self):
        self.packer = Advanced3DPacker()
        self.engine = Advanced3DPackingEngine()

    def recommend_optimal_trucks(self, trucks: List[Truck3D], cartons: List[Carton3D]) -> List[Dict]:
        """Find optimal trucks for given cartons"""

        recommendations = []

        # Convert to advanced objects
        advanced_cartons = [c.to_advanced() if isinstance(c, Carton3D) else c for c in cartons]

        for truck in trucks:
            advanced_truck = truck.to_advanced() if isinstance(truck, Truck3D) else truck

            # Try genetic algorithm for best results
            result = self.engine.pack_with_algorithm(
                advanced_truck, advanced_cartons, Algorithm3DType.GENETIC_ALGORITHM
            )

            packing_result = PackingResult(result)

            # Calculate recommendation score
            fits_all = len(packing_result.unpacked_cartons) == 0
            space_efficiency = packing_result.volume_utilization / 100
            weight_efficiency = packing_result.weight_utilization / 100
            stability = packing_result.stability_score / 100

            # Higher score is better
            recommendation_score = (
                (1.0 if fits_all else 0.5) * 40 +  # Fits all is critical
                space_efficiency * 30 +             # Space utilization
                stability * 20 +                    # Stability
                weight_efficiency * 10              # Weight utilization
            )

            # Calculate cost efficiency (lower cost per volume is better)
            cost_efficiency = 100.0
            if truck.cost_per_km > 0 and packing_result.volume_utilization > 0:
                cost_efficiency = packing_result.volume_utilization / truck.cost_per_km

            recommendations.append({
                'truck': truck,
                'packing_result': packing_result,
                'fits_all': fits_all,
                'recommendation_score': recommendation_score,
                'cost_efficiency': cost_efficiency,
                'space_suggestions': []  # Legacy field
            })

        # Sort by recommendation score (descending)
        recommendations.sort(key=lambda x: x['recommendation_score'], reverse=True)

        return recommendations


def get_packing_engine() -> SmartTruckRecommendation:
    """
    Lazy load packing engine only when needed.

    DEPRECATED: Use Advanced3DPackingEngine() directly.

    Returns:
        SmartTruckRecommendation: Compatibility wrapper around advanced engine
    """
    global _packing_engine

    if _packing_engine is None:
        warnings.warn(
            "get_packing_engine() is deprecated. Use Advanced3DPackingEngine() directly.",
            DeprecationWarning,
            stacklevel=2
        )
        print("Loading advanced 3D packing engine (11 production algorithms)...")
        _packing_engine = SmartTruckRecommendation()

    return _packing_engine


# ============================================================================
# MIGRATION HELPER FUNCTIONS
# ============================================================================

def migrate_to_advanced_api():
    """
    Helper function to guide migration to advanced API.
    Prints migration instructions.
    """
    print("""
    ╔════════════════════════════════════════════════════════════════════════╗
    ║                    PACKING ENGINE MIGRATION GUIDE                      ║
    ╚════════════════════════════════════════════════════════════════════════╝

    The packing_engine module is deprecated. Please migrate to advanced_3d_algorithms:

    OLD CODE:
    ---------
    from packing_engine import Carton3D, Truck3D, get_packing_engine

    carton = Carton3D(1, "Box", 100, 80, 60, 50)
    truck = Truck3D(1, "Truck", 600, 240, 240, 5000, 2.5)
    engine = get_packing_engine()
    result = engine.packer.pack_cartons_in_truck(truck, [carton], "auto")

    NEW CODE:
    ---------
    from advanced_3d_algorithms import (
        Carton3D, Truck3D, Advanced3DPackingEngine, Algorithm3DType
    )

    carton = Carton3D(1, "Box", 100, 80, 60, 50, quantity=1)
    truck = Truck3D(1, "Truck", 600, 240, 240, 5000, 2.5)
    engine = Advanced3DPackingEngine()
    result = engine.pack_with_algorithm(truck, [carton], Algorithm3DType.GENETIC_ALGORITHM)

    BENEFITS:
    ---------
    ✓ 11 production-ready algorithms (vs 10 placeholder algorithms)
    ✓ Multi-objective optimization
    ✓ Stability validation
    ✓ Load balancing
    ✓ Fragile item protection
    ✓ Parallel algorithm comparison
    ✓ Better performance (spatial indexing)
    ✓ Comprehensive metrics

    For more information, see advanced_3d_algorithms.py documentation.
    """)


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    'Carton3D',
    'Truck3D',
    'PackingResult',
    'Advanced3DPacker',
    'SmartTruckRecommendation',
    'get_packing_engine',
    'migrate_to_advanced_api',
]
