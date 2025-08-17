import logging
import os
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler


def get_logger(name: str = 'TruckOpti') -> logging.Logger:
    """Get a logger instance"""
    return logging.getLogger(name)


class PerformanceLogger:
    """Simple performance logger"""
    
    def __init__(self):
        self.logger = get_logger('Performance')
    
    def log_operation(self, operation: str, duration: float, success: bool = True, details: dict = None):
        """Log operation performance"""
        status = "SUCCESS" if success else "FAILED"
        self.logger.info(f"Operation {operation} {status} in {duration:.3f}s", extra=details or {})


# Global instances
performance_logger = PerformanceLogger()
business_logger = get_logger('Business')
security_logger = get_logger('Security')


def setup_logging(log_level='INFO', log_dir=None):
    """
    Configure logging for the application.
    
    Args:
        log_level (str): Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir (str, optional): Directory for log files
    
    Returns:
        logging.Logger: Configured logger instance
    """
    # Determine log directory
    if log_dir is None:
        if getattr(sys, 'frozen', False):
            # PyInstaller executable path
            log_dir = os.path.join(sys._MEIPASS, 'logs')
        else:
            # Default application log directory
            log_dir = os.path.join(
                os.path.expanduser('~'), 
                '.truckopti', 
                'logs'
            )
    
    # Create log directory if it doesn't exist
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    
    # Log file configuration
    log_file = os.path.join(log_dir, 'truckopti.log')
    
    # Logging configuration
    logger = logging.getLogger('TruckOpti')
    logger.setLevel(getattr(logging, log_level.upper()))
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # File handler with rotation
    file_handler = RotatingFileHandler(
        log_file, 
        maxBytes=10*1024*1024,  # 10 MB
        backupCount=5
    )
    file_handler.setLevel(logging.DEBUG)
    
    # Formatters
    console_formatter = logging.Formatter(
        '%(levelname)s: %(message)s'
    )
    file_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    console_handler.setFormatter(console_formatter)
    file_handler.setFormatter(file_formatter)
    
    # Add handlers
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    
    return logger


def log_exception(logger, message, exc_info=True):
    """
    Log an exception with optional additional message.
    
    Args:
        logger (logging.Logger): Logger instance
        message (str): Optional context message
        exc_info (bool or Exception): Exception info to log
    """
    logger.exception(message, exc_info=exc_info)
