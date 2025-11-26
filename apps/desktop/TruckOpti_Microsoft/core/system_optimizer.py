"""
TruckOpti - Base System Optimizer

Abstract base class for platform-specific system optimizations.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging
import psutil
from ..utils.platform_detector import PlatformType, get_platform_capabilities


class SystemOptimizer(ABC):
    """
    Abstract base class for platform-specific system optimizations.
    
    Provides common interface and shared functionality for optimizing
    system resources across different platforms.
    """
    
    def __init__(self):
        """Initialize base system optimizer."""
        self.logger = logging.getLogger(self.__class__.__name__)
        self.capabilities = get_platform_capabilities()
        self.optimizations_applied = []
        self.original_settings = {}
        
    @abstractmethod
    def get_platform_type(self) -> PlatformType:
        """
        Get the platform type this optimizer handles.
        
        Returns:
            PlatformType: Platform type
        """
        pass
    
    @abstractmethod
    def optimize_process_priority(self, priority_level: str = 'high') -> bool:
        """
        Set process priority for optimal performance.
        
        Args:
            priority_level: Priority level (platform-specific values)
            
        Returns:
            bool: True if successful
        """
        pass
    
    @abstractmethod
    def optimize_memory_usage(self, **kwargs) -> Dict[str, Any]:
        """
        Optimize memory usage for the platform.
        
        Args:
            **kwargs: Platform-specific parameters
            
        Returns:
            Dict[str, Any]: Optimization results
        """
        pass
    
    def get_system_info(self) -> Dict[str, Any]:
        """
        Get system information (common across platforms).
        
        Returns:
            Dict[str, Any]: System information
        """
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        return {
            'platform': self.capabilities.platform_name,
            'platform_version': self.capabilities.platform_version,
            'cpu_count': self.capabilities.cpu_count,
            'cpu_count_physical': self.capabilities.cpu_count_physical,
            'cpu_percent': cpu_percent,
            'total_memory_gb': round(self.capabilities.total_memory_gb, 2),
            'available_memory_gb': round(self.capabilities.available_memory_gb, 2),
            'memory_percent': memory.percent,
            'python_version': self.capabilities.python_version,
            'is_64bit': self.capabilities.is_64bit
        }
    
    def start_performance_monitoring(self, interval: float = 1.0) -> bool:
        """
        Start performance monitoring (common implementation).
        
        Args:
            interval: Monitoring interval in seconds
            
        Returns:
            bool: True if monitoring started successfully
        """
        self.logger.info(f"Performance monitoring started with {interval}s interval")
        # Subclasses can override for platform-specific monitoring
        return True
    
    def stop_performance_monitoring(self) -> Dict[str, Any]:
        """
        Stop performance monitoring and return collected data.
        
        Returns:
            Dict[str, Any]: Monitoring results
        """
        self.logger.info("Performance monitoring stopped")
        # Subclasses can override for platform-specific results
        return {
            'monitoring_supported': False,
            'message': 'Basic monitoring only'
        }
    
    def optimize_for_truck_optimization(self) -> Dict[str, Any]:
        """
        Apply all optimizations for truck optimization workload.
        
        This is a template method that calls platform-specific optimizations.
        
        Returns:
            Dict[str, Any]: Optimization results
        """
        results = {
            'platform': self.get_platform_type().value,
            'optimizations': [],
            'success': True
        }
        
        try:
            # Attempt process priority optimization
            if self.capabilities.supports_process_priority:
                if self.optimize_process_priority('high'):
                    results['optimizations'].append('process_priority')
                    self.logger.info("Process priority optimized")
            
            # Attempt memory optimization
            if self.capabilities.supports_memory_optimization:
                memory_result = self.optimize_memory_usage()
                if memory_result.get('success', False):
                    results['optimizations'].append('memory_usage')
                    self.logger.info("Memory usage optimized")
            
            self.logger.info(f"Applied {len(results['optimizations'])} optimizations")
            
        except Exception as e:
            self.logger.warning(f"Some optimizations failed: {e}")
            results['success'] = False
            results['error'] = str(e)
        
        return results
    
    def cleanup_optimizations(self) -> bool:
        """
        Cleanup and restore normal system settings.
        
        Returns:
            bool: True if cleanup successful
        """
        try:
            # Restore original settings if any were saved
            if self.original_settings:
                self.logger.info("Restoring original system settings")
                # Subclasses should override to restore specific settings
            
            self.optimizations_applied.clear()
            return True
            
        except Exception as e:
            self.logger.error(f"Cleanup failed: {e}")
            return False
    
    def __enter__(self):
        """Context manager entry."""
        self.optimize_for_truck_optimization()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.cleanup_optimizations()
    
    def __del__(self):
        """Destructor."""
        try:
            self.cleanup_optimizations()
        except:
            pass


def create_system_optimizer() -> SystemOptimizer:
    """
    Factory function to create platform-appropriate system optimizer.
    
    Returns:
        SystemOptimizer: Platform-specific optimizer instance
    """
    from ..utils.platform_detector import get_platform_type
    
    platform_type = get_platform_type()
    
    if platform_type == PlatformType.WINDOWS:
        from .windows_optimizer import WindowsOptimizer
        return WindowsOptimizer()
    elif platform_type == PlatformType.LINUX:
        from .linux_optimizer import LinuxOptimizer
        return LinuxOptimizer()
    elif platform_type == PlatformType.MACOS:
        from .macos_optimizer import MacOSOptimizer
        return MacOSOptimizer()
    else:
        # Fallback to a no-op optimizer
        return NoOpOptimizer()


class NoOpOptimizer(SystemOptimizer):
    """
    No-operation optimizer for unsupported platforms.
    
    Provides graceful degradation when platform isn't recognized.
    """
    
    def get_platform_type(self) -> PlatformType:
        """Get platform type."""
        return PlatformType.UNKNOWN
    
    def optimize_process_priority(self, priority_level: str = 'high') -> bool:
        """No-op priority optimization."""
        self.logger.warning("Process priority optimization not supported on this platform")
        return False
    
    def optimize_memory_usage(self, **kwargs) -> Dict[str, Any]:
        """No-op memory optimization."""
        self.logger.warning("Memory optimization not supported on this platform")
        return {
            'success': False,
            'message': 'Platform not supported'
        }
