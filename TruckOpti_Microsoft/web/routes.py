"""
TruckOpti Microsoft - Web Routes

This module defines all web routes for the TruckOpti system,
providing a modern API for truck optimization operations.
"""

from flask import Blueprint, request, jsonify, render_template
from typing import Dict, Any, List
import logging
import traceback
from datetime import datetime
import csv
import io

from ..core.models.truck import Truck, TruckConstraints
from ..core.models.carton import Carton
from ..core.models.packed_carton import PackedCarton
from ..core.models.coordinates import Coordinates3D


def register_routes(app):
    """
    Register all routes with the Flask application.
    
    Args:
        app: Flask application instance
    """
    bp = Blueprint('truckopti', __name__)
    
    @bp.route('/')
    def index():
        """Main dashboard page."""
        return render_template('index.html')
    
    @bp.route('/api/health')
    def health_check():
        """Health check endpoint."""
        try:
            # Test optimizer availability
            optimizer_status = "available" if hasattr(app, 'truck_optimizer') else "unavailable"
            
            # Test Windows optimizer
            windows_status = "available" if hasattr(app, 'windows_optimizer') and app.windows_optimizer else "unavailable"
            
            health_data = {
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'version': '1.0.0',
                'optimization_engine': optimizer_status,
                'windows_optimizer': windows_status,
                'features': {
                    'multi_core_processing': optimizer_status == 'available',
                    'windows_optimization': windows_status == 'available',
                    'parallel_processing': True
                }
            }
            
            return jsonify(health_data)
            
        except Exception as e:
            app.logger.error(f"Health check failed: {e}")
            return jsonify({
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }), 500
    
    @bp.route('/api/algorithms')
    def get_algorithms():
        """Get available algorithms."""
        try:
            if not hasattr(app, 'truck_optimizer'):
                return jsonify({'error': 'Optimization engine not available'}), 503
            
            algorithms = app.truck_optimizer.get_available_algorithms()
            return jsonify({
                'algorithms': algorithms,
                'count': len(algorithms),
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            app.logger.error(f"Failed to get algorithms: {e}")
            return jsonify({'error': str(e)}), 500
    
    @bp.route('/api/optimize/single', methods=['POST'])
    def optimize_single_truck():
        """Optimize packing for a single truck."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            # Parse truck data
            truck_data = data.get('truck', {})
            cartons_data = data.get('cartons', [])
            algorithm = data.get('algorithm', 'l_aff')
            max_iterations = data.get('max_iterations', 1000)
            
            # Create truck
            truck = _create_truck_from_data(truck_data)
            
            # Create cartons
            cartons = [_create_carton_from_data(carton_data) for carton_data in cartons_data]
            
            # Optimize
            if not hasattr(app, 'truck_optimizer'):
                return jsonify({'error': 'Optimization engine not available'}), 503
            
            packed_cartons, metrics = app.truck_optimizer.optimize_single_truck(
                cartons, truck, algorithm, max_iterations
            )
            
            # Convert results to JSON-serializable format
            result = {
                'success': True,
                'truck_id': truck.id,
                'packed_cartons_count': len(packed_cartons),
                'metrics': metrics,
                'packed_cartons': [_pack_carton_to_dict(pc) for pc in packed_cartons],
                'timestamp': datetime.now().isoformat()
            }
            
            return jsonify(result)
            
        except Exception as e:
            app.logger.error(f"Single truck optimization failed: {e}")
            return jsonify({
                'error': str(e),
                'traceback': traceback.format_exc() if app.debug else None
            }), 500
    
    @bp.route('/api/optimize/multiple', methods=['POST'])
    def optimize_multiple_trucks():
        """Optimize distribution across multiple trucks."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            trucks_data = data.get('trucks', [])
            cartons_data = data.get('cartons', [])
            algorithm = data.get('algorithm', 'l_aff')
            max_iterations = data.get('max_iterations', 1000)
            
            # Create trucks
            trucks = [_create_truck_from_data(truck_data) for truck_data in trucks_data]
            
            # Create cartons
            cartons = [_create_carton_from_data(carton_data) for carton_data in cartons_data]
            
            # Optimize
            if not hasattr(app, 'truck_optimizer'):
                return jsonify({'error': 'Optimization engine not available'}), 503
            
            results = app.truck_optimizer.optimize_multiple_trucks(
                cartons, trucks, algorithm, max_iterations
            )
            
            # Convert packed cartons in results to dictionaries
            for truck_id, truck_result in results.get('truck_results', {}).items():
                if 'packed_cartons' in truck_result:
                    truck_result['packed_cartons'] = [
                        _pack_carton_to_dict(pc) for pc in truck_result['packed_cartons']
                    ]
            
            return jsonify(results)
            
        except Exception as e:
            app.logger.error(f"Multi-truck optimization failed: {e}")
            return jsonify({
                'error': str(e),
                'traceback': traceback.format_exc() if app.debug else None
            }), 500
    
    @bp.route('/api/benchmark', methods=['POST'])
    def benchmark_algorithms():
        """Benchmark all algorithms with test data."""
        try:
            data = request.get_json() or {}
            test_cartons_data = data.get('test_cartons', [])
            test_truck_data = data.get('test_truck', {})
            iterations = data.get('iterations', 3)
            
            # Create test data
            test_truck = _create_truck_from_data(test_truck_data)
            test_cartons = [_create_carton_from_data(carton_data) for carton_data in test_cartons_data]
            
            if not hasattr(app, 'truck_optimizer'):
                return jsonify({'error': 'Optimization engine not available'}), 503
            
            # Run benchmark
            results = app.truck_optimizer.benchmark_algorithms(
                test_cartons, test_truck, iterations
            )
            
            return jsonify({
                'benchmark_results': results,
                'test_data': {
                    'cartons_count': len(test_cartons),
                    'truck_id': test_truck.id,
                    'iterations': iterations
                },
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            app.logger.error(f"Algorithm benchmark failed: {e}")
            return jsonify({
                'error': str(e),
                'traceback': traceback.format_exc() if app.debug else None
            }), 500
    
    @bp.route('/api/upload/cartons', methods=['POST'])
    def upload_cartons_csv():
        """Upload cartons from CSV file."""
        try:
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            
            file = request.files['file']
            if file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            
            # Parse CSV
            stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_reader = csv.DictReader(stream)
            
            cartons = []
            for row in csv_reader:
                try:
                    carton = _create_carton_from_csv_row(row)
                    cartons.append(carton)
                except Exception as e:
                    app.logger.warning(f"Failed to parse carton row: {row}, error: {e}")
                    continue
            
            return jsonify({
                'success': True,
                'cartons_count': len(cartons),
                'cartons': [_carton_to_dict(c) for c in cartons],
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            app.logger.error(f"CSV upload failed: {e}")
            return jsonify({
                'error': str(e),
                'traceback': traceback.format_exc() if app.debug else None
            }), 500
    
    @bp.route('/api/upload/trucks', methods=['POST'])
    def upload_trucks_csv():
        """Upload trucks from CSV file."""
        try:
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            
            file = request.files['file']
            if file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            
            # Parse CSV
            stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_reader = csv.DictReader(stream)
            
            trucks = []
            for row in csv_reader:
                try:
                    truck = _create_truck_from_csv_row(row)
                    trucks.append(truck)
                except Exception as e:
                    app.logger.warning(f"Failed to parse truck row: {row}, error: {e}")
                    continue
            
            return jsonify({
                'success': True,
                'trucks_count': len(trucks),
                'trucks': [_truck_to_dict(t) for t in trucks],
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            app.logger.error(f"Truck CSV upload failed: {e}")
            return jsonify({
                'error': str(e),
                'traceback': traceback.format_exc() if app.debug else None
            }), 500
    
    @bp.route('/api/system/info')
    def get_system_info():
        """Get system information and Windows optimizations status."""
        try:
            system_info = {}
            
            # Get Windows system info if available
            if hasattr(app, 'windows_optimizer') and app.windows_optimizer:
                try:
                    system_info = app.windows_optimizer.get_windows_system_info()
                except Exception as e:
                    app.logger.warning(f"Failed to get Windows system info: {e}")
                    system_info['windows_error'] = str(e)
            
            # Get optimization engine info
            if hasattr(app, 'truck_optimizer'):
                try:
                    system_info['optimization_engine'] = {
                        'available_algorithms': len(app.truck_optimizer.algorithms),
                        'max_workers': app.truck_optimizer.max_workers,
                        'parallel_processing': app.truck_optimizer.enable_parallel_processing,
                        'performance_stats': app.truck_optimizer.get_performance_stats()
                    }
                except Exception as e:
                    app.logger.warning(f"Failed to get optimization engine info: {e}")
                    system_info['optimization_error'] = str(e)
            
            return jsonify({
                'system_info': system_info,
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            app.logger.error(f"System info request failed: {e}")
            return jsonify({
                'error': str(e),
                'traceback': traceback.format_exc() if app.debug else None
            }), 500
    
    # Register blueprint
    app.register_blueprint(bp)


# Helper functions for data conversion
def _create_truck_from_data(data: Dict[str, Any]) -> Truck:
    """Create Truck object from API data."""
    constraints = TruckConstraints(
        max_length=data.get('max_length', 10.0),
        max_width=data.get('max_width', 2.5),
        max_height=data.get('max_height', 2.5),
        max_weight=data.get('max_weight', 10000.0),
        max_volume=data.get('max_volume', 50.0)
    )
    
    return Truck(
        id=data.get('id', 'truck_1'),
        constraints=constraints,
        name=data.get('name', f"Truck {data.get('id', '1')}"),
        priority=data.get('priority', 1)
    )


def _create_carton_from_data(data: Dict[str, Any]) -> Carton:
    """Create Carton object from API data."""
    return Carton(
        id=data.get('id', f'carton_{len(data)}'),
        length=data.get('length', 1.0),
        width=data.get('width', 1.0),
        height=data.get('height', 1.0),
        weight=data.get('weight', 10.0),
        priority=data.get('priority', 1),
        is_fragile=data.get('is_fragile', False),
        allow_rotation=data.get('allow_rotation', True),
        name=data.get('name')
    )


def _create_truck_from_csv_row(row: Dict[str, str]) -> Truck:
    """Create Truck object from CSV row."""
    return _create_truck_from_data({
        'id': row.get('id', row.get('truck_id', 'truck_1')),
        'max_length': float(row.get('max_length', row.get('length', 10))),
        'max_width': float(row.get('max_width', row.get('width', 2.5))),
        'max_height': float(row.get('max_height', row.get('height', 2.5))),
        'max_weight': float(row.get('max_weight', row.get('weight_capacity', 10000))),
        'name': row.get('name', row.get('truck_name', f"Truck {row.get('id', '1')}"))
    })


def _create_carton_from_csv_row(row: Dict[str, str]) -> Carton:
    """Create Carton object from CSV row."""
    return _create_carton_from_data({
        'id': row.get('id', row.get('carton_id', f'carton_{len(row)}')),
        'length': float(row.get('length', 1.0)),
        'width': float(row.get('width', 1.0)),
        'height': float(row.get('height', 1.0)),
        'weight': float(row.get('weight', 10.0)),
        'priority': int(row.get('priority', 1)),
        'is_fragile': row.get('is_fragile', 'false').lower() == 'true',
        'name': row.get('name', row.get('description', f"Carton {row.get('id', '')}"))
    })


def _pack_carton_to_dict(packed_carton: PackedCarton) -> Dict[str, Any]:
    """Convert PackedCarton to dictionary."""
    return packed_carton.get_position_info()


def _carton_to_dict(carton: Carton) -> Dict[str, Any]:
    """Convert Carton to dictionary."""
    return {
        'id': carton.id,
        'length': carton.length,
        'width': carton.width,
        'height': carton.height,
        'weight': carton.weight,
        'volume': carton.volume,
        'priority': carton.priority,
        'is_fragile': carton.is_fragile,
        'is_stackable': carton.is_stackable,
        'allow_rotation': carton.allow_rotation,
        'name': carton.name
    }


def _truck_to_dict(truck: Truck) -> Dict[str, Any]:
    """Convert Truck to dictionary."""
    return {
        'id': truck.id,
        'name': truck.name,
        'constraints': {
            'max_length': truck.constraints.max_length,
            'max_width': truck.constraints.max_width,
            'max_height': truck.constraints.max_height,
            'max_weight': truck.constraints.max_weight,
            'max_volume': truck.constraints.max_volume
        },
        'current_load': {
            'weight': truck.current_load_weight,
            'volume': truck.current_load_volume,
            'cartons_count': len(truck.loaded_cartons)
        },
        'utilization': {
            'weight_percent': truck.weight_utilization,
            'volume_percent': truck.volume_utilization,
            'overall_percent': truck.overall_utilization
        }
    }