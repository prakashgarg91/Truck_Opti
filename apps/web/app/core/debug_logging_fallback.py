"""
Comprehensive Debug Logging Fallback System
Provides robust logging when the main debug_logger module is unavailable
"""

import logging
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
from functools import wraps


class DebugLoggingFallback:
    """
    Fallback logging system that writes to files when debug_logger is unavailable
    Provides same interface as the main debug logger for seamless fallback
    """

    def __init__(self, log_directory: str = None):
        """
        Initialize fallback logging system

        Args:
            log_directory: Directory for log files (default: ./logs/fallback)
        """
        # Determine log directory
        if log_directory is None:
            # Try to use app_data directory, fallback to current directory
            base_dir = Path(os.getcwd())
            log_directory = base_dir / "logs" / "fallback"

        self.log_directory = Path(log_directory)
        self.log_directory.mkdir(parents=True, exist_ok=True)

        # Setup file handlers for different log types
        self.loggers = {}
        self._setup_loggers()

        # Track log statistics
        self.stats = {
            'total_logs': 0,
            'by_level': {},
            'by_type': {}
        }

    def _setup_loggers(self):
        """Setup individual loggers for different log types"""

        log_types = [
            'user_actions',
            'system_events',
            'api_requests',
            'database_operations',
            'algorithm_execution',
            'errors',
            'general'
        ]

        for log_type in log_types:
            logger = logging.getLogger(f'fallback_{log_type}')
            logger.setLevel(logging.DEBUG)

            # File handler for this log type
            log_file = self.log_directory / f"{log_type}.log"
            file_handler = logging.FileHandler(log_file)
            file_handler.setLevel(logging.DEBUG)

            # Format: timestamp | level | message
            formatter = logging.Formatter(
                '%(asctime)s | %(levelname)-8s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            file_handler.setFormatter(formatter)

            logger.addHandler(file_handler)
            self.loggers[log_type] = logger

    def _format_details(self, details: Optional[Dict[str, Any]]) -> str:
        """Format details dictionary as JSON string"""
        if not details:
            return ""

        try:
            # Make details JSON serializable
            serializable_details = {}
            for key, value in details.items():
                try:
                    json.dumps(value)
                    serializable_details[key] = value
                except (TypeError, ValueError):
                    serializable_details[key] = str(value)

            return json.dumps(serializable_details, indent=2)
        except Exception:
            return str(details)

    def log_user_action(self, action: str, details: Optional[Dict[str, Any]] = None):
        """Log user actions (button clicks, form submissions, etc.)"""
        try:
            logger = self.loggers.get('user_actions')
            message = f"USER ACTION: {action}"

            if details:
                message += f"\nDetails: {self._format_details(details)}"

            logger.info(message)
            self._update_stats('user_actions', 'INFO')

        except Exception as e:
            print(f"[FALLBACK LOGGER ERROR] Failed to log user action: {e}")

    def log_system_event(self, event: str, details: Optional[Dict[str, Any]] = None):
        """Log system events (startup, shutdown, configuration changes, etc.)"""
        try:
            logger = self.loggers.get('system_events')
            message = f"SYSTEM EVENT: {event}"

            if details:
                message += f"\nDetails: {self._format_details(details)}"

            logger.info(message)
            self._update_stats('system_events', 'INFO')

        except Exception as e:
            print(f"[FALLBACK LOGGER ERROR] Failed to log system event: {e}")

    def log_api_request(self, endpoint: str, method: str,
                       data: Optional[Dict[str, Any]] = None,
                       response: Optional[Dict[str, Any]] = None):
        """Log API requests and responses"""
        try:
            logger = self.loggers.get('api_requests')
            message = f"API: {method} {endpoint}"

            if data:
                message += f"\nRequest Data: {self._format_details(data)}"
            if response:
                message += f"\nResponse: {self._format_details(response)}"

            logger.info(message)
            self._update_stats('api_requests', 'INFO')

        except Exception as e:
            print(f"[FALLBACK LOGGER ERROR] Failed to log API request: {e}")

    def log_database_operation(self, operation: str, table: str,
                              data: Optional[Dict[str, Any]] = None,
                              result: Optional[Dict[str, Any]] = None):
        """Log database operations"""
        try:
            logger = self.loggers.get('database_operations')
            message = f"DATABASE: {operation} on {table}"

            if data:
                message += f"\nData: {self._format_details(data)}"
            if result:
                message += f"\nResult: {self._format_details(result)}"

            logger.info(message)
            self._update_stats('database_operations', 'INFO')

        except Exception as e:
            print(f"[FALLBACK LOGGER ERROR] Failed to log database operation: {e}")

    def log_algorithm_execution(self, algorithm: str, input_data: Dict[str, Any],
                                output_data: Dict[str, Any],
                                execution_time: Optional[float] = None):
        """Log algorithm execution with performance metrics"""
        try:
            logger = self.loggers.get('algorithm_execution')
            message = f"ALGORITHM: {algorithm}"

            if execution_time is not None:
                message += f" | Execution Time: {execution_time:.3f}s"

            message += f"\nInput: {self._format_details(input_data)}"
            message += f"\nOutput: {self._format_details(output_data)}"

            logger.info(message)
            self._update_stats('algorithm_execution', 'INFO')

        except Exception as e:
            print(f"[FALLBACK LOGGER ERROR] Failed to log algorithm execution: {e}")

    def log_error(self, error: Exception, context: Optional[Dict[str, Any]] = None):
        """Log errors with full context and stack trace"""
        try:
            logger = self.loggers.get('errors')
            message = f"ERROR: {type(error).__name__}: {str(error)}"

            if context:
                message += f"\nContext: {self._format_details(context)}"

            # Include stack trace
            import traceback
            stack_trace = traceback.format_exc()
            if stack_trace and stack_trace != 'NoneType: None\n':
                message += f"\nStack Trace:\n{stack_trace}"

            logger.error(message)
            self._update_stats('errors', 'ERROR')

        except Exception as e:
            print(f"[FALLBACK LOGGER ERROR] Failed to log error: {e}")

    def _update_stats(self, log_type: str, level: str):
        """Update logging statistics"""
        self.stats['total_logs'] += 1

        if level not in self.stats['by_level']:
            self.stats['by_level'][level] = 0
        self.stats['by_level'][level] += 1

        if log_type not in self.stats['by_type']:
            self.stats['by_type'][log_type] = 0
        self.stats['by_type'][log_type] += 1

    def get_stats(self) -> Dict[str, Any]:
        """Get logging statistics"""
        return {
            **self.stats,
            'log_directory': str(self.log_directory),
            'timestamp': datetime.utcnow().isoformat()
        }

    def clear_old_logs(self, days_to_keep: int = 30):
        """Clear log files older than specified days"""
        try:
            from datetime import timedelta
            cutoff_time = datetime.now() - timedelta(days=days_to_keep)

            deleted_count = 0
            for log_file in self.log_directory.glob("*.log"):
                if log_file.stat().st_mtime < cutoff_time.timestamp():
                    log_file.unlink()
                    deleted_count += 1

            return deleted_count

        except Exception as e:
            print(f"[FALLBACK LOGGER ERROR] Failed to clear old logs: {e}")
            return 0


# Global fallback logger instance
_fallback_logger = None


def get_fallback_logger() -> DebugLoggingFallback:
    """Get or create global fallback logger instance"""
    global _fallback_logger
    if _fallback_logger is None:
        _fallback_logger = DebugLoggingFallback()
    return _fallback_logger


# Convenience functions that match the main debug_logger interface
def log_user_action(action: str, details: Optional[Dict[str, Any]] = None):
    """Log user action using fallback logger"""
    get_fallback_logger().log_user_action(action, details)


def log_system_event(event: str, details: Optional[Dict[str, Any]] = None):
    """Log system event using fallback logger"""
    get_fallback_logger().log_system_event(event, details)


def log_api_request(endpoint: str, method: str,
                   data: Optional[Dict[str, Any]] = None,
                   response: Optional[Dict[str, Any]] = None):
    """Log API request using fallback logger"""
    get_fallback_logger().log_api_request(endpoint, method, data, response)


def log_database_operation(operation: str, table: str,
                          data: Optional[Dict[str, Any]] = None,
                          result: Optional[Dict[str, Any]] = None):
    """Log database operation using fallback logger"""
    get_fallback_logger().log_database_operation(operation, table, data, result)


def log_algorithm_execution(algorithm: str, input_data: Dict[str, Any],
                           output_data: Dict[str, Any],
                           execution_time: Optional[float] = None):
    """Log algorithm execution using fallback logger"""
    get_fallback_logger().log_algorithm_execution(
        algorithm, input_data, output_data, execution_time
    )


def log_error(error: Exception, context: Optional[Dict[str, Any]] = None):
    """Log error using fallback logger"""
    get_fallback_logger().log_error(error, context)


# Decorator for automatic function logging
def log_execution(log_type: str = 'general'):
    """
    Decorator to automatically log function execution

    Usage:
        @log_execution('algorithm')
        def my_function(arg1, arg2):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            func_name = func.__name__
            start_time = datetime.now()

            try:
                result = func(*args, **kwargs)
                end_time = datetime.now()
                execution_time = (end_time - start_time).total_seconds()

                log_algorithm_execution(
                    algorithm=func_name,
                    input_data={
                        'args': [str(arg)[:100] for arg in args],  # Truncate long args
                        'kwargs': {k: str(v)[:100] for k, v in kwargs.items()}
                    },
                    output_data={'result': str(result)[:200]},  # Truncate long results
                    execution_time=execution_time
                )

                return result

            except Exception as e:
                log_error(e, {'function': func_name, 'args': str(args)[:200]})
                raise

        return wrapper
    return decorator
