"""
Optimization Controller - Truck Loading Optimization Endpoints
Clean architecture controller for optimization operations
"""

from typing import Dict, Any, List
from flask import request, render_template, jsonify

from .base import ApiController, WebController, validate_request, RequestValidation, handle_exceptions, ControllerResult
from ..application.services.truck_optimization_service import TruckOptimizationService, OptimizationRequest
from ..repositories import ITruckRepository, ICartonRepository
from ..core.container import resolve


class OptimizationController(ApiController):
    """Controller for truck optimization operations"""
    
    def __init__(self):
        super().__init__()
        self.optimization_service = resolve(TruckOptimizationService)
        self.truck_repository = resolve(ITruckRepository)
        self.carton_repository = resolve(ICartonRepository)
    
    @handle_exceptions
    @validate_request(RequestValidation(
        required_fields=['cartons'],
        optional_fields=['strategy', 'constraints', 'preferences'],
        field_types={'strategy': str},
        custom_validators={
            'cartons': lambda x: isinstance(x, list) and len(x) > 0,
            'strategy': lambda x: x in ['space', 'cost', 'weight', 'balanced', 'time']
        }
    ))
    def optimize_loading(self, validated_data: Dict[str, Any]):
        """
        Optimize truck loading for given cartons
        
        POST /api/optimization/optimize
        Body: {
            "cartons": [
                {
                    "name": "Box A",
                    "length": 30, "width": 20, "height": 15,
                    "weight": 5, "quantity": 10,
                    "fragile": false, "stackable": true
                }
            ],
            "strategy": "space",
            "constraints": {
                "max_cost": 5000,
                "required_category": "Medium"
            },
            "preferences": {
                "prefer_single_truck": true
            }
        }
        """
        self.log_action("optimize_loading", {
            'carton_count': len(validated_data['cartons']),
            'strategy': validated_data.get('strategy', 'space')
        })
        
        try:
            # Create optimization request
            optimization_request = OptimizationRequest(
                cartons=validated_data['cartons'],
                strategy=validated_data.get('strategy', 'space'),
                constraints=validated_data.get('constraints', {}),
                preferences=validated_data.get('preferences', {})
            )
            
            # Execute optimization
            result = self.optimization_service.optimize_truck_loading(optimization_request)
            
            if result.success:
                return self.create_success_response(
                    data=self._format_optimization_result(result.data),
                    message="Optimization completed successfully"
                )
            else:
                return self.create_error_response(
                    error=result.errors[0] if result.errors else "Optimization failed",
                    status_code=422
                )
                
        except Exception as e:
            self.logger.error(f"Optimization error: {str(e)}")
            return self.create_error_response(
                error="Optimization failed due to internal error",
                status_code=500
            )
    
    @handle_exceptions
    @validate_request(RequestValidation(
        required_fields=['cartons'],
        optional_fields=['strategy', 'limit'],
        field_types={'strategy': str, 'limit': int}
    ))
    def get_truck_recommendations(self, validated_data: Dict[str, Any]):
        """
        Get truck recommendations without full optimization
        
        POST /api/optimization/recommendations
        Body: {
            "cartons": [...],
            "strategy": "space",
            "limit": 5
        }
        """
        self.log_action("get_truck_recommendations", {
            'carton_count': len(validated_data['cartons']),
            'strategy': validated_data.get('strategy', 'space')
        })
        
        try:
            result = self.optimization_service.get_truck_recommendations(
                cartons=validated_data['cartons'],
                strategy=validated_data.get('strategy', 'space')
            )
            
            if result.success:
                recommendations = result.data
                limit = validated_data.get('limit', 10)
                
                return self.create_success_response(
                    data={
                        'recommendations': recommendations[:limit],
                        'total_evaluated': len(recommendations)
                    },
                    message=f"Found {len(recommendations)} truck recommendations"
                )
            else:
                return self.create_error_response(
                    error=result.errors[0] if result.errors else "Failed to get recommendations"
                )
                
        except Exception as e:
            self.logger.error(f"Recommendation error: {str(e)}")
            return self.create_error_response(
                error="Failed to get truck recommendations",
                status_code=500
            )
    
    @handle_exceptions
    @validate_request(RequestValidation(
        required_fields=['name', 'truck_id', 'cartons'],
        optional_fields=['strategy', 'metadata'],
        field_types={'truck_id': int, 'strategy': str}
    ))
    def create_packing_job(self, validated_data: Dict[str, Any]):
        """
        Create a new packing job
        
        POST /api/optimization/jobs
        """
        self.log_action("create_packing_job", {
            'job_name': validated_data['name'],
            'truck_id': validated_data['truck_id']
        })
        
        try:
            result = self.optimization_service.create_packing_job(validated_data)
            
            if result.success:
                return self.create_success_response(
                    data=self._format_packing_job(result.data),
                    message="Packing job created successfully",
                    status_code=201
                )
            else:
                return self.create_error_response(
                    error=result.errors[0] if result.errors else "Failed to create packing job"
                )
                
        except Exception as e:
            self.logger.error(f"Job creation error: {str(e)}")
            return self.create_error_response(
                error="Failed to create packing job",
                status_code=500
            )
    
    @handle_exceptions
    def get_optimization_strategies(self):
        """
        Get available optimization strategies
        
        GET /api/optimization/strategies
        """
        strategies = [
            {
                'name': 'space',
                'display_name': 'Space Utilization',
                'description': 'Maximize space utilization in trucks',
                'best_for': 'High volume, light weight items'
            },
            {
                'name': 'cost',
                'display_name': 'Cost Optimization',
                'description': 'Minimize total transportation cost',
                'best_for': 'Cost-sensitive operations'
            },
            {
                'name': 'weight',
                'display_name': 'Weight Optimization',
                'description': 'Optimize for weight distribution',
                'best_for': 'Heavy items with weight constraints'
            },
            {
                'name': 'balanced',
                'display_name': 'Balanced Approach',
                'description': 'Balance space, cost, and weight factors',
                'best_for': 'General purpose optimization'
            },
            {
                'name': 'time',
                'display_name': 'Time Optimization',
                'description': 'Minimize loading and delivery time',
                'best_for': 'Time-critical deliveries'
            }
        ]
        
        return self.create_success_response(
            data={'strategies': strategies},
            message="Available optimization strategies"
        )
    
    @handle_exceptions
    def get_optimization_constraints(self):
        """
        Get available optimization constraints
        
        GET /api/optimization/constraints
        """
        constraints = {
            'truck_constraints': {
                'max_cost': {
                    'type': 'number',
                    'description': 'Maximum cost per truck (INR)',
                    'min_value': 0
                },
                'required_category': {
                    'type': 'string',
                    'description': 'Required truck category',
                    'allowed_values': ['Light', 'Medium', 'Heavy', 'Extra Heavy']
                },
                'max_trucks': {
                    'type': 'integer',
                    'description': 'Maximum number of trucks allowed',
                    'min_value': 1,
                    'max_value': 10
                }
            },
            'carton_constraints': {
                'fragile_on_top': {
                    'type': 'boolean',
                    'description': 'Place fragile items on top',
                    'default': True
                },
                'no_rotation': {
                    'type': 'boolean',
                    'description': 'Disable carton rotation',
                    'default': False
                },
                'max_stack_height': {
                    'type': 'integer',
                    'description': 'Maximum stacking height',
                    'min_value': 1,
                    'max_value': 10,
                    'default': 5
                }
            },
            'delivery_constraints': {
                'max_distance': {
                    'type': 'number',
                    'description': 'Maximum delivery distance (km)',
                    'min_value': 0
                },
                'delivery_deadline': {
                    'type': 'datetime',
                    'description': 'Delivery deadline (ISO format)'
                }
            }
        }
        
        return self.create_success_response(
            data={'constraints': constraints},
            message="Available optimization constraints"
        )
    
    def _format_optimization_result(self, result) -> Dict[str, Any]:
        """Format optimization result for API response"""
        return {
            'recommended_trucks': result.recommended_trucks,
            'optimization_score': result.optimization_score,
            'cost_analysis': result.cost_analysis,
            'space_utilization': result.space_utilization,
            'recommendations': result.recommendations,
            'metadata': result.metadata,
            'summary': {
                'total_trucks_evaluated': result.metadata.get('total_trucks_evaluated', 0),
                'strategy_used': result.metadata.get('strategy_used', 'unknown'),
                'best_truck': result.recommended_trucks[0] if result.recommended_trucks else None,
                'potential_savings': result.cost_analysis.get('potential_savings', 0)
            }
        }
    
    def _format_packing_job(self, job_entity) -> Dict[str, Any]:
        """Format packing job entity for API response"""
        return {
            'id': job_entity.id,
            'name': job_entity.name,
            'status': job_entity.status,
            'truck': {
                'id': job_entity.truck.id,
                'name': job_entity.truck.name,
                'category': job_entity.truck.truck_category
            } if job_entity.truck else None,
            'carton_count': job_entity.total_cartons,
            'total_volume': job_entity.total_volume.cubic_meters,
            'total_weight': job_entity.total_weight.kilograms,
            'total_value': job_entity.total_value.amount,
            'strategy': str(job_entity.strategy),
            'date_created': job_entity.date_created.isoformat() if job_entity.date_created else None,
            'can_fit': job_entity.can_fit_in_truck(),
            'validation_errors': job_entity.validate_for_processing()
        }


