"""
Enterprise Logging Configuration
Structured logging with correlation IDs, performance metrics, and security audit trails
"""

import logging
import logging.handlers
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path
import threading
from contextlib import contextmanager

from app.config.settings import get_config


class StructuredFormatter(logging.Formatter):
    """
    Custom formatter that outputs structured JSON logs
    """
    
    def format(self, record: logging.LogRecord) -> str:
        # Get correlation context
        correlation_id = getattr(threading.current_thread(), 'correlation_id', None)
        user_id = getattr(threading.current_thread(), 'user_id', None)
        
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "correlation_id": correlation_id,
            "user_id": user_id,
            "process_id": record.process,
            "thread_id": record.thread
        }
        
        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        # Add extra fields from record
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
                          'filename', 'module', 'exc_info', 'exc_text', 'stack_info',
                          'lineno', 'funcName', 'created', 'msecs', 'relativeCreated',
                          'thread', 'threadName', 'processName', 'process', 'message']:
                log_entry[key] = value
        
        return json.dumps(log_entry, default=str)


class PerformanceLogger:
    """
    Logger for performance metrics and timing
    """
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(f"performance.{name}")
    
    def log_request(self, method: str, path: str, duration: float, 
                   status_code: int, user_id: str = None):
        """Log HTTP request performance"""
        self.logger.info(
            "HTTP request completed",
            extra={
                "event_type": "http_request",
                "method": method,
                "path": path,
                "duration_ms": duration * 1000,
                "status_code": status_code,
                "user_id": user_id
            }
        )
    
    def log_operation(self, operation: str, duration: float, 
                     success: bool, details: Dict[str, Any] = None):
        """Log business operation performance"""
        self.logger.info(
            f"Operation {operation} completed",
            extra={
                "event_type": "operation",
                "operation": operation,
                "duration_ms": duration * 1000,
                "success": success,
                "details": details or {}
            }
        )
    
    def log_database_query(self, query_type: str, table: str, duration: float):
        """Log database query performance"""
        self.logger.info(
            f"Database {query_type} on {table}",
            extra={
                "event_type": "database_query",
                "query_type": query_type,
                "table": table,
                "duration_ms": duration * 1000
            }
        )


class SecurityLogger:
    """
    Logger for security events and audit trails
    """
    
    def __init__(self):
        self.logger = logging.getLogger("security")
    
    def log_authentication(self, user_id: str, success: bool, 
                          ip_address: str, user_agent: str = None):
        """Log authentication attempts"""
        self.logger.info(
            f"Authentication {'successful' if success else 'failed'}",
            extra={
                "event_type": "authentication",
                "user_id": user_id,
                "success": success,
                "ip_address": ip_address,
                "user_agent": user_agent
            }
        )
    
    def log_authorization(self, user_id: str, resource: str, 
                         action: str, granted: bool):
        """Log authorization decisions"""
        self.logger.info(
            f"Access {'granted' if granted else 'denied'}",
            extra={
                "event_type": "authorization",
                "user_id": user_id,
                "resource": resource,
                "action": action,
                "granted": granted
            }
        )
    
    def log_sensitive_operation(self, user_id: str, operation: str, 
                               resource_id: str = None, details: Dict[str, Any] = None):
        """Log sensitive business operations"""
        self.logger.warning(
            f"Sensitive operation: {operation}",
            extra={
                "event_type": "sensitive_operation",
                "user_id": user_id,
                "operation": operation,
                "resource_id": resource_id,
                "details": details or {}
            }
        )


