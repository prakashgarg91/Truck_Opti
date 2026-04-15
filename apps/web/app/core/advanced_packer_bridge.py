"""
Bridge module to connect TruckOptimum with advanced packing algorithms
"""
from typing import Dict, List, Optional, Any
import logging
import time
from app.extensions import socketio

logger = logging.getLogger(__name__)


class AdvancedPackerBridge:
    """
    Bridge between TruckOptimum and advanced packing algorithms
    Provides unified interface for all algorithm types
    """

    ALGORITHMS = {
        'py3dbp': 'Standard heuristic (fast)',
        'dwave_scipy': 'Mathematical optimization (accurate)',
        'genetic': 'Genetic algorithm (balanced)',
        'skyline': 'Skyline method (fast)',
    }

    def __init__(self):
        self._dwave_solver = None

    def _emit_lifecycle_event(self, event: str, payload: Dict[str, Any]) -> None:
        if getattr(socketio, 'server', None) is None:
            logger.debug('Skipping %s emit because Socket.IO is not initialized', event)
            return

        socketio.emit(event, payload)

    def get_available_algorithms(self) -> Dict[str, str]:
        """Return available algorithms with descriptions"""
        return self.ALGORITHMS.copy()

    def pack(self, algorithm: str, trucks: List[Dict], cartons: List[Dict],
             optimization_goal: str = 'space', **kwargs) -> Dict:
        """
        Universal packing interface

        Args:
            algorithm: Algorithm identifier
            trucks: List of truck dictionaries
            cartons: List of carton dictionaries
            optimization_goal: 'space', 'weight', 'cost', 'min_trucks'
            **kwargs: Algorithm-specific parameters

        Returns:
            Packing result dictionary
        """
        job_id = kwargs.get('job_id', f"job_{int(time.time())}")
        logger.info(f"Packing with algorithm: {algorithm}, goal: {optimization_goal}, job: {job_id}")

        # Emit start event
        self._emit_lifecycle_event('packing_started', {
            'job_id': job_id,
            'algorithm': algorithm,
            'total_items': len(cartons)
        })

        result = None
        if algorithm == 'dwave_scipy':
            result = self._pack_dwave(trucks, cartons, **kwargs)
        elif algorithm == 'py3dbp':
            result = self._pack_py3dbp(trucks, cartons, optimization_goal)
        elif algorithm == 'genetic':
            result = self._pack_genetic(trucks, cartons, **kwargs)
        elif algorithm == 'skyline':
            result = self._pack_skyline(trucks, cartons)
        else:
            logger.warning(f"Unknown algorithm {algorithm}, falling back to py3dbp")
            result = self._pack_py3dbp(trucks, cartons, optimization_goal)

        # Emit completion event
        packed_items = result.get('packed_cartons') or result.get('packed_items') or []
        self._emit_lifecycle_event('packing_completed', {
            'job_id': job_id,
            'success': result.get('success', True),
            'packed_count': len(packed_items) if result else 0
        })

        return result

    def _pack_dwave(self, trucks: List[Dict], cartons: List[Dict], **kwargs) -> Dict:
        """Pack using D-Wave mathematical optimization"""
        try:
            from .dwave_packing_adapter import (
                DWaveSciPySolver, convert_from_truckoptimum, convert_to_truckoptimum
            )

            if self._dwave_solver is None:
                time_limit = kwargs.get('time_limit', 20.0)
                self._dwave_solver = DWaveSciPySolver(time_limit=time_limit)

            # Convert formats
            bin_template, cases = convert_from_truckoptimum(trucks, cartons)

            # Solve
            result = self._dwave_solver.solve(cases, bin_template)

            # Convert back
            truck_name = trucks[0].get('name', 'Truck') if trucks else 'Truck'
            return convert_to_truckoptimum(result, truck_name)

        except ImportError as e:
            logger.error(f"D-Wave adapter not available: {e}")
            return {'success': False, 'error': 'D-Wave adapter not installed'}
        except Exception as e:
            logger.error(f"D-Wave packing error: {e}")
            return {'success': False, 'error': str(e)}

    def _pack_py3dbp(self, trucks: List[Dict], cartons: List[Dict],
                     optimization_goal: str) -> Dict:
        """Pack using standard py3dbp library"""
        try:
            from py3dbp import Packer, Bin, Item

            packer = Packer()

            # Add bins
            for truck in trucks:
                packer.add_bin(Bin(
                    truck.get('name', 'Truck'),
                    truck.get('length', 100),
                    truck.get('width', 100),
                    truck.get('height', 100),
                    truck.get('max_weight', 10000)
                ))

            # Add items
            for carton in cartons:
                qty = carton.get('quantity', 1)
                for i in range(qty):
                    packer.add_item(Item(
                        f"{carton.get('name', 'Item')}_{i}",
                        carton.get('length', 10),
                        carton.get('width', 10),
                        carton.get('height', 10),
                        carton.get('weight', 1)
                    ))

            # Pack
            packer.pack(bigger_first=True, distribute_items=True)

            # Format result
            packed = []
            unpacked = []
            for b in packer.bins:
                for item in b.items:
                    packed.append({
                        'name': item.name,
                        'truck': b.name,
                        'position': {'x': item.position[0], 'y': item.position[1], 'z': item.position[2]},
                        'dimensions': {'dx': item.width, 'dy': item.height, 'dz': item.depth}
                    })
                for item in b.unfitted_items:
                    unpacked.append({'name': item.name})

            total_items = len(packed) + len(unpacked)
            return {
                'success': True,
                'algorithm': 'py3dbp',
                'trucks_used': len([b for b in packer.bins if b.items]),
                'packed_count': len(packed),
                'unpacked_count': len(unpacked),
                'efficiency': (len(packed) / total_items * 100) if total_items > 0 else 0,
                'packed_cartons': packed
            }

        except Exception as e:
            logger.error(f"py3dbp packing error: {e}")
            return {'success': False, 'error': str(e)}

    def _pack_genetic(self, trucks: List[Dict], cartons: List[Dict], **kwargs) -> Dict:
        """Pack using genetic algorithm from advanced_3d_algorithms"""
        try:
            import sys
            sys.path.insert(0, 'd:\\Github\\Truck_Opti\\apps\\desktop\\TruckOptimum')
            from advanced_3d_algorithms import GeneticAlgorithm3D, Truck3D, Carton3D

            if not trucks:
                return {'success': False, 'error': 'No trucks provided'}

            truck_data = trucks[0]
            truck = Truck3D(
                id=0,
                name=truck_data.get('name', 'Truck'),
                length=truck_data.get('length', 100),
                width=truck_data.get('width', 100),
                height=truck_data.get('height', 100),
                max_weight=truck_data.get('max_weight', 10000),
                cost_per_km=truck_data.get('cost_per_km', 0)
            )

            carton_list = []
            for i, c in enumerate(cartons):
                carton_list.append(Carton3D(
                    id=i,
                    name=c.get('name', f'Carton_{i}'),
                    length=c.get('length', 10),
                    width=c.get('width', 10),
                    height=c.get('height', 10),
                    weight=c.get('weight', 1),
                    quantity=c.get('quantity', 1)
                ))

            ga = GeneticAlgorithm3D(
                truck,
                population_size=kwargs.get('population_size', 50),
                generations=kwargs.get('generations', 100)
            )

            result = ga.pack(carton_list)

            return {
                'success': True,
                'algorithm': 'Genetic Algorithm',
                'trucks_used': 1,
                'packed_count': result.get('total_packed', 0),
                'unpacked_count': result.get('total_unpacked', 0),
                'volume_utilization': result.get('volume_utilization', 0),
                'load_balance_score': result.get('load_balance_score', 0),
                'packed_cartons': [
                    {
                        'name': p.carton.name,
                        'position': {'x': p.x, 'y': p.y, 'z': p.z},
                        'dimensions': {'dx': p.orientation[0], 'dy': p.orientation[1], 'dz': p.orientation[2]}
                    }
                    for p in result.get('packed_cartons', [])
                ]
            }

        except Exception as e:
            logger.error(f"Genetic algorithm error: {e}")
            return {'success': False, 'error': str(e)}

    def _pack_skyline(self, trucks: List[Dict], cartons: List[Dict]) -> Dict:
        """Pack using skyline algorithm"""
        try:
            import sys
            sys.path.insert(0, 'd:\\Github\\Truck_Opti\\apps\\desktop\\TruckOptimum')
            from advanced_3d_algorithms import SkylineBottomLeft, Truck3D, Carton3D

            if not trucks:
                return {'success': False, 'error': 'No trucks provided'}

            truck_data = trucks[0]
            truck = Truck3D(
                id=0,
                name=truck_data.get('name', 'Truck'),
                length=truck_data.get('length', 100),
                width=truck_data.get('width', 100),
                height=truck_data.get('height', 100),
                max_weight=truck_data.get('max_weight', 10000),
                cost_per_km=truck_data.get('cost_per_km', 0)
            )

            carton_list = []
            for i, c in enumerate(cartons):
                carton_list.append(Carton3D(
                    id=i,
                    name=c.get('name', f'Carton_{i}'),
                    length=c.get('length', 10),
                    width=c.get('width', 10),
                    height=c.get('height', 10),
                    weight=c.get('weight', 1),
                    quantity=c.get('quantity', 1)
                ))

            skyline = SkylineBottomLeft(truck)
            result = skyline.pack(carton_list)

            return {
                'success': True,
                'algorithm': 'Skyline Bottom-Left',
                'trucks_used': 1,
                'packed_count': result.get('total_packed', 0),
                'unpacked_count': result.get('total_unpacked', 0),
                'volume_utilization': result.get('volume_utilization', 0),
                'packed_cartons': [
                    {
                        'name': p.carton.name,
                        'position': {'x': p.x, 'y': p.y, 'z': p.z},
                        'dimensions': {'dx': p.orientation[0], 'dy': p.orientation[1], 'dz': p.orientation[2]}
                    }
                    for p in result.get('packed_cartons', [])
                ]
            }

        except Exception as e:
            logger.error(f"Skyline algorithm error: {e}")
            return {'success': False, 'error': str(e)}


# Singleton instance for easy import
packer_bridge = AdvancedPackerBridge()
