"""
AGENT 5: Recommendation Validation and Accuracy Enhancement Module
Provides comprehensive validation for all recommendation logic and calculations
"""

import logging
import math
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class ValidationResult:
    """Data class for validation results"""
    is_valid: bool
    warnings: List[str]
    errors: List[str]
    recommendations: List[str]
    metadata: Dict

class RecommendationValidator:
    """AGENT 5: Comprehensive validation for truck recommendations"""
    
    def __init__(self):
        self.validation_rules = {
            'max_utilization': 95.0,  # Maximum 95% space utilization (realistic packing)
            'min_utilization': 10.0,  # Minimum 10% space utilization (efficiency threshold)
            'weight_safety_margin': 0.9,  # 90% of max weight for safety
            'dimension_tolerance': 1.02,  # 2% tolerance for dimension calculations
            'cost_variance_threshold': 0.15  # 15% cost variance threshold
        }
        
    def validate_truck_recommendation(self, truck_data, carton_data, packing_result) -> ValidationResult:
        """
        AGENT 5: Comprehensive validation of truck recommendations
        """
        warnings = []
        errors = []
        recommendations = []
        
        # Validate physical dimensions
        dimension_validation = self._validate_dimensions(truck_data, carton_data, packing_result)
        warnings.extend(dimension_validation['warnings'])
        errors.extend(dimension_validation['errors'])
        
        # Validate space utilization calculations
        space_validation = self._validate_space_utilization(truck_data, packing_result)
        warnings.extend(space_validation['warnings'])
        errors.extend(space_validation['errors'])
        
        # Validate weight calculations
        weight_validation = self._validate_weight_limits(truck_data, packing_result)
        warnings.extend(weight_validation['warnings'])
        errors.extend(weight_validation['errors'])
        
        # Validate cost calculations
        cost_validation = self._validate_cost_calculations(truck_data, packing_result)
        warnings.extend(cost_validation['warnings'])
        errors.extend(cost_validation['errors'])
        
        # Generate optimization recommendations
        optimization_recommendations = self._generate_optimization_recommendations(
            truck_data, carton_data, packing_result
        )
        recommendations.extend(optimization_recommendations)
        
        # Overall validation
        is_valid = len(errors) == 0
        
        metadata = {
            'validation_timestamp': datetime.now().isoformat(),
            'validation_rules_applied': list(self.validation_rules.keys()),
            'truck_type': truck_data.get('truck_type', 'Unknown'),
            'total_items_evaluated': len(carton_data),
            'validation_score': self._calculate_validation_score(warnings, errors)
        }
        
        return ValidationResult(
            is_valid=is_valid,
            warnings=warnings,
            errors=errors,
            recommendations=recommendations,
            metadata=metadata
        )
    
    def _validate_dimensions(self, truck_data, carton_data, packing_result) -> Dict:
        """AGENT 5: Validate dimensional constraints and calculations"""
        warnings = []
        errors = []
        
        truck_dims = truck_data.get('truck_dimensions', [0, 0, 0])
        truck_volume = truck_dims[0] * truck_dims[1] * truck_dims[2]
        
        if truck_volume <= 0:
            errors.append(f"Invalid truck dimensions: {truck_dims}")
            return {'warnings': warnings, 'errors': errors}
        
        # Check each fitted item against truck dimensions
        fitted_items = packing_result.get('fitted_items', [])
        for item in fitted_items:
            item_dims = item.get('dimensions', [0, 0, 0])
            item_pos = item.get('position', [0, 0, 0])
            
            # Check if item fits within truck bounds
            for i, (dim, pos) in enumerate(zip(item_dims, item_pos)):
                if pos + dim > truck_dims[i] * self.validation_rules['dimension_tolerance']:
                    errors.append(
                        f"Item {item['name']} exceeds truck boundary: "
                        f"position {pos} + dimension {dim} > truck limit {truck_dims[i]}"
                    )
        
        # Validate total volume calculation
        calculated_volume = sum(
            item['dimensions'][0] * item['dimensions'][1] * item['dimensions'][2] 
            for item in fitted_items
        )
        
        reported_volume = packing_result.get('total_volume_used', 0)
        volume_difference = abs(calculated_volume - reported_volume)
        
        if volume_difference > truck_volume * 0.01:  # 1% tolerance
            warnings.append(
                f"Volume calculation discrepancy: "
                f"Calculated {calculated_volume} vs Reported {reported_volume}"
            )
        
        return {'warnings': warnings, 'errors': errors}
    
    def _validate_space_utilization(self, truck_data, packing_result) -> Dict:
        """AGENT 5: Validate space utilization calculations"""
        warnings = []
        errors = []
        
        space_util = packing_result.get('space_utilization', 0)
        
        # Check for impossible utilization values
        if space_util > self.validation_rules['max_utilization']:
            errors.append(f"Impossible space utilization: {space_util}% > {self.validation_rules['max_utilization']}%")
        
        if space_util < 0:
            errors.append(f"Negative space utilization: {space_util}%")
        
        # Check for extremely low utilization
        if 0 < space_util < self.validation_rules['min_utilization']:
            warnings.append(f"Low space utilization: {space_util}%. Consider smaller truck or more items.")
        
        # Validate utilization calculation
        truck_dims = truck_data.get('truck_dimensions', [0, 0, 0])
        truck_volume = truck_dims[0] * truck_dims[1] * truck_dims[2]
        used_volume = packing_result.get('total_volume_used', 0)
        
        if truck_volume > 0:
            calculated_util = (used_volume / truck_volume) * 100
            util_difference = abs(calculated_util - space_util)
            
            if util_difference > 1.0:  # 1% tolerance
                warnings.append(
                    f"Space utilization calculation error: "
                    f"Calculated {calculated_util:.2f}% vs Reported {space_util:.2f}%"
                )
        
        return {'warnings': warnings, 'errors': errors}
    
    def _validate_weight_limits(self, truck_data, packing_result) -> Dict:
        """AGENT 5: Validate weight constraints"""
        warnings = []
        errors = []
        
        max_weight = truck_data.get('max_weight', 0)
        total_weight = packing_result.get('total_weight', 0)
        
        if total_weight > max_weight:
            errors.append(f"Weight limit exceeded: {total_weight} kg > {max_weight} kg")
        
        # Check weight safety margin
        weight_ratio = total_weight / max_weight if max_weight > 0 else 0
        if weight_ratio > self.validation_rules['weight_safety_margin']:
            warnings.append(
                f"Weight near capacity: {total_weight} kg ({weight_ratio*100:.1f}% of {max_weight} kg). "
                f"Consider weight distribution."
            )
        
        return {'warnings': warnings, 'errors': errors}
    
    def _validate_cost_calculations(self, truck_data, packing_result) -> Dict:
        """AGENT 5: Validate cost calculations"""
        warnings = []
        errors = []
        
        cost_data = packing_result.get('cost_analysis', {})
        
        # Check for missing cost components
        expected_components = ['fuel_cost', 'maintenance_cost', 'driver_cost', 'total_cost']
        for component in expected_components:
            if component not in cost_data:
                warnings.append(f"Missing cost component: {component}")
        
        # Validate total cost calculation
        component_sum = sum([
            cost_data.get('fuel_cost', 0),
            cost_data.get('maintenance_cost', 0),
            cost_data.get('driver_cost', 0)
        ])
        
        total_cost = cost_data.get('total_cost', 0)
        if abs(component_sum - total_cost) > total_cost * 0.01:  # 1% tolerance
            warnings.append(f"Cost calculation mismatch: components sum to {component_sum}, total is {total_cost}")
        
        return {'warnings': warnings, 'errors': errors}
    
    def _generate_optimization_recommendations(self, truck_data, carton_data, packing_result) -> List[str]:
        """AGENT 5: Generate optimization recommendations"""
        recommendations = []
        
        space_util = packing_result.get('space_utilization', 0)
        weight_util = packing_result.get('weight_utilization', 0)
        
        # Space optimization recommendations
        if space_util < 50:
            recommendations.append("Consider using a smaller truck type for better cost efficiency")
        elif space_util > 90:
            recommendations.append("Excellent space utilization - this is an optimal choice")
        
        # Weight optimization recommendations
        if weight_util < 30:
            recommendations.append("Truck has significant unused weight capacity - consider adding more items")
        elif weight_util > 85:
            recommendations.append("Weight utilization is high - ensure proper weight distribution")
        
        # Cost optimization recommendations
        cost_per_item = packing_result.get('cost_per_item', 0)
        if cost_per_item > 100:  # Threshold for high cost per item
            recommendations.append("Cost per item is high - consider consolidating with other orders")
        
        # Efficiency recommendations
        fitted_items = len(packing_result.get('fitted_items', []))
        total_items = len(carton_data)
        packing_efficiency = (fitted_items / total_items) * 100 if total_items > 0 else 0
        
        if packing_efficiency < 80:
            recommendations.append(f"Only {packing_efficiency:.1f}% of items fit - consider multiple trucks")
        
        return recommendations
    
    def _calculate_validation_score(self, warnings: List[str], errors: List[str]) -> float:
        """AGENT 5: Calculate overall validation score"""
        base_score = 100.0
        
        # Deduct points for issues
        error_penalty = len(errors) * 20  # 20 points per error
        warning_penalty = len(warnings) * 5  # 5 points per warning
        
        score = max(0.0, base_score - error_penalty - warning_penalty)
        return round(score, 2)
    
    def generate_validation_report(self, validation_result: ValidationResult) -> str:
        """AGENT 5: Generate human-readable validation report"""
        report = []
        report.append("=== TRUCK RECOMMENDATION VALIDATION REPORT ===")
        report.append(f"Validation Score: {validation_result.metadata['validation_score']}/100")
        report.append(f"Overall Status: {'VALID' if validation_result.is_valid else 'INVALID'}")
        report.append("")
        
        if validation_result.errors:
            report.append("🚨 ERRORS:")
            for error in validation_result.errors:
                report.append(f"  • {error}")
            report.append("")
        
        if validation_result.warnings:
            report.append("⚠️ WARNINGS:")
            for warning in validation_result.warnings:
                report.append(f"  • {warning}")
            report.append("")
        
        if validation_result.recommendations:
            report.append("💡 RECOMMENDATIONS:")
            for rec in validation_result.recommendations:
                report.append(f"  • {rec}")
            report.append("")
        
        report.append("📊 METADATA:")
        for key, value in validation_result.metadata.items():
            report.append(f"  {key}: {value}")
        
        return "\n".join(report)

# AGENT 5: Global validator instance
recommendation_validator = RecommendationValidator()

def validate_recommendation(truck_data, carton_data, packing_result):
    """AGENT 5: Public function to validate recommendations"""
    return recommendation_validator.validate_truck_recommendation(
        truck_data, carton_data, packing_result
    )