class BusinessLogger:
    """
    Logger for business events and domain operations
    """
    
    def __init__(self):
        self.logger = logging.getLogger("business")
    
    def log_packing_job(self, job_id: str, user_id: str, 
                       cartons_count: int, trucks_used: int, 
                       utilization: float, cost: float):
        """Log packing job completion"""
        self.logger.info(
            f"Packing job {job_id} completed",
            extra={
                "event_type": "packing_job_completed",
                "job_id": job_id,
                "user_id": user_id,
                "cartons_count": cartons_count,
                "trucks_used": trucks_used,
                "utilization_percent": utilization * 100,
                "total_cost": cost
            }
        )
    
    def log_optimization_run(self, algorithm: str, duration: float, 
                           improvement: float, iterations: int):
        """Log optimization algorithm execution"""
        self.logger.info(
            f"Optimization completed using {algorithm}",
            extra={
                "event_type": "optimization_run",
                "algorithm": algorithm,
                "duration_ms": duration * 1000,
                "improvement_percent": improvement * 100,
                "iterations": iterations
            }
        )
    
    def log_data_export(self, user_id: str, export_type: str, 
                       records_count: int, file_size: int):
        """Log data export operations"""
        self.logger.info(
            f"Data export: {export_type}",
            extra={
                "event_type": "data_export",
                "user_id": user_id,
                "export_type": export_type,
                "records_count": records_count,
                "file_size_bytes": file_size
            }
        )


def setup_logging(config=None):
    """
    Setup enterprise logging configuration
    """
    if config is None:
        config = get_config()
    
    # Create logs directory
    log_path = Path(config.logging.file_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, config.logging.level.upper()))
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    if config.logging.structured_logging:
        console_handler.setFormatter(StructuredFormatter())
    else:
        console_handler.setFormatter(
            logging.Formatter(config.logging.format)
        )
    console_handler.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    
    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        config.logging.file_path,
        maxBytes=config.logging.max_file_size,
        backupCount=config.logging.backup_count,
        encoding='utf-8'
    )
    
    if config.logging.structured_logging:
        file_handler.setFormatter(StructuredFormatter())
    else:
        file_handler.setFormatter(
            logging.Formatter(config.logging.format)
        )
    file_handler.setLevel(getattr(logging, config.logging.level.upper()))
    root_logger.addHandler(file_handler)
    
    # Error file handler for errors and above
    error_file_handler = logging.handlers.RotatingFileHandler(
        config.logging.file_path.replace('.log', '_errors.log'),
        maxBytes=config.logging.max_file_size,
        backupCount=config.logging.backup_count,
        encoding='utf-8'
    )
    error_file_handler.setLevel(logging.ERROR)
    if config.logging.structured_logging:
        error_file_handler.setFormatter(StructuredFormatter())
    else:
        error_file_handler.setFormatter(
            logging.Formatter(config.logging.format)
        )
    root_logger.addHandler(error_file_handler)
    
    # Configure specific loggers
    configure_loggers()
    
    return root_logger


def configure_loggers():
    """Configure specific application loggers"""
    # Flask request logging
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.setLevel(logging.WARNING)
    
    # SQLAlchemy logging (reduced verbosity in production)
    sqlalchemy_logger = logging.getLogger('sqlalchemy.engine')
    sqlalchemy_logger.setLevel(logging.WARNING)
    
    # Business domain loggers
    logging.getLogger('business').setLevel(logging.INFO)
    logging.getLogger('security').setLevel(logging.INFO)
    logging.getLogger('performance').setLevel(logging.INFO)


@contextmanager
def correlation_context(correlation_id: str, user_id: str = None):
    """
    Context manager to set correlation ID for request tracing
    """
    current_thread = threading.current_thread()
    old_correlation_id = getattr(current_thread, 'correlation_id', None)
    old_user_id = getattr(current_thread, 'user_id', None)
    
    try:
        current_thread.correlation_id = correlation_id
        current_thread.user_id = user_id
        yield
    finally:
        current_thread.correlation_id = old_correlation_id
        current_thread.user_id = old_user_id


def get_logger(name: str) -> logging.Logger:
    """Get a configured logger instance"""
    return logging.getLogger(name)


# Initialize global loggers
performance_logger = PerformanceLogger("main")
security_logger = SecurityLogger()
business_logger = BusinessLogger()