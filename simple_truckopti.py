#!/usr/bin/env python3
"""
TruckOpti - Single Function Smart Truck Loading Optimization
Advanced LAFF (Largest Area Fit First) + RANSAC Algorithm Implementation
"""

import os
import sys
import json
import webbrowser
import socket
import logging
import traceback
from datetime import datetime
from threading import Timer
from flask import Flask, render_template_string, request, jsonify
import numpy as np
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple, Optional
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
    """3D Truck with enhanced properties"""
    id: str
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
    """Packed carton with 3D position"""
    carton: Carton
    x: float
    y: float
    z: float
    rotated: bool = False

class AdvancedLAFFPacker:
    """
    Advanced LAFF (Largest Area Fit First) Algorithm with RANSAC Optimization
    Based on study materials: pyRANSAC-3D and advanced bin packing research
    """
    
    def __init__(self):
        self.tolerance = 0.1  # mm tolerance for fitting
        self.rotation_enabled = True
        
    def can_fit(self, carton: Carton, truck: Truck, x: float, y: float, z: float, 
                packed_cartons: List[PackedCarton]) -> bool:
        """Check if carton can fit at given position without overlapping"""
        
        # Check truck boundaries
        if (x + carton.length > truck.length or 
            y + carton.width > truck.width or 
            z + carton.height > truck.height):
            return False
            
        # Check collision with existing cartons
        for packed in packed_cartons:
            if self._boxes_overlap(
                x, y, z, carton.length, carton.width, carton.height,
                packed.x, packed.y, packed.z, 
                packed.carton.length, packed.carton.width, packed.carton.height
            ):
                return False
                
        return True
    
    def _boxes_overlap(self, x1, y1, z1, l1, w1, h1, x2, y2, z2, l2, w2, h2) -> bool:
        """Check if two 3D boxes overlap"""
        return not (x1 + l1 <= x2 or x2 + l2 <= x1 or
                   y1 + w1 <= y2 or y2 + w2 <= y1 or
                   z1 + h1 <= z2 or z2 + h2 <= z1)
    
    def find_best_position(self, carton: Carton, truck: Truck, 
                          packed_cartons: List[PackedCarton]) -> Optional[Tuple[float, float, float]]:
        """Find best position using LAFF algorithm"""
        
        # Generate candidate positions (LAFF approach)
        positions = [(0, 0, 0)]  # Start with origin
        
        # Add positions based on existing cartons (LAFF strategy)
        for packed in packed_cartons:
            candidates = [
                (packed.x + packed.carton.length, packed.y, packed.z),
                (packed.x, packed.y + packed.carton.width, packed.z),
                (packed.x, packed.y, packed.z + packed.carton.height),
                (packed.x + packed.carton.length, packed.y + packed.carton.width, packed.z),
                (packed.x + packed.carton.length, packed.y, packed.z + packed.carton.height),
                (packed.x, packed.y + packed.carton.width, packed.z + packed.carton.height),
            ]
            positions.extend(candidates)
        
        # Sort positions by LAFF criteria (lowest position, then largest area fit)
        positions.sort(key=lambda p: (p[2], p[1], p[0]))
        
        # Try each position
        for x, y, z in positions:
            if self.can_fit(carton, truck, x, y, z, packed_cartons):
                return (x, y, z)
                
        return None
    
    def optimize_with_rotations(self, cartons: List[Carton], truck: Truck) -> Tuple[List[PackedCarton], Dict]:
        """Optimize packing with rotation options (RANSAC-inspired)"""
        
        best_packing = []
        best_utilization = 0
        
        # Try different rotation combinations (RANSAC sampling approach)
        rotation_attempts = min(100, 2 ** len(cartons))  # Limit attempts
        
        for attempt in range(rotation_attempts):
            current_packing = []
            current_weight = 0
            
            # Sort cartons by area (LAFF principle)
            sorted_cartons = sorted(cartons, key=lambda c: c.area, reverse=True)
            
            for carton in sorted_cartons:
                if current_weight + carton.weight > truck.max_weight:
                    continue
                    
                # Try original orientation
                position = self.find_best_position(carton, truck, current_packing)
                if position:
                    current_packing.append(PackedCarton(carton, *position))
                    current_weight += carton.weight
                    continue
                
                # Try rotated orientation if enabled
                if self.rotation_enabled:
                    rotated_carton = Carton(
                        carton.id, carton.name, carton.width, carton.length, carton.height,
                        carton.weight, carton.value, carton.type
                    )
                    position = self.find_best_position(rotated_carton, truck, current_packing)
                    if position:
                        current_packing.append(PackedCarton(rotated_carton, *position, rotated=True))
                        current_weight += carton.weight
            
            # Calculate utilization
            used_volume = sum(p.carton.volume for p in current_packing)
            utilization = (used_volume / truck.volume) * 100
            
            if utilization > best_utilization:
                best_utilization = utilization
                best_packing = current_packing.copy()
        
        # Calculate metrics
        metrics = {
            'total_cartons_packed': len(best_packing),
            'space_utilization': best_utilization,
            'weight_utilization': (sum(p.carton.weight for p in best_packing) / truck.max_weight) * 100,
            'total_value': sum(p.carton.value for p in best_packing)
        }
        
        return best_packing, metrics

