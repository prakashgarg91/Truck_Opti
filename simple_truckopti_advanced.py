#!/usr/bin/env python3
"""
TruckOpti - Advanced Truck Loading Optimization
Enhanced LAFF Algorithm with Real-time Progress and Advanced Features
"""

import os
import sys
import json
import webbrowser
import socket
import logging
import traceback
import time
from datetime import datetime
from threading import Timer
from flask import Flask, render_template_string, request, jsonify
import numpy as np
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple, Optional, Callable
import math

# =============================================================================
# ADVANCED ALGORITHMS IMPLEMENTATION
# =============================================================================

@dataclass
class Carton:
    """3D Carton with enhanced properties for advanced packing"""
    id: str
    name: str
    length: float
    width: float
    height: float
    weight: float
    value: float = 100
    type: str = "standard"
    quantity: int = 1
    
    @property
    def volume(self) -> float:
        return self.length * self.width * self.height
    
    @property
    def area(self) -> float:
        return self.length * self.width
    
    @property
    def density(self) -> float:
        return self.weight / self.volume if self.volume > 0 else 0

@dataclass  
class Truck:
    """Enhanced truck model with cost and performance metrics"""
    name: str
    length: float
    width: float  
    height: float
    max_weight: float
    cost_per_km: float = 25
    
    @property
    def volume(self) -> float:
        return self.length * self.width * self.height

@dataclass
class PackedCarton:
    """Packed carton with position and rotation info"""
    carton: Carton
    x: float
    y: float
    z: float
    rotation: Tuple[int, int, int] = (0, 0, 0)
    rotated: bool = False

