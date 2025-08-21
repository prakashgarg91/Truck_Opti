"""
TruckOpti Debug Logger - Comprehensive User & System Action Tracking
Logs every user interaction and software operation for debugging purposes
"""

import logging
import json
import time
import os
import sys
from datetime import datetime
from functools import wraps
from flask import request, session, g
import traceback

class TruckOptiDebugLogger:
    def __init__(self, log_file="truckopti_debug.log"):
        # Create logs directory if it doesn't exist
        self.log_dir = self._get_log_directory()
        os.makedirs(self.log_dir, exist_ok=True)
        
        # Set up comprehensive logging
        self.log_file = os.path.join(self.log_dir, log_file)
        self._setup_logging()
        
        # Track session start
        self.session_id = self._generate_session_id()
        self.log_system_event("DEBUG_SESSION_START", {
            "session_id": self.session_id,
            "executable_mode": hasattr(sys, 'frozen'),
            "python_version": sys.version,
            "platform": sys.platform,
            "working_directory": os.getcwd()
        })
    
    def _get_log_directory(self):
        """Get appropriate log directory for executable vs development"""
        if hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS'):
            # Executable mode - log in same directory as exe
            return os.path.dirname(sys.executable)
        else:
            # Development mode - log in project directory
            return os.path.join(os.getcwd(), "debug_logs")
    
    def _setup_logging(self):
        """Set up comprehensive logging with multiple levels"""
        # Configure root logger
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
            handlers=[
                logging.FileHandler(self.log_file, encoding='utf-8'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        
        self.logger = logging.getLogger('TruckOptiDebug')
        self.logger.setLevel(logging.DEBUG)
        
        # Create specialized loggers
        self.user_logger = logging.getLogger('UserActions')
        self.system_logger = logging.getLogger('SystemOperations')
        self.api_logger = logging.getLogger('APIRequests')
        self.database_logger = logging.getLogger('DatabaseOps')
        self.algorithm_logger = logging.getLogger('AlgorithmExecution')
    
    def _generate_session_id(self):
        """Generate unique session ID"""
        return f"SESSION_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{int(time.time() * 1000) % 10000}"
    
    def log_user_action(self, action, details=None):
        """Log user interactions and UI events"""
        log_data = {
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "details": details or {},
            "request_info": self._get_request_info() if request else None
        }
        
        self.user_logger.info(f"USER_ACTION: {json.dumps(log_data, indent=2)}")
        return log_data
    
    def log_system_event(self, event, details=None):
        """Log system operations and software events"""
        log_data = {
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "event": event,
            "details": details or {}
        }
        
        self.system_logger.info(f"SYSTEM_EVENT: {json.dumps(log_data, indent=2)}")
        return log_data
    
    def log_api_request(self, endpoint, method, data=None, response=None):
        """Log API requests and responses"""
        log_data = {
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "endpoint": endpoint,
            "method": method,
            "request_data": data,
            "response_data": response,
            "request_info": self._get_request_info() if request else None
        }
        
        self.api_logger.info(f"API_REQUEST: {json.dumps(log_data, indent=2)}")
        return log_data
    
    def log_database_operation(self, operation, table, data=None, result=None):
        """Log database operations"""
        log_data = {
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "operation": operation,
            "table": table,
            "data": data,
            "result": result
        }
        
        self.database_logger.info(f"DATABASE_OP: {json.dumps(log_data, indent=2)}")
        return log_data
    
    def log_algorithm_execution(self, algorithm, input_data, output_data, execution_time=None):
        """Log algorithm execution details"""
        log_data = {
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "algorithm": algorithm,
            "input_data": input_data,
            "output_data": output_data,
            "execution_time_ms": execution_time,
            "success": output_data is not None
        }
        
        self.algorithm_logger.info(f"ALGORITHM_EXEC: {json.dumps(log_data, indent=2)}")
        return log_data
    
    def log_error(self, error, context=None):
        """Log errors with full context"""
        log_data = {
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "error_type": type(error).__name__,
            "error_message": str(error),
            "traceback": traceback.format_exc(),
            "context": context or {},
            "request_info": self._get_request_info() if request else None
        }
        
        self.logger.error(f"ERROR: {json.dumps(log_data, indent=2)}")
        return log_data
    
    def _get_request_info(self):
        """Extract comprehensive request information"""
        if not request:
            return None
            
        return {
            "url": request.url,
            "method": request.method,
            "endpoint": request.endpoint,
            "remote_addr": request.remote_addr,
            "user_agent": request.headers.get('User-Agent'),
            "referrer": request.headers.get('Referer'),
            "form_data": dict(request.form) if request.form else None,
            "query_params": dict(request.args) if request.args else None,
            "json_data": request.get_json(silent=True),
            "headers": dict(request.headers)
        }
    
    def route_logger(self, func):
        """Decorator to automatically log route access"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            # Log route entry
            self.log_user_action("ROUTE_ACCESS", {
                "route": func.__name__,
                "args": str(args),
                "kwargs": str(kwargs)
            })
            
            try:
                result = func(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000
                
                # Log successful route completion
                self.log_system_event("ROUTE_COMPLETED", {
                    "route": func.__name__,
                    "execution_time_ms": execution_time,
                    "success": True
                })
                
                return result
                
            except Exception as e:
                execution_time = (time.time() - start_time) * 1000
                
                # Log route error
                self.log_error(e, {
                    "route": func.__name__,
                    "execution_time_ms": execution_time
                })
                
                raise
        
        return wrapper
    
    def database_logger(self, func):
        """Decorator to automatically log database operations"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000
                
                self.log_database_operation(
                    operation=func.__name__,
                    table="unknown",
                    data=str(kwargs),
                    result=f"Success in {execution_time:.2f}ms"
                )
                
                return result
                
            except Exception as e:
                execution_time = (time.time() - start_time) * 1000
                
                self.log_database_operation(
                    operation=func.__name__,
                    table="unknown",
                    data=str(kwargs),
                    result=f"Error: {str(e)} in {execution_time:.2f}ms"
                )
                
                raise
        
        return wrapper

# Global debug logger instance
debug_logger = TruckOptiDebugLogger()

# Convenience functions for easy import
def log_user_action(action, details=None):
    return debug_logger.log_user_action(action, details)

def log_system_event(event, details=None):
    return debug_logger.log_system_event(event, details)

def log_api_request(endpoint, method, data=None, response=None):
    return debug_logger.log_api_request(endpoint, method, data, response)

def log_database_operation(operation, table, data=None, result=None):
    return debug_logger.log_database_operation(operation, table, data, result)

def log_algorithm_execution(algorithm, input_data, output_data, execution_time=None):
    return debug_logger.log_algorithm_execution(algorithm, input_data, output_data, execution_time)

def log_error(error, context=None):
    return debug_logger.log_error(error, context)

def route_logger(func):
    return debug_logger.route_logger(func)

def database_logger(func):
    return debug_logger.database_logger(func)