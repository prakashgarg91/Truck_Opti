"""
TruckOpti - Platform Detection Utility

Detects platform capabilities and system resources for cross-platform optimization.
"""

import platform
import os
import sys
import psutil
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class PlatformType(Enum):
    """Supported platform types."""
    WINDOWS = "windows"
    LINUX = "linux"
    MACOS = "macos"
    UNKNOWN = "unknown"


@dataclass
class PlatformCapabilities:
    """Platform capabilities and resources."""
    platform_type: PlatformType
    platform_name: str
    platform_version: str
    cpu_count: int
    cpu_count_physical: int
    total_memory_gb: float
    available_memory_gb: float
    python_version: str
    is_64bit: bool
    supports_threading: bool
    supports_multiprocessing: bool
    
    # Platform-specific features
    supports_process_priority: bool
    supports_memory_optimization: bool
    supports_numa: bool


class PlatformDetector:
    """
    Detects platform type and capabilities.
    
    Provides comprehensive platform information for optimizing 3D bin packing
    algorithms across different operating systems.
    """
    
    def __init__(self):
        """Initialize platform detector."""
        self._capabilities: Optional[PlatformCapabilities] = None
    
    def detect_platform_type(self) -> PlatformType:
        """
        Detect the current platform type.
        
        Returns:
            PlatformType: Detected platform
        """
        system = platform.system().lower()
        
        if system == "windows":
            return PlatformType.WINDOWS
        elif system == "linux":
            return PlatformType.LINUX
        elif system == "darwin":
            return PlatformType.MACOS
        else:
            return PlatformType.UNKNOWN
    
    def get_capabilities(self) -> PlatformCapabilities:
        """
        Get comprehensive platform capabilities.
        
        Returns:
            PlatformCapabilities: Platform information and capabilities
        """
        if self._capabilities is None:
            self._capabilities = self._detect_capabilities()
        
        return self._capabilities
    
    def _detect_capabilities(self) -> PlatformCapabilities:
        """
        Detect all platform capabilities.
        
        Returns:
            PlatformCapabilities: Detected capabilities
        """
        platform_type = self.detect_platform_type()
        
        # Basic system info
        platform_name = platform.system()
        platform_version = platform.release()
        
        # CPU information
        cpu_count = psutil.cpu_count(logical=True) or 1
        cpu_count_physical = psutil.cpu_count(logical=False) or 1
        
        # Memory information
        memory = psutil.virtual_memory()
        total_memory_gb = memory.total / (1024 ** 3)
        available_memory_gb = memory.available / (1024 ** 3)
        
        # Python information
        python_version = sys.version.split()[0]
        is_64bit = sys.maxsize > 2**32
        
        # Threading and multiprocessing support
        supports_threading = True  # Python always supports threading
        supports_multiprocessing = True  # Modern Python always supports multiprocessing
        
        # Platform-specific features
        supports_process_priority = self._check_process_priority_support(platform_type)
        supports_memory_optimization = self._check_memory_optimization_support(platform_type)
        supports_numa = self._check_numa_support(platform_type)
        
        return PlatformCapabilities(
            platform_type=platform_type,
            platform_name=platform_name,
            platform_version=platform_version,
            cpu_count=cpu_count,
            cpu_count_physical=cpu_count_physical,
            total_memory_gb=total_memory_gb,
            available_memory_gb=available_memory_gb,
            python_version=python_version,
            is_64bit=is_64bit,
            supports_threading=supports_threading,
            supports_multiprocessing=supports_multiprocessing,
            supports_process_priority=supports_process_priority,
            supports_memory_optimization=supports_memory_optimization,
            supports_numa=supports_numa
        )
    
    def _check_process_priority_support(self, platform_type: PlatformType) -> bool:
        """
        Check if platform supports process priority modification.
        
        Args:
            platform_type: Platform type
            
        Returns:
            bool: True if supported
        """
        if platform_type == PlatformType.WINDOWS:
            try:
                import ctypes
                return True
            except ImportError:
                return False
        elif platform_type in (PlatformType.LINUX, PlatformType.MACOS):
            # Unix-like systems support nice/renice
            return True
        
        return False
    
    def _check_memory_optimization_support(self, platform_type: PlatformType) -> bool:
        """
        Check if platform supports memory optimization.
        
        Args:
            platform_type: Platform type
            
        Returns:
            bool: True if supported
        """
        # All modern platforms support some form of memory optimization
        return platform_type in (PlatformType.WINDOWS, PlatformType.LINUX, PlatformType.MACOS)
    
    def _check_numa_support(self, platform_type: PlatformType) -> bool:
        """
        Check if platform supports NUMA (Non-Uniform Memory Access).
        
        Args:
            platform_type: Platform type
            
        Returns:
            bool: True if NUMA is available
        """
        if platform_type == PlatformType.LINUX:
            # Check if numactl is available on Linux
            return os.path.exists("/usr/bin/numactl")
        elif platform_type == PlatformType.WINDOWS:
            # Windows supports NUMA on server editions
            # For simplicity, assume it's available but will fail gracefully if not
            return True
        
        return False
    
    def get_optimal_worker_count(self, overhead_factor: float = 1.5) -> int:
        """
        Get optimal number of worker threads/processes for parallel operations.
        
        Args:
            overhead_factor: Factor to account for overhead (default 1.5)
            
        Returns:
            int: Recommended worker count
        """
        capabilities = self.get_capabilities()
        
        # Use physical cores for CPU-bound tasks
        # Add some overhead for I/O operations
        optimal = max(1, int(capabilities.cpu_count_physical / overhead_factor))
        
        # Ensure at least 1 worker, max equal to logical cores
        return min(max(1, optimal), capabilities.cpu_count)
    
    def get_platform_info_dict(self) -> Dict[str, Any]:
        """
        Get platform information as dictionary.
        
        Returns:
            Dict[str, Any]: Platform information
        """
        capabilities = self.get_capabilities()
        
        return {
            'platform_type': capabilities.platform_type.value,
            'platform_name': capabilities.platform_name,
            'platform_version': capabilities.platform_version,
            'cpu_count': capabilities.cpu_count,
            'cpu_count_physical': capabilities.cpu_count_physical,
            'total_memory_gb': round(capabilities.total_memory_gb, 2),
            'available_memory_gb': round(capabilities.available_memory_gb, 2),
            'python_version': capabilities.python_version,
            'is_64bit': capabilities.is_64bit,
            'supports_threading': capabilities.supports_threading,
            'supports_multiprocessing': capabilities.supports_multiprocessing,
            'supports_process_priority': capabilities.supports_process_priority,
            'supports_memory_optimization': capabilities.supports_memory_optimization,
            'supports_numa': capabilities.supports_numa,
            'optimal_worker_count': self.get_optimal_worker_count()
        }


# Global singleton instance
_platform_detector = None


def get_platform_detector() -> PlatformDetector:
    """
    Get global platform detector instance.
    
    Returns:
        PlatformDetector: Singleton instance
    """
    global _platform_detector
    
    if _platform_detector is None:
        _platform_detector = PlatformDetector()
    
    return _platform_detector


# Convenience functions
def get_platform_type() -> PlatformType:
    """Get current platform type."""
    return get_platform_detector().detect_platform_type()


def get_platform_capabilities() -> PlatformCapabilities:
    """Get current platform capabilities."""
    return get_platform_detector().get_capabilities()


def get_optimal_worker_count() -> int:
    """Get optimal worker count for current platform."""
    return get_platform_detector().get_optimal_worker_count()
