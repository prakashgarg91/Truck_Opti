"""
TruckOpti Startup Profiler - Deep Performance Analysis
Identifies exact bottlenecks during application startup and initialization
"""

import time
import psutil
import sys
import os
import threading
import traceback
from datetime import datetime
from typing import Dict, List, Any, Optional
import json

class StartupProfiler:
    def __init__(self, log_file="startup_profile.log"):
        self.start_time = time.time()
        self.checkpoints = []
        self.memory_usage = []
        self.cpu_usage = []
        self.import_times = {}
        self.initialization_times = {}
        self.error_log = []
        
        # Create profiling directory
        self.profile_dir = self._get_profile_directory()
        os.makedirs(self.profile_dir, exist_ok=True)
        
        self.log_file = os.path.join(self.profile_dir, log_file)
        self.session_id = f"PROFILE_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Start resource monitoring
        self._start_resource_monitoring()
        
        self.log_checkpoint("PROFILER_INITIALIZED", "Startup profiler initialized")
    
    def _get_profile_directory(self):
        """Get appropriate profiling directory"""
        if hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS'):
            # Executable mode - profile in same directory as exe
            return os.path.dirname(sys.executable)
        else:
            # Development mode - profile in project directory
            return os.path.join(os.getcwd(), "startup_profiles")
    
    def _start_resource_monitoring(self):
        """Start background resource monitoring"""
        def monitor_resources():
            while hasattr(self, 'monitoring') and self.monitoring:
                try:
                    process = psutil.Process()
                    memory_mb = process.memory_info().rss / 1024 / 1024
                    cpu_percent = process.cpu_percent()
                    
                    self.memory_usage.append({
                        'timestamp': time.time() - self.start_time,
                        'memory_mb': memory_mb
                    })
                    
                    self.cpu_usage.append({
                        'timestamp': time.time() - self.start_time,
                        'cpu_percent': cpu_percent
                    })
                    
                    time.sleep(0.1)  # Monitor every 100ms
                except Exception as e:
                    self.log_error(f"Resource monitoring error: {e}")
                    break
        
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=monitor_resources, daemon=True)
        self.monitor_thread.start()
    
    def log_checkpoint(self, checkpoint_name: str, description: str = "", details: Optional[Dict] = None):
        """Log a performance checkpoint"""
        current_time = time.time()
        elapsed = current_time - self.start_time
        
        checkpoint = {
            'session_id': self.session_id,
            'timestamp': datetime.now().isoformat(),
            'elapsed_seconds': elapsed,
            'checkpoint': checkpoint_name,
            'description': description,
            'details': details or {},
            'memory_mb': self._get_current_memory(),
            'cpu_percent': self._get_current_cpu()
        }
        
        self.checkpoints.append(checkpoint)
        
        # Log to file immediately
        self._write_checkpoint_to_file(checkpoint)
        
        print(f"[{elapsed:.3f}s] {checkpoint_name}: {description}")
        
        return elapsed
    
    def log_import_time(self, module_name: str, import_time: float):
        """Log module import time"""
        self.import_times[module_name] = import_time
        self.log_checkpoint(f"IMPORT_{module_name.upper()}", f"Imported {module_name}", {
            'import_time_ms': import_time * 1000,
            'module': module_name
        })
    
    def log_initialization_time(self, component: str, init_time: float, details: Optional[Dict] = None):
        """Log component initialization time"""
        self.initialization_times[component] = init_time
        self.log_checkpoint(f"INIT_{component.upper()}", f"Initialized {component}", {
            'init_time_ms': init_time * 1000,
            'component': component,
            **(details or {})
        })
    
    def log_error(self, error_message: str, exception: Optional[Exception] = None):
        """Log startup errors"""
        error_entry = {
            'timestamp': datetime.now().isoformat(),
            'elapsed_seconds': time.time() - self.start_time,
            'error_message': error_message,
            'exception_type': type(exception).__name__ if exception else None,
            'exception_details': str(exception) if exception else None,
            'traceback': traceback.format_exc() if exception else None
        }
        
        self.error_log.append(error_entry)
        print(f"[ERROR] {error_message}")
        
        if exception:
            print(f"[ERROR] Exception: {exception}")
    
    def _get_current_memory(self) -> float:
        """Get current memory usage in MB"""
        try:
            return psutil.Process().memory_info().rss / 1024 / 1024
        except:
            return 0.0
    
    def _get_current_cpu(self) -> float:
        """Get current CPU usage percentage"""
        try:
            return psutil.Process().cpu_percent()
        except:
            return 0.0
    
    def _write_checkpoint_to_file(self, checkpoint: Dict):
        """Write checkpoint to log file"""
        try:
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(f"{json.dumps(checkpoint)}\n")
        except Exception as e:
            print(f"Failed to write checkpoint to file: {e}")
    
    def timed_operation(self, operation_name: str):
        """Context manager for timing operations"""
        class TimedOperation:
            def __init__(self, profiler, name):
                self.profiler = profiler
                self.name = name
                self.start_time = None
            
            def __enter__(self):
                self.start_time = time.time()
                self.profiler.log_checkpoint(f"START_{self.name.upper()}", f"Starting {self.name}")
                return self
            
            def __exit__(self, exc_type, exc_val, exc_tb):
                elapsed = time.time() - self.start_time
                if exc_type:
                    self.profiler.log_error(f"Error in {self.name}: {exc_val}", exc_val)
                else:
                    self.profiler.log_checkpoint(f"COMPLETE_{self.name.upper()}", f"Completed {self.name}", {
                        'operation_time_ms': elapsed * 1000
                    })
        
        return TimedOperation(self, operation_name)
    
    def generate_performance_report(self) -> Dict:
        """Generate comprehensive performance report"""
        total_time = time.time() - self.start_time
        
        # Stop monitoring
        self.monitoring = False
        
        # Calculate statistics
        slowest_imports = sorted(self.import_times.items(), key=lambda x: x[1], reverse=True)[:10]
        slowest_initializations = sorted(self.initialization_times.items(), key=lambda x: x[1], reverse=True)[:10]
        
        peak_memory = max(self.memory_usage, key=lambda x: x['memory_mb']) if self.memory_usage else {'memory_mb': 0}
        avg_cpu = sum(usage['cpu_percent'] for usage in self.cpu_usage) / len(self.cpu_usage) if self.cpu_usage else 0
        
        report = {
            'session_id': self.session_id,
            'generated_at': datetime.now().isoformat(),
            'total_startup_time_seconds': total_time,
            'total_checkpoints': len(self.checkpoints),
            'total_errors': len(self.error_log),
            
            'performance_summary': {
                'peak_memory_mb': peak_memory['memory_mb'],
                'average_cpu_percent': avg_cpu,
                'slowest_imports': slowest_imports,
                'slowest_initializations': slowest_initializations,
            },
            
            'detailed_timeline': self.checkpoints,
            'import_analysis': self.import_times,
            'initialization_analysis': self.initialization_times,
            'memory_timeline': self.memory_usage,
            'cpu_timeline': self.cpu_usage,
            'error_log': self.error_log,
            
            'recommendations': self._generate_recommendations(total_time, slowest_imports, slowest_initializations)
        }
        
        # Save detailed report
        report_file = os.path.join(self.profile_dir, f"performance_report_{self.session_id}.json")
        try:
            with open(report_file, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2)
            print(f"Performance report saved to: {report_file}")
        except Exception as e:
            print(f"Failed to save performance report: {e}")
        
        return report
    
    def _generate_recommendations(self, total_time: float, slowest_imports: List, slowest_initializations: List) -> List[str]:
        """Generate optimization recommendations"""
        recommendations = []
        
        if total_time > 10:
            recommendations.append("CRITICAL: Startup time exceeds 10 seconds - requires immediate optimization")
        elif total_time > 5:
            recommendations.append("WARNING: Startup time exceeds 5 seconds - optimization recommended")
        
        if slowest_imports:
            slowest_import = slowest_imports[0]
            if slowest_import[1] > 2:
                recommendations.append(f"IMPORT BOTTLENECK: '{slowest_import[0]}' takes {slowest_import[1]:.2f}s - consider lazy loading")
        
        if slowest_initializations:
            slowest_init = slowest_initializations[0]
            if slowest_init[1] > 3:
                recommendations.append(f"INIT BOTTLENECK: '{slowest_init[0]}' takes {slowest_init[1]:.2f}s - optimize initialization")
        
        if len(self.error_log) > 0:
            recommendations.append(f"ERROR COUNT: {len(self.error_log)} errors during startup - investigate error log")
        
        peak_memory = max(self.memory_usage, key=lambda x: x['memory_mb'])['memory_mb'] if self.memory_usage else 0
        if peak_memory > 500:
            recommendations.append(f"MEMORY USAGE: Peak memory {peak_memory:.1f}MB - consider memory optimization")
        
        return recommendations
    
    def print_summary(self):
        """Print startup performance summary"""
        total_time = time.time() - self.start_time
        print(f"\n{'='*60}")
        print(f"TruckOpti Startup Performance Summary")
        print(f"{'='*60}")
        print(f"Total Startup Time: {total_time:.3f} seconds")
        print(f"Checkpoints Logged: {len(self.checkpoints)}")
        print(f"Errors Encountered: {len(self.error_log)}")
        
        if self.import_times:
            print(f"\nSlowest Imports:")
            for module, time_taken in sorted(self.import_times.items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"  {module}: {time_taken:.3f}s")
        
        if self.initialization_times:
            print(f"\nSlowest Initializations:")
            for component, time_taken in sorted(self.initialization_times.items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"  {component}: {time_taken:.3f}s")
        
        if self.error_log:
            print(f"\nErrors:")
            for error in self.error_log[-3:]:  # Show last 3 errors
                print(f"  {error['error_message']}")
        
        print(f"{'='*60}\n")

# Global profiler instance
startup_profiler = StartupProfiler()

# Convenience functions
def log_checkpoint(name: str, description: str = "", details: Optional[Dict] = None):
    return startup_profiler.log_checkpoint(name, description, details)

def log_import_time(module_name: str, import_time: float):
    return startup_profiler.log_import_time(module_name, import_time)

def log_initialization_time(component: str, init_time: float, details: Optional[Dict] = None):
    return startup_profiler.log_initialization_time(component, init_time, details)

def log_error(error_message: str, exception: Optional[Exception] = None):
    return startup_profiler.log_error(error_message, exception)

def timed_operation(operation_name: str):
    return startup_profiler.timed_operation(operation_name)

def generate_performance_report():
    return startup_profiler.generate_performance_report()

def print_summary():
    return startup_profiler.print_summary()