"""
Domain Services - Business Logic Implementation
Core domain services with rich business behavior
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import logging
from abc import ABC, abstractmethod

from .entities import TruckEntity, CartonEntity, PackingJobEntity, PackingResultEntity
from .value_objects import (
    OptimizationStrategy, Dimensions, Weight, Volume, Money, 
    PackingPosition, CostBreakdown
)
from ..exceptions.domain import DomainValidationError, BusinessLogicError
from ..core.logging import get_logger


class PackingDomainService:
    """Domain service for 3D packing operations"""
    
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
    
    def optimize_packing(self, truck: TruckEntity, cartons: List[CartonEntity], 
                        strategy: OptimizationStrategy) -> 'ServiceResult[PackingResultEntity]':
        """Optimize 3D packing of cartons in truck"""
        from ..services.base import ServiceResult
        
        try:
            # Validate inputs
            if not truck.is_available:
                return ServiceResult(success=False, errors=["Truck is not available"])
            
            if not cartons:
                return ServiceResult(success=False, errors=["No cartons to pack"])
            
            # Sort cartons by strategy
            sorted_cartons = self._sort_cartons_by_strategy(cartons, strategy)
            
            # Perform 3D packing
            packing_result = self._pack_cartons_3d(truck, sorted_cartons, strategy)
            
            if not packing_result:
                return ServiceResult(success=False, errors=["Failed to pack cartons"])
            
            return ServiceResult(success=True, data=packing_result)
            
        except Exception as e:
            self.logger.error(f"Packing optimization error: {str(e)}")
            return ServiceResult(success=False, errors=[f"Packing optimization failed: {str(e)}"])
    
    def _sort_cartons_by_strategy(self, cartons: List[CartonEntity], 
                                 strategy: OptimizationStrategy) -> List[CartonEntity]:
        """Sort cartons based on optimization strategy"""
        if strategy == OptimizationStrategy.SPACE:
            # Sort by volume (largest first)
            return sorted(cartons, key=lambda c: c.volume.cubic_meters if c.volume else 0, reverse=True)
        elif strategy == OptimizationStrategy.WEIGHT:
            # Sort by weight (heaviest first for bottom placement)
            return sorted(cartons, key=lambda c: c.weight.kilograms if c.weight else 0, reverse=True)
        elif strategy == OptimizationStrategy.COST:
            # Sort by value (highest first)
            return sorted(cartons, key=lambda c: c.value.amount if c.value else 0, reverse=True)
        else:
            # Balanced approach: consider volume, weight, and priority
            return sorted(cartons, key=lambda c: (
                c.priority * 1000 +  # Priority boost
                (c.volume.cubic_meters if c.volume else 0) * 100 +  # Volume factor
                (c.weight.kilograms if c.weight else 0) * 10  # Weight factor
            ), reverse=True)
    
    def _pack_cartons_3d(self, truck: TruckEntity, cartons: List[CartonEntity], 
                        strategy: OptimizationStrategy) -> Optional[PackingResultEntity]:
        """Perform 3D bin packing algorithm"""
        try:
            packed_cartons = []
            packing_positions = {}
            current_position = PackingPosition(0, 0, 0)
            
            truck_dims = truck.dimensions
            if not truck_dims:
                return None
            
            # Simple 3D packing algorithm (bottom-left-fill)
            occupied_spaces = []
            
            for carton in cartons:
                if not carton.dimensions:
                    continue
                
                # Find best position for carton
                best_position = self._find_best_position(
                    carton, truck_dims, occupied_spaces, strategy
                )
                
                if best_position:
                    packed_cartons.append(carton)
                    packing_positions[carton.id] = best_position
                    
                    # Add to occupied spaces
                    occupied_spaces.append({
                        'position': best_position,
                        'dimensions': carton.dimensions,
                        'carton_id': carton.id
                    })
                else:
                    # Carton doesn't fit, skip for now
                    continue
            
            # Calculate utilization metrics
            space_utilization = self._calculate_space_utilization(
                truck, packed_cartons
            )
            weight_utilization = self._calculate_weight_utilization(
                truck, packed_cartons
            )
            
            # Calculate optimization score
            optimization_score = self._calculate_optimization_score(
                space_utilization, weight_utilization, strategy, len(packed_cartons), len(cartons)
            )
            
            return PackingResultEntity(
                truck=truck,
                packed_cartons=packed_cartons,
                packing_positions=packing_positions,
                space_utilization=space_utilization,
                weight_utilization=weight_utilization,
                optimization_score=optimization_score,
                metadata={
                    'strategy': str(strategy),
                    'total_cartons': len(cartons),
                    'packed_cartons': len(packed_cartons),
                    'packing_efficiency': len(packed_cartons) / len(cartons) * 100
                }
            )
            
        except Exception as e:
            self.logger.error(f"3D packing error: {str(e)}")
            return None
    
    def _find_best_position(self, carton: CartonEntity, truck_dims: Dimensions,
                           occupied_spaces: List[Dict], strategy: OptimizationStrategy) -> Optional[PackingPosition]:
        """Find best position for carton in truck"""
        carton_dims = carton.dimensions
        if not carton_dims:
            return None
        
        # Try different orientations if rotation is allowed
        orientations = carton_dims.get_all_orientations() if carton.can_rotate else [carton_dims]
        
        best_position = None
        best_score = float('-inf')
        
        # Grid-based search for positions
        step_size = 5  # cm
        
        for x in range(0, int(truck_dims.length), step_size):
            for y in range(0, int(truck_dims.width), step_size):
                for z in range(0, int(truck_dims.height), step_size):
                    for orientation in orientations:
                        position = PackingPosition(x, y, z)
                        
                        if self._can_place_carton(position, orientation, truck_dims, occupied_spaces):
                            # Score this position based on strategy
                            score = self._score_position(position, orientation, strategy, carton)
                            
                            if score > best_score:
                                best_score = score
                                best_position = position
        
        return best_position
    
    def _can_place_carton(self, position: PackingPosition, carton_dims: Dimensions,
                         truck_dims: Dimensions, occupied_spaces: List[Dict]) -> bool:
        """Check if carton can be placed at position without conflicts"""
        # Check if carton fits within truck bounds
        if (position.x + carton_dims.length > truck_dims.length or
            position.y + carton_dims.width > truck_dims.width or
            position.z + carton_dims.height > truck_dims.height):
            return False
        
        # Check for overlaps with existing cartons
        for space in occupied_spaces:
            if self._boxes_overlap(position, carton_dims, space['position'], space['dimensions']):
                return False
        
        return True
    
    def _boxes_overlap(self, pos1: PackingPosition, dims1: Dimensions,
                      pos2: PackingPosition, dims2: Dimensions) -> bool:
        """Check if two boxes overlap in 3D space"""
        return not (
            pos1.x + dims1.length <= pos2.x or pos2.x + dims2.length <= pos1.x or
            pos1.y + dims1.width <= pos2.y or pos2.y + dims2.width <= pos1.y or
            pos1.z + dims1.height <= pos2.z or pos2.z + dims2.height <= pos1.z
        )
    
    def _score_position(self, position: PackingPosition, carton_dims: Dimensions,
                       strategy: OptimizationStrategy, carton: CartonEntity) -> float:
        """Score a position based on optimization strategy"""
        score = 0.0
        
        if strategy == OptimizationStrategy.SPACE:
            # Prefer lower positions (bottom-first)
            score += (1000 - position.z)
            # Prefer positions closer to corners
            score += (1000 - position.x - position.y)
        elif strategy == OptimizationStrategy.WEIGHT:
            # Heavy items at bottom
            if carton.weight:
                score += carton.weight.kilograms * (1000 - position.z)
        else:
            # Balanced approach
            score += (1000 - position.z) * 0.5  # Height preference
            score += (1000 - position.x - position.y) * 0.3  # Corner preference
            score += carton.priority * 100  # Priority boost
        
        return score
    
    def _calculate_space_utilization(self, truck: TruckEntity, cartons: List[CartonEntity]) -> float:
        """Calculate space utilization percentage"""
        if not truck.volume or not cartons:
            return 0.0
        
        total_carton_volume = sum(c.volume.cubic_meters if c.volume else 0 for c in cartons)
        return min(100.0, (total_carton_volume / truck.volume.cubic_meters) * 100)
    
    def _calculate_weight_utilization(self, truck: TruckEntity, cartons: List[CartonEntity]) -> float:
        """Calculate weight utilization percentage"""
        if not truck.max_weight or not cartons:
            return 0.0
        
        total_carton_weight = sum(c.weight.kilograms if c.weight else 0 for c in cartons)
        return min(100.0, (total_carton_weight / truck.max_weight.kilograms) * 100)
    
    def _calculate_optimization_score(self, space_util: float, weight_util: float,
                                    strategy: OptimizationStrategy, packed_count: int, total_count: int) -> float:
        """Calculate overall optimization score"""
        packing_efficiency = (packed_count / total_count) * 100 if total_count > 0 else 0
        
        if strategy == OptimizationStrategy.SPACE:
            return (space_util * 0.6 + weight_util * 0.2 + packing_efficiency * 0.2) / 100
        elif strategy == OptimizationStrategy.WEIGHT:
            return (weight_util * 0.6 + space_util * 0.2 + packing_efficiency * 0.2) / 100
        else:
            return (space_util * 0.4 + weight_util * 0.4 + packing_efficiency * 0.2) / 100


class CostCalculationService:
    """Domain service for cost calculations"""
    
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
        
        # Default cost parameters (can be configurable)
        self.default_fuel_price = Money(100.0)  # INR per liter
        self.default_loading_cost = Money(500.0)  # INR per truck
        self.default_insurance_rate = 0.02  # 2% of value
    
    def calculate_total_cost(self, truck: TruckEntity, packing_result: PackingResultEntity,
                           distance_km: float = 100, fuel_price: Money = None) -> 'ServiceResult[CostBreakdown]':
        """Calculate total transportation cost"""
        from ..services.base import ServiceResult
        
        try:
            fuel_price = fuel_price or self.default_fuel_price
            
            # Calculate fuel cost
            fuel_cost = self._calculate_fuel_cost(truck, distance_km, fuel_price)
            
            # Calculate driver cost
            driver_cost = truck.driver_cost_per_day or Money(800.0)  # Default daily rate
            
            # Calculate maintenance cost
            maintenance_cost = self._calculate_maintenance_cost(truck, distance_km)
            
            # Calculate insurance cost
            insurance_cost = self._calculate_insurance_cost(packing_result)
            
            # Create cost breakdown
            cost_breakdown = CostBreakdown(
                fuel_cost=fuel_cost,
                driver_cost=driver_cost,
                maintenance_cost=maintenance_cost,
                toll_cost=Money(0.0),  # TODO: Calculate based on route
                insurance_cost=insurance_cost,
                loading_cost=self.default_loading_cost
            )
            
            return ServiceResult(success=True, data=cost_breakdown)
            
        except Exception as e:
            self.logger.error(f"Cost calculation error: {str(e)}")
            return ServiceResult(success=False, errors=[f"Cost calculation failed: {str(e)}"])
    
    def _calculate_fuel_cost(self, truck: TruckEntity, distance_km: float, fuel_price: Money) -> Money:
        """Calculate fuel cost based on distance and efficiency"""
        if truck.fuel_efficiency <= 0:
            # Default fuel efficiency if not specified
            fuel_efficiency = 8.0  # km per liter for trucks
        else:
            fuel_efficiency = truck.fuel_efficiency
        
        fuel_needed = distance_km / fuel_efficiency
        return fuel_price * fuel_needed
    
    def _calculate_maintenance_cost(self, truck: TruckEntity, distance_km: float) -> Money:
        """Calculate maintenance cost"""
        if truck.maintenance_cost_per_km:
            return truck.maintenance_cost_per_km * distance_km
        else:
            # Default maintenance cost
            return Money(2.0) * distance_km  # INR 2 per km
    
    def _calculate_insurance_cost(self, packing_result: PackingResultEntity) -> Money:
        """Calculate insurance cost based on cargo value"""
        total_value = sum(c.value.amount if c.value else 0 for c in packing_result.packed_cartons)
        return Money(total_value * self.default_insurance_rate)
    
    def compare_cost_scenarios(self, scenarios: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compare multiple cost scenarios"""
        results = []
        
        for i, scenario in enumerate(scenarios):
            truck = scenario['truck']
            packing_result = scenario['packing_result']
            distance = scenario.get('distance_km', 100)
            
            cost_result = self.calculate_total_cost(truck, packing_result, distance)
            
            if cost_result.success:
                cost_breakdown = cost_result.data
                results.append({
                    'scenario_id': i,
                    'truck_id': truck.id,
                    'truck_name': truck.name,
                    'total_cost': cost_breakdown.total_cost.amount,
                    'cost_breakdown': cost_breakdown.get_breakdown_percentages(),
                    'cost_per_carton': cost_breakdown.total_cost.amount / len(packing_result.packed_cartons) if packing_result.packed_cartons else 0,
                    'space_utilization': packing_result.space_utilization,
                    'weight_utilization': packing_result.weight_utilization
                })
        
        # Sort by total cost
        results.sort(key=lambda x: x['total_cost'])
        
        # Calculate savings potential
        if len(results) > 1:
            best_cost = results[0]['total_cost']
            worst_cost = results[-1]['total_cost']
            savings_potential = worst_cost - best_cost
            savings_percentage = (savings_potential / worst_cost) * 100
        else:
            savings_potential = 0
            savings_percentage = 0
        
        return {
            'scenarios': results,
            'best_option': results[0] if results else None,
            'worst_option': results[-1] if results else None,
            'savings_potential': savings_potential,
            'savings_percentage': round(savings_percentage, 2),
            'total_scenarios': len(results)
        }