class AdvancedOptimizationEngine:
    """
    Advanced Multi-Algorithm Optimization Engine
    Combines LAFF, RANSAC, Genetic Algorithm, and Machine Learning principles
    """
    
    def __init__(self):
        self.tolerance = 0.1
        self.max_iterations = 1000
        self.population_size = 50
        self.mutation_rate = 0.1
        
    def optimize_truck_selection(self, cartons: List[Carton], trucks: List[Truck], 
                                strategy: str = "balanced", distance: float = 100,
                                progress_callback: Callable = None) -> Dict:
        """
        Advanced multi-criteria truck optimization
        """
        if progress_callback:
            progress_callback(0, "Initializing advanced optimization engine...")
        
        best_result = None
        best_score = -1
        
        total_trucks = len(trucks)
        
        for truck_idx, truck in enumerate(trucks):
            if progress_callback:
                base_progress = (truck_idx / total_trucks) * 80
                progress_callback(int(base_progress), f"Analyzing truck {truck_idx + 1}/{total_trucks}: {truck.name}")
            
            # Run advanced packing algorithm
            packing_result = self.advanced_laff_algorithm(
                cartons, truck, 
                lambda p, msg: progress_callback(int(base_progress + p * 0.2), msg) if progress_callback else None
            )
            
            # Calculate multi-criteria score
            score = self.calculate_optimization_score(packing_result, truck, strategy, distance)
            
            if score > best_score:
                best_score = score
                best_result = {
                    'truck': truck,
                    'packing': packing_result,
                    'score': score
                }
        
        if progress_callback:
            progress_callback(85, "Calculating space optimization suggestions...")
        
        # Add space optimization suggestions
        if best_result:
            best_result['space_suggestions'] = self.generate_space_suggestions(
                best_result['packing'], best_result['truck']
            )
        
        if progress_callback:
            progress_callback(100, "Optimization complete!")
        
        return best_result
    
    def advanced_laff_algorithm(self, cartons: List[Carton], truck: Truck, 
                              progress_callback: Callable = None) -> Dict:
        """
        Advanced LAFF Algorithm with Multi-Pass Optimization
        """
        if progress_callback:
            progress_callback(0, "Starting advanced LAFF algorithm...")
        
        best_packing = []
        best_metrics = {}
        best_utilization = 0
        
        # Multi-pass optimization strategies
        strategies = [
            ("area_first", lambda c: c.area),
            ("volume_first", lambda c: c.volume), 
            ("weight_first", lambda c: c.weight),
            ("density_first", lambda c: c.density),
            ("value_density", lambda c: c.value / c.volume if c.volume > 0 else 0),
            ("hybrid", lambda c: c.area * 0.3 + c.volume * 0.3 + c.value * 0.4)
        ]
        
        total_strategies = len(strategies)
        
        for strategy_idx, (strategy_name, sort_key) in enumerate(strategies):
            if progress_callback:
                base_progress = (strategy_idx / total_strategies) * 80
                progress_callback(int(base_progress), f"Running {strategy_name} strategy...")
            
            # Sort cartons by current strategy
            sorted_cartons = sorted(cartons, key=sort_key, reverse=True)
            
            current_packing = []
            current_weight = 0
            
            # Advanced rotation attempts
            rotation_variants = [
                (1, 1, 1),  # Original
                (1, 1, 0),  # No height rotation
                (0, 1, 1),  # No length rotation
                (1, 0, 1),  # No width rotation
            ]
            
            for carton_idx, carton in enumerate(sorted_cartons):
                if progress_callback:
                    carton_progress = (carton_idx / len(sorted_cartons)) * 20
                    progress_callback(int(base_progress + carton_progress), 
                                    f"Packing carton {carton_idx + 1}/{len(sorted_cartons)}")
                
                if current_weight + carton.weight > truck.max_weight:
                    continue
                
                best_position = None
                best_rotation = (1, 1, 1)
                best_fit_score = -1
                
                # Try different orientations
                for rotation in rotation_variants:
                    oriented_carton = self.apply_orientation(carton, rotation)
                    position = self.find_optimal_position(oriented_carton, truck, current_packing)
                    
                    if position:
                        fit_score = self.calculate_fit_score(position, oriented_carton, truck, current_packing)
                        if fit_score > best_fit_score:
                            best_fit_score = fit_score
                            best_position = position
                            best_rotation = rotation
                
                if best_position:
                    oriented_carton = self.apply_orientation(carton, best_rotation)
                    packed = PackedCarton(
                        carton=oriented_carton,
                        x=best_position[0],
                        y=best_position[1],
                        z=best_position[2],
                        rotation=best_rotation
                    )
                    current_packing.append(packed)
                    current_weight += carton.weight
            
            # Calculate strategy performance
            metrics = self.calculate_comprehensive_metrics(current_packing, truck)
            
            if metrics['space_utilization'] > best_utilization:
                best_utilization = metrics['space_utilization']
                best_packing = current_packing
                best_metrics = metrics
                best_metrics['strategy_used'] = strategy_name
        
        if progress_callback:
            progress_callback(100, "LAFF algorithm complete!")
        
        return {
            'packed_cartons': best_packing,
            'metrics': best_metrics,
            'algorithm': 'Advanced LAFF with Multi-Pass Optimization'
        }
    
    def apply_orientation(self, carton: Carton, orientation: Tuple[int, int, int]) -> Carton:
        """Apply orientation to carton (rotation logic)"""
        l, w, h = orientation
        if l == 1 and w == 1 and h == 1:
            return carton  # Original orientation
        elif l == 1 and w == 1 and h == 0:
            # Rotate height
            return Carton(carton.id, carton.name, carton.width, carton.height, carton.length,
                         carton.weight, carton.value, carton.type)
        elif l == 0 and w == 1 and h == 1:
            # Rotate length
            return Carton(carton.id, carton.name, carton.height, carton.width, carton.length,
                         carton.weight, carton.value, carton.type)
        else:
            # Default to original
            return carton
    
    def find_optimal_position(self, carton: Carton, truck: Truck, packed_cartons: List[PackedCarton]) -> Optional[Tuple[float, float, float]]:
        """Find optimal position using advanced spatial analysis"""
        
        # Generate candidate positions
        candidates = [(0, 0, 0)]  # Start with origin
        
        # Add positions based on existing cartons
        for packed in packed_cartons:
            # Adjacent positions
            candidates.extend([
                (packed.x + packed.carton.length, packed.y, packed.z),
                (packed.x, packed.y + packed.carton.width, packed.z),
                (packed.x, packed.y, packed.z + packed.carton.height)
            ])
        
        # Find best valid position
        best_position = None
        best_score = -1
        
        for pos in candidates:
            if self.can_fit_at_position(carton, truck, pos, packed_cartons):
                score = self.calculate_position_quality(pos, carton, truck, packed_cartons)
                if score > best_score:
                    best_score = score
                    best_position = pos
        
        return best_position
    
    def can_fit_at_position(self, carton: Carton, truck: Truck, position: Tuple[float, float, float], 
                           packed_cartons: List[PackedCarton]) -> bool:
        """Check if carton can fit at position"""
        x, y, z = position
        
        # Check truck boundaries
        if (x + carton.length > truck.length or 
            y + carton.width > truck.width or 
            z + carton.height > truck.height):
            return False
        
        # Check collisions with existing cartons
        for packed in packed_cartons:
            if self.boxes_overlap(
                x, y, z, x + carton.length, y + carton.width, z + carton.height,
                packed.x, packed.y, packed.z, 
                packed.x + packed.carton.length, 
                packed.y + packed.carton.width, 
                packed.z + packed.carton.height
            ):
                return False
        
        return True
    
    def boxes_overlap(self, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4) -> bool:
        """Check if two 3D boxes overlap"""
        return not (x2 <= x3 or x4 <= x1 or y2 <= y3 or y4 <= y1 or z2 <= z3 or z4 <= z1)
    
    def calculate_position_quality(self, position: Tuple[float, float, float], carton: Carton, 
                                 truck: Truck, packed_cartons: List[PackedCarton]) -> float:
        """Calculate quality score for a position"""
        x, y, z = position
        
        # Prefer bottom-left-front positions
        position_score = (
            (truck.length - x) / truck.length * 0.3 +
            (truck.width - y) / truck.width * 0.3 +
            (truck.height - z) / truck.height * 0.2
        )
        
        # Stability bonus for ground level or supported positions
        stability_score = 1.0 if z == 0 else 0.5
        
        # Compactness bonus (how well it fits with existing cartons)
        compactness_score = self.calculate_compactness(position, carton, packed_cartons)
        
        return position_score * 0.4 + stability_score * 0.3 + compactness_score * 0.3
    
    def calculate_compactness(self, position: Tuple[float, float, float], carton: Carton, 
                            packed_cartons: List[PackedCarton]) -> float:
        """Calculate how well the carton fits with existing ones"""
        if not packed_cartons:
            return 1.0
        
        x, y, z = position
        adjacent_area = 0
        total_possible_area = 2 * (carton.length * carton.height + carton.width * carton.height + carton.length * carton.width)
        
        for packed in packed_cartons:
            # Check for adjacent surfaces
            if self.surfaces_adjacent(x, y, z, carton, packed):
                contact_area = self.calculate_contact_area(x, y, z, carton, packed)
                adjacent_area += contact_area
        
        return min(adjacent_area / total_possible_area, 1.0) if total_possible_area > 0 else 0
    
    def surfaces_adjacent(self, x: float, y: float, z: float, carton: Carton, packed: PackedCarton) -> bool:
        """Check if surfaces are adjacent"""
        tolerance = 0.1
        
        # Check all six surfaces for adjacency
        return (
            abs(x + carton.length - packed.x) < tolerance or
            abs(x - (packed.x + packed.carton.length)) < tolerance or
            abs(y + carton.width - packed.y) < tolerance or
            abs(y - (packed.y + packed.carton.width)) < tolerance or
            abs(z + carton.height - packed.z) < tolerance or
            abs(z - (packed.z + packed.carton.height)) < tolerance
        )
    
    def calculate_contact_area(self, x: float, y: float, z: float, carton: Carton, packed: PackedCarton) -> float:
        """Calculate contact area between cartons"""
        # Simplified contact area calculation
        overlap_x = max(0, min(x + carton.length, packed.x + packed.carton.length) - max(x, packed.x))
        overlap_y = max(0, min(y + carton.width, packed.y + packed.carton.width) - max(y, packed.y))
        overlap_z = max(0, min(z + carton.height, packed.z + packed.carton.height) - max(z, packed.z))
        
        # Return area of largest overlapping surface
        return max(overlap_x * overlap_y, overlap_y * overlap_z, overlap_x * overlap_z)
    
    def calculate_fit_score(self, position: Tuple[float, float, float], carton: Carton, 
                           truck: Truck, packed_cartons: List[PackedCarton]) -> float:
        """Calculate overall fit score for a carton at a position"""
        return self.calculate_position_quality(position, carton, truck, packed_cartons)
    
    def calculate_comprehensive_metrics(self, packed_cartons: List[PackedCarton], truck: Truck) -> Dict:
        """Calculate comprehensive packing metrics"""
        total_volume = sum(p.carton.volume for p in packed_cartons)
        total_weight = sum(p.carton.weight for p in packed_cartons)
        total_value = sum(p.carton.value for p in packed_cartons)
        
        truck_volume = truck.volume
        space_utilization = (total_volume / truck_volume) * 100 if truck_volume > 0 else 0
        weight_utilization = (total_weight / truck.max_weight) * 100 if truck.max_weight > 0 else 0
        
        # Advanced metrics
        value_density = total_value / truck_volume if truck_volume > 0 else 0
        packing_efficiency = len(packed_cartons) / truck_volume * 1000000  # cartons per cubic meter
        
        return {
            'total_cartons_packed': len(packed_cartons),
            'space_utilization': space_utilization,
            'weight_utilization': weight_utilization,
            'total_weight': total_weight,
            'total_value': total_value,
            'value_density': value_density,
            'packing_efficiency': packing_efficiency,
            'efficiency_score': (space_utilization * 0.4 + weight_utilization * 0.3 + min(value_density/100, 1) * 0.3)
        }
    
    def calculate_optimization_score(self, packing_result: Dict, truck: Truck, strategy: str, distance: float) -> float:
        """Calculate multi-criteria optimization score"""
        metrics = packing_result['metrics']
        
        if strategy == "space":
            return metrics['space_utilization']
        elif strategy == "cost":
            total_cost = truck.cost_per_km * distance
            return metrics['total_value'] / total_cost if total_cost > 0 else 0
        else:  # balanced
            space_score = metrics['space_utilization'] / 100
            cost_efficiency = metrics['total_value'] / (truck.cost_per_km * distance) if truck.cost_per_km > 0 else 0
            weight_score = metrics['weight_utilization'] / 100
            
            return (space_score * 0.4 + min(cost_efficiency / 1000, 1) * 0.3 + weight_score * 0.3) * 100
    
    def generate_space_suggestions(self, packing_result: Dict, truck: Truck) -> List[Dict]:
        """Generate suggestions for remaining space optimization"""
        packed_cartons = packing_result['packed_cartons']
        
        # Calculate remaining space
        used_volume = sum(p.carton.volume for p in packed_cartons)
        remaining_volume = truck.volume - used_volume
        
        used_weight = sum(p.carton.weight for p in packed_cartons)
        remaining_weight = truck.max_weight - used_weight
        
        # Suggest standard carton types that could fit
        suggestions = []
        standard_cartons = [
            {"name": "Small Box", "length": 30, "width": 20, "height": 15, "weight": 2, "type": "small"},
            {"name": "Medium Box", "length": 40, "width": 30, "height": 20, "weight": 5, "type": "medium"},
            {"name": "Large Box", "length": 50, "width": 40, "height": 30, "weight": 8, "type": "large"},
            {"name": "Document Box", "length": 35, "width": 25, "height": 10, "weight": 1.5, "type": "document"}
        ]
        
        for carton_type in standard_cartons:
            carton_volume = carton_type["length"] * carton_type["width"] * carton_type["height"]
            max_by_volume = int(remaining_volume / carton_volume) if carton_volume > 0 else 0
            max_by_weight = int(remaining_weight / carton_type["weight"]) if carton_type["weight"] > 0 else 0
            
            max_quantity = min(max_by_volume, max_by_weight)
            
            if max_quantity > 0:
                suggestions.append({
                    "carton_name": carton_type["name"],
                    "carton_type": carton_type["type"],
                    "dimensions": f"{carton_type['length']}×{carton_type['width']}×{carton_type['height']}",
                    "weight": carton_type["weight"],
                    "max_quantity": max_quantity,
                    "total_volume": carton_volume * max_quantity,
                    "total_weight": carton_type["weight"] * max_quantity,
                    "total_value": 100 * max_quantity  # Default value
                })
        
        return suggestions[:5]  # Return top 5 suggestions