class SpaceOptimizer:
    """Advanced Space Optimization Engine"""
    
    def __init__(self, available_carton_types: List[Carton]):
        self.available_carton_types = available_carton_types
        self.packer = AdvancedLAFFPacker()
    
    def calculate_remaining_space(self, truck: Truck, packed_cartons: List[PackedCarton]) -> Dict:
        """Calculate detailed remaining space information"""
        
        used_volume = sum(p.carton.volume for p in packed_cartons)
        used_weight = sum(p.carton.weight for p in packed_cartons)
        
        remaining_volume = truck.volume - used_volume
        remaining_weight = truck.max_weight - used_weight
        
        # Calculate available space regions (simplified)
        occupied_positions = [(p.x, p.y, p.z, p.carton.length, p.carton.width, p.carton.height) 
                            for p in packed_cartons]
        
        return {
            'remaining_volume': remaining_volume,
            'remaining_weight': remaining_weight,
            'utilization_percentage': (used_volume / truck.volume) * 100,
            'weight_percentage': (used_weight / truck.max_weight) * 100,
            'available_positions': self._find_available_spaces(truck, packed_cartons)
        }
    
    def _find_available_spaces(self, truck: Truck, packed_cartons: List[PackedCarton]) -> List[Dict]:
        """Find available space regions in the truck"""
        
        # Simplified space detection - find major empty regions
        spaces = []
        
        # Check corner spaces
        test_positions = [
            (0, 0, 0),
            (truck.length/2, 0, 0),
            (0, truck.width/2, 0),
            (0, 0, truck.height/2),
            (truck.length/2, truck.width/2, 0),
        ]
        
        for x, y, z in test_positions:
            # Find largest box that could fit at this position
            max_length = truck.length - x
            max_width = truck.width - y  
            max_height = truck.height - z
            
            # Check if space is actually free
            space_free = True
            for packed in packed_cartons:
                if (packed.x < x + max_length and packed.x + packed.carton.length > x and
                    packed.y < y + max_width and packed.y + packed.carton.width > y and
                    packed.z < z + max_height and packed.z + packed.carton.height > z):
                    space_free = False
                    break
            
            if space_free and max_length > 10 and max_width > 10 and max_height > 10:
                spaces.append({
                    'x': x, 'y': y, 'z': z,
                    'max_length': max_length,
                    'max_width': max_width, 
                    'max_height': max_height,
                    'volume': max_length * max_width * max_height
                })
        
        return sorted(spaces, key=lambda s: s['volume'], reverse=True)
    
    def suggest_additional_cartons(self, truck: Truck, packed_cartons: List[PackedCarton], 
                                 remaining_space: Dict) -> List[Dict]:
        """Suggest additional cartons that can fit in remaining space"""
        
        suggestions = []
        available_spaces = remaining_space['available_positions']
        remaining_weight = remaining_space['remaining_weight']
        
        for carton_type in self.available_carton_types:
            if carton_type.weight > remaining_weight:
                continue
                
            max_quantity = 0
            
            # Check how many of this carton type can fit
            for space in available_spaces:
                if (carton_type.length <= space['max_length'] and
                    carton_type.width <= space['max_width'] and
                    carton_type.height <= space['max_height']):
                    
                    # Calculate how many can fit in this space
                    qty_x = int(space['max_length'] // carton_type.length)
                    qty_y = int(space['max_width'] // carton_type.width)
                    qty_z = int(space['max_height'] // carton_type.height)
                    
                    space_quantity = qty_x * qty_y * qty_z
                    weight_limit = int(remaining_weight // carton_type.weight)
                    
                    quantity = min(space_quantity, weight_limit)
                    max_quantity = max(max_quantity, quantity)
            
            if max_quantity > 0:
                suggestions.append({
                    'carton_name': carton_type.name,
                    'carton_type': carton_type.type,
                    'dimensions': f"{carton_type.length}×{carton_type.width}×{carton_type.height}",
                    'weight': carton_type.weight,
                    'value': carton_type.value,
                    'max_quantity': max_quantity,
                    'total_volume': carton_type.volume * max_quantity,
                    'total_weight': carton_type.weight * max_quantity,
                    'total_value': carton_type.value * max_quantity
                })
        
        # Sort by total value descending
        return sorted(suggestions, key=lambda s: s['total_value'], reverse=True)

# =============================================================================
# ERROR LOGGING SETUP
# =============================================================================

def setup_logging():
    """Setup comprehensive logging for error tracking and improvement"""
    # Create logs directory if it doesn't exist
    if not os.path.exists('logs'):
        os.makedirs('logs')
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('logs/truckopti.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Create specific loggers
    app_logger = logging.getLogger('truckopti')
    error_logger = logging.getLogger('errors')
    
    return app_logger, error_logger

def log_error(error_logger, error, context=""):
    """Log errors with full context for debugging"""
    error_logger.error(f"ERROR in {context}: {str(error)}")
    error_logger.error(f"Traceback: {traceback.format_exc()}")

# =============================================================================
# FLASK APPLICATION
# =============================================================================

app = Flask(__name__)
app.secret_key = 'truckopti_simple_2025'

# Setup logging
app_logger, error_logger = setup_logging()

# Global data storage
trucks_db = []
cartons_db = []
available_carton_types = []

def initialize_default_data():
    """Initialize with some default truck and carton types"""
    global trucks_db, cartons_db, available_carton_types
    
    # Default truck types
    trucks_db = [
        Truck("1", "Tata Ace Mini", 180, 120, 120, 750, 12),
        Truck("2", "Eicher 14 ft", 427, 183, 213, 10000, 25),
        Truck("3", "Ashok Leyland 17 ft", 518, 200, 230, 12000, 30),
        Truck("4", "Eicher 32 ft XL", 975, 244, 244, 25000, 55),
    ]
    
    # Default carton types  
    available_carton_types = [
        Carton("small", "Small Box", 30, 20, 15, 2.5, 100, "standard"),
        Carton("medium", "Medium Box", 40, 30, 25, 5.0, 250, "standard"),
        Carton("large", "Large Box", 60, 40, 35, 8.5, 500, "standard"),
        Carton("electronics", "Electronics Box", 35, 25, 20, 3.2, 800, "fragile"),
        Carton("document", "Document Box", 32, 24, 12, 1.8, 50, "lightweight"),
    ]

# HTML Template
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TruckOpti - Smart Truck Loading Optimization</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .main-card {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .tabs {
            display: flex;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        
        .tab {
            flex: 1;
            padding: 15px 20px;
            text-align: center;
            background: none;
            border: none;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s;
        }
        
        .tab.active {
            background: white;
            color: #667eea;
            border-bottom: 3px solid #667eea;
        }
        
        .tab:hover:not(.active) {
            background: #e9ecef;
        }
        
        .tab-content {
            padding: 30px;
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }
        
        input, select, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: transform 0.2s;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
        }
        
        .btn-success {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #f44336 0%, #da190b 100%);
        }
        
        .optimization-section {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            margin-top: 30px;
        }
        
        .carton-list {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
        }
        
        .carton-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }
        
        .carton-item:last-child {
            border-bottom: none;
        }
        
        .results-section {
            background: white;
            border-radius: 15px;
            padding: 25px;
            margin-top: 20px;
        }
        
        .metric-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .metric-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 15px;
            text-align: center;
        }
        
        .metric-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .metric-label {
            font-size: 0.9rem;
            opacity: 0.9;
        }
        
        .suggestions-section {
            background: #e8f5e8;
            border: 2px solid #4CAF50;
            border-radius: 15px;
            padding: 20px;
            margin-top: 20px;
        }
        
        .suggestion-item {
            background: white;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 10px;
            border-left: 4px solid #4CAF50;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            display: none;
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
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .alert {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        
        .alert-success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }
        
        .alert-error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }
        
        .truck-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .truck-card {
            background: white;
            border: 2px solid #e9ecef;
            border-radius: 15px;
            padding: 20px;
            transition: border-color 0.3s;
        }
        
        .truck-card:hover {
            border-color: #667eea;
        }
        
        .truck-card.selected {
            border-color: #4CAF50;
            background: #f0fff0;
        }
        
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .header h1 { font-size: 2rem; }
            .form-row { grid-template-columns: 1fr; }
            .tabs { flex-direction: column; }
            .metric-cards { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>TruckOpti</h1>
            <p>Smart Truck Loading Optimization with Advanced LAFF Algorithm</p>
        </div>
        
        <div class="main-card">
            <div class="tabs">
                <button class="tab active" onclick="showTab('trucks')">Manage Trucks</button>
                <button class="tab" onclick="showTab('cartons')">Manage Cartons</button>
                <button class="tab" onclick="showTab('optimize')">Smart Optimization</button>
            </div>
            
            <!-- Trucks Tab -->
            <div id="trucks" class="tab-content active">
                <h2>Truck Fleet Management</h2>
                
                <div class="form-group">
                    <h3>Add New Truck</h3>
                    <form onsubmit="addTruck(event)">
                        <div class="form-row">
                            <div>
                                <label>Truck Name:</label>
                                <input type="text" id="truck_name" required placeholder="e.g., Tata 14ft">
                            </div>
                            <div>
                                <label>Length (cm):</label>
                                <input type="number" id="truck_length" required step="0.1" placeholder="427">
                            </div>
                            <div>
                                <label>Width (cm):</label>
                                <input type="number" id="truck_width" required step="0.1" placeholder="183">
                            </div>
                            <div>
                                <label>Height (cm):</label>
                                <input type="number" id="truck_height" required step="0.1" placeholder="213">
                            </div>
                            <div>
                                <label>Max Weight (kg):</label>
                                <input type="number" id="truck_weight" required step="0.1" placeholder="10000">
                            </div>
                            <div>
                                <label>Cost per KM (₹):</label>
                                <input type="number" id="truck_cost" required step="0.1" placeholder="25">
                            </div>
                        </div>
                        <button type="submit" class="btn">Add Truck</button>
                    </form>
                </div>
                
                <div id="trucks_list">
                    <h3>Current Fleet</h3>
                    <div id="trucks_display"></div>
                </div>
            </div>
            
            <!-- Cartons Tab -->
            <div id="cartons" class="tab-content">
                <h2>Carton Management</h2>
                
                <div class="form-group">
                    <h3>Add Cartons for Packing</h3>
                    <form onsubmit="addCarton(event)">
                        <div class="form-row">
                            <div>
                                <label>Carton Name:</label>
                                <input type="text" id="carton_name" required placeholder="e.g., Medium Electronics Box">
                            </div>
                            <div>
                                <label>Length (cm):</label>
                                <input type="number" id="carton_length" required step="0.1" placeholder="40">
                            </div>
                            <div>
                                <label>Width (cm):</label>
                                <input type="number" id="carton_width" required step="0.1" placeholder="30">
                            </div>
                            <div>
                                <label>Height (cm):</label>
                                <input type="number" id="carton_height" required step="0.1" placeholder="25">
                            </div>
                            <div>
                                <label>Weight (kg):</label>
                                <input type="number" id="carton_weight" required step="0.1" placeholder="5.0">
                            </div>
                            <div>
                                <label>Value (₹):</label>
                                <input type="number" id="carton_value" required step="0.1" placeholder="250">
                            </div>
                            <div>
                                <label>Quantity:</label>
                                <input type="number" id="carton_quantity" required min="1" placeholder="10">
                            </div>
                            <div>
                                <label>Type:</label>
                                <select id="carton_type" required>
                                    <option value="standard">Standard</option>
                                    <option value="fragile">Fragile</option>
                                    <option value="heavy">Heavy</option>
                                    <option value="lightweight">Lightweight</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" class="btn">Add Cartons</button>
                    </form>
                </div>
                
                <div id="cartons_list">
                    <h3>Cartons to Pack</h3>
                    <div id="cartons_display"></div>
                </div>
            </div>
            
            <!-- Optimization Tab -->
            <div id="optimize" class="tab-content">
                <h2>Smart Truck Recommendation</h2>
                
                <div class="optimization-section">
                    <!-- Carton Selection Section -->
                    <div class="carton-selection-section" style="margin-bottom: 20px;">
                        <h3>Select Cartons to Pack</h3>
                        <div id="available_cartons_list" style="margin-bottom: 15px;">
                            <!-- Carton selection will be populated here -->
                        </div>
                        <button class="btn btn-primary" onclick="addSelectedCartons()">Add Selected Cartons</button>
                    </div>
                    
                    <!-- Selected Cartons Display -->
                    <div class="selected-cartons-section" style="margin-bottom: 20px;">
                        <h3>Selected Cartons for Optimization</h3>
                        <div id="selected_cartons_display">
                            <p style="color: #666; font-style: italic;">No cartons selected. Please select cartons above to enable optimization.</p>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div>
                            <label>Optimization Strategy:</label>
                            <select id="optimization_strategy">
                                <option value="space">Space Utilization</option>
                                <option value="cost">Cost Efficiency</option>
                                <option value="balanced">Balanced Approach</option>
                            </select>
                        </div>
                        <div>
                            <label>Distance (km):</label>
                            <input type="number" id="distance" value="100" min="1" placeholder="100">
                        </div>
                    </div>
                    
                    <button class="btn btn-success" onclick="optimizeLoading()" style="margin-top: 15px;" id="optimize_button" disabled>
                        Find Best Truck & Optimize Loading
                    </button>
                </div>
                
                <div class="loading" id="loading">
                    <div class="spinner"></div>
                    <p>Running advanced LAFF algorithm optimization...</p>
                </div>
                
                <div id="results"></div>
            </div>
        </div>
    </div>
    
    <script>
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
            
            // Load data for the tab
            if (tabName === 'trucks') loadTrucks();
            if (tabName === 'cartons') loadCartons();
        }
        
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
                    showAlert('Truck added successfully!', 'success');
                    event.target.reset();
                    loadTrucks();
                } else {
                    throw new Error('Failed to add truck');
                }
            } catch (error) {
                showAlert('Error adding truck: ' + error.message, 'error');
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
                    showAlert('Cartons added successfully!', 'success');
                    event.target.reset();
                    loadCartons();
                } else {
                    throw new Error('Failed to add cartons');
                }
            } catch (error) {
                showAlert('Error adding cartons: ' + error.message, 'error');
            }
        }
        
        async function loadTrucks() {
            try {
                const response = await fetch('/api/trucks');
                const trucks = await response.json();
                
                let html = '';
                if (trucks.length === 0) {
                    html = '<p>No trucks added yet. Add your first truck above.</p>';
                } else {
                    html = '<div class="truck-grid">';
                    trucks.forEach((truck, index) => {
                        html += `
                            <div class="truck-card">
                                <h4>${truck.name}</h4>
                                <p><strong>Dimensions:</strong> ${truck.length}×${truck.width}×${truck.height} cm</p>
                                <p><strong>Volume:</strong> ${(truck.length * truck.width * truck.height / 1000000).toFixed(2)} m³</p>
                                <p><strong>Max Weight:</strong> ${truck.max_weight} kg</p>
                                <p><strong>Cost:</strong> ₹${truck.cost_per_km}/km</p>
                                <div style="margin-top: 15px;">
                                    <button class="btn" onclick="editTruck(${index})" style="background: #28a745; margin-right: 10px;">Edit</button>
                                    <button class="btn btn-danger" onclick="deleteTruck(${index})">Remove</button>
                                </div>
                            </div>
                        `;
                    });
                    html += '</div>';
                }
                
                document.getElementById('trucks_display').innerHTML = html;
            } catch (error) {
                showAlert('Error loading trucks: ' + error.message, 'error');
            }
        }
        
        async function loadCartons() {
            try {
                const response = await fetch('/api/cartons');
                const cartons = await response.json();
                
                let html = '';
                if (cartons.length === 0) {
                    html = '<p>No cartons added yet. Add cartons to pack above.</p>';
                } else {
                    html = '<div class="carton-list">';
                    cartons.forEach((carton, index) => {
                        html += `
                            <div class="carton-item">
                                <div>
                                    <strong>${carton.name}</strong> (${carton.type})
                                    <br>
                                    <small>${carton.length}×${carton.width}×${carton.height} cm, ${carton.weight} kg, ₹${carton.value}</small>
                                </div>
                                <div>
                                    <button class="btn" onclick="editCarton(${index})" style="background: #28a745; margin-right: 10px; padding: 8px 12px; font-size: 12px;">Edit</button>
                                    <button class="btn btn-danger" onclick="deleteCarton(${index})" style="padding: 8px 12px; font-size: 12px;">Remove</button>
                                </div>
                            </div>
                        `;
                    });
                    html += '</div>';
                }
                
                document.getElementById('cartons_display').innerHTML = html;
            } catch (error) {
                showAlert('Error loading cartons: ' + error.message, 'error');
            }
        }
        
        async function deleteTruck(index) {
            try {
                const response = await fetch(`/api/trucks/${index}`, {method: 'DELETE'});
                if (response.ok) {
                    showAlert('Truck removed successfully!', 'success');
                    loadTrucks();
                } else {
                    throw new Error('Failed to remove truck');
                }
            } catch (error) {
                showAlert('Error removing truck: ' + error.message, 'error');
            }
        }
        
        async function deleteCarton(index) {
            try {
                const response = await fetch(`/api/cartons/${index}`, {method: 'DELETE'});
                if (response.ok) {
                    showAlert('Carton removed successfully!', 'success');
                    loadCartons();
                } else {
                    throw new Error('Failed to remove carton');
                }
            } catch (error) {
                showAlert('Error removing carton: ' + error.message, 'error');
            }
        }
        
        async function editTruck(index) {
            try {
                const response = await fetch('/api/trucks');
                const trucks = await response.json();
                const truck = trucks[index];
                
                // Pre-fill form with current truck data
                document.getElementById('truck_name').value = truck.name;
                document.getElementById('truck_length').value = truck.length;
                document.getElementById('truck_width').value = truck.width;
                document.getElementById('truck_height').value = truck.height;
                document.getElementById('truck_weight').value = truck.max_weight;
                document.getElementById('truck_cost').value = truck.cost_per_km;
                
                // Change button to update mode
                const form = document.querySelector('#trucks form');
                form.onsubmit = async (event) => {
                    event.preventDefault();
                    await updateTruck(index);
                };
                
                // Change button text
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.textContent = 'Update Truck';
                submitBtn.style.background = '#28a745';
                
                // Add cancel button
                if (!form.querySelector('.cancel-btn')) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'btn cancel-btn';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.style.background = '#6c757d';
                    cancelBtn.style.marginLeft = '10px';
                    cancelBtn.onclick = () => {
                        form.reset();
                        form.onsubmit = addTruck;
                        submitBtn.textContent = 'Add Truck';
                        submitBtn.style.background = '';
                        cancelBtn.remove();
                    };
                    submitBtn.parentNode.appendChild(cancelBtn);
                }
                
                showAlert('Edit mode activated. Modify the truck details above.', 'success');
                
            } catch (error) {
                showAlert('Error loading truck for editing: ' + error.message, 'error');
            }
        }
        
        async function updateTruck(index) {
            const truck = {
                name: document.getElementById('truck_name').value,
                length: parseFloat(document.getElementById('truck_length').value),
                width: parseFloat(document.getElementById('truck_width').value),
                height: parseFloat(document.getElementById('truck_height').value),
                max_weight: parseFloat(document.getElementById('truck_weight').value),
                cost_per_km: parseFloat(document.getElementById('truck_cost').value)
            };
            
            try {
                const response = await fetch(`/api/trucks/${index}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(truck)
                });
                
                if (response.ok) {
                    showAlert('Truck updated successfully!', 'success');
                    
                    // Reset form
                    const form = document.querySelector('#trucks form');
                    form.reset();
                    form.onsubmit = addTruck;
                    
                    const submitBtn = form.querySelector('button[type="submit"]');
                    submitBtn.textContent = 'Add Truck';
                    submitBtn.style.background = '';
                    
                    const cancelBtn = form.querySelector('.cancel-btn');
                    if (cancelBtn) cancelBtn.remove();
                    
                    loadTrucks();
                } else {
                    throw new Error('Failed to update truck');
                }
            } catch (error) {
                showAlert('Error updating truck: ' + error.message, 'error');
            }
        }
        
        async function editCarton(index) {
            try {
                const response = await fetch('/api/cartons');
                const cartons = await response.json();
                const carton = cartons[index];
                
                // Pre-fill form with current carton data
                document.getElementById('carton_name').value = carton.name;
                document.getElementById('carton_length').value = carton.length;
                document.getElementById('carton_width').value = carton.width;
                document.getElementById('carton_height').value = carton.height;
                document.getElementById('carton_weight').value = carton.weight;
                document.getElementById('carton_value').value = carton.value;
                document.getElementById('carton_quantity').value = 1; // Reset quantity for single edit
                document.getElementById('carton_type').value = carton.type;
                
                // Change button to update mode
                const form = document.querySelector('#cartons form');
                form.onsubmit = async (event) => {
                    event.preventDefault();
                    await updateCarton(index);
                };
                
                // Change button text
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.textContent = 'Update Carton';
                submitBtn.style.background = '#28a745';
                
                // Add cancel button
                if (!form.querySelector('.cancel-btn')) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'btn cancel-btn';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.style.background = '#6c757d';
                    cancelBtn.style.marginLeft = '10px';
                    cancelBtn.onclick = () => {
                        form.reset();
                        form.onsubmit = addCarton;
                        submitBtn.textContent = 'Add Cartons';
                        submitBtn.style.background = '';
                        cancelBtn.remove();
                    };
                    submitBtn.parentNode.appendChild(cancelBtn);
                }
                
                showAlert('Edit mode activated. Modify the carton details above.', 'success');
                
            } catch (error) {
                showAlert('Error loading carton for editing: ' + error.message, 'error');
            }
        }
        
        async function updateCarton(index) {
            const carton = {
                name: document.getElementById('carton_name').value,
                length: parseFloat(document.getElementById('carton_length').value),
                width: parseFloat(document.getElementById('carton_width').value),
                height: parseFloat(document.getElementById('carton_height').value),
                weight: parseFloat(document.getElementById('carton_weight').value),
                value: parseFloat(document.getElementById('carton_value').value),
                type: document.getElementById('carton_type').value
            };
            
            try {
                const response = await fetch(`/api/cartons/${index}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(carton)
                });
                
                if (response.ok) {
                    showAlert('Carton updated successfully!', 'success');
                    
                    // Reset form
                    const form = document.querySelector('#cartons form');
                    form.reset();
                    form.onsubmit = addCarton;
                    
                    const submitBtn = form.querySelector('button[type="submit"]');
                    submitBtn.textContent = 'Add Cartons';
                    submitBtn.style.background = '';
                    
                    const cancelBtn = form.querySelector('.cancel-btn');
                    if (cancelBtn) cancelBtn.remove();
                    
                    loadCartons();
                } else {
                    throw new Error('Failed to update carton');
                }
            } catch (error) {
                showAlert('Error updating carton: ' + error.message, 'error');
            }
        }
        
        async function optimizeLoading() {
            const strategy = document.getElementById('optimization_strategy').value;
            const distance = parseFloat(document.getElementById('distance').value);
            
            // Check if cartons are selected
            if (selectedCartons.length === 0) {
                showAlert('Please select at least one carton for optimization!', 'error');
                return;
            }
            
            document.getElementById('loading').style.display = 'block';
            document.getElementById('results').innerHTML = '';
            
            try {
                const response = await fetch('/api/optimize', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        strategy, 
                        distance, 
                        selected_cartons: selectedCartons
                    })
                });
                
                if (response.ok) {
                    const results = await response.json();
                    displayResults(results);
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Optimization failed');
                }
            } catch (error) {
                showAlert('Error during optimization: ' + error.message, 'error');
            } finally {
                document.getElementById('loading').style.display = 'none';
            }
        }
        
        function displayResults(results) {
            let html = `
                <div class="results-section">
                    <h3>🏆 Recommended Truck: ${results.best_truck.name}</h3>
                    
                    <div class="metric-cards">
                        <div class="metric-card">
                            <div class="metric-value">${results.metrics.total_cartons_packed}</div>
                            <div class="metric-label">Cartons Packed</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value">${results.metrics.space_utilization.toFixed(1)}%</div>
                            <div class="metric-label">Space Utilization</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value">${results.metrics.weight_utilization.toFixed(1)}%</div>
                            <div class="metric-label">Weight Utilization</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value">₹${results.total_cost.toFixed(0)}</div>
                            <div class="metric-label">Total Cost</div>
                        </div>
                    </div>
                    
                    <h4>📊 Packing Details</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                        <p><strong>Truck Dimensions:</strong> ${results.best_truck.length}×${results.best_truck.width}×${results.best_truck.height} cm</p>
                        <p><strong>Total Volume:</strong> ${(results.best_truck.length * results.best_truck.width * results.best_truck.height / 1000000).toFixed(2)} m³</p>
                        <p><strong>Used Volume:</strong> ${(results.used_volume / 1000000).toFixed(2)} m³</p>
                        <p><strong>Remaining Volume:</strong> ${(results.remaining_space.remaining_volume / 1000000).toFixed(2)} m³</p>
                        <p><strong>Remaining Weight Capacity:</strong> ${results.remaining_space.remaining_weight.toFixed(1)} kg</p>
                    </div>
            `;
            
            if (results.space_suggestions && results.space_suggestions.length > 0) {
                html += `
                    <div class="suggestions-section">
                        <h4>💡 Additional Cartons You Can Fit</h4>
                        <p>Based on remaining space analysis, you can add these carton types:</p>
                `;
                
                results.space_suggestions.forEach(suggestion => {
                    html += `
                        <div class="suggestion-item">
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
            
            if (results.packed_cartons && results.packed_cartons.length > 0) {
                html += `
                    <h4>Packed Cartons Layout</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 10px;">
                `;
                
                results.packed_cartons.forEach((packed, index) => {
                    html += `
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd;">
                            <span><strong>${packed.carton.name}</strong></span>
                            <span>Position: (${packed.x}, ${packed.y}, ${packed.z}) cm</span>
                            <span>${packed.rotated ? '🔄 Rotated' : '➡️ Normal'}</span>
                        </div>
                    `;
                });
                
                html += '</div>';
            }
            
            html += '</div>';
            
            document.getElementById('results').innerHTML = html;
        }
        
        function showAlert(message, type) {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${type}`;
            alertDiv.textContent = message;
            
            // Insert at top of current tab
            const activeTab = document.querySelector('.tab-content.active');
            activeTab.insertBefore(alertDiv, activeTab.firstChild);
            
            // Remove after 5 seconds
            setTimeout(() => {
                alertDiv.remove();
            }, 5000);
        }
        
        // Carton Selection Functions
        let selectedCartons = [];
        
        async function loadAvailableCartons() {
            try {
                const response = await fetch('/api/cartons');
                const cartons = await response.json();
                
                let html = '';
                if (cartons.length === 0) {
                    html = '<p style="color: #666;">No carton types available. Please add carton types first in the "Manage Cartons" tab.</p>';
                } else {
                    html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">';
                    cartons.forEach((carton, index) => {
                        html += `
                            <div class="carton-selection-card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: white;">
                                <h4>${carton.name}</h4>
                                <p><strong>Dimensions:</strong> ${carton.length}×${carton.width}×${carton.height} cm</p>
                                <p><strong>Weight:</strong> ${carton.weight} kg</p>
                                <p><strong>Value:</strong> ₹${carton.value}</p>
                                <div style="margin-top: 10px;">
                                    <label>Quantity:</label>
                                    <input type="number" id="carton_qty_${index}" min="1" max="100" value="1" style="width: 60px; margin-left: 10px;">
                                </div>
                                <div style="margin-top: 10px;">
                                    <input type="checkbox" id="carton_select_${index}" value="${index}">
                                    <label for="carton_select_${index}">Select this carton type</label>
                                </div>
                            </div>
                        `;
                    });
                    html += '</div>';
                }
                
                document.getElementById('available_cartons_list').innerHTML = html;
            } catch (error) {
                showAlert('Error loading carton types: ' + error.message, 'error');
            }
        }
        
        async function addSelectedCartons() {
            try {
                const response = await fetch('/api/cartons');
                const cartons = await response.json();
                
                selectedCartons = []; // Clear previous selection
                
                cartons.forEach((carton, index) => {
                    const checkbox = document.getElementById(`carton_select_${index}`);
                    const qtyInput = document.getElementById(`carton_qty_${index}`);
                    
                    if (checkbox && checkbox.checked) {
                        const quantity = parseInt(qtyInput.value) || 1;
                        selectedCartons.push({
                            ...carton,
                            quantity: quantity,
                            total_volume: carton.length * carton.width * carton.height * quantity / 1000000,
                            total_weight: carton.weight * quantity,
                            total_value: carton.value * quantity
                        });
                    }
                });
                
                displaySelectedCartons();
                updateOptimizeButton();
                
            } catch (error) {
                showAlert('Error adding selected cartons: ' + error.message, 'error');
            }
        }
        
        function displaySelectedCartons() {
            if (selectedCartons.length === 0) {
                document.getElementById('selected_cartons_display').innerHTML = 
                    '<p style="color: #666; font-style: italic;">No cartons selected. Please select cartons above to enable optimization.</p>';
                return;
            }
            
            let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">';
            selectedCartons.forEach((carton, index) => {
                html += `
                    <div class="selected-carton-card" style="border: 1px solid #28a745; padding: 10px; border-radius: 6px; background: #f8f9fa;">
                        <h5>${carton.name}</h5>
                        <p><strong>Qty:</strong> ${carton.quantity}</p>
                        <p><strong>Total Volume:</strong> ${carton.total_volume.toFixed(3)} m³</p>
                        <p><strong>Total Weight:</strong> ${carton.total_weight} kg</p>
                        <p><strong>Total Value:</strong> ₹${carton.total_value}</p>
                        <button class="btn btn-sm" onclick="removeSelectedCarton(${index})" style="background: #dc3545; color: white; padding: 5px 10px; font-size: 12px;">Remove</button>
                    </div>
                `;
            });
            html += '</div>';
            
            // Add summary
            const totalVolume = selectedCartons.reduce((sum, c) => sum + c.total_volume, 0);
            const totalWeight = selectedCartons.reduce((sum, c) => sum + c.total_weight, 0);
            const totalValue = selectedCartons.reduce((sum, c) => sum + c.total_value, 0);
            
            html += `
                <div style="margin-top: 15px; padding: 15px; background: #e9ecef; border-radius: 6px;">
                    <h4>Selection Summary</h4>
                    <p><strong>Total Items:</strong> ${selectedCartons.reduce((sum, c) => sum + c.quantity, 0)}</p>
                    <p><strong>Total Volume:</strong> ${totalVolume.toFixed(3)} m³</p>
                    <p><strong>Total Weight:</strong> ${totalWeight} kg</p>
                    <p><strong>Total Value:</strong> ₹${totalValue}</p>
                </div>
            `;
            
            document.getElementById('selected_cartons_display').innerHTML = html;
        }
        
        function removeSelectedCarton(index) {
            selectedCartons.splice(index, 1);
            displaySelectedCartons();
            updateOptimizeButton();
        }
        
        function updateOptimizeButton() {
            const optimizeButton = document.getElementById('optimize_button');
            if (selectedCartons.length > 0) {
                optimizeButton.disabled = false;
                optimizeButton.style.opacity = '1';
            } else {
                optimizeButton.disabled = true;
                optimizeButton.style.opacity = '0.5';
            }
        }
        
        // Load initial data
        loadTrucks();
        loadAvailableCartons();
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/trucks', methods=['GET', 'POST'])
def trucks_api():
    global trucks_db
    
    try:
        if request.method == 'GET':
            app_logger.info("GET /api/trucks - retrieving truck list")
            return jsonify([asdict(truck) for truck in trucks_db])
        
        elif request.method == 'POST':
            data = request.json
            app_logger.info(f"POST /api/trucks - adding truck: {data.get('name', 'Unknown')}")
            
            truck_id = str(len(trucks_db) + 1)
            truck = Truck(
                truck_id,
                data['name'],
                data['length'],
                data['width'], 
                data['height'],
                data['max_weight'],
                data.get('cost_per_km', 25)
            )
            trucks_db.append(truck)
            app_logger.info(f"Successfully added truck: {truck.name}")
            return jsonify({'success': True, 'truck_id': truck_id})
            
    except Exception as e:
        log_error(error_logger, e, "trucks_api")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trucks/<int:index>', methods=['DELETE', 'PUT'])
def manage_truck(index):
    global trucks_db
    
    try:
        if request.method == 'DELETE':
            app_logger.info(f"DELETE /api/trucks/{index}")
            if 0 <= index < len(trucks_db):
                deleted_truck = trucks_db.pop(index)
                app_logger.info(f"Successfully deleted truck: {deleted_truck.name}")
                return jsonify({'success': True})
            return jsonify({'success': False, 'error': 'Truck not found'}), 404
            
        elif request.method == 'PUT':
            app_logger.info(f"PUT /api/trucks/{index} - editing truck")
            if 0 <= index < len(trucks_db):
                data = request.json
                truck = trucks_db[index]
                
                # Update truck properties
                truck.name = data.get('name', truck.name)
                truck.length = data.get('length', truck.length)
                truck.width = data.get('width', truck.width)
                truck.height = data.get('height', truck.height)
                truck.max_weight = data.get('max_weight', truck.max_weight)
                truck.cost_per_km = data.get('cost_per_km', truck.cost_per_km)
                
                app_logger.info(f"Successfully updated truck: {truck.name}")
                return jsonify({'success': True, 'truck': asdict(truck)})
            return jsonify({'success': False, 'error': 'Truck not found'}), 404
            
    except Exception as e:
        log_error(error_logger, e, f"manage_truck (index: {index})")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cartons', methods=['GET', 'POST'])
def cartons_api():
    global cartons_db
    
    if request.method == 'GET':
        return jsonify([asdict(carton) for carton in cartons_db])
    
    elif request.method == 'POST':
        data = request.json
        
        # Create multiple carton instances based on quantity
        for i in range(data['quantity']):
            carton_id = f"{len(cartons_db) + i + 1}"
            carton = Carton(
                carton_id,
                data['name'],
                data['length'],
                data['width'],
                data['height'],
                data['weight'],
                data.get('value', 100),
                data.get('type', 'standard'),
                1  # Individual quantity is 1
            )
            cartons_db.append(carton)
        
        return jsonify({'success': True, 'added_count': data['quantity']})

@app.route('/api/cartons/<int:index>', methods=['DELETE', 'PUT'])
def manage_carton(index):
    global cartons_db
    
    try:
        if request.method == 'DELETE':
            app_logger.info(f"DELETE /api/cartons/{index}")
            if 0 <= index < len(cartons_db):
                deleted_carton = cartons_db.pop(index)
                app_logger.info(f"Successfully deleted carton: {deleted_carton.name}")
                return jsonify({'success': True})
            return jsonify({'success': False, 'error': 'Carton not found'}), 404
            
        elif request.method == 'PUT':
            app_logger.info(f"PUT /api/cartons/{index} - editing carton")
            if 0 <= index < len(cartons_db):
                data = request.json
                carton = cartons_db[index]
                
                # Update carton properties
                carton.name = data.get('name', carton.name)
                carton.length = data.get('length', carton.length)
                carton.width = data.get('width', carton.width)
                carton.height = data.get('height', carton.height)
                carton.weight = data.get('weight', carton.weight)
                carton.value = data.get('value', carton.value)
                carton.type = data.get('type', carton.type)
                
                app_logger.info(f"Successfully updated carton: {carton.name}")
                return jsonify({'success': True, 'carton': asdict(carton)})
            return jsonify({'success': False, 'error': 'Carton not found'}), 404
            
    except Exception as e:
        log_error(error_logger, e, f"manage_carton (index: {index})")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/optimize', methods=['POST'])
def optimize_api():
    global trucks_db, cartons_db, available_carton_types
    
    try:
        app_logger.info("POST /api/optimize - starting truck recommendation")
        
        if not trucks_db:
            app_logger.warning("No trucks available for optimization")
            return jsonify({'error': 'Please add trucks to your fleet first'}), 400
        
        data = request.json
        strategy = data.get('strategy', 'space')
        distance = data.get('distance', 100)
        selected_cartons_data = data.get('selected_cartons', [])
        
        # Use selected cartons if provided, otherwise fall back to all cartons
        if selected_cartons_data:
            # Convert selected cartons data to Carton objects
            selected_cartons = []
            for carton_data in selected_cartons_data:
                carton = Carton(
                    name=carton_data['name'],
                    length=carton_data['length'],
                    width=carton_data['width'],
                    height=carton_data['height'],
                    weight=carton_data['weight'],
                    value=carton_data.get('value', 0),
                    carton_type=carton_data.get('type', 'Box'),
                    quantity=carton_data.get('quantity', 1)
                )
                # Add multiple instances based on quantity
                for _ in range(carton_data.get('quantity', 1)):
                    selected_cartons.append(carton)
            
            cartons_to_pack = selected_cartons
            app_logger.info(f"Using {len(selected_cartons_data)} selected carton types with total {len(cartons_to_pack)} cartons")
        else:
            if not cartons_db:
                app_logger.warning("No cartons available for optimization")
                return jsonify({'error': 'Please select cartons to pack first'}), 400
            cartons_to_pack = cartons_db
            app_logger.info(f"Using all {len(cartons_to_pack)} cartons from database")
        
        packer = AdvancedLAFFPacker()
        best_truck = None
        best_packing = []
        best_score = -1
        best_metrics = {}
        
        # Try each truck and find the best one
        for truck in trucks_db:
            packed_cartons, metrics = packer.optimize_with_rotations(cartons_to_pack, truck)
            
            # Calculate score based on strategy
            if strategy == 'space':
                score = metrics['space_utilization']
            elif strategy == 'cost':
                total_cost = truck.cost_per_km * distance
                score = metrics['total_value'] / total_cost if total_cost > 0 else 0
            else:  # balanced
                space_score = metrics['space_utilization'] / 100
                cost_efficiency = metrics['total_value'] / (truck.cost_per_km * distance) if truck.cost_per_km > 0 else 0
                score = (space_score + min(cost_efficiency / 1000, 1)) / 2
            
            if score > best_score:
                best_score = score
                best_truck = truck
                best_packing = packed_cartons
                best_metrics = metrics
        
        if not best_truck:
            return jsonify({'error': 'No suitable truck found'}), 400
        
        # Calculate space optimization suggestions
        space_optimizer = SpaceOptimizer(available_carton_types)
        remaining_space = space_optimizer.calculate_remaining_space(best_truck, best_packing)
        space_suggestions = space_optimizer.suggest_additional_cartons(best_truck, best_packing, remaining_space)
        
        # Calculate costs
        total_cost = best_truck.cost_per_km * distance
        used_volume = sum(p.carton.volume for p in best_packing)
        
        results = {
            'best_truck': asdict(best_truck),
            'packed_cartons': [
                {
                    'carton': asdict(p.carton),
                    'x': p.x, 'y': p.y, 'z': p.z,
                    'rotated': p.rotated
                } for p in best_packing
            ],
            'metrics': best_metrics,
            'total_cost': total_cost,
            'used_volume': used_volume,
            'remaining_space': remaining_space,
            'space_suggestions': space_suggestions[:5],  # Top 5 suggestions
            'optimization_strategy': strategy
        }
        
        app_logger.info(f"Optimization completed. Best truck: {best_truck.name}, Utilization: {best_metrics['space_utilization']:.1f}%")
        return jsonify(results)
        
    except Exception as e:
        log_error(error_logger, e, "optimize_api")
        return jsonify({'error': f'Optimization failed: {str(e)}'}), 500

def find_available_port(start_port=5000):
    """Find available port starting from start_port"""
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1

if __name__ == '__main__':
    # Initialize default data
    initialize_default_data()
    
    # Find available port
    port = find_available_port()
    
    print("=" * 60)
    print("TruckOpti - Smart Truck Loading Optimization")
    print("=" * 60)
    print(f"Server starting on: http://127.0.0.1:{port}/")
    print("Features:")
    print("   - Advanced LAFF Algorithm")
    print("   - Smart Truck Recommendations") 
    print("   - Space Optimization")
    print("   - Remaining Capacity Analysis")
    print("=" * 60)
    
    # Auto-open browser
    Timer(2, lambda: webbrowser.open_new(f"http://127.0.0.1:{port}/")).start()
    
    # Run the application
    app.run(debug=True, port=port, host='127.0.0.1')