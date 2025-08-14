# Smart Truck Recommendation Engine
# Enhanced algorithm for intelligent truck selection based on carton analysis

import numpy as np
from typing import List, Dict, Tuple, Optional
import logging
from dataclasses import dataclass
from enum import Enum

class OptimizationGoal(Enum):
    COST_MINIMUM = "cost_minimum"
    SPACE_MAXIMUM = "space_maximum"
    BALANCED = "balanced"
    VALUE_PROTECTED = "value_protected"

@dataclass
class CartonAnalysis:
    """Detailed analysis of carton characteristics"""
    total_volume: float
    total_weight: float
    avg_density: float
    largest_item_volume: float
    count_by_size: Dict[str, int]  # small, medium, large
    fragility_score: float
    value_density: float  # value per unit volume

@dataclass
class TruckRecommendation:
    """Enhanced truck recommendation with detailed analysis"""
    truck_name: str
    truck_dimensions: str
    quantity_needed: int
    space_utilization: float
    cost_estimate: float
    fit_confidence: float
    recommendation_reason: str
    optimization_benefits: List[str]
    risk_factors: List[str]
    efficiency_score: float

class SmartTruckRecommender:
    """Advanced truck recommendation engine with carton quantity intelligence"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
        # Truck categorization by Indian standards
        self.truck_categories = {
            'LCV': {'max_volume': 20000000, 'max_weight': 2000, 'cost_per_km': 8},  # cm³, kg, INR
            'MCV': {'max_volume': 120000000, 'max_weight': 16000, 'cost_per_km': 15},
            'HCV': {'max_volume': 300000000, 'max_weight': 28000, 'cost_per_km': 25}
        }
        
    def analyze_carton_mix(self, carton_quantities: Dict) -> CartonAnalysis:
        """Comprehensive analysis of carton types and quantities"""
        total_volume = 0
        total_weight = 0
        total_value = 0
        size_counts = {'small': 0, 'medium': 0, 'large': 0}
        max_volume = 0
        fragility_scores = []
        
        for carton, qty in carton_quantities.items():
            # Calculate individual carton metrics
            volume = carton.length * carton.width * carton.height
            weight = getattr(carton, 'weight', 5) * qty
            value = getattr(carton, 'value', 1000) * qty  # Default value if not specified
            
            total_volume += volume * qty
            total_weight += weight
            total_value += value
            max_volume = max(max_volume, volume)
            
            # Categorize by size
            if volume < 50000:  # < 50k cm³
                size_counts['small'] += qty
            elif volume < 200000:  # < 200k cm³
                size_counts['medium'] += qty
            else:
                size_counts['large'] += qty
                
            # Fragility assessment (electronics = high, appliances = medium)
            item_name = carton.name.lower() if hasattr(carton, 'name') else ""
            if any(word in item_name for word in ['tv', 'electronics', 'glass']):
                fragility_scores.append(0.8 * qty)
            elif any(word in item_name for word in ['refrigerator', 'washing', 'ac']):
                fragility_scores.append(0.4 * qty)
            else:
                fragility_scores.append(0.2 * qty)
        
        return CartonAnalysis(
            total_volume=total_volume,
            total_weight=total_weight,
            avg_density=total_weight / (total_volume / 1000000) if total_volume > 0 else 0,  # kg/m³
            largest_item_volume=max_volume,
            count_by_size=size_counts,
            fragility_score=np.mean(fragility_scores) if fragility_scores else 0.2,
            value_density=total_value / (total_volume / 1000000) if total_volume > 0 else 1000
        )
    
    def calculate_truck_efficiency(self, truck, carton_analysis: CartonAnalysis, 
                                 optimization_goal: OptimizationGoal) -> float:
        """Calculate truck efficiency based on carton analysis and optimization goal"""
        truck_volume = truck.length * truck.width * truck.height
        truck_capacity = getattr(truck, 'max_weight', 10000)
        truck_category = self._categorize_truck(truck)
        
        # Base efficiency factors
        volume_efficiency = min(1.0, carton_analysis.total_volume / truck_volume)
        weight_efficiency = min(1.0, carton_analysis.total_weight / truck_capacity)
        
        # Size matching efficiency
        size_match_score = self._calculate_size_matching(truck, carton_analysis)
        
        # Goal-specific scoring
        if optimization_goal == OptimizationGoal.COST_MINIMUM:
            cost_factor = 1.0 / self.truck_categories[truck_category]['cost_per_km']
            return (volume_efficiency * 0.3 + weight_efficiency * 0.3 + 
                   cost_factor * 0.3 + size_match_score * 0.1)
        
        elif optimization_goal == OptimizationGoal.SPACE_MAXIMUM:
            return (volume_efficiency * 0.5 + weight_efficiency * 0.3 + size_match_score * 0.2)
        
        elif optimization_goal == OptimizationGoal.VALUE_PROTECTED:
            # Prefer larger, more secure trucks for high-value cargo
            security_factor = 0.8 if truck_category == 'HCV' else (0.6 if truck_category == 'MCV' else 0.4)
            return (volume_efficiency * 0.3 + security_factor * 0.4 + size_match_score * 0.3)
        
        else:  # BALANCED
            cost_factor = 1.0 / self.truck_categories[truck_category]['cost_per_km']
            return (volume_efficiency * 0.25 + weight_efficiency * 0.25 + 
                   cost_factor * 0.25 + size_match_score * 0.25)
    
    def _categorize_truck(self, truck) -> str:
        """Categorize truck as LCV, MCV, or HCV"""
        truck_volume = truck.length * truck.width * truck.height
        truck_weight = getattr(truck, 'max_weight', 10000)
        
        if truck_volume <= 20000000 and truck_weight <= 2000:
            return 'LCV'
        elif truck_volume <= 120000000 and truck_weight <= 16000:
            return 'MCV'
        else:
            return 'HCV'
    
    def _calculate_size_matching(self, truck, carton_analysis: CartonAnalysis) -> float:
        """Calculate how well truck size matches carton mix"""
        truck_volume = truck.length * truck.width * truck.height
        
        # Penalty for oversized trucks with small cargo
        if (carton_analysis.count_by_size['small'] > carton_analysis.count_by_size['large'] * 3 and
            truck_volume > 100000000):  # Large truck for mostly small items
            return 0.3
        
        # Bonus for appropriately sized trucks
        total_items = sum(carton_analysis.count_by_size.values())
        if total_items == 0:
            return 0.5
        
        small_ratio = carton_analysis.count_by_size['small'] / total_items
        
        if small_ratio > 0.7 and truck_volume < 50000000:  # Small truck for small items
            return 0.9
        elif small_ratio < 0.3 and truck_volume > 100000000:  # Large truck for large items
            return 0.9
        else:
            return 0.7
    
    def generate_recommendations(self, carton_quantities: Dict, available_trucks: List, 
                               optimization_goal: OptimizationGoal = OptimizationGoal.BALANCED,
                               max_recommendations: int = 5) -> List[TruckRecommendation]:
        """Generate intelligent truck recommendations based on carton analysis"""
        
        # Analyze carton characteristics
        carton_analysis = self.analyze_carton_mix(carton_quantities)
        
        # Calculate efficiency for each truck
        truck_scores = []
        for truck in available_trucks:
            efficiency = self.calculate_truck_efficiency(truck, carton_analysis, optimization_goal)
            truck_scores.append((truck, efficiency))
        
        # Sort by efficiency and generate recommendations
        truck_scores.sort(key=lambda x: x[1], reverse=True)
        recommendations = []
        
        for truck, efficiency_score in truck_scores[:max_recommendations]:
            recommendation = self._build_recommendation(
                truck, efficiency_score, carton_analysis, optimization_goal
            )
            recommendations.append(recommendation)
        
        return recommendations
    
    def _build_recommendation(self, truck, efficiency_score: float, 
                            carton_analysis: CartonAnalysis, 
                            optimization_goal: OptimizationGoal) -> TruckRecommendation:
        """Build detailed recommendation with explanations"""
        
        truck_volume = truck.length * truck.width * truck.height
        truck_capacity = getattr(truck, 'max_weight', 10000)
        truck_category = self._categorize_truck(truck)
        
        # Calculate quantity needed
        volume_based = max(1, int(carton_analysis.total_volume / truck_volume) + 1)
        weight_based = max(1, int(carton_analysis.total_weight / truck_capacity) + 1)
        quantity_needed = max(volume_based, weight_based)
        
        # Calculate utilization
        space_utilization = min(1.0, carton_analysis.total_volume / (truck_volume * quantity_needed))
        
        # Estimate cost
        base_cost = self.truck_categories[truck_category]['cost_per_km'] * 100 * quantity_needed  # 100km default
        
        # Generate recommendation reason
        reason = self._generate_recommendation_reason(truck, carton_analysis, optimization_goal, efficiency_score)
        
        # Benefits and risks
        benefits = self._identify_benefits(truck, carton_analysis, space_utilization)
        risks = self._identify_risks(truck, carton_analysis, space_utilization)
        
        return TruckRecommendation(
            truck_name=truck.name,
            truck_dimensions=f"{truck.length}×{truck.width}×{truck.height} cm",
            quantity_needed=quantity_needed,
            space_utilization=space_utilization,
            cost_estimate=base_cost,
            fit_confidence=efficiency_score,
            recommendation_reason=reason,
            optimization_benefits=benefits,
            risk_factors=risks,
            efficiency_score=efficiency_score
        )
    
    def _generate_recommendation_reason(self, truck, carton_analysis: CartonAnalysis, 
                                      goal: OptimizationGoal, efficiency: float) -> str:
        """Generate human-readable recommendation explanation"""
        truck_category = self._categorize_truck(truck)
        total_items = sum(carton_analysis.count_by_size.values())
        
        if efficiency > 0.8:
            if goal == OptimizationGoal.COST_MINIMUM:
                return f"Excellent cost-efficient choice. {truck_category} truck offers optimal balance of capacity and cost for your {total_items} item mix."
            elif goal == OptimizationGoal.SPACE_MAXIMUM:
                return f"Superb space utilization. This {truck_category} maximizes loading efficiency for your cargo volume."
            elif goal == OptimizationGoal.VALUE_PROTECTED:
                return f"High-security option. {truck_category} truck provides excellent protection for valuable cargo."
            else:
                return f"Well-balanced choice. {truck_category} truck offers optimal combination of cost, space, and reliability."
        
        elif efficiency > 0.6:
            return f"Good option for your needs. {truck_category} truck handles your {total_items} items effectively with reasonable efficiency."
        
        else:
            return f"Alternative option. {truck_category} truck can accommodate your cargo but may not be the most efficient choice."
    
    def _identify_benefits(self, truck, carton_analysis: CartonAnalysis, utilization: float) -> List[str]:
        """Identify key benefits of this truck choice"""
        benefits = []
        truck_category = self._categorize_truck(truck)
        
        if utilization > 0.8:
            benefits.append(f"High space efficiency ({utilization:.1%} utilization)")
        
        if truck_category == 'LCV' and carton_analysis.count_by_size['small'] > 50:
            benefits.append("Perfect for city delivery of small items")
        
        if truck_category == 'HCV' and carton_analysis.value_density > 50000:
            benefits.append("Enhanced security for high-value cargo")
        
        if carton_analysis.fragility_score > 0.6:
            benefits.append("Suitable for fragile item transport")
        
        cost_per_km = self.truck_categories[truck_category]['cost_per_km']
        if cost_per_km < 20:
            benefits.append("Cost-effective transportation")
        
        return benefits
    
    def _identify_risks(self, truck, carton_analysis: CartonAnalysis, utilization: float) -> List[str]:
        """Identify potential risks or concerns"""
        risks = []
        truck_category = self._categorize_truck(truck)
        
        if utilization < 0.4:
            risks.append("Low space utilization may increase cost per item")
        
        if truck_category == 'HCV' and sum(carton_analysis.count_by_size.values()) < 20:
            risks.append("Large truck for small quantity may be inefficient")
        
        if truck_category == 'LCV' and carton_analysis.total_weight > 1500:
            risks.append("Weight limits may require multiple trips")
        
        if carton_analysis.fragility_score > 0.7 and truck_category == 'LCV':
            risks.append("Consider additional packaging for fragile items")
        
        return risks

# Integration function for existing codebase
def get_enhanced_truck_recommendations(carton_quantities: Dict, available_trucks: List, 
                                     optimization_goal: str = "balanced") -> List[Dict]:
    """
    Enhanced truck recommendation function that integrates with existing TruckOpti system
    """
    recommender = SmartTruckRecommender()
    
    # Map string goals to enum
    goal_mapping = {
        'cost_saving': OptimizationGoal.COST_MINIMUM,
        'space_utilization': OptimizationGoal.SPACE_MAXIMUM,
        'balanced': OptimizationGoal.BALANCED,
        'value_protected': OptimizationGoal.VALUE_PROTECTED
    }
    
    goal = goal_mapping.get(optimization_goal, OptimizationGoal.BALANCED)
    
    recommendations = recommender.generate_recommendations(
        carton_quantities, available_trucks, goal, max_recommendations=5
    )
    
    # Convert to format expected by existing UI
    formatted_recommendations = []
    for rec in recommendations:
        formatted_recommendations.append({
            'truck_type': rec.truck_name,
            'truck_dimensions': rec.truck_dimensions,
            'quantity': rec.quantity_needed,
            'utilization': rec.space_utilization,
            'total_cost': rec.cost_estimate,
            'efficiency_score': rec.efficiency_score,
            'recommendation_reason': rec.recommendation_reason,
            'benefits': rec.optimization_benefits,
            'risks': rec.risk_factors,
            'confidence': rec.fit_confidence
        })
    
    return formatted_recommendations