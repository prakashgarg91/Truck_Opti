"""
TruckOpti - Scenario Configuration System

Defines packing scenario presets and configuration management for different use cases.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional
from enum import Enum
import json
import os


class ScenarioType(Enum):
    """Predefined scenario types."""
    WAREHOUSE = "warehouse"
    DELIVERY = "delivery"
    ECOMMERCE = "e-commerce"
    BULK_TRANSPORT = "bulk_transport"
    CUSTOM = "custom"


@dataclass
class OptimizationWeights:
    """Weights for multi-objective optimization."""
    space_utilization: float = 1.0      # Weight for space efficiency
    stability: float = 1.0              # Weight for load stability
    packing_speed: float = 0.5          # Weight for computation speed
    accessibility: float = 0.5          # Weight for easy unloading
    cost_efficiency: float = 0.7        # Weight for cost optimization
    weight_distribution: float = 0.8    # Weight for balanced weight


@dataclass
class AlgorithmParameters:
    """Algorithm-specific configuration parameters."""
    # RANSAC parameters
    ransac_iterations: int = 100
    optimization_passes: int = 3
    
    # Parallel processing
    parallel_workers: Optional[int] = None  # None = auto-detect
    
    # Grid search
    grid_size_factor: float = 0.25  # Fraction of smallest carton dimension
    max_search_positions: int = 50
    
    # Stability thresholds
    min_stability_score: float = 60.0
    min_support_percentage: float = 0.7
    
    # Constraints
    max_handling_difficulty: float = 80.0
    fragile_priority_boost: float = 20.0


@dataclass
class ScenarioConfig:
    """
    Complete scenario configuration.
    
    Defines all parameters for a specific packing scenario.
    """
    name: str
    scenario_type: ScenarioType
    description: str
    
    # Optimization weights
    weights: OptimizationWeights = field(default_factory=OptimizationWeights)
    
    # Algorithm parameters
    algorithm_params: AlgorithmParameters = field(default_factory=AlgorithmParameters)
    
    # Scenario-specific constraints
    constraints: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            'name': self.name,
            'scenario_type': self.scenario_type.value,
            'description': self.description,
            'weights': {
                'space_utilization': self.weights.space_utilization,
                'stability': self.weights.stability,
                'packing_speed': self.weights.packing_speed,
                'accessibility': self.weights.accessibility,
                'cost_efficiency': self.weights.cost_efficiency,
                'weight_distribution': self.weights.weight_distribution
            },
            'algorithm_params': {
                'ransac_iterations': self.algorithm_params.ransac_iterations,
                'optimization_passes': self.algorithm_params.optimization_passes,
                'parallel_workers': self.algorithm_params.parallel_workers,
                'grid_size_factor': self.algorithm_params.grid_size_factor,
                'max_search_positions': self.algorithm_params.max_search_positions,
                'min_stability_score': self.algorithm_params.min_stability_score,
                'min_support_percentage': self.algorithm_params.min_support_percentage,
                'max_handling_difficulty': self.algorithm_params.max_handling_difficulty,
                'fragile_priority_boost': self.algorithm_params.fragile_priority_boost
            },
            'constraints': self.constraints
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ScenarioConfig':
        """Create configuration from dictionary."""
        weights = OptimizationWeights(**data.get('weights', {}))
        algorithm_params = AlgorithmParameters(**data.get('algorithm_params', {}))
        
        return cls(
            name=data['name'],
            scenario_type=ScenarioType(data['scenario_type']),
            description=data['description'],
            weights=weights,
            algorithm_params=algorithm_params,
            constraints=data.get('constraints', {})
        )


class ScenarioConfigManager:
    """
    Manages scenario configurations and presets.
    """
    
    def __init__(self):
        """Initialize scenario config manager."""
        self._presets: Dict[str, ScenarioConfig] = {}
        self._load_default_presets()
    
    def _load_default_presets(self):
        """Load default scenario presets."""
        # Warehouse Scenario: Maximize space, prioritize stability
        warehouse = ScenarioConfig(
            name="Warehouse Storage",
            scenario_type=ScenarioType.WAREHOUSE,
            description="Maximize space utilization for long-term storage. High stability priority.",
            weights=OptimizationWeights(
                space_utilization=1.5,
                stability=1.3,
                packing_speed=0.3,
                accessibility=0.4,
                cost_efficiency=0.8,
                weight_distribution=1.2
            ),
            algorithm_params=AlgorithmParameters(
                ransac_iterations=150,
                optimization_passes=4,
                grid_size_factor=0.2,
                min_stability_score=75.0,
                min_support_percentage=0.8
            )
        )
        
        # Delivery Scenario: Fast packing, easy unloading
        delivery = ScenarioConfig(
            name="Delivery Route",
            scenario_type=ScenarioType.DELIVERY,
            description="Fast packing with easy unloading. Accessibility prioritized.",
            weights=OptimizationWeights(
                space_utilization=0.8,
                stability=1.0,
                packing_speed=1.5,
                accessibility=1.4,
                cost_efficiency=0.9,
                weight_distribution=0.9
            ),
            algorithm_params=AlgorithmParameters(
                ransac_iterations=50,
                optimization_passes=2,
                grid_size_factor=0.35,
                max_search_positions=30,
                min_stability_score=65.0,
                max_handling_difficulty=60.0
            )
        )
        
        # E-commerce Scenario: Mixed sizes, fragile handling
        ecommerce = ScenarioConfig(
            name="E-Commerce Fulfillment",
            scenario_type=ScenarioType.ECOMMERCE,
            description="Handle diverse package sizes with focus on fragile items.",
            weights=OptimizationWeights(
                space_utilization=1.0,
                stability=1.4,
                packing_speed=0.7,
                accessibility=1.0,
                cost_efficiency=1.0,
                weight_distribution=1.1
            ),
            algorithm_params=AlgorithmParameters(
                ransac_iterations=100,
                optimization_passes=3,
                grid_size_factor=0.25,
                min_stability_score=70.0,
                min_support_percentage=0.75,
                max_handling_difficulty=70.0,
                fragile_priority_boost=30.0
            ),
            constraints={
                'fragile_on_top': True,
                'group_similar_sizes': True
            }
        )
        
        # Bulk Transport Scenario: Uniform items, weight distribution critical
        bulk = ScenarioConfig(
            name="Bulk Transport",
            scenario_type=ScenarioType.BULK_TRANSPORT,
            description="Uniform items with critical weight distribution.",
            weights=OptimizationWeights(
                space_utilization=1.3,
                stability=1.1,
                packing_speed=0.6,
                accessibility=0.5,
                cost_efficiency=1.2,
                weight_distribution=1.5
            ),
            algorithm_params=AlgorithmParameters(
                ransac_iterations=80,
                optimization_passes=3,
                grid_size_factor=0.3,
                min_stability_score=70.0,
                min_support_percentage=0.7
            ),
            constraints={
                'enforce_weight_balance': True,
                'max_weight_deviation': 0.15
            }
        )
        
        # Register presets
        self._presets[ScenarioType.WAREHOUSE.value] = warehouse
        self._presets[ScenarioType.DELIVERY.value] = delivery
        self._presets[ScenarioType.ECOMMERCE.value] = ecommerce
        self._presets[ScenarioType.BULK_TRANSPORT.value] = bulk
    
    def get_preset(self, scenario_type: ScenarioType) -> ScenarioConfig:
        """
        Get a preset configuration.
        
        Args:
            scenario_type: Type of scenario
            
        Returns:
            ScenarioConfig: Preset configuration
        """
        return self._presets.get(scenario_type.value)
    
    def get_all_presets(self) -> Dict[str, ScenarioConfig]:
        """
        Get all preset configurations.
        
        Returns:
            Dict[str, ScenarioConfig]: All presets
        """
        return self._presets.copy()
    
    def create_custom_config(
        self,
        name: str,
        description: str,
        base_preset: Optional[ScenarioType] = None,
        **overrides
    ) -> ScenarioConfig:
        """
        Create a custom configuration.
        
        Args:
            name: Configuration name
            description: Configuration description
            base_preset: Base preset to start from (optional)
            **overrides: Parameters to override
            
        Returns:
            ScenarioConfig: Custom configuration
        """
        if base_preset:
            # Start with preset and override
            base_config = self.get_preset(base_preset)
            config_dict = base_config.to_dict()
            config_dict['name'] = name
            config_dict['description'] = description
            config_dict['scenario_type'] = ScenarioType.CUSTOM.value
            
            # Apply overrides
            if 'weights' in overrides:
                config_dict['weights'].update(overrides['weights'])
            if 'algorithm_params' in overrides:
                config_dict['algorithm_params'].update(overrides['algorithm_params'])
            if 'constraints' in overrides:
                config_dict['constraints'].update(overrides['constraints'])
            
            return ScenarioConfig.from_dict(config_dict)
        else:
            # Create from scratch
            return ScenarioConfig(
                name=name,
                scenario_type=ScenarioType.CUSTOM,
                description=description,
                **overrides
            )
    
    def save_config(self, config: ScenarioConfig, filepath: str):
        """
        Save configuration to JSON file.
        
        Args:
            config: Configuration to save
            filepath: File path
        """
        with open(filepath, 'w') as f:
            json.dump(config.to_dict(), f, indent=2)
    
    def load_config(self, filepath: str) -> ScenarioConfig:
        """
        Load configuration from JSON file.
        
        Args:
            filepath: File path
            
        Returns:
            ScenarioConfig: Loaded configuration
        """
        with open(filepath, 'r') as f:
            data = json.load(f)
        return ScenarioConfig.from_dict(data)


# Global singleton
_config_manager = None


def get_config_manager() -> ScenarioConfigManager:
    """
    Get global configuration manager instance.
    
    Returns:
        ScenarioConfigManager: Singleton instance
    """
    global _config_manager
    
    if _config_manager is None:
        _config_manager = ScenarioConfigManager()
    
    return _config_manager


def get_scenario_config(scenario_type: ScenarioType) -> ScenarioConfig:
    """
    Convenience function to get a scenario configuration.
    
    Args:
        scenario_type: Type of scenario
        
    Returns:
        ScenarioConfig: Configuration for scenario
    """
    return get_config_manager().get_preset(scenario_type)