class OptimizationService:
    """Domain service for optimization algorithms"""
    
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
        self.packing_service = PackingDomainService()
        self.cost_service = CostCalculationService()
    
    def find_optimal_truck_combination(self, cartons: List[CartonEntity], 
                                     available_trucks: List[TruckEntity],
                                     strategy: OptimizationStrategy) -> Dict[str, Any]:
        """Find optimal combination of trucks for given cartons"""
        try:
            results = []
            
            # Single truck solutions
            for truck in available_trucks:
                packing_result = self.packing_service.optimize_packing(truck, cartons, strategy)
                
                if packing_result.success:
                    cost_result = self.cost_service.calculate_total_cost(truck, packing_result.data)
                    
                    results.append({
                        'trucks': [truck],
                        'packing_results': [packing_result.data],
                        'total_cost': cost_result.data.total_cost.amount if cost_result.success else float('inf'),
                        'total_cartons_packed': len(packing_result.data.packed_cartons),
                        'utilization_score': packing_result.data.optimization_score,
                        'solution_type': 'single_truck'
                    })
            
            # Multi-truck solutions (for large loads)
            if len(cartons) > 50:  # Only for large loads
                multi_truck_results = self._find_multi_truck_solutions(cartons, available_trucks, strategy)
                results.extend(multi_truck_results)
            
            # Sort by strategy preference
            if strategy == OptimizationStrategy.COST:
                results.sort(key=lambda x: x['total_cost'])
            elif strategy == OptimizationStrategy.SPACE:
                results.sort(key=lambda x: x['utilization_score'], reverse=True)
            else:
                # Balanced: consider both cost and utilization
                results.sort(key=lambda x: (x['total_cost'] / 1000) - x['utilization_score'])
            
            return {
                'optimal_solutions': results[:5],  # Top 5 solutions
                'strategy_used': str(strategy),
                'total_cartons': len(cartons),
                'solutions_evaluated': len(results)
            }
            
        except Exception as e:
            self.logger.error(f"Optimization error: {str(e)}")
            return {
                'optimal_solutions': [],
                'error': str(e)
            }
    
    def _find_multi_truck_solutions(self, cartons: List[CartonEntity], 
                                   available_trucks: List[TruckEntity],
                                   strategy: OptimizationStrategy) -> List[Dict[str, Any]]:
        """Find multi-truck solutions for large loads"""
        multi_truck_results = []
        
        # Try combinations of 2-3 trucks
        from itertools import combinations
        
        for truck_count in [2, 3]:
            for truck_combo in combinations(available_trucks, truck_count):
                solution = self._optimize_multi_truck_packing(cartons, list(truck_combo), strategy)
                if solution:
                    multi_truck_results.append(solution)
        
        return multi_truck_results
    
    def _optimize_multi_truck_packing(self, cartons: List[CartonEntity],
                                    trucks: List[TruckEntity], 
                                    strategy: OptimizationStrategy) -> Optional[Dict[str, Any]]:
        """Optimize packing across multiple trucks"""
        try:
            # Simple greedy allocation
            remaining_cartons = cartons.copy()
            truck_assignments = []
            total_cost = 0
            total_packed = 0
            
            for truck in trucks:
                if not remaining_cartons:
                    break
                
                # Pack as many cartons as possible in this truck
                packing_result = self.packing_service.optimize_packing(truck, remaining_cartons, strategy)
                
                if packing_result.success and packing_result.data.packed_cartons:
                    # Remove packed cartons from remaining
                    packed_ids = {c.id for c in packing_result.data.packed_cartons}
                    remaining_cartons = [c for c in remaining_cartons if c.id not in packed_ids]
                    
                    # Calculate cost for this truck
                    cost_result = self.cost_service.calculate_total_cost(truck, packing_result.data)
                    truck_cost = cost_result.data.total_cost.amount if cost_result.success else 0
                    
                    truck_assignments.append({
                        'truck': truck,
                        'packing_result': packing_result.data,
                        'cost': truck_cost
                    })
                    
                    total_cost += truck_cost
                    total_packed += len(packing_result.data.packed_cartons)
            
            if truck_assignments:
                # Calculate overall utilization score
                avg_utilization = sum(ta['packing_result'].optimization_score for ta in truck_assignments) / len(truck_assignments)
                
                return {
                    'trucks': [ta['truck'] for ta in truck_assignments],
                    'packing_results': [ta['packing_result'] for ta in truck_assignments],
                    'total_cost': total_cost,
                    'total_cartons_packed': total_packed,
                    'utilization_score': avg_utilization,
                    'solution_type': 'multi_truck',
                    'truck_count': len(truck_assignments)
                }
            
            return None
            
        except Exception as e:
            self.logger.error(f"Multi-truck optimization error: {str(e)}")
            return None