"""
TruckOpti - macOS System Optimizer

macOS-specific system optimizations using BSD system calls and Darwin APIs.
"""

import os
import logging
from typing import Dict, Any
from .system_optimizer import SystemOptimizer
from ..utils.platform_detector import PlatformType


class MacOSOptimizer(SystemOptimizer):
    """
    macOS-specific system optimizer.
    
    Uses macOS/BSD system calls for optimization:
    - nice/renice for process priority (Unix-compatible)
    - sysctl for system information
    - Darwin-specific APIs where available
    """
    
    def __init__(self):
        """Initialize macOS optimizer."""
        super().__init__()
        self.logger = logging.getLogger("MacOSOptimizer")
        self.logger.info(f"Initialized macOS optimizer for {self.capabilities.platform_name}")
    
    def get_platform_type(self) -> PlatformType:
        """Get platform type."""
        return PlatformType.MACOS
    
    def optimize_process_priority(self, priority_level: str = 'high') -> bool:
        """
        Set process priority using nice values (BSD-style).
        
        Args:
            priority_level: 'low' (-10), 'normal' (0), 'high' (-15), 'realtime' (-20)
            
        Returns:
            bool: True if successful
        """
        try:
            # Map priority levels to nice values
            priority_map = {
                'low': 10,
                'normal': 0,
                'high': -10,
                'realtime': -15  # macOS typically doesn't allow -20 without special permissions
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
        Optimize memory usage on macOS.
        
        Args:
            **kwargs: macOS-specific parameters
            
        Returns:
            Dict[str, Any]: Optimization results
        """
        results = {
            'success': True,
            'optimizations': []
        }
        
        try:
            import subprocess
            
            # Use vm_stat to get memory information (macOS-specific)
            result = subprocess.run(['vm_stat'], capture_output=True, text=True)
            
            if result.returncode == 0:
                vm_stat = result.stdout
                
                # Parse vm_stat output
                for line in vm_stat.split('\n'):
                    if 'Pages free' in line:
                        results['pages_free'] = int(line.split(':')[1].strip().rstrip('.'))
                    elif 'Pages active' in line:
                        results['pages_active'] = int(line.split(':')[1].strip().rstrip('.'))
                    elif 'Pages inactive' in line:
                        results['pages_inactive'] = int(line.split(':')[1].strip().rstrip('.'))
                    elif 'Pages wired down' in line:
                        results['pages_wired'] = int(line.split(':')[1].strip().rstrip('.'))
                
                # Page size is typically 4096 bytes on macOS
                page_size = 4096
                if 'pages_free' in results:
                    free_mb = (results['pages_free'] * page_size) / (1024 * 1024)
                    self.logger.info(f"Free memory: {free_mb:.2f} MB")
                
                results['optimizations'].append('memory_monitoring')
                self.optimizations_applied.append('memory_monitoring')
            
        except Exception as e:
            self.logger.warning(f"Memory optimization failed: {e}")
            results['success'] = False
            results['error'] = str(e)
        
        return results
    
    def get_system_info(self) -> Dict[str, Any]:
        """
        Get macOS-specific system information.
        
        Returns:
            Dict[str, Any]: System information
        """
        info = super().get_system_info()
        
        # Add macOS-specific information using sysctl
        try:
            import subprocess
            
            # Get CPU brand
            result = subprocess.run(
                ['sysctl', '-n', 'machdep.cpu.brand_string'],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                info['cpu_model'] = result.stdout.strip()
            
            # Get hardware model
            result = subprocess.run(
                ['sysctl', '-n', 'hw.model'],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                info['hardware_model'] = result.stdout.strip()
            
            # Get macOS version
            result = subprocess.run(
                ['sw_vers', '-productVersion'],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                info['macos_version'] = result.stdout.strip()
            
        except Exception as e:
            self.logger.debug(f"Could not read extended system info: {e}")
        
        return info
    
    def optimize_for_computational_workload(self) -> bool:
        """
        Apply macOS-specific optimizations for computational workloads.
        
        Returns:
            bool: True if successful
        """
        try:
            # On macOS, we can recommend performance mode but can't force it
            # without admin privileges
            self.logger.info("For best performance, ensure Mac is plugged in and not in Low Power Mode")
            
            # Suggest checking battery/power mode
            try:
                import subprocess
                result = subprocess.run(
                    ['pmset', '-g', 'batt'],
                    capture_output=True,
                    text=True
                )
                if 'AC Power' in result.stdout:
                    self.logger.info("System is on AC power - optimal for computations")
                else:
                    self.logger.warning("System is on battery - performance may be reduced")
            except:
                pass
            
            return True
            
        except Exception as e:
            self.logger.error(f"Computational workload optimization failed: {e}")
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
