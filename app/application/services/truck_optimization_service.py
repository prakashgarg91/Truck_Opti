"""
Truck Optimization Application Service
High-level orchestration for truck optimization operations
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import logging

from ...services.base import BaseService, ServiceResult, TransactionalService
from ...domain.entities import TruckEntity, CartonEntity, PackingJobEntity, PackingResultEntity
from ...domain.value_objects import OptimizationStrategy, Dimensions, Weight, Volume, Money
from ...repositories import ITruckRepository, ICartonRepository, IPackingJobRepository
from ...exceptions.domain import DomainValidationError, BusinessLogicError
from ...core.logging import business_logger


@dataclass
class OptimizationRequest:
    """Request for truck optimization"""
    cartons: List[Dict[str, Any]]
    strategy: str = "space"
    constraints: Dict[str, Any] = None
    preferences: Dict[str, Any] = None
    
    def __post_init__(self):
        if not self.cartons:
            raise DomainValidationError("At least one carton is required")
        if self.constraints is None:
            self.constraints = {}
        if self.preferences is None:
            self.preferences = {}


@dataclass
class OptimizationResult:
    """Result of truck optimization"""
    recommended_trucks: List[Dict[str, Any]]
    optimization_score: float
    cost_analysis: Dict[str, Any]
    space_utilization: Dict[str, Any]
    recommendations: List[str]
    metadata: Dict[str, Any]


class TruckOptimizationService(TransactionalService):
    """
    Application service for truck loading optimization
    Orchestrates domain services and repositories
    """
    
    def __init__(self, 
                 truck_repository: ITruckRepository,
                 carton_repository: ICartonRepository,
                 packing_job_repository: IPackingJobRepository,
                 packing_domain_service,
                 cost_calculation_service,
                 db=None):
        super().__init__(db, logger_name="TruckOptimizationService")
        self.truck_repository = truck_repository
        self.carton_repository = carton_repository
        self.packing_job_repository = packing_job_repository
        self.packing_domain_service = packing_domain_service
        self.cost_calculation_service = cost_calculation_service
    
    def optimize_truck_loading(self, request: OptimizationRequest) -> ServiceResult[OptimizationResult]:
        """
        Main optimization workflow
        """
        operation_name = "optimize_truck_loading"
        self._start_operation(operation_name)
        
        try:
            # Validate request
            self._validate_optimization_request(request)
            
            # Convert request data to domain entities
            carton_entities = self._convert_to_carton_entities(request.cartons)
            strategy = OptimizationStrategy.from_string(request.strategy)
            
            # Get available trucks
            truck_result = self.truck_repository.get_available_trucks()
            if not truck_result.success:
                return self._create_error_result([f"Failed to get trucks: {truck_result.error}"])
            
            available_trucks = truck_result.data
            
            # Calculate total requirements
            total_volume = sum(c.volume.cubic_meters if c.volume else 0 for c in carton_entities)
            total_weight = sum(c.weight.kilograms if c.weight else 0 for c in carton_entities)
            
            # Filter suitable trucks
            suitable_trucks = self._filter_suitable_trucks(
                available_trucks, total_volume, total_weight, request.constraints
            )
            
            if not suitable_trucks:
                return self._create_error_result(["No suitable trucks found for the given requirements"])
            
            # Optimize packing for each suitable truck
            optimization_results = []
            
            for truck in suitable_trucks:
                packing_result = self.packing_domain_service.optimize_packing(
                    truck, carton_entities, strategy
                )
                
                if packing_result.success:
                    cost_analysis = self.cost_calculation_service.calculate_total_cost(
                        truck, packing_result.data
                    )
                    
                    optimization_results.append({
                        'truck': truck,
                        'packing_result': packing_result.data,
                        'cost_analysis': cost_analysis.data if cost_analysis.success else None
                    })
            
            # Rank and select best options
            ranked_results = self._rank_optimization_results(optimization_results, strategy)
            
            # Create optimization result
            result = OptimizationResult(
                recommended_trucks=self._format_truck_recommendations(ranked_results[:5]),
                optimization_score=ranked_results[0]['score'] if ranked_results else 0.0,
                cost_analysis=self._aggregate_cost_analysis(ranked_results),
                space_utilization=self._calculate_space_utilization(ranked_results),
                recommendations=self._generate_recommendations(ranked_results, request),
                metadata={
                    'total_trucks_evaluated': len(optimization_results),
                    'strategy_used': request.strategy,
                    'timestamp': datetime.utcnow().isoformat()
                }
            )
            
            # Log business event
            business_logger.log_optimization_completed(
                carton_count=len(carton_entities),
                truck_count=len(ranked_results),
                strategy=request.strategy,
                optimization_score=result.optimization_score
            )
            
            self._end_operation(operation_name, success=True)
            return self._create_success_result(result)
            
        except DomainValidationError as e:
            return self._handle_exception(operation_name, e)
        except BusinessLogicError as e:
            return self._handle_exception(operation_name, e)
        except Exception as e:
            return self._handle_exception(operation_name, e)
    
    def get_truck_recommendations(self, cartons: List[Dict], strategy: str = "space") -> ServiceResult[List[Dict]]:
        """
        Get truck recommendations without full optimization
        """
        operation_name = "get_truck_recommendations"
        self._start_operation(operation_name)
        
        try:
            # Quick validation and calculation
            total_volume = sum(
                c.get('length', 0) * c.get('width', 0) * c.get('height', 0) / 1000000 * c.get('quantity', 1)
                for c in cartons
            )
            total_weight = sum(c.get('weight', 0) * c.get('quantity', 1) for c in cartons)
            
            # Get optimal trucks
            truck_result = self.truck_repository.get_optimal_trucks_for_cartons(total_volume, total_weight)
            if not truck_result.success:
                return self._create_error_result([f"Failed to get truck recommendations: {truck_result.error}"])
            
            recommendations = []
            for i, truck in enumerate(truck_result.data[:10]):  # Top 10 recommendations
                utilization = self._estimate_utilization(truck, total_volume, total_weight)
                
                recommendations.append({
                    'rank': i + 1,
                    'truck_id': truck.id,
                    'truck_name': truck.name,
                    'truck_category': truck.truck_category,
                    'estimated_utilization': utilization,
                    'can_fit_all': utilization['volume'] <= 100 and utilization['weight'] <= 100,
                    'cost_estimate': self._estimate_cost(truck, 100),  # 100km default
                    'capacity': {
                        'volume_m3': truck.volume.cubic_meters if truck.volume else 0,
                        'weight_kg': truck.max_weight.kilograms if truck.max_weight else 0
                    }
                })
            
            self._end_operation(operation_name, success=True)
            return self._create_success_result(recommendations)
            
        except Exception as e:
            return self._handle_exception(operation_name, e)
    
    def create_packing_job(self, job_data: Dict[str, Any]) -> ServiceResult[PackingJobEntity]:
        """
        Create a new packing job
        """
        operation_name = "create_packing_job"
        self._start_operation(operation_name)
        
        try:
            # Validate job data
            required_fields = ['name', 'truck_id', 'cartons']
            self._validate_required_fields(job_data, required_fields)
            
            # Get truck entity
            truck_result = self.truck_repository.get_by_id(job_data['truck_id'])
            if not truck_result.success:
                return self._create_error_result([f"Truck not found: {truck_result.error}"])
            
            truck = truck_result.data
            
            # Convert cartons to entities
            carton_entities = self._convert_to_carton_entities(job_data['cartons'])
            
            # Create job entity
            job_entity = PackingJobEntity(
                name=job_data['name'],
                truck=truck,
                cartons=carton_entities,
                strategy=OptimizationStrategy.from_string(job_data.get('strategy', 'space')),
                metadata=job_data.get('metadata', {})
            )
            
            # Validate job before saving
            validation_errors = job_entity.validate_for_processing()
            if validation_errors:
                return self._create_error_result(validation_errors)
            
            # Save to repository
            job_result = self.packing_job_repository.create({
                'name': job_entity.name,
                'truck_type_id': truck.id,
                'status': job_entity.status,
                'optimization_goal': str(job_entity.strategy),
                'date_created': job_entity.date_created
            })
            
            if not job_result.success:
                return self._create_error_result([f"Failed to create job: {job_result.error}"])
            
            # Update entity with ID
            job_entity.id = job_result.data.id
            
            # Log business event
            business_logger.log_packing_job_created(
                job_id=job_entity.id,
                truck_id=truck.id,
                carton_count=len(carton_entities)
            )
            
            self._end_operation(operation_name, success=True)
            return self._create_success_result(job_entity)
            
        except Exception as e:
            return self._handle_exception(operation_name, e)
    
    def _validate_optimization_request(self, request: OptimizationRequest) -> None:
        """Validate optimization request"""
        if not request.cartons:
            raise DomainValidationError("At least one carton is required")
        
        for i, carton in enumerate(request.cartons):
            if not all(k in carton for k in ['length', 'width', 'height', 'quantity']):
                raise DomainValidationError(f"Carton {i+1} missing required dimensions")
            
            if any(carton[k] <= 0 for k in ['length', 'width', 'height', 'quantity']):
                raise DomainValidationError(f"Carton {i+1} has invalid dimensions or quantity")
    
    def _convert_to_carton_entities(self, carton_data: List[Dict]) -> List[CartonEntity]:
        """Convert carton data to domain entities"""
        entities = []
        
        for carton in carton_data:
            dimensions = Dimensions(
                length=carton['length'],
                width=carton['width'],
                height=carton['height'],
                unit="cm"
            )
            
            weight = Weight(carton.get('weight', 1.0), "kg")
            
            entity = CartonEntity(
                name=carton.get('name', 'Unknown'),
                dimensions=dimensions,
                weight=weight,
                can_rotate=carton.get('can_rotate', True),
                fragile=carton.get('fragile', False),
                stackable=carton.get('stackable', True),
                priority=carton.get('priority', 1),
                category=carton.get('category', 'General')
            )
            
            # Add multiple instances based on quantity
            quantity = carton.get('quantity', 1)
            for _ in range(quantity):
                entities.append(entity)
        
        return entities
    
    def _filter_suitable_trucks(self, trucks: List[TruckEntity], 
                               total_volume: float, total_weight: float,
                               constraints: Dict[str, Any]) -> List[TruckEntity]:
        """Filter trucks that can handle the requirements"""
        suitable_trucks = []
        
        for truck in trucks:
            if not truck.is_available:
                continue
            
            # Check volume capacity
            if truck.volume and truck.volume.cubic_meters < total_volume:
                continue
            
            # Check weight capacity
            if truck.max_weight and truck.max_weight.kilograms < total_weight:
                continue
            
            # Check constraints
            if constraints.get('max_cost') and truck.cost_per_km:
                if truck.cost_per_km.amount > constraints['max_cost']:
                    continue
            
            if constraints.get('required_category'):
                if truck.truck_category != constraints['required_category']:
                    continue
            
            suitable_trucks.append(truck)
        
        return suitable_trucks
    
    def _rank_optimization_results(self, results: List[Dict], strategy: OptimizationStrategy) -> List[Dict]:
        """Rank optimization results based on strategy"""
        for result in results:
            score = self._calculate_optimization_score(result, strategy)
            result['score'] = score
        
        # Sort by score (descending)
        return sorted(results, key=lambda x: x['score'], reverse=True)
    
    def _calculate_optimization_score(self, result: Dict, strategy: OptimizationStrategy) -> float:
        """Calculate optimization score based on strategy"""
        packing_result = result['packing_result']
        cost_analysis = result['cost_analysis']
        
        if strategy == OptimizationStrategy.SPACE:
            return packing_result.space_utilization * 0.7 + packing_result.weight_utilization * 0.3
        elif strategy == OptimizationStrategy.COST:
            # Lower cost = higher score
            if cost_analysis and cost_analysis.get('total_cost'):
                cost_score = max(0, 100 - cost_analysis['total_cost'] / 100)  # Normalize
                return cost_score * 0.6 + packing_result.space_utilization * 0.4
            return packing_result.space_utilization
        elif strategy == OptimizationStrategy.BALANCED:
            space_score = (packing_result.space_utilization + packing_result.weight_utilization) / 2
            cost_score = 50  # Default if no cost data
            if cost_analysis and cost_analysis.get('total_cost'):
                cost_score = max(0, 100 - cost_analysis['total_cost'] / 100)
            return space_score * 0.5 + cost_score * 0.5
        else:
            return packing_result.space_utilization
    
    def _format_truck_recommendations(self, ranked_results: List[Dict]) -> List[Dict]:
        """Format truck recommendations for response"""
        recommendations = []
        
        for i, result in enumerate(ranked_results):
            truck = result['truck']
            packing_result = result['packing_result']
            cost_analysis = result['cost_analysis']
            
            recommendations.append({
                'rank': i + 1,
                'truck_id': truck.id,
                'truck_name': truck.name,
                'truck_category': truck.truck_category,
                'optimization_score': round(result['score'], 2),
                'space_utilization': round(packing_result.space_utilization, 2),
                'weight_utilization': round(packing_result.weight_utilization, 2),
                'packed_items_count': len(packing_result.packed_cartons),
                'estimated_cost': cost_analysis.get('total_cost') if cost_analysis else None,
                'efficiency_rating': packing_result.efficiency_rating,
                'capacity': {
                    'volume_m3': truck.volume.cubic_meters if truck.volume else 0,
                    'weight_kg': truck.max_weight.kilograms if truck.max_weight else 0
                }
            })
        
        return recommendations
    
    def _aggregate_cost_analysis(self, ranked_results: List[Dict]) -> Dict[str, Any]:
        """Aggregate cost analysis from results"""
        if not ranked_results or not ranked_results[0].get('cost_analysis'):
            return {}
        
        best_result = ranked_results[0]['cost_analysis']
        
        # Calculate cost savings vs worst option
        costs = [r.get('cost_analysis', {}).get('total_cost', 0) for r in ranked_results if r.get('cost_analysis')]
        if len(costs) > 1:
            best_cost = min(costs)
            worst_cost = max(costs)
            savings = worst_cost - best_cost
            savings_percent = (savings / worst_cost * 100) if worst_cost > 0 else 0
        else:
            savings = 0
            savings_percent = 0
        
        return {
            'best_option_cost': best_result.get('total_cost', 0),
            'potential_savings': savings,
            'savings_percentage': round(savings_percent, 2),
            'cost_breakdown': best_result.get('breakdown', {})
        }
    
    def _calculate_space_utilization(self, ranked_results: List[Dict]) -> Dict[str, Any]:
        """Calculate space utilization metrics"""
        if not ranked_results:
            return {}
        
        best_result = ranked_results[0]['packing_result']
        
        return {
            'best_space_utilization': round(best_result.space_utilization, 2),
            'best_weight_utilization': round(best_result.weight_utilization, 2),
            'wasted_space_m3': best_result.calculate_wasted_space().cubic_meters,
            'efficiency_rating': best_result.efficiency_rating
        }
    
    def _generate_recommendations(self, ranked_results: List[Dict], request: OptimizationRequest) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []
        
        if not ranked_results:
            recommendations.append("No suitable trucks found. Consider splitting the load.")
            return recommendations
        
        best_result = ranked_results[0]
        best_utilization = best_result['packing_result'].space_utilization
        
        if best_utilization < 60:
            recommendations.append("Consider using a smaller truck to improve cost efficiency.")
        elif best_utilization > 95:
            recommendations.append("Excellent space utilization achieved!")
        
        if len(ranked_results) > 1:
            cost_diff = (ranked_results[0].get('cost_analysis', {}).get('total_cost', 0) - 
                        ranked_results[1].get('cost_analysis', {}).get('total_cost', 0))
            if abs(cost_diff) > 500:  # INR 500 difference
                recommendations.append("Significant cost difference between top options. Review carefully.")
        
        # Strategy-specific recommendations
        if request.strategy == "space":
            recommendations.append("Focus on maximizing space utilization for cost efficiency.")
        elif request.strategy == "cost":
            recommendations.append("Prioritizing cost optimization over space utilization.")
        
        return recommendations
    
    def _estimate_utilization(self, truck: TruckEntity, total_volume: float, total_weight: float) -> Dict[str, float]:
        """Estimate utilization percentages"""
        volume_util = 0.0
        weight_util = 0.0
        
        if truck.volume:
            volume_util = min(100.0, (total_volume / truck.volume.cubic_meters) * 100)
        
        if truck.max_weight:
            weight_util = min(100.0, (total_weight / truck.max_weight.kilograms) * 100)
        
        return {
            'volume': round(volume_util, 2),
            'weight': round(weight_util, 2)
        }
    
    def _estimate_cost(self, truck: TruckEntity, distance_km: float) -> Optional[float]:
        """Estimate total cost for truck"""
        if not truck.cost_per_km:
            return None
        
        return float(truck.calculate_daily_operating_cost(distance_km).amount)