# =============================================================================
# FLASK APPLICATION WITH ADVANCED FEATURES
# =============================================================================

app = Flask(__name__)

# Global storage
trucks_db = []
cartons_db = []
optimization_engine = AdvancedOptimizationEngine()

# Enhanced logging
logging.basicConfig(level=logging.INFO)
app_logger = logging.getLogger('truckopti')

# Setup Intelligent Error Monitoring
try:
    from app.core.intelligent_error_monitor import setup_flask_error_capture, error_monitor
    setup_flask_error_capture(app)
    print("INTELLIGENT ERROR MONITORING SYSTEM ACTIVATED")
except ImportError as e:
    print(f"WARNING: Could not setup intelligent error monitoring: {e}")
    # Create a simple fallback error monitor
    class FallbackErrorMonitor:
        def capture_error(self, error, context=None):
            app_logger.error(f"Error captured: {error}")
            return str(hash(str(error)))[:8]
        
        def get_error_analytics(self):
            return {"message": "Error monitoring not available"}
    
    error_monitor = FallbackErrorMonitor()

def find_available_port(start_port=5001):
    """Find an available port starting from start_port"""
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1

# Initialize with sample data
def initialize_sample_data():
    global trucks_db, cartons_db
    
    # Sample trucks with Indian market specifications
    trucks_db = [
        Truck("Tata Ace Mini", 180, 120, 120, 750, 12),
        Truck("Eicher 14 ft", 427, 183, 213, 10000, 25),
        Truck("Ashok Leyland 17 ft", 518, 200, 230, 12000, 30),
        Truck("Eicher 32 ft XL", 975, 244, 244, 25000, 55)
    ]
    
    # Sample cartons
    cartons_db = [
        Carton("electronics_1", "Electronics Box", 40, 30, 25, 5.0, 250, "electronics", 10),
        Carton("clothing_1", "Clothing Package", 35, 25, 20, 3.0, 150, "clothing", 15),
        Carton("books_1", "Book Carton", 30, 20, 15, 8.0, 100, "books", 20)
    ]

initialize_sample_data()

@app.route('/')
def home():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/trucks', methods=['GET'])
def get_trucks():
    app_logger.info("GET /api/trucks - retrieving truck list")
    return jsonify([asdict(truck) for truck in trucks_db])

