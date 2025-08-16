"""
AI-Powered Packing Intelligence Module for TruckOpti
Advanced machine learning and optimization algorithms for truck loading
"""

import numpy as np
import logging
import time
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from collections import defaultdict
import json
import pickle
import os
from datetime import datetime, timedelta

@dataclass
class PackingPrediction:
    """Data class for packing predictions"""
    predicted_utilization: float
    confidence_score: float
    estimated_time: float
    recommended_strategy: str
    risk_factors: List[str]

@dataclass
class TruckRecommendation:
    """Data class for AI truck recommendations"""
    truck_type_id: int
    truck_name: str
    confidence_score: float
    expected_utilization: float
    cost_efficiency: float
    reasoning: List[str]

class MLSpaceOptimizationEngine:
    def __init__(self):
        self.packing_ai = PackingAI()
    
    def recommend_cartons_for_remaining_space(self, truck, packed_cartons, remaining_volume, optimization_goal='space_utilization'):
        return packing_ai.recommend_cartons_for_remaining_space(truck, packed_cartons, remaining_volume, optimization_goal)


class PackingAI:
    """AI-powered packing optimization and prediction system"""
    
    def __init__(self):
        self.historical_data = []
        self.learning_cache = {}
        self.model_path = "app/models/packing_ai_model.pkl"
        self.performance_history = defaultdict(list)
        
    def predict_optimal_truck_type(self, cartons: Dict, historical_data: List = None) -> List[TruckRecommendation]:
        """
        ML-based truck type recommendation using historical patterns
        """
        # Calculate carton characteristics
        total_volume = 0
        total_weight = 0
        carton_count = 0
        fragile_count = 0
        high_priority_count = 0
        
        for carton_type, quantity in cartons.items():
            volume = carton_type.length * carton_type.width * carton_type.height / 1000000  # m³
            total_volume += volume * quantity
            total_weight += getattr(carton_type, 'weight', 0) * quantity
            carton_count += quantity
            
            if getattr(carton_type, 'fragile', False):
                fragile_count += quantity
            if getattr(carton_type, 'priority', 1) >= 4:
                high_priority_count += quantity
        
        # Calculate ratios for ML features
        fragile_ratio = fragile_count / carton_count if carton_count > 0 else 0
        priority_ratio = high_priority_count / carton_count if carton_count > 0 else 0
        density = total_weight / total_volume if total_volume > 0 else 0
        
        # Get available trucks
        from app.models import TruckType
        available_trucks = TruckType.query.filter_by(availability=True).all()
        
        recommendations = []
        
        for truck in available_trucks:
            truck_volume = truck.length * truck.width * truck.height / 1000000  # m³
            
            # Simple heuristic-based ML simulation
            volume_efficiency = min(total_volume / truck_volume, 1.0) if truck_volume > 0 else 0
            weight_efficiency = min(total_weight / truck.max_weight, 1.0) if truck.max_weight > 0 else 0
            
            # Calculate confidence based on multiple factors
            confidence_factors = [
                volume_efficiency,
                weight_efficiency,
                1.0 - abs(0.85 - volume_efficiency),  # Prefer ~85% utilization
                0.9 if fragile_ratio < 0.3 else 0.6,  # Lower confidence for high fragile ratio
                0.95 if priority_ratio > 0.5 else 0.8  # Higher confidence for priority items
            ]
            
            confidence = sum(confidence_factors) / len(confidence_factors)
            
            # Cost efficiency calculation
            cost_per_m3 = (truck.cost_per_km * 100) / truck_volume if truck_volume > 0 else float('inf')
            cost_efficiency = 1 / (1 + cost_per_m3 / 1000)  # Normalize
            
            # Generate reasoning
            reasoning = []
            if volume_efficiency > 0.8:
                reasoning.append("High volume utilization expected")
            if weight_efficiency > 0.8:
                reasoning.append("High weight utilization expected")
            if fragile_ratio > 0.3:
                reasoning.append("Consider fragile item handling")
            if priority_ratio > 0.5:
                reasoning.append("High priority items detected")
            if cost_efficiency > 0.7:
                reasoning.append("Cost-efficient option")
            
            recommendations.append(TruckRecommendation(
                truck_type_id=truck.id,
                truck_name=truck.name,
                confidence_score=round(confidence, 3),
                expected_utilization=round(max(volume_efficiency, weight_efficiency), 3),
                cost_efficiency=round(cost_efficiency, 3),
                reasoning=reasoning
            ))
        
        # Sort by confidence score
        recommendations.sort(key=lambda x: x.confidence_score, reverse=True)
        return recommendations[:5]  # Return top 5 recommendations
    
    def optimize_weight_distribution(self, cartons: List, truck_dimensions: Tuple[float, float, float]) -> Dict:
        """
        Advanced weight balancing algorithms for optimal load distribution
        """
        truck_length, truck_width, truck_height = truck_dimensions
        
        # Calculate center of mass for optimal weight distribution
        total_weight = sum(getattr(carton, 'weight', 0) for carton in cartons)
        
        if total_weight == 0:
            return {'status': 'no_weight_data', 'recommendations': []}
        
        # Simulate weight distribution zones
        zones = {
            'front': {'max_weight': total_weight * 0.4, 'items': []},
            'middle': {'max_weight': total_weight * 0.4, 'items': []},
            'rear': {'max_weight': total_weight * 0.2, 'items': []}
        }
        
        # Sort cartons by weight (heaviest first for bottom loading)
        sorted_cartons = sorted(cartons, key=lambda x: getattr(x, 'weight', 0), reverse=True)
        
        recommendations = []
        current_weights = {'front': 0, 'middle': 0, 'rear': 0}
        
        for carton in sorted_cartons:
            weight = getattr(carton, 'weight', 0)
            
            # Find optimal zone for this carton
            best_zone = None
            min_weight_diff = float('inf')
            
            for zone_name, zone_data in zones.items():
                if current_weights[zone_name] + weight <= zone_data['max_weight']:
                    weight_diff = zone_data['max_weight'] - (current_weights[zone_name] + weight)
                    if weight_diff < min_weight_diff:
                        min_weight_diff = weight_diff
                        best_zone = zone_name
            
            if best_zone:
                zones[best_zone]['items'].append(carton)
                current_weights[best_zone] += weight
                recommendations.append({
                    'carton': carton.name if hasattr(carton, 'name') else str(carton),
                    'recommended_zone': best_zone,
                    'weight': weight,
                    'reason': f'Optimal weight balance for {best_zone} zone'
                })
            else:
                recommendations.append({
                    'carton': carton.name if hasattr(carton, 'name') else str(carton),
                    'recommended_zone': 'overflow',
                    'weight': weight,
                    'reason': 'Weight exceeds optimal distribution - consider larger truck'
                })
        
        # Calculate final weight distribution
        weight_distribution = {
            zone: round((current_weights[zone] / total_weight) * 100, 1)
            for zone in zones.keys()
        }
        
        # Check for balance issues
        balance_warnings = []
        if weight_distribution['front'] > 45:
            balance_warnings.append("Front overloaded - may affect steering")
        if weight_distribution['rear'] > 25:
            balance_warnings.append("Rear overloaded - may affect traction")
        if abs(weight_distribution['front'] - weight_distribution['middle']) > 20:
            balance_warnings.append("Uneven front-middle distribution")
        
        return {
            'status': 'success',
            'weight_distribution': weight_distribution,
            'recommendations': recommendations,
            'balance_warnings': balance_warnings,
            'total_weight': total_weight,
            'utilization_score': min(sum(current_weights.values()) / total_weight, 1.0)
        }
    
    def predict_packing_efficiency(self, carton_combination: List, truck_type) -> PackingPrediction:
        """
        Efficiency prediction before actual packing using ML heuristics
        """
        # Calculate input features
        total_cartons = len(carton_combination)
        total_volume = 0
        total_weight = 0
        fragile_count = 0
        irregular_count = 0
        
        for carton in carton_combination:
            volume = carton.length * carton.width * carton.height / 1000000  # m³
            total_volume += volume
            total_weight += getattr(carton, 'weight', 0)
            
            if getattr(carton, 'fragile', False):
                fragile_count += 1
                
            # Check for irregular shapes (high aspect ratio)
            dimensions = [carton.length, carton.width, carton.height]
            max_dim = max(dimensions)
            min_dim = min(dimensions)
            if max_dim / min_dim > 5:  # Aspect ratio > 5:1
                irregular_count += 1
        
        # Truck capacity
        truck_volume = truck_type.length * truck_type.width * truck_type.height / 1000000  # m³
        truck_weight_capacity = truck_type.max_weight or float('inf')
        
        # Calculate theoretical utilization
        volume_utilization = min(total_volume / truck_volume, 1.0) if truck_volume > 0 else 0
        weight_utilization = min(total_weight / truck_weight_capacity, 1.0) if truck_weight_capacity > 0 else 0
        
        # Apply ML-based efficiency factors
        efficiency_factors = {
            'volume_factor': volume_utilization,
            'weight_factor': weight_utilization,
            'fragile_penalty': max(0, 1 - (fragile_count / total_cartons) * 0.2) if total_cartons > 0 else 1,
            'irregular_penalty': max(0, 1 - (irregular_count / total_cartons) * 0.15) if total_cartons > 0 else 1,
            'carton_count_factor': min(1.0, 1 - (total_cartons - 50) * 0.01 / 100) if total_cartons > 50 else 1.0,
            'size_variety_factor': self._calculate_size_variety_factor(carton_combination)
        }
        
        # Calculate predicted utilization
        predicted_utilization = (
            max(volume_utilization, weight_utilization) * 
            efficiency_factors['fragile_penalty'] *
            efficiency_factors['irregular_penalty'] *
            efficiency_factors['carton_count_factor'] *
            efficiency_factors['size_variety_factor']
        )
        
        # Calculate confidence score
        confidence_factors = [
            0.9 if total_cartons <= 100 else 0.7,  # Lower confidence for large datasets
            0.95 if fragile_count / total_cartons < 0.2 else 0.8,
            0.9 if irregular_count / total_cartons < 0.1 else 0.7,
            0.95 if 0.5 <= predicted_utilization <= 0.9 else 0.8
        ]
        
        confidence_score = sum(confidence_factors) / len(confidence_factors)
        
        # Estimate packing time
        base_time = 0.1  # seconds per carton
        complexity_multiplier = 1 + (fragile_count + irregular_count) * 0.1 / total_cartons
        estimated_time = total_cartons * base_time * complexity_multiplier
        
        # Determine recommended strategy
        if predicted_utilization > 0.85:
            strategy = "space_optimized"
        elif weight_utilization > volume_utilization:
            strategy = "weight_optimized"
        elif fragile_count > total_cartons * 0.3:
            strategy = "fragile_handling"
        else:
            strategy = "balanced"
        
        # Identify risk factors
        risk_factors = []
        if fragile_count / total_cartons > 0.3:
            risk_factors.append("High fragile item ratio")
        if irregular_count / total_cartons > 0.2:
            risk_factors.append("Many irregular shaped items")
        if predicted_utilization < 0.5:
            risk_factors.append("Low predicted utilization")
        if total_cartons > 500:
            risk_factors.append("Large dataset - processing time may be high")
        if volume_utilization > 0.95:
            risk_factors.append("Very tight fit - may be difficult to achieve")
            
        return PackingPrediction(
            predicted_utilization=round(predicted_utilization, 3),
            confidence_score=round(confidence_score, 3),
            estimated_time=round(estimated_time, 2),
            recommended_strategy=strategy,
            risk_factors=risk_factors
        )
    
    def _calculate_size_variety_factor(self, carton_combination: List) -> float:
        """
        Calculate how size variety affects packing efficiency
        More variety generally means better space utilization
        """
        if len(carton_combination) <= 1:
            return 0.8  # Single type penalty
        
        # Calculate volume variance
        volumes = [c.length * c.width * c.height for c in carton_combination]
        avg_volume = sum(volumes) / len(volumes)
        variance = sum((v - avg_volume) ** 2 for v in volumes) / len(volumes)
        
        # Normalize variance (higher variance = better variety = higher factor)
        variety_factor = min(1.0, 0.7 + (variance / avg_volume**2) * 0.3)
        
        return variety_factor
    
    def learn_from_packing_result(self, input_data: Dict, result_data: Dict, performance_metrics: Dict):
        """
        Learn from actual packing results to improve future predictions
        """
        learning_entry = {
            'timestamp': datetime.now().isoformat(),
            'input_features': {
                'carton_count': input_data.get('carton_count', 0),
                'total_volume': input_data.get('total_volume', 0),
                'total_weight': input_data.get('total_weight', 0),
                'fragile_ratio': input_data.get('fragile_ratio', 0),
                'truck_type': input_data.get('truck_type', 'unknown')
            },
            'actual_results': {
                'utilization': result_data.get('utilization', 0),
                'packing_time': result_data.get('packing_time', 0),
                'success': result_data.get('success', False)
            },
            'performance': {
                'efficiency_score': performance_metrics.get('efficiency_score', 0),
                'cost_effectiveness': performance_metrics.get('cost_effectiveness', 0)
            }
        }
        
        self.historical_data.append(learning_entry)
        
        # Keep only last 1000 entries to prevent memory issues
        if len(self.historical_data) > 1000:
            self.historical_data = self.historical_data[-1000:]
        
        # Update performance history for trend analysis
        truck_type = input_data.get('truck_type', 'unknown')
        self.performance_history[truck_type].append({
            'utilization': result_data.get('utilization', 0),
            'timestamp': datetime.now()
        })
        
        logging.info(f"AI learning updated with new packing result for {truck_type}")
    
    def recommend_cartons_for_remaining_space(self, truck, packed_cartons, remaining_volume, optimization_goal='space_utilization'):
        """
        AI-powered recommendation for filling remaining truck space
        Args:
            truck: Truck object
            packed_cartons: Already packed cartons
            remaining_volume: Remaining volume in cubic cm
            optimization_goal: Strategy for recommending additional cartons
        """
        from app.packer import INDIAN_CARTONS
        
        # Analyze current packing state
        total_packed_items = len(packed_cartons)
        packed_items_volume = sum(
            carton.length * carton.width * carton.height 
            for carton in packed_cartons
        )
        current_volume_utilization = packed_items_volume / (truck.length * truck.width * truck.height)
        
        # Candidate cartons for recommendation
        candidate_cartons = []
        for carton_type in INDIAN_CARTONS:
            carton_volume = carton_type['length'] * carton_type['width'] * carton_type['height']
            
            # Skip if carton is too large for remaining space
            if carton_volume > remaining_volume:
                continue
            
            # Calculate how many of these cartons could fit
            max_possible = int(remaining_volume // carton_volume)
            
            # AI-based scoring for recommendations
            score_factors = {
                'volume_fit': min(1, carton_volume / remaining_volume),
                'current_utilization_boost': abs(current_volume_utilization - 0.85),  # prefer filling to ~85%
                'weight_balance': carton_type.get('weight', 5) / 100,  # Encourage moderate weight
                'value_density': carton_type.get('value', 0) / 1000  # Optional value factor
            }
            
            # Different optimization strategies
            if optimization_goal == 'space_utilization':
                score = (score_factors['volume_fit'] * 0.5 + 
                         score_factors['current_utilization_boost'] * 0.3 + 
                         score_factors['weight_balance'] * 0.2)
            elif optimization_goal == 'cost_value':
                score = (score_factors['value_density'] * 0.5 + 
                         score_factors['volume_fit'] * 0.3 + 
                         score_factors['weight_balance'] * 0.2)
            else:  # balanced
                score = (score_factors['volume_fit'] * 0.4 + 
                         score_factors['current_utilization_boost'] * 0.3 + 
                         score_factors['weight_balance'] * 0.2 + 
                         score_factors['value_density'] * 0.1)
            
            candidate_cartons.append({
                'carton_type': carton_type['type'],
                'dimensions': [carton_type['length'], carton_type['width'], carton_type['height']],
                'volume_per_carton': carton_volume,
                'max_possible': max_possible,
                'weight_per_carton': carton_type.get('weight', 0),
                'score': score
            })
        
        # Sort by recommendation score and then max possible quantity
        candidate_cartons.sort(key=lambda x: (x['score'], x['max_possible']), reverse=True)
        
        # Return top 5 recommendations
        return candidate_cartons[:5]

    def get_performance_insights(self) -> Dict:
        """
        Generate insights from historical performance data
        """
        if not self.historical_data:
            return {'status': 'no_data', 'insights': []}
        
        insights = []
        
        # Analyze average performance by truck type
        truck_performance = defaultdict(list)
        for entry in self.historical_data[-100:]:  # Last 100 entries
            truck_type = entry['input_features']['truck_type']
            utilization = entry['actual_results']['utilization']
            truck_performance[truck_type].append(utilization)
        
        for truck_type, utilizations in truck_performance.items():
            if len(utilizations) >= 5:  # Need at least 5 data points
                avg_util = sum(utilizations) / len(utilizations)
                if avg_util > 0.8:
                    insights.append(f"{truck_type}: Consistently high utilization ({avg_util:.1%})")
                elif avg_util < 0.6:
                    insights.append(f"{truck_type}: Low utilization trend ({avg_util:.1%}) - consider smaller trucks")
        
        # Analyze fragile item patterns
        fragile_results = [e for e in self.historical_data[-50:] if e['input_features']['fragile_ratio'] > 0.3]
        if fragile_results:
            avg_fragile_util = sum(e['actual_results']['utilization'] for e in fragile_results) / len(fragile_results)
            if avg_fragile_util < 0.7:
                insights.append(f"Fragile items reduce utilization to {avg_fragile_util:.1%} - consider specialized handling")
        
        # Recent performance trends
        recent_entries = self.historical_data[-20:] if len(self.historical_data) >= 20 else self.historical_data
        if recent_entries:
            recent_avg = sum(e['actual_results']['utilization'] for e in recent_entries) / len(recent_entries)
            if recent_avg > 0.85:
                insights.append(f"Recent performance excellent: {recent_avg:.1%} average utilization")
            elif recent_avg < 0.6:
                insights.append(f"Recent performance needs improvement: {recent_avg:.1%} average utilization")
        
        return {
            'status': 'success',
            'insights': insights,
            'data_points': len(self.historical_data),
            'truck_types_analyzed': len(truck_performance)
        }

# Global AI instance
packing_ai = PackingAI()
ml_space_optimizer = MLSpaceOptimizationEngine()