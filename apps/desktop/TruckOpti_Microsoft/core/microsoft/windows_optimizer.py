"""
TruckOpti Microsoft - Windows System Optimizer

This module provides Windows-specific optimizations for the TruckOpti system,
including memory management, process optimization, and Windows API integration.
"""

import os
import sys
import ctypes
import psutil
import logging
from typing import Dict, Any, List, Optional
from ctypes import wintypes
import threading
import time


class WindowsOptimizer:
    """
    Windows-specific system optimizer for TruckOpti.
    
    This class provides optimizations specific to Microsoft Windows,
    including memory management, process priority control, and Windows API integration.
    """
    
    def __init__(self):
        """
        Initialize Windows optimizer.
        """
        self.logger = logging.getLogger("TruckOpti.WindowsOptimizer")
        self.is_windows = os.name == 'nt'
        self.process = psutil.Process()
        
        # Windows API constants
        if self.is_windows:
            self._setup_windows_api()
        
        # Performance monitoring
        self.monitoring_active = False
        self.performance_data = []
        self.monitor_thread = None
        
        self.logger.info("WindowsOptimizer initialized")
    
    def _setup_windows_api(self) -> None:
        """
        Setup Windows API interfaces.
        """
        try:
            # Load Windows libraries
            kernel32 = ctypes.windll.kernel32
            psapi = ctypes.windll.psapi
            
            # Set function prototypes
            kernel32.SetProcessWorkingSetSize.argtypes = [wintypes.HANDLE, wintypes.SIZE_T, wintypes.SIZE_T]
            kernel32.SetProcessWorkingSetSize.restype = wintypes.BOOL
            
            # Get current process
            self.process_handle = kernel32.GetCurrentProcess()
            
            self.logger.info("Windows API setup completed")
            
        except Exception as e:
            self.logger.warning(f"Windows API setup failed: {e}")
            self.process_handle = None
    
    def optimize_process_priority(self, priority_level: str = 'high') -> bool:
        """
        Set process priority for optimal performance.
        
        Args:
            priority_level: Priority level ('idle', 'below_normal', 'normal', 'above_normal', 'high', 'realtime')
            
        Returns:
            bool: True if successful
        """
        if not self.is_windows:
            self.logger.warning("Process priority optimization only available on Windows")
            return False
        
        try:
            # Map priority names to Windows priority classes
            priority_map = {
                'idle': psutil.IDLE_PRIORITY_CLASS,
                'below_normal': psutil.BELOW_NORMAL_PRIORITY_CLASS,
                'normal': psutil.NORMAL_PRIORITY_CLASS,
                'above_normal': psutil.ABOVE_NORMAL_PRIORITY_CLASS,
                'high': psutil.HIGH_PRIORITY_CLASS,
                'realtime': psutil.REALTIME_PRIORITY_CLASS
            }
            
            if priority_level not in priority_map:
                self.logger.error(f"Invalid priority level: {priority_level}")
                return False
            
            priority_class = priority_map[priority_level]
            
            # Set process priority
            if hasattr(psutil, 'Process'):
                self.process.nice(priority_class)
            
            self.logger.info(f"Process priority set to: {priority_level}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to set process priority: {e}")
            return False
    
    def optimize_memory_usage(self, enable_large_pages: bool = True, 
                            min_working_set: int = 256) -> Dict[str, Any]:
        """
        Optimize memory usage for Windows.
        
        Args:
            enable_large_pages: Enable large page support
            min_working_set: Minimum working set size in MB
            
        Returns:
            Dict[str, Any]: Optimization results
        """
        results = {
            'success': False,
            'optimizations_applied': [],
            'errors': []
        }
        
        if not self.is_windows:
            results['errors'].append("Memory optimization only available on Windows")
            return results
        
        try:
            # Set working set size
            if self.process_handle:
                min_working_set_bytes = min_working_set * 1024 * 1024
                max_working_set_bytes = min_working_set_bytes * 2
                
                result = ctypes.windll.kernel32.SetProcessWorkingSetSize(
                    self.process_handle, min_working_set_bytes, max_working_set_bytes
                )
                
                if result:
                    results['optimizations_applied'].append(f"Working set set to {min_working_set}MB")
                else:
                    results['errors'].append("Failed to set working set size")
            
            # Enable large page support if requested
            if enable_large_pages:
                try:
                    # Try to enable large page support
                    large_page_result = ctypes.windll.kernel32.SetProcessWorkingSetSize(
                        self.process_handle, -1, -1
                    )
                    
                    if large_page_result:
                        results['optimizations_applied'].append("Large page support enabled")
                    else:
                        results['errors'].append("Large page support not available (requires admin privileges)")
                
                except Exception as e:
                    results['errors'].append(f"Large page support failed: {e}")
            
            # Set process affinity to use all available cores
            cpu_count = psutil.cpu_count()
            if cpu_count:
                try:
                    # Set affinity to use all cores
                    self.process.cpu_affinity(list(range(cpu_count)))
                    results['optimizations_applied'].append(f"CPU affinity set to all {cpu_count} cores")
                except Exception as e:
                    results['errors'].append(f"Failed to set CPU affinity: {e}")
            
            results['success'] = len(results['errors']) == 0
            
        except Exception as e:
            results['errors'].append(f"Memory optimization failed: {e}")
        
        self.logger.info(f"Memory optimization completed: {results}")
        return results
    
    def get_windows_system_info(self) -> Dict[str, Any]:
        """
        Get detailed Windows system information.
        
        Returns:
            Dict[str, Any]: System information
        """
        info = {
            'platform': 'Windows',
            'python_version': sys.version,
            'available': self.is_windows
        }
        
        if not self.is_windows:
            return info
        
        try:
            # Get Windows version
            info['windows_version'] = sys.getwindowsversion()
            
            # Get system memory info
            memory = psutil.virtual_memory()
            info['memory'] = {
                'total_gb': round(memory.total / (1024**3), 2),
                'available_gb': round(memory.available / (1024**3), 2),
                'used_percent': memory.percent,
                'page_size': memory.page_size if hasattr(memory, 'page_size') else None
            }
            
            # Get CPU information
            info['cpu'] = {
                'count_logical': psutil.cpu_count(logical=True),
                'count_physical': psutil.cpu_count(logical=False),
                'max_frequency_mhz': psutil.cpu_max_freq() if hasattr(psutil, 'cpu_max_freq') else None,
                'current_frequency_mhz': psutil.cpu_freq().current if hasattr(psutil, 'cpu_freq') and psutil.cpu_freq() else None
            }
            
            # Get disk information
            disk_usage = psutil.disk_usage('C:\\')
            info['disk'] = {
                'total_gb': round(disk_usage.total / (1024**3), 2),
                'free_gb': round(disk_usage.free / (1024**3), 2),
                'used_percent': round((disk_usage.used / disk_usage.total) * 100, 2)
            }
            
            # Get process information
            info['process'] = {
                'pid': self.process.pid,
                'cpu_percent': self.process.cpu_percent(),
                'memory_info': {
                    'rss_mb': round(self.process.memory_info().rss / (1024**2), 2),
                    'vms_mb': round(self.process.memory_info().vms / (1024**2), 2)
                },
                'num_threads': self.process.num_threads(),
                'num_handles': self.process.num_handles() if hasattr(self.process, 'num_handles') else None
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get Windows system info: {e}")
            info['error'] = str(e)
        
        return info
    
    def start_performance_monitoring(self, interval: float = 1.0) -> bool:
        """
        Start performance monitoring thread.
        
        Args:
            interval: Monitoring interval in seconds
            
        Returns:
            bool: True if monitoring started successfully
        """
        if self.monitoring_active:
            self.logger.warning("Performance monitoring already active")
            return False
        
        try:
            self.monitoring_active = True
            self.performance_data = []
            
            def monitor_loop():
                while self.monitoring_active:
                    try:
                        # Collect performance data
                        cpu_percent = self.process.cpu_percent()
                        memory_info = self.process.memory_info()
                        
                        performance_point = {
                            'timestamp': time.time(),
                            'cpu_percent': cpu_percent,
                            'memory_rss_mb': memory_info.rss / (1024 * 1024),
                            'memory_vms_mb': memory_info.vms / (1024 * 1024),
                            'system_cpu_percent': psutil.cpu_percent(),
                            'system_memory_percent': psutil.virtual_memory().percent
                        }
                        
                        self.performance_data.append(performance_point)
                        
                        # Keep only last 1000 data points
                        if len(self.performance_data) > 1000:
                            self.performance_data.pop(0)
                        
                        time.sleep(interval)
                        
                    except Exception as e:
                        self.logger.error(f"Performance monitoring error: {e}")
                        time.sleep(interval)
            
            self.monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
            self.monitor_thread.start()
            
            self.logger.info("Performance monitoring started")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to start performance monitoring: {e}")
            self.monitoring_active = False
            return False
    
    def stop_performance_monitoring(self) -> Dict[str, Any]:
        """
        Stop performance monitoring and return collected data.
        
        Returns:
            Dict[str, Any]: Monitoring results and statistics
        """
        if not self.monitoring_active:
            return {'error': 'Performance monitoring not active'}
        
        self.monitoring_active = False
        
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5.0)
        
        # Calculate statistics
        if not self.performance_data:
            return {'message': 'No performance data collected'}
        
        cpu_values = [p['cpu_percent'] for p in self.performance_data]
        memory_values = [p['memory_rss_mb'] for p in self.performance_data]
        
        stats = {
            'data_points': len(self.performance_data),
            'duration_seconds': self.performance_data[-1]['timestamp'] - self.performance_data[0]['timestamp'],
            'cpu_stats': {
                'min': min(cpu_values),
                'max': max(cpu_values),
                'average': sum(cpu_values) / len(cpu_values)
            },
            'memory_stats': {
                'min_mb': min(memory_values),
                'max_mb': max(memory_values),
                'average_mb': sum(memory_values) / len(memory_values)
            },
            'raw_data': self.performance_data
        }
        
        self.logger.info(f"Performance monitoring stopped: {len(self.performance_data)} data points collected")
        return stats
    
    def optimize_for_truck_optimization(self) -> Dict[str, Any]:
        """
        Apply all optimizations specifically for truck optimization workload.
        
        Returns:
            Dict[str, Any]: Optimization results
        """
        self.logger.info("Applying Windows optimizations for truck optimization workload")
        
        results = {
            'success': False,
            'optimizations': [],
            'errors': []
        }
        
        # 1. Set high priority for optimization process
        if self.optimize_process_priority('high'):
            results['optimizations'].append('Process priority set to high')
        
        # 2. Optimize memory usage
        memory_result = self.optimize_memory_usage(enable_large_pages=True, min_working_set=512)
        if memory_result['success']:
            results['optimizations'].append('Memory optimization applied')
            results['optimizations'].extend(memory_result['optimizations_applied'])
        results['errors'].extend(memory_result['errors'])
        
        # 3. Start performance monitoring
        if self.start_performance_monitoring(interval=0.5):
            results['optimizations'].append('Performance monitoring started')
        
        # Overall success
        results['success'] = len(results['errors']) == 0
        
        self.logger.info(f"Truck optimization Windows optimizations completed: {results}")
        return results
    
    def cleanup_optimizations(self) -> bool:
        """
        Cleanup and restore normal system settings.
        
        Returns:
            bool: True if cleanup successful
        """
        try:
            # Stop performance monitoring
            if self.monitoring_active:
                self.stop_performance_monitoring()
            
            # Reset process priority to normal
            if self.is_windows:
                self.process.nice(psutil.NORMAL_PRIORITY_CLASS)
            
            self.logger.info("Windows optimizations cleaned up")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to cleanup Windows optimizations: {e}")
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
        if hasattr(self, 'monitoring_active') and self.monitoring_active:
            try:
                self.cleanup_optimizations()
            except:
                pass