class OptimizationWebController(WebController):
    """Web interface controller for optimization"""
    
    def __init__(self):
        super().__init__()
        self.optimization_service = resolve(TruckOptimizationService)
        self.truck_repository = resolve(ITruckRepository)
    
    @handle_exceptions
    def recommend_truck_form(self):
        """Show truck recommendation form"""
        trucks_result = self.truck_repository.get_available_trucks()
        cartons_result = self.carton_repository.get_all()
        
        trucks = trucks_result.data if trucks_result.success else []
        cartons = cartons_result.data.items if cartons_result.success else []
        
        return self.render_with_context(
            'recommend_truck.html',
            trucks=trucks,
            cartons=cartons,
            strategies=[
                {'value': 'space', 'name': 'Space Utilization'},
                {'value': 'cost', 'name': 'Cost Optimization'},
                {'value': 'balanced', 'name': 'Balanced Approach'}
            ]
        )
    
    @handle_exceptions
    def process_truck_recommendation(self):
        """Process truck recommendation form submission"""
        if request.method == 'GET':
            return self.recommend_truck_form()
        
        form_data = self.get_request_data()
        
        try:
            # Build carton list from form data
            cartons = []
            i = 1
            while f'carton_type_{i}' in form_data and f'carton_qty_{i}' in form_data:
                carton_type_id = int(form_data[f'carton_type_{i}'])
                quantity = int(form_data[f'carton_qty_{i}'])
                
                if quantity > 0:
                    # Get carton details from repository
                    carton_result = self.carton_repository.get_by_id(carton_type_id)
                    if carton_result.success:
                        carton = carton_result.data
                        cartons.append({
                            'name': carton.name,
                            'length': carton.dimensions.length,
                            'width': carton.dimensions.width,
                            'height': carton.dimensions.height,
                            'weight': carton.weight.kilograms,
                            'quantity': quantity
                        })
                i += 1
            
            if not cartons:
                self.flash_message("Please select at least one carton type", 'error')
                return self.recommend_truck_form()
            
            # Get recommendations
            result = self.optimization_service.get_truck_recommendations(
                cartons=cartons,
                strategy=form_data.get('optimization_goal', 'space')
            )
            
            if result.success:
                return self.render_with_context(
                    'packing_result.html',
                    recommendations=result.data[:5],  # Top 5 recommendations
                    cartons=cartons,
                    strategy=form_data.get('optimization_goal', 'space'),
                    total_cartons=sum(c['quantity'] for c in cartons)
                )
            else:
                self.flash_message(f"Optimization failed: {result.errors[0]}", 'error')
                return self.recommend_truck_form()
                
        except Exception as e:
            self.logger.error(f"Form processing error: {str(e)}")
            self.flash_message("An error occurred while processing your request", 'error')
            return self.recommend_truck_form()
    
    @handle_exceptions  
    def optimization_history(self):
        """Show optimization history"""
        # Get pagination parameters
        pagination = self.get_pagination_params()
        
        # For now, return empty history - implement when job tracking is added
        return self.render_with_context(
            'optimization_history.html',
            jobs=[],
            pagination={
                'page': pagination['page'],
                'total_pages': 0,
                'has_prev': False,
                'has_next': False
            }
        )