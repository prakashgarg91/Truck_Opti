"""
TruckOpti - Algorithm Factory

Factory for creating algorithm instances with scenario configurations.
"""

from typing import Dict, Any, Optional
import logging

from .base_algorithm import BasePackingAlgorithm
from .l_aff_algorithm import LAFFAlgorithm
from .skyline_bottom_left import SkylineBottomLeftAlgorithm

try:
    from ..config.scenario_config import ScenarioConfig, ScenarioType, get_scenario_config
except ImportError:
    ScenarioConfig = None
    ScenarioType = None
    get_scenario_config = None


class AlgorithmFactory:
    """
    Factory for creating configured algorithm instances.
    
    Automatically selects and configures algorithms based on scenarios.
    """
    
    def __init__(self):
        """Initialize algorithm factory."""
        self.logger = logging.getLogger("AlgorithmFactory")
        
        # Registry of available algorithms
        self._algorithms = {
            'laff': LAFFAlgorithm,
            'skyline': SkylineBottomLeftAlgorithm
        }
    
    def create_algorithm(
        self,
        algorithm_type: str = 'laff',
        config: Optional['ScenarioConfig'] = None,
        scenario_type: Optional['ScenarioType'] = None
    ) -> BasePackingAlgorithm:
        """
        Create an algorithm instance.
        
        Args:
            algorithm_type: Algorithm type ('laff', 'skyline', etc.)
            config: Explicit scenario configuration
            scenario_type: Scenario type to load preset config (if config not provided)
            
        Returns:
            BasePackingAlgorithm: Configured algorithm instance
        """
        # Get configuration
        if config is None and scenario_type is not None and get_scenario_config:
            config = get_scenario_config(scenario_type)
            self.logger.info(f"Loaded preset config for scenario: {scenario_type.value}")
        
        # Get algorithm class
        algorithm_class = self._algorithms.get(algorithm_type)
        
        if algorithm_class is None:
            self.logger.warning(f"Unknown algorithm type: {algorithm_type}, using LAFF")
            algorithm_class = LAFFAlgorithm
        
        # Create instance with config
        algorithm = algorithm_class(config=config)
        
        self.logger.info(f"Created {algorithm.name} algorithm")
        return algorithm
    
    def create_for_scenario(self, scenario_type: 'ScenarioType') -> BasePackingAlgorithm:
        """
        Create algorithm optimized for a scenario.
        
        Args:
            scenario_type: Type of scenario
            
        Returns:
            BasePackingAlgorithm: Algorithm instance
        """
        # Different scenarios may benefit from different algorithms
        # For now, use LAFF for all, but configured differently
        
        if scenario_type == ScenarioType.DELIVERY:
            # Fast packing for delivery
            return self.create_algorithm('laff', scenario_type=scenario_type)
        elif scenario_type == ScenarioType.WAREHOUSE:
            # Optimal packing for warehouse
            return self.create_algorithm('laff', scenario_type=scenario_type)
        elif scenario_type == ScenarioType.ECOMMERCE:
            # Careful packing for e-commerce
            return self.create_algorithm('laff', scenario_type=scenario_type)
        elif scenario_type == ScenarioType.BULK_TRANSPORT:
            # Efficient packing for bulk
            return self.create_algorithm('laff', scenario_type=scenario_type)
        else:
            # Default
            return self.create_algorithm('laff')
    
    def get_available_algorithms(self) -> Dict[str, str]:
        """
        Get list of available algorithms.
        
        Returns:
            Dict[str, str]: Algorithm name to description mapping
        """
        return {
            'laff': 'Largest Area Fit First with RANSAC optimization',
            'skyline': 'Skyline Bottom Left algorithm'
        }


# Global factory instance
_algorithm_factory = None


def get_algorithm_factory() -> AlgorithmFactory:
    """
    Get global algorithm factory instance.
    
    Returns:
        AlgorithmFactory: Singleton instance
    """
    global _algorithm_factory
    
    if _algorithm_factory is None:
        _algorithm_factory = AlgorithmFactory()
    
    return _algorithm_factory


def create_algorithm_for_scenario(scenario_type: 'ScenarioType') -> BasePackingAlgorithm:
    """
    Convenience function to create algorithm for a scenario.
    
    Args:
        scenario_type: Type of scenario
        
    Returns:
        BasePackingAlgorithm: Configured algorithm
    """
    return get_algorithm_factory().create_for_scenario(scenario_type)