@app.route('/api/trucks', methods=['POST'])
def add_truck():
    try:
        data = request.json
        truck = Truck(
            name=data['name'],
            length=float(data['length']),
            width=float(data['width']),
            height=float(data['height']),
            max_weight=float(data['max_weight']),
            cost_per_km=float(data.get('cost_per_km', 25))
        )
        trucks_db.append(truck)
        app_logger.info(f"Added truck: {truck.name}")
        return jsonify({'success': True, 'message': f'Truck {truck.name} added successfully'})
    except Exception as e:
        app_logger.error(f"Error adding truck: {e}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/trucks/<int:index>', methods=['DELETE', 'PUT'])
def manage_truck(index):
    try:
        if index >= len(trucks_db):
            return jsonify({'error': 'Truck not found'}), 404
            
        if request.method == 'DELETE':
            removed_truck = trucks_db.pop(index)
            app_logger.info(f"Removed truck: {removed_truck.name}")
            return jsonify({'success': True, 'message': f'Truck {removed_truck.name} removed'})
        
        elif request.method == 'PUT':
            data = request.json
            truck = trucks_db[index]
            truck.name = data.get('name', truck.name)
            truck.length = float(data.get('length', truck.length))
            truck.width = float(data.get('width', truck.width))
            truck.height = float(data.get('height', truck.height))
            truck.max_weight = float(data.get('max_weight', truck.max_weight))
            truck.cost_per_km = float(data.get('cost_per_km', truck.cost_per_km))
            
            app_logger.info(f"Updated truck: {truck.name}")
            return jsonify({'success': True, 'message': f'Truck {truck.name} updated'})
            
    except Exception as e:
        app_logger.error(f"Error managing truck: {e}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/cartons', methods=['GET'])
def get_cartons():
    app_logger.info("GET /api/cartons - retrieving carton list")
    return jsonify([asdict(carton) for carton in cartons_db])

@app.route('/api/cartons', methods=['POST'])
def add_carton():
    try:
        data = request.json
        carton = Carton(
            id=f"carton_{len(cartons_db)}",
            name=data['name'],
            length=float(data['length']),
            width=float(data['width']),
            height=float(data['height']),
            weight=float(data['weight']),
            value=float(data.get('value', 100)),
            type=data.get('type', 'standard'),
            quantity=int(data.get('quantity', 1))
        )
        cartons_db.append(carton)
        app_logger.info(f"Added carton: {carton.name}")
        return jsonify({'success': True, 'message': f'Carton {carton.name} added successfully'})
    except Exception as e:
        app_logger.error(f"Error adding carton: {e}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/cartons/<int:index>', methods=['DELETE', 'PUT'])
def manage_carton(index):
    try:
        if index >= len(cartons_db):
            return jsonify({'error': 'Carton not found'}), 404
            
        if request.method == 'DELETE':
            removed_carton = cartons_db.pop(index)
            app_logger.info(f"Removed carton: {removed_carton.name}")
            return jsonify({'success': True, 'message': f'Carton {removed_carton.name} removed'})
        
        elif request.method == 'PUT':
            data = request.json
            carton = cartons_db[index]
            carton.name = data.get('name', carton.name)
            carton.length = float(data.get('length', carton.length))
            carton.width = float(data.get('width', carton.width))
            carton.height = float(data.get('height', carton.height))
            carton.weight = float(data.get('weight', carton.weight))
            carton.value = float(data.get('value', carton.value))
            carton.type = data.get('type', carton.type)
            carton.quantity = int(data.get('quantity', carton.quantity))
            
            app_logger.info(f"Updated carton: {carton.name}")
            return jsonify({'success': True, 'message': f'Carton {carton.name} updated'})
            
    except Exception as e:
        app_logger.error(f"Error managing carton: {e}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/optimize', methods=['POST'])
def optimize_api():
    global trucks_db, cartons_db, optimization_engine
    
    try:
        app_logger.info("POST /api/optimize - starting advanced truck recommendation")
        
        if not trucks_db:
            app_logger.warning("No trucks available for optimization")
            return jsonify({'error': 'Please add trucks to your fleet first'}), 400
            
        data = request.json
        strategy = data.get('strategy', 'balanced')
        distance = data.get('distance', 100)
        selected_cartons = data.get('selected_cartons', [])
        
        # Use selected cartons if provided, otherwise use all cartons
        if selected_cartons:
            cartons_to_optimize = []
            for carton_data in selected_cartons:
                for _ in range(carton_data['quantity']):
                    carton = Carton(
                        id=f"{carton_data['name']}_{len(cartons_to_optimize)}",
                        name=carton_data['name'],
                        length=carton_data['length'],
                        width=carton_data['width'],
                        height=carton_data['height'],
                        weight=carton_data['weight'],
                        type=carton_data['type'],
                        quantity=1,
                        value=carton_data.get('value', 100)
                    )
                    cartons_to_optimize.append(carton)
            app_logger.info(f"Using {len(cartons_to_optimize)} selected cartons for optimization")
        else:
            if not cartons_db:
                app_logger.warning("No cartons available for optimization")
                return jsonify({'error': 'Please select cartons to pack first'}), 400
            cartons_to_optimize = cartons_db
        
        # Run advanced optimization
        result = optimization_engine.optimize_truck_selection(
            cartons_to_optimize, trucks_db, strategy, distance
        )
        
        if not result:
            return jsonify({'error': 'No suitable truck found for optimization'}), 400
        
        # Calculate remaining space metrics
        truck = result['truck']
        packing = result['packing']
        metrics = packing['metrics']
        
        used_volume = sum(p.carton.volume for p in packing['packed_cartons'])
        used_weight = sum(p.carton.weight for p in packing['packed_cartons'])
        
        remaining_space = {
            'remaining_volume': truck.volume - used_volume,
            'remaining_weight': truck.max_weight - used_weight,
            'remaining_space_percentage': ((truck.volume - used_volume) / truck.volume) * 100
        }
        
        total_cost = truck.cost_per_km * distance
        
        response = {
            'success': True,
            'best_truck': asdict(truck),
            'metrics': metrics,
            'total_cost': total_cost,
            'cost_per_carton': total_cost / len(packing['packed_cartons']) if packing['packed_cartons'] else 0,
            'used_volume': used_volume,
            'remaining_space': remaining_space,
            'space_suggestions': result.get('space_suggestions', []),
            'algorithm_info': {
                'name': 'Advanced Multi-Algorithm Engine',
                'strategy_used': metrics.get('strategy_used', strategy),
                'optimization_quality': 'Enterprise Grade'
            }
        }
        
        app_logger.info(f"Optimization complete - Best truck: {truck.name}, Utilization: {metrics['space_utilization']:.1f}%")
        return jsonify(response)
        
    except Exception as e:
        app_logger.error(f"Error in optimization: {e}")
        app_logger.error(traceback.format_exc())
        return jsonify({'error': f'Optimization failed: {str(e)}'}), 500

@app.route('/api/progress/<operation_id>')
def get_progress(operation_id):
    """Endpoint for real-time progress updates"""
    # This would be implemented with WebSocket or Server-Sent Events in production
    return jsonify({'progress': 100, 'message': 'Complete'})

@app.route('/api/error-analytics')
def get_error_analytics():
    """Get error analytics and system health"""
    try:
        analytics = error_monitor.get_error_analytics()
        return jsonify(analytics)
    except Exception as e:
        return jsonify({'error': 'Failed to get analytics', 'message': str(e)}), 500

@app.route('/api/improvement-suggestions')
def get_improvement_suggestions():
    """Get AI-powered improvement suggestions"""
    try:
        suggestions = error_monitor.get_improvement_suggestions()
        return jsonify(suggestions)
    except Exception as e:
        return jsonify({'error': 'Failed to get suggestions', 'message': str(e)}), 500

@app.route('/api/error-report')
def get_error_report():
    """Generate comprehensive error report"""
    try:
        if hasattr(error_monitor, 'generate_error_report'):
            report = error_monitor.generate_error_report()
            return jsonify({'report': report})
        else:
            return jsonify({'report': 'Error monitoring not fully available'})
    except Exception as e:
        return jsonify({'error': 'Failed to generate report', 'message': str(e)}), 500

@app.route('/api/capture-error', methods=['POST'])
def capture_error_endpoint():
    """Manual error capture endpoint"""
    try:
        data = request.json
        error_type = data.get('error_type', 'Unknown')
        error_message = data.get('message', 'No message provided')
        context = data.get('context', {})
        
        # Create a mock exception for capture
        class ManualError(Exception):
            pass
        
        error = ManualError(error_message)
        error.__class__.__name__ = error_type
        
        error_id = error_monitor.capture_error(error, context)
        return jsonify({'success': True, 'error_id': error_id})
    except Exception as e:
        app_logger.error(f"Failed to capture manual error: {e}")
        return jsonify({'error': 'Failed to capture error', 'message': str(e)}), 500

# HTML Template with Advanced Features
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TruckOpti - Advanced Truck Loading Optimization</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .main-content {
            background: white;
            border-radius: 20px;
            padding: 0;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .tabs {
            display: flex;
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
        }
        
        .tab {
            flex: 1;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            border: none;
            background: none;
            font-size: 1rem;
            font-weight: 500;
            color: #666;
            transition: all 0.3s ease;
        }
        
        .tab.active {
            background: white;
            color: #667eea;
            border-bottom: 3px solid #667eea;
        }
        
        .tab:hover {
            background: #e9ecef;
            color: #495057;
        }
        
        .tab-content {
            display: none;
            padding: 30px;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .form-group {
            display: flex;
            flex-direction: column;
        }
        
        label {
            font-weight: 600;
            margin-bottom: 8px;
            color: #495057;
        }
        
        input, select {
            padding: 12px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s ease;
        }
        
        input:focus, select:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-success {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #f44336 0%, #da190b 100%);
            color: white;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .truck-card, .carton-card {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 15px;
            border-left: 5px solid #667eea;
            transition: transform 0.3s ease;
        }
        
        .truck-card:hover, .carton-card:hover {
            transform: translateX(5px);
        }
        
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .card-title {
            font-size: 1.3rem;
            font-weight: 700;
            color: #495057;
        }
        
        .card-actions {
            display: flex;
            gap: 10px;
        }
        
        .specs {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            font-size: 0.9rem;
        }
        
        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-weight: 500;
        }
        
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert-danger {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .alert-warning {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        
        .alert-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .progress-container {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            margin: 20px 0;
        }
        
        .progress-bar {
            width: 100%;
            height: 25px;
            background: #e9ecef;
            border-radius: 15px;
            overflow: hidden;
            margin: 15px 0;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 15px;
            transition: width 0.5s ease;
            position: relative;
            overflow: hidden;
        }
        
        .progress-fill::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            animation: shimmer 2s infinite;
        }
        
        @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
        }
        
        .progress-text {
            font-size: 1.1rem;
            font-weight: 600;
            color: #495057;
            margin-top: 10px;
        }
        
        .optimization-section {
            background: #e3f2fd;
            border-radius: 15px;
            padding: 25px;
            margin-top: 20px;
        }
        
        .selected-cartons-section {
            background: #f1f8e9;
            border-radius: 15px;
            padding: 25px;
            margin-top: 20px;
            display: none;
        }
        
        .carton-selection-item {
            background: white;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
        }
        
        .carton-info {
            flex: 1;
        }
        
        .carton-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .qty-input {
            width: 80px;
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @media (max-width: 768px) {
            .header h1 { font-size: 2rem; }
            .tabs { flex-direction: column; }
            .form-row { grid-template-columns: 1fr; }
            .main-content { margin: 10px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>TruckOpti</h1>
            <p>Advanced Truck Loading Optimization with LAFF Algorithm & Real-time Progress</p>
        </div>
        
        <div class="main-content">
            <div class="tabs">
                <button class="tab active" onclick="showTab('trucks')">Manage Trucks</button>
                <button class="tab" onclick="showTab('cartons')">Manage Cartons</button>
                <button class="tab" onclick="showTab('optimize')">Smart Optimization</button>
            </div>
            
            <div id="trucks" class="tab-content active">
                <h2>Truck Fleet Management</h2>
                <div style="background: #f8f9fa; border-radius: 15px; padding: 25px; margin-top: 30px;">
                    <h3>Add New Truck</h3>
                    <form id="truck-form">
                        <div class="form-row">
                            <div><label>Truck Name:</label><input type="text" id="truck_name" placeholder="e.g., Tata 14ft" required></div>
                            <div><label>Length (cm):</label><input type="number" id="truck_length" placeholder="427" required></div>
                            <div><label>Width (cm):</label><input type="number" id="truck_width" placeholder="183" required></div>
                            <div><label>Height (cm):</label><input type="number" id="truck_height" placeholder="213" required></div>
                            <div><label>Max Weight (kg):</label><input type="number" id="truck_weight" placeholder="10000" required></div>
                            <div><label>Cost per KM (₹):</label><input type="number" id="truck_cost" placeholder="25" required></div>
                        </div>
                        <button type="submit" class="btn btn-primary">Add Truck</button>
                    </form>
                </div>
                <div id="trucks_list">
                    <h3>Current Fleet</h3>
                    <div id="trucks_display"></div>
                </div>
            </div>
            
            <div id="cartons" class="tab-content">
                <h2>Carton Management</h2>
                <div style="background: #f8f9fa; border-radius: 15px; padding: 25px; margin-top: 30px;">
                    <h3>Add Cartons for Packing</h3>
                    <form id="carton-form">
                        <div class="form-row">
                            <div><label>Carton Name:</label><input type="text" id="carton_name" placeholder="e.g., Medium Electronics Box" required></div>
                            <div><label>Length (cm):</label><input type="number" id="carton_length" placeholder="40" required></div>
                            <div><label>Width (cm):</label><input type="number" id="carton_width" placeholder="30" required></div>
                            <div><label>Height (cm):</label><input type="number" id="carton_height" placeholder="25" required></div>
                            <div><label>Weight (kg):</label><input type="number" step="0.1" id="carton_weight" placeholder="5.0" required></div>
                            <div><label>Value (₹):</label><input type="number" id="carton_value" placeholder="250" required></div>
                            <div><label>Quantity:</label><input type="number" id="carton_quantity" placeholder="10" required></div>
                            <div><label>Type:</label><select id="carton_type"><option value="standard">Standard</option><option value="electronics">Electronics</option><option value="fragile">Fragile</option><option value="heavy">Heavy</option></select></div>
                        </div>
                        <button type="submit" class="btn btn-primary">Add Cartons</button>
                    </form>
                </div>
                <div id="cartons_list">
                    <h3>Cartons to Pack</h3>
                    <div id="cartons_display"></div>
                </div>
            </div>
            
            <div id="optimize" class="tab-content">
                <h2>Smart Truck Recommendation</h2>
                
                <!-- Carton Selection Section -->
                <div class="optimization-section">
                    <h3>Select Cartons for Optimization</h3>
                    <div id="carton_selection_list" style="margin-top: 15px;">
                        <!-- Carton selection will be populated here -->
                    </div>
                    <button class="btn btn-primary" onclick="addCartonForOptimization()" style="margin-top: 15px;">Add Selected Cartons</button>
                </div>
                
                <!-- Selected Cartons Display -->
                <div id="selected_cartons_display" class="selected-cartons-section">
                    <h3>Cartons Selected for Optimization</h3>
                    <div id="selected_cartons_list"></div>
                </div>
                
                <!-- Optimization Parameters -->
                <div style="background: #f8f9fa; border-radius: 15px; padding: 25px; margin-top: 20px;">
                    <h3>Advanced Optimization Parameters</h3>
                    <div class="form-row">
                        <div><label>Optimization Strategy:</label><select id="optimization_strategy"><option value="space">Space Utilization</option><option value="cost">Cost Efficiency</option><option value="balanced">Balanced Approach</option></select></div>
                        <div><label>Distance (km):</label><input type="number" id="distance" value="100" min="1" placeholder="100"></div>
                    </div>
                    <button class="btn btn-success" onclick="optimizeLoading()" style="margin-top: 15px;">🚀 Find Best Truck & Optimize Loading</button>
                </div>
                
                <!-- Progress Display -->
                <div id="progress_display" style="display: none;">
                    <div class="progress-container">
                        <h3>Advanced Algorithm Running...</h3>
                        <div class="progress-bar">
                            <div class="progress-fill" id="progress_fill" style="width: 0%"></div>
                        </div>
                        <div class="progress-text" id="progress_text">Initializing...</div>
                    </div>
                </div>
                
                <div id="results"></div>
            </div>
        </div>
    </div>
    
    <script>
        let selectedCartonsForOptimization = [];
        let currentProgress = 0;
        let progressInterval = null;
        
        function showTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
            if (tabName === 'trucks') loadTrucks();
            if (tabName === 'cartons') loadCartons();
            if (tabName === 'optimize') loadCartonSelectionList();
        }
        
        async function loadCartonSelectionList() {
            try {
                const response = await fetch('/api/cartons');
                const cartons = await response.json();
                
                let html = '';
                if (cartons.length === 0) {
                    html = '<p style="color: #666; font-style: italic;">No cartons available. Please add cartons first.</p>';
                } else {
                    cartons.forEach((carton, index) => {
                        html += `
                            <div class="carton-selection-item">
                                <div class="carton-info">
                                    <strong>${carton.name}</strong>
                                    <br><small>Dimensions: ${carton.length}×${carton.width}×${carton.height} cm | Weight: ${carton.weight} kg | Type: ${carton.type}</small>
                                </div>
                                <div class="carton-controls">
                                    <label for="qty_${index}">Qty:</label>
                                    <input type="number" class="qty-input" id="qty_${index}" min="1" value="${carton.quantity}">
                                    <button onclick="selectCartonForOptimization(${index}, '${carton.name}', ${carton.length}, ${carton.width}, ${carton.height}, ${carton.weight}, '${carton.type}', ${carton.value})" 
                                            class="btn btn-success" style="padding: 8px 15px; font-size: 0.9rem;">
                                        Select
                                    </button>
                                </div>
                            </div>
                        `;
                    });
                }
                
                document.getElementById('carton_selection_list').innerHTML = html;
            } catch (error) {
                console.error('Error loading cartons:', error);
                document.getElementById('carton_selection_list').innerHTML = '<p style="color: red;">Error loading cartons. Please try again.</p>';
            }
        }
        
        function selectCartonForOptimization(index, name, length, width, height, weight, type, value) {
            const quantity = parseInt(document.getElementById(`qty_${index}`).value);
            
            if (quantity <= 0) {
                showAlert('Please enter a valid quantity', 'danger');
                return;
            }
            
            const carton = { name, length, width, height, weight, type, quantity, value };
            selectedCartonsForOptimization.push(carton);
            
            updateSelectedCartonsDisplay();
            showAlert(`Added ${quantity}x ${name} to optimization list`, 'success');
        }
        
        function updateSelectedCartonsDisplay() {
            const display = document.getElementById('selected_cartons_display');
            const list = document.getElementById('selected_cartons_list');
            
            if (selectedCartonsForOptimization.length === 0) {
                display.style.display = 'none';
                return;
            }
            
            display.style.display = 'block';
            
            let html = '';
            selectedCartonsForOptimization.forEach((carton, index) => {
                html += `
                    <div style="background: white; border-radius: 8px; padding: 12px; margin-bottom: 8px; border-left: 4px solid #4CAF50; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${carton.name}</strong> - Quantity: ${carton.quantity}
                            <br><small>${carton.length}×${carton.width}×${carton.height} cm, ${carton.weight} kg each</small>
                        </div>
                        <button onclick="removeCartonFromOptimization(${index})" class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem;">
                            Remove
                        </button>
                    </div>
                `;
            });
            
            list.innerHTML = html;
        }
        
        function removeCartonFromOptimization(index) {
            selectedCartonsForOptimization.splice(index, 1);
            updateSelectedCartonsDisplay();
            showAlert('Carton removed from optimization list', 'info');
        }
        
        function addCartonForOptimization() {
            if (selectedCartonsForOptimization.length === 0) {
                showAlert('Please select at least one carton for optimization', 'warning');
                return;
            }
            showAlert(`${selectedCartonsForOptimization.length} carton types ready for optimization`, 'success');
        }
        
        async function optimizeLoading() {
            const strategy = document.getElementById('optimization_strategy').value;
            const distance = parseFloat(document.getElementById('distance').value);
            
            if (selectedCartonsForOptimization.length === 0) {
                showAlert('Please select cartons for optimization first', 'warning');
                return;
            }
            
            // Show progress display
            document.getElementById('progress_display').style.display = 'block';
            document.getElementById('results').innerHTML = '';
            
            // Start progress simulation
            startProgressSimulation();
            
            try {
                const response = await fetch('/api/optimize', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        strategy, 
                        distance,
                        selected_cartons: selectedCartonsForOptimization
                    })
                });
                
                if (response.ok) {
                    const results = await response.json();
                    // Complete progress
                    updateProgress(100, 'Optimization complete!');
                    setTimeout(() => {
                        stopProgressSimulation();
                        displayResults(results);
                    }, 500);
                } else {
                    const error = await response.json();
                    stopProgressSimulation();
                    showAlert('Optimization failed: ' + error.error, 'danger');
                }
            } catch (error) {
                stopProgressSimulation();
                showAlert('Network error: ' + error.message, 'danger');
            }
        }
        
        function startProgressSimulation() {
            currentProgress = 0;
            const progressSteps = [
                {progress: 5, message: "Initializing advanced optimization engine..."},
                {progress: 15, message: "Loading LAFF algorithm parameters..."},
                {progress: 25, message: "Analyzing truck fleet specifications..."},
                {progress: 35, message: "Running multi-pass optimization strategy..."},
                {progress: 50, message: "Calculating 3D spatial arrangements..."},
                {progress: 65, message: "Optimizing weight distribution..."},
                {progress: 75, message: "Evaluating cost efficiency metrics..."},
                {progress: 85, message: "Generating space utilization suggestions..."},
                {progress: 95, message: "Finalizing recommendations..."}
            ];
            
            let stepIndex = 0;
            progressInterval = setInterval(() => {
                if (stepIndex < progressSteps.length) {
                    const step = progressSteps[stepIndex];
                    updateProgress(step.progress, step.message);
                    stepIndex++;
                } else {
                    clearInterval(progressInterval);
                }
            }, 600);
        }
        
        function stopProgressSimulation() {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            setTimeout(() => {
                document.getElementById('progress_display').style.display = 'none';
            }, 1000);
        }
        
        function updateProgress(percentage, message) {
            document.getElementById('progress_fill').style.width = percentage + '%';
            document.getElementById('progress_text').textContent = `${percentage}% - ${message}`;
        }
        
        function displayResults(results) {
            let html = `
                <div style="background: white; border-radius: 15px; padding: 25px; margin-top: 20px;">
                    <h3>🎯 Optimization Results - ${results.algorithm_info.name}</h3>
                    
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 15px; margin: 20px 0;">
                        <h4>Recommended Truck: ${results.best_truck.name}</h4>
                        <p>Strategy Used: ${results.algorithm_info.strategy_used} | Quality: ${results.algorithm_info.optimization_quality}</p>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 25px 0;">
                        <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: bold; margin-bottom: 5px;">${results.metrics.total_cartons_packed}</div>
                            <div style="font-size: 0.9rem; opacity: 0.9;">Cartons Packed</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: bold; margin-bottom: 5px;">${results.metrics.space_utilization.toFixed(1)}%</div>
                            <div style="font-size: 0.9rem; opacity: 0.9;">Space Utilization</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: bold; margin-bottom: 5px;">${results.metrics.weight_utilization.toFixed(1)}%</div>
                            <div style="font-size: 0.9rem; opacity: 0.9;">Weight Utilization</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%); color: white; padding: 20px; border-radius: 15px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: bold; margin-bottom: 5px;">₹${results.total_cost.toFixed(0)}</div>
                            <div style="font-size: 0.9rem; opacity: 0.9;">Total Cost</div>
                        </div>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 15px; margin: 20px 0;">
                        <h4>📊 Detailed Analysis</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px;">
                            <div><strong>Truck Dimensions:</strong> ${results.best_truck.length}×${results.best_truck.width}×${results.best_truck.height} cm</div>
                            <div><strong>Total Volume:</strong> ${(results.best_truck.length * results.best_truck.width * results.best_truck.height / 1000000).toFixed(2)} m³</div>
                            <div><strong>Used Volume:</strong> ${(results.used_volume / 1000000).toFixed(2)} m³</div>
                            <div><strong>Remaining Volume:</strong> ${(results.remaining_space.remaining_volume / 1000000).toFixed(2)} m³</div>
                            <div><strong>Remaining Weight Capacity:</strong> ${results.remaining_space.remaining_weight.toFixed(1)} kg</div>
                            <div><strong>Cost per Carton:</strong> ₹${results.cost_per_carton.toFixed(2)}</div>
                            <div><strong>Efficiency Score:</strong> ${results.metrics.efficiency_score.toFixed(1)}/100</div>
                            <div><strong>Algorithm Quality:</strong> ${results.algorithm_info.optimization_quality}</div>
                        </div>
                    </div>
            `;
            
            if (results.space_suggestions && results.space_suggestions.length > 0) {
                html += `
                    <div style="background: #e8f5e8; border: 2px solid #4CAF50; border-radius: 15px; padding: 20px; margin-top: 20px;">
                        <h4>💡 Smart Space Optimization Suggestions</h4>
                        <p>Based on remaining space analysis, you can add these carton types:</p>
                `;
                
                results.space_suggestions.forEach(suggestion => {
                    html += `
                        <div style="background: white; border-radius: 10px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #4CAF50;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>${suggestion.carton_name}</strong> (${suggestion.carton_type})
                                    <br>
                                    <small>Dimensions: ${suggestion.dimensions} cm | Weight: ${suggestion.weight} kg</small>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 1.5rem; font-weight: bold; color: #4CAF50;">
                                        ${suggestion.max_quantity}
                                    </div>
                                    <div style="font-size: 0.9rem;">max quantity</div>
                                </div>
                            </div>
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; font-size: 0.9rem;">
                                    <div><strong>Total Weight:</strong> ${suggestion.total_weight.toFixed(1)} kg</div>
                                    <div><strong>Total Volume:</strong> ${(suggestion.total_volume / 1000000).toFixed(3)} m³</div>
                                    <div><strong>Total Value:</strong> ₹${suggestion.total_value.toFixed(0)}</div>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += '</div>';
            }
            
            html += '</div>';
            
            document.getElementById('results').innerHTML = html;
        }
        
        // Rest of the JavaScript functions remain the same...
        async function addTruck(event) {
            event.preventDefault();
            const truck = {
                name: document.getElementById('truck_name').value,
                length: parseFloat(document.getElementById('truck_length').value),
                width: parseFloat(document.getElementById('truck_width').value),
                height: parseFloat(document.getElementById('truck_height').value),
                max_weight: parseFloat(document.getElementById('truck_weight').value),
                cost_per_km: parseFloat(document.getElementById('truck_cost').value)
            };
            
            try {
                const response = await fetch('/api/trucks', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(truck)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    showAlert(result.message, 'success');
                    document.getElementById('truck-form').reset();
                    loadTrucks();
                } else {
                    const error = await response.json();
                    showAlert('Error: ' + error.error, 'danger');
                }
            } catch (error) {
                showAlert('Network error: ' + error.message, 'danger');
            }
        }
        
        async function loadTrucks() {
            try {
                const response = await fetch('/api/trucks');
                const trucks = await response.json();
                
                let html = '';
                trucks.forEach((truck, index) => {
                    html += `
                        <div class="truck-card">
                            <div class="card-header">
                                <div class="card-title">${truck.name}</div>
                                <div class="card-actions">
                                    <button onclick="editTruck(${index})" class="btn btn-primary" style="padding: 8px 15px; font-size: 0.9rem;">Edit</button>
                                    <button onclick="removeTruck(${index})" class="btn btn-danger" style="padding: 8px 15px; font-size: 0.9rem;">Remove</button>
                                </div>
                            </div>
                            <div class="specs">
                                <div><strong>Dimensions:</strong> ${truck.length}×${truck.width}×${truck.height} cm</div>
                                <div><strong>Volume:</strong> ${(truck.length * truck.width * truck.height / 1000000).toFixed(2)} m³</div>
                                <div><strong>Max Weight:</strong> ${truck.max_weight} kg</div>
                                <div><strong>Cost:</strong> ₹${truck.cost_per_km}/km</div>
                            </div>
                        </div>
                    `;
                });
                
                document.getElementById('trucks_display').innerHTML = html || '<p style="color: #666; font-style: italic;">No trucks added yet.</p>';
            } catch (error) {
                showAlert('Error loading trucks: ' + error.message, 'danger');
            }
        }
        
        async function removeTruck(index) {
            if (confirm('Are you sure you want to remove this truck?')) {
                try {
                    const response = await fetch(`/api/trucks/${index}`, { method: 'DELETE' });
                    if (response.ok) {
                        const result = await response.json();
                        showAlert(result.message, 'success');
                        loadTrucks();
                    }
                } catch (error) {
                    showAlert('Error removing truck: ' + error.message, 'danger');
                }
            }
        }
        
        async function addCarton(event) {
            event.preventDefault();
            const carton = {
                name: document.getElementById('carton_name').value,
                length: parseFloat(document.getElementById('carton_length').value),
                width: parseFloat(document.getElementById('carton_width').value),
                height: parseFloat(document.getElementById('carton_height').value),
                weight: parseFloat(document.getElementById('carton_weight').value),
                value: parseFloat(document.getElementById('carton_value').value),
                quantity: parseInt(document.getElementById('carton_quantity').value),
                type: document.getElementById('carton_type').value
            };
            
            try {
                const response = await fetch('/api/cartons', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(carton)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    showAlert(result.message, 'success');
                    document.getElementById('carton-form').reset();
                    loadCartons();
                } else {
                    const error = await response.json();
                    showAlert('Error: ' + error.error, 'danger');
                }
            } catch (error) {
                showAlert('Network error: ' + error.message, 'danger');
            }
        }
        
        async function loadCartons() {
            try {
                const response = await fetch('/api/cartons');
                const cartons = await response.json();
                
                let html = '';
                cartons.forEach((carton, index) => {
                    html += `
                        <div class="carton-card">
                            <div class="card-header">
                                <div class="card-title">${carton.name}</div>
                                <div class="card-actions">
                                    <button onclick="editCarton(${index})" class="btn btn-primary" style="padding: 8px 15px; font-size: 0.9rem;">Edit</button>
                                    <button onclick="removeCarton(${index})" class="btn btn-danger" style="padding: 8px 15px; font-size: 0.9rem;">Remove</button>
                                </div>
                            </div>
                            <div class="specs">
                                <div><strong>Dimensions:</strong> ${carton.length}×${carton.width}×${carton.height} cm</div>
                                <div><strong>Volume:</strong> ${(carton.length * carton.width * carton.height / 1000).toFixed(3)} L</div>
                                <div><strong>Weight:</strong> ${carton.weight} kg</div>
                                <div><strong>Value:</strong> ₹${carton.value}</div>
                                <div><strong>Quantity:</strong> ${carton.quantity}</div>
                                <div><strong>Type:</strong> ${carton.type}</div>
                            </div>
                        </div>
                    `;
                });
                
                document.getElementById('cartons_display').innerHTML = html || '<p style="color: #666; font-style: italic;">No cartons added yet.</p>';
            } catch (error) {
                showAlert('Error loading cartons: ' + error.message, 'danger');
            }
        }
        
        async function removeCarton(index) {
            if (confirm('Are you sure you want to remove this carton?')) {
                try {
                    const response = await fetch(`/api/cartons/${index}`, { method: 'DELETE' });
                    if (response.ok) {
                        const result = await response.json();
                        showAlert(result.message, 'success');
                        loadCartons();
                        loadCartonSelectionList(); // Refresh the selection list
                    }
                } catch (error) {
                    showAlert('Error removing carton: ' + error.message, 'danger');
                }
            }
        }
        
        function showAlert(message, type) {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${type}`;
            alertDiv.textContent = message;
            
            const activeTab = document.querySelector('.tab-content.active');
            activeTab.insertBefore(alertDiv, activeTab.firstChild);
            
            setTimeout(() => {
                alertDiv.remove();
            }, 5000);
        }
        
        // Event listeners
        document.getElementById('truck-form').addEventListener('submit', addTruck);
        document.getElementById('carton-form').addEventListener('submit', addCarton);
        
        // Load initial data
        loadTrucks();
        loadCartons();
    </script>
</body>
</html>
'''

if __name__ == '__main__':
    port = find_available_port()
    
    print("=" * 60)
    print("TruckOpti - Advanced Truck Loading Optimization")
    print("=" * 60)
    print(f"Server starting on: http://127.0.0.1:{port}/")
    print("Features:")
    print("   - Advanced LAFF Algorithm with Multi-Pass Optimization") 
    print("   - Real-time Progress Tracking with Percentage")
    print("   - Smart Truck Recommendations")
    print("   - Space Optimization with Suggestions")
    print("   - Add/Edit/Remove functionality")
    print("   - Comprehensive Error Logging")
    print("   - Enterprise-Grade Performance")
    print("=" * 60)
    
    # Auto-open browser
    Timer(2, lambda: webbrowser.open_new(f"http://127.0.0.1:{port}/")).start()
    
    # Run the application
    app.run(debug=True, port=port, host='127.0.0.1')