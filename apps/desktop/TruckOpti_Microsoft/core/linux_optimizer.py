"""
TruckOpti - Linux System Optimizer

Linux-specific system optimizations using nice, ionice, and /proc filesystem.
"""

import os
import logging
from typing import Dict, Any
from .system_optimizer import SystemOptimizer
from ..utils.platform_detector import PlatformType


class LinuxOptimizer(SystemOptimizer):
    """
    Linux-specific system optimizer.
    
    Uses Linux system calls and utilities for optimization:
    - nice/renice for process priority
    - /proc filesystem for memory info
    - ionice for I/O priority (if available)
    """
    
    def __init__(self):
        """Initialize Linux optimizer."""
        super().__init__()
        self.logger = logging.getLogger("LinuxOptimizer")
        self.logger.info(f"Initialized Linux optimizer for {self.capabilities.platform_name}")
    
    def get_platform_type(self) -> PlatformType:
        """Get platform type."""
        return PlatformType.LINUX
    
    def optimize_process_priority(self, priority_level: str = 'high') -> bool:
        """
        Set process priority using nice values.
        
        Args:
            priority_level: 'low' (-10), 'normal' (0), 'high' (-15), 'realtime' (-20)
            
        Returns:
            bool: True if successful
        """
        try:
            # Map priority levels to nice values (lower nice = higher priority)
            priority_map = {
                'low': 10,
                'normal': 0,
                'high': -10,
                'realtime': -15  # Be conservative, -20 requires root
            }
            
            nice_value = priority_map.get(priority_level, 0)
            
            # Save original priority
            if 'nice_value' not in self.original_settings:
                self.original_settings['nice_value'] = os.nice(0)
            
            # Set new priority
            try:
                os.nice(nice_value)
                self.logger.info(f"Set process nice value to {nice_value}")
                self.optimizations_applied.append('process_priority')
                return True
            except PermissionError:
                self.logger.warning(f"Insufficient permissions to set nice value to {nice_value}")
                # Try a more conservative value
                try:
                    os.nice(-5)
                    self.logger.info("Set process nice value to -5 (fallback)")
                    self.optimizations_applied.append('process_priority_limited')
                    return True
                except:
                    return False
                    
        except Exception as e:
            self.logger.error(f"Failed to optimize process priority: {e}")
            return False
    
    def optimize_memory_usage(self, **kwargs) -> Dict[str, Any]:
        """
        Optimize memory usage on Linux.
        
        Args:
            **kwargs: Linux-specific parameters (currently unused)
            
        Returns:
            Dict[str, Any]: Optimization results
        """
        results = {
            'success': True,
            'optimizations': []
        }
        
        try:
            # Read memory information from /proc
            with open('/proc/meminfo', 'r') as f:
                meminfo = f.read()
            
            # Extract key memory metrics
            for line in meminfo.split('\n'):
                if 'MemTotal' in line:
                    results['total_memory_kb'] = int(line.split()[1])
                elif 'MemAvailable' in line:
                    results['available_memory_kb'] = int(line.split()[1])
                elif 'SwapTotal' in line:
                    results['swap_total_kb'] = int(line.split()[1])
            
            # Log memory information
            self.logger.info(f"Memory available: {results.get('available_memory_kb', 0) / 1024:.2f} MB")
            
            # Note: Actual memory optimization on Linux typically requires
            # kernel parameters (sysctl) which require root access
            # We're doing read-only monitoring here
            
            results['optimizations'].append('memory_monitoring')
            self.optimizations_applied.append('memory_monitoring')
            
        except Exception as e:
            self.logger.warning(f"Memory optimization failed: {e}")
            results['success'] = False
            results['error'] = str(e)
        
        return results
    
    def get_system_info(self) -> Dict[str, Any]:
        """
        Get Linux-specific system information.
        
        Returns:
            Dict[str, Any]: System information
        """
        info = super().get_system_info()
        
        # Add Linux-specific information
        try:
            # Read CPU info
            with open('/proc/cpuinfo', 'r') as f:
                cpuinfo = f.read()
            
            # Extract model name
            for line in cpuinfo.split('\n'):
                if 'model name' in line:
                    info['cpu_model'] = line.split(':')[1].strip()
                    break
            
            # Load averages
            with open('/proc/loadavg', 'r') as f:
                loadavg = f.read().split()
            info['load_average_1min'] = float(loadavg[0])
            info['load_average_5min'] = float(loadavg[1])
            info['load_average_15min'] = float(loadavg[2])
            
        except Exception as e:
            self.logger.debug(f"Could not read extended system info: {e}")
        
        return info
    
    def set_io_priority(self, priority_class: str = 'best-effort', priority_level: int = 0) -> bool:
        """
        Set I/O priority using ionice (if available).
        
        Args:
            priority_class: 'idle', 'best-effort', 'realtime'
            priority_level: 0-7 (0 is highest)
            
        Returns:
            bool: True if successful
        """
        try:
            import subprocess
            
            # Map priority classes
            class_map = {
                'idle': '3',
                'best-effort': '2',
                'realtime': '1'
            }
            
            class_value = class_map.get(priority_class, '2')
            
            # Try to set I/O priority using ionice
            result = subprocess.run(
                ['ionice', '-c', class_value, '-n', str(priority_level), '-p', str(os.getpid())],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                self.logger.info(f"Set I/O priority to class {priority_class}, level {priority_level}")
                self.optimizations_applied.append('io_priority')
                return True
            else:
                self.logger.warning(f"ionice failed: {result.stderr}")
                return False
                
        except FileNotFoundError:
            self.logger.debug("ionice not available on this system")
            return False
        except Exception as e:
            self.logger.error(f"Failed to set I/O priority: {e}")
            return False
    
    def cleanup_optimizations(self) -> bool:
        """
        Cleanup and restore normal system settings.
        
        Returns:
            bool: True if cleanup successful
        """
        try:
            # Restore nice value if it was changed
            if 'nice_value' in self.original_settings:
                try:
                    original = self.original_settings['nice_value']
                    current = os.nice(0)
                    # Reset to original (approximate, as nice is cumulative)
                    if current != original:
                        os.nice(original - current)
                    self.logger.info("Restored original process priority")
                except Exception as e:
                    self.logger.warning(f"Could not fully restore priority: {e}")
            
            return super().cleanup_optimizations()
            
        except Exception as e:
            self.logger.error(f"Cleanup failed: {e}")
            return False
