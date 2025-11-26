"""
TruckOpti Utilities Package
"""

from .platform_detector import (
    PlatformDetector,
    PlatformType,
    PlatformCapabilities,
    get_platform_detector,
    get_platform_type,
    get_platform_capabilities,
    get_optimal_worker_count
)

__all__ = [
    'PlatformDetector',
    'PlatformType',
    'PlatformCapabilities',
    'get_platform_detector',
    'get_platform_type',
    'get_platform_capabilities',
    'get_optimal_worker_count'
]
