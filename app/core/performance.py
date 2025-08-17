"""
Performance Optimization Layer
Enterprise performance monitoring, caching, and optimization
"""

import time
import asyncio
import threading
from typing import Dict, Any, Optional, Callable, List, Union
from functools import wraps, lru_cache
from datetime import datetime, timedelta
from collections import defaultdict, deque
import hashlib
import pickle
import json
import logging
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
import psutil
import gc

from .logging import get_logger


@dataclass
class PerformanceMetrics:
    """Performance metrics data structure"""
    operation_name: str
    start_time: datetime
    end_time: datetime
    duration_ms: float
    memory_usage_mb: float
    cpu_usage_percent: float
    status: str  # success, error, timeout
    details: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def duration_seconds(self) -> float:
        return self.duration_ms / 1000


class PerformanceMonitor:
    """Real-time performance monitoring"""
    
    def __init__(self, max_metrics: int = 10000):
        self.metrics: deque = deque(maxlen=max_metrics)
        self.operation_stats: Dict[str, Dict] = defaultdict(lambda: {
            'count': 0,
            'total_duration': 0,
            'avg_duration': 0,
            'min_duration': float('inf'),
            'max_duration': 0,
            'error_count': 0,
            'last_execution': None
        })
        self.logger = get_logger(self.__class__.__name__)
        self._lock = threading.Lock()
    
    def record_metric(self, metric: PerformanceMetrics):
        """Record a performance metric"""
        with self._lock:
            self.metrics.append(metric)
            
            # Update operation statistics
            stats = self.operation_stats[metric.operation_name]
            stats['count'] += 1
            stats['total_duration'] += metric.duration_ms
            stats['avg_duration'] = stats['total_duration'] / stats['count']
            stats['min_duration'] = min(stats['min_duration'], metric.duration_ms)
            stats['max_duration'] = max(stats['max_duration'], metric.duration_ms)
            stats['last_execution'] = metric.end_time
            
            if metric.status == 'error':
                stats['error_count'] += 1
    
    def get_operation_stats(self, operation_name: str = None) -> Dict[str, Any]:
        """Get performance statistics for operations"""
        if operation_name:
            return dict(self.operation_stats.get(operation_name, {}))
        return dict(self.operation_stats)
    
    def get_slow_operations(self, threshold_ms: float = 1000) -> List[PerformanceMetrics]:
        """Get operations that exceeded threshold"""
        return [m for m in self.metrics if m.duration_ms > threshold_ms]
    
    def get_error_operations(self) -> List[PerformanceMetrics]:
        """Get operations that failed"""
        return [m for m in self.metrics if m.status == 'error']
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """Get current system performance metrics"""
        try:
            memory = psutil.virtual_memory()
            cpu_percent = psutil.cpu_percent(interval=1)
            disk = psutil.disk_usage('/')
            
            return {
                'memory': {
                    'total_mb': memory.total / (1024 * 1024),
                    'available_mb': memory.available / (1024 * 1024),
                    'used_mb': memory.used / (1024 * 1024),
                    'percent': memory.percent
                },
                'cpu': {
                    'percent': cpu_percent,
                    'count': psutil.cpu_count()
                },
                'disk': {
                    'total_gb': disk.total / (1024 * 1024 * 1024),
                    'used_gb': disk.used / (1024 * 1024 * 1024),
                    'free_gb': disk.free / (1024 * 1024 * 1024),
                    'percent': (disk.used / disk.total) * 100
                }
            }
        except Exception as e:
            self.logger.error(f"Error getting system metrics: {str(e)}")
            return {}
    
    def generate_performance_report(self) -> Dict[str, Any]:
        """Generate comprehensive performance report"""
        now = datetime.utcnow()
        
        # Calculate overall statistics
        total_operations = len(self.metrics)
        if total_operations == 0:
            return {'message': 'No performance data available'}
        
        durations = [m.duration_ms for m in self.metrics]
        avg_duration = sum(durations) / len(durations)
        
        error_count = len(self.get_error_operations())
        error_rate = (error_count / total_operations) * 100
        
        # Top slowest operations
        slowest_ops = sorted(self.metrics, key=lambda x: x.duration_ms, reverse=True)[:10]
        
        # Most frequent operations
        op_counts = defaultdict(int)
        for metric in self.metrics:
            op_counts[metric.operation_name] += 1
        
        most_frequent = sorted(op_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return {
            'report_generated': now.isoformat(),
            'total_operations': total_operations,
            'average_duration_ms': round(avg_duration, 2),
            'error_rate_percent': round(error_rate, 2),
            'system_metrics': self.get_system_metrics(),
            'slowest_operations': [
                {
                    'operation': op.operation_name,
                    'duration_ms': op.duration_ms,
                    'timestamp': op.end_time.isoformat()
                }
                for op in slowest_ops
            ],
            'most_frequent_operations': [
                {'operation': op, 'count': count}
                for op, count in most_frequent
            ],
            'operation_statistics': self.get_operation_stats()
        }


class CacheManager:
    """Advanced caching system"""
    
    def __init__(self, default_ttl: int = 300, max_size: int = 1000):
        self.default_ttl = default_ttl
        self.max_size = max_size
        self.cache: Dict[str, Dict] = {}
        self.access_times: Dict[str, datetime] = {}
        self.hit_count = 0
        self.miss_count = 0
        self.logger = get_logger(self.__class__.__name__)
        self._lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        with self._lock:
            if key not in self.cache:
                self.miss_count += 1
                return None
            
            entry = self.cache[key]
            
            # Check expiration
            if datetime.utcnow() > entry['expires']:
                del self.cache[key]
                del self.access_times[key]
                self.miss_count += 1
                return None
            
            # Update access time
            self.access_times[key] = datetime.utcnow()
            self.hit_count += 1
            
            return entry['value']
    
    def set(self, key: str, value: Any, ttl: int = None) -> None:
        """Set value in cache"""
        with self._lock:
            ttl = ttl or self.default_ttl
            expires = datetime.utcnow() + timedelta(seconds=ttl)
            
            # Evict if cache is full
            if len(self.cache) >= self.max_size and key not in self.cache:
                self._evict_lru()
            
            self.cache[key] = {
                'value': value,
                'expires': expires,
                'created': datetime.utcnow()
            }
            self.access_times[key] = datetime.utcnow()
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        with self._lock:
            if key in self.cache:
                del self.cache[key]
                del self.access_times[key]
                return True
            return False
    
    def clear(self) -> None:
        """Clear all cache entries"""
        with self._lock:
            self.cache.clear()
            self.access_times.clear()
            self.hit_count = 0
            self.miss_count = 0
    
    def _evict_lru(self) -> None:
        """Evict least recently used item"""
        if not self.access_times:
            return
        
        lru_key = min(self.access_times.items(), key=lambda x: x[1])[0]
        del self.cache[lru_key]
        del self.access_times[lru_key]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_requests = self.hit_count + self.miss_count
        hit_rate = (self.hit_count / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'size': len(self.cache),
            'max_size': self.max_size,
            'hit_count': self.hit_count,
            'miss_count': self.miss_count,
            'hit_rate_percent': round(hit_rate, 2),
            'memory_usage_mb': self._estimate_memory_usage()
        }
    
    def _estimate_memory_usage(self) -> float:
        """Estimate memory usage of cache"""
        try:
            total_size = 0
            for entry in self.cache.values():
                total_size += len(pickle.dumps(entry['value']))
            return total_size / (1024 * 1024)  # Convert to MB
        except Exception:
            return 0.0


class DatabaseOptimizer:
    """Database query optimization utilities"""
    
    def __init__(self):
        self.query_stats: Dict[str, Dict] = defaultdict(lambda: {
            'count': 0,
            'total_time': 0,
            'avg_time': 0,
            'slow_queries': []
        })
        self.logger = get_logger(self.__class__.__name__)
    
    def track_query(self, query: str, duration: float, threshold: float = 1.0):
        """Track database query performance"""
        query_hash = hashlib.md5(query.encode()).hexdigest()[:8]
        
        stats = self.query_stats[query_hash]
        stats['count'] += 1
        stats['total_time'] += duration
        stats['avg_time'] = stats['total_time'] / stats['count']
        
        if duration > threshold:
            stats['slow_queries'].append({
                'query': query[:200] + '...' if len(query) > 200 else query,
                'duration': duration,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            # Keep only last 10 slow queries
            stats['slow_queries'] = stats['slow_queries'][-10:]
    
    def get_slow_queries(self, threshold: float = 1.0) -> List[Dict]:
        """Get all slow queries across all tracked queries"""
        slow_queries = []
        for stats in self.query_stats.values():
            slow_queries.extend(stats['slow_queries'])
        
        return sorted(slow_queries, key=lambda x: x['duration'], reverse=True)
    
    def get_query_stats(self) -> Dict[str, Any]:
        """Get database query statistics"""
        total_queries = sum(stats['count'] for stats in self.query_stats.values())
        avg_query_time = sum(stats['total_time'] for stats in self.query_stats.values()) / total_queries if total_queries > 0 else 0
        
        return {
            'total_queries': total_queries,
            'unique_queries': len(self.query_stats),
            'average_query_time': round(avg_query_time, 3),
            'slow_queries_count': len(self.get_slow_queries()),
            'query_details': dict(self.query_stats)
        }


# Global instances
performance_monitor = PerformanceMonitor()
cache_manager = CacheManager()
db_optimizer = DatabaseOptimizer()


def monitor_performance(operation_name: str = None):
    """Decorator to monitor function performance"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            op_name = operation_name or f"{func.__module__}.{func.__name__}"
            
            # Get initial system metrics
            start_memory = psutil.Process().memory_info().rss / (1024 * 1024)
            start_time = datetime.utcnow()
            start_cpu = psutil.cpu_percent()
            
            try:
                result = func(*args, **kwargs)
                status = 'success'
            except Exception as e:
                result = e
                status = 'error'
                raise
            finally:
                # Calculate metrics
                end_time = datetime.utcnow()
                end_memory = psutil.Process().memory_info().rss / (1024 * 1024)
                duration_ms = (end_time - start_time).total_seconds() * 1000
                
                metric = PerformanceMetrics(
                    operation_name=op_name,
                    start_time=start_time,
                    end_time=end_time,
                    duration_ms=duration_ms,
                    memory_usage_mb=end_memory - start_memory,
                    cpu_usage_percent=psutil.cpu_percent() - start_cpu,
                    status=status,
                    details={
                        'function': func.__name__,
                        'args_count': len(args),
                        'kwargs_count': len(kwargs)
                    }
                )
                
                performance_monitor.record_metric(metric)
            
            return result
        return wrapper
    return decorator


def cached(ttl: int = 300, key_func: Callable = None):
    """Decorator for function result caching"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                key_parts = [func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
                cache_key = hashlib.md5(":".join(key_parts).encode()).hexdigest()
            
            # Try to get from cache
            cached_result = cache_manager.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            cache_manager.set(cache_key, result, ttl)
            
            return result
        return wrapper
    return decorator


def async_executor(max_workers: int = 4):
    """Decorator for asynchronous execution"""
    executor = ThreadPoolExecutor(max_workers=max_workers)
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            future = executor.submit(func, *args, **kwargs)
            return future
        return wrapper
    return decorator


def batch_processor(batch_size: int = 100, parallel: bool = True):
    """Decorator for batch processing of large datasets"""
    def decorator(func):
        @wraps(func)
        def wrapper(data_list, *args, **kwargs):
            if not isinstance(data_list, (list, tuple)):
                return func(data_list, *args, **kwargs)
            
            # Split into batches
            batches = [data_list[i:i + batch_size] for i in range(0, len(data_list), batch_size)]
            results = []
            
            if parallel and len(batches) > 1:
                # Process batches in parallel
                with ThreadPoolExecutor(max_workers=min(4, len(batches))) as executor:
                    futures = [executor.submit(func, batch, *args, **kwargs) for batch in batches]
                    
                    for future in as_completed(futures):
                        try:
                            results.extend(future.result())
                        except Exception as e:
                            logging.error(f"Batch processing error: {str(e)}")
                            continue
            else:
                # Process batches sequentially
                for batch in batches:
                    try:
                        batch_result = func(batch, *args, **kwargs)
                        if isinstance(batch_result, (list, tuple)):
                            results.extend(batch_result)
                        else:
                            results.append(batch_result)
                    except Exception as e:
                        logging.error(f"Batch processing error: {str(e)}")
                        continue
            
            return results
        return wrapper
    return decorator


def memory_efficient(cleanup_threshold: float = 80.0):
    """Decorator to manage memory usage"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Check memory usage before execution
            memory_before = psutil.virtual_memory().percent
            
            if memory_before > cleanup_threshold:
                # Force garbage collection
                gc.collect()
                
                # Clear cache if memory is still high
                current_memory = psutil.virtual_memory().percent
                if current_memory > cleanup_threshold:
                    cache_manager.clear()
                    gc.collect()
            
            try:
                result = func(*args, **kwargs)
            finally:
                # Check memory after execution
                memory_after = psutil.virtual_memory().percent
                if memory_after > cleanup_threshold:
                    gc.collect()
            
            return result
        return wrapper
    return decorator


class PerformanceProfiler:
    """Advanced performance profiling utilities"""
    
    def __init__(self):
        self.profiles: Dict[str, List[Dict]] = defaultdict(list)
        self.logger = get_logger(self.__class__.__name__)
    
    def profile_function(self, func_name: str = None):
        """Profile function execution with detailed metrics"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                name = func_name or f"{func.__module__}.{func.__name__}"
                
                # Start profiling
                start_time = time.perf_counter()
                start_memory = psutil.Process().memory_info().rss
                
                try:
                    result = func(*args, **kwargs)
                    success = True
                    error = None
                except Exception as e:
                    result = None
                    success = False
                    error = str(e)
                    raise
                finally:
                    # Calculate metrics
                    end_time = time.perf_counter()
                    end_memory = psutil.Process().memory_info().rss
                    
                    profile_data = {
                        'timestamp': datetime.utcnow().isoformat(),
                        'duration_seconds': end_time - start_time,
                        'memory_delta_mb': (end_memory - start_memory) / (1024 * 1024),
                        'success': success,
                        'error': error,
                        'args_count': len(args),
                        'kwargs_count': len(kwargs)
                    }
                    
                    self.profiles[name].append(profile_data)
                    
                    # Keep only last 100 profiles per function
                    self.profiles[name] = self.profiles[name][-100:]
                
                return result
            return wrapper
        return decorator
    
    def get_profile_summary(self, func_name: str = None) -> Dict[str, Any]:
        """Get profile summary for functions"""
        if func_name:
            profiles = self.profiles.get(func_name, [])
            if not profiles:
                return {'error': f'No profiles found for {func_name}'}
            
            durations = [p['duration_seconds'] for p in profiles]
            memory_deltas = [p['memory_delta_mb'] for p in profiles]
            success_count = sum(1 for p in profiles if p['success'])
            
            return {
                'function_name': func_name,
                'total_calls': len(profiles),
                'success_rate': (success_count / len(profiles)) * 100,
                'avg_duration_seconds': sum(durations) / len(durations),
                'min_duration_seconds': min(durations),
                'max_duration_seconds': max(durations),
                'avg_memory_delta_mb': sum(memory_deltas) / len(memory_deltas),
                'total_memory_delta_mb': sum(memory_deltas)
            }
        
        # Return summary for all functions
        summary = {}
        for name in self.profiles:
            summary[name] = self.get_profile_summary(name)
        
        return summary


# Global profiler instance
profiler = PerformanceProfiler()


def get_performance_dashboard() -> Dict[str, Any]:
    """Get comprehensive performance dashboard data"""
    return {
        'timestamp': datetime.utcnow().isoformat(),
        'system_metrics': performance_monitor.get_system_metrics(),
        'performance_report': performance_monitor.generate_performance_report(),
        'cache_stats': cache_manager.get_stats(),
        'database_stats': db_optimizer.get_query_stats(),
        'profile_summary': profiler.get_profile_summary(),
        'memory_info': {
            'cache_size': len(cache_manager.cache),
            'metrics_count': len(performance_monitor.metrics),
            'profiles_count': sum(len(profiles) for profiles in profiler.profiles.values())
        }
    }


def optimize_performance():
    """Run performance optimizations"""
    optimizations_applied = []
    
    # Clear old performance metrics
    if len(performance_monitor.metrics) > 5000:
        # Keep only recent metrics
        performance_monitor.metrics = deque(
            list(performance_monitor.metrics)[-2500:],
            maxlen=performance_monitor.metrics.maxlen
        )
        optimizations_applied.append('Cleared old performance metrics')
    
    # Optimize cache
    cache_stats = cache_manager.get_stats()
    if cache_stats['hit_rate_percent'] < 50 and cache_stats['size'] > 100:
        # Clear cache if hit rate is poor
        cache_manager.clear()
        optimizations_applied.append('Cleared underperforming cache')
    
    # Force garbage collection
    gc.collect()
    optimizations_applied.append('Forced garbage collection')
    
    return {
        'optimizations_applied': optimizations_applied,
        'timestamp': datetime.utcnow().isoformat()
    }