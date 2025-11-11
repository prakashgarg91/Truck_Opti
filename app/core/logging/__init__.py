"""
Core Logging Module
Centralized logging utilities for TruckOpti
"""

import logging
import sys
from typing import Optional

# Logger cache
_loggers = {}


def get_logger(name: str, level: Optional[int] = None) -> logging.Logger:
    """
    Get or create a logger with the given name

    Args:
        name: Logger name (usually __name__ from calling module)
        level: Optional logging level (default: INFO)

    Returns:
        Configured logger instance
    """
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(name)

    if not logger.handlers:
        # Set level
        logger.setLevel(level or logging.INFO)

        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level or logging.INFO)

        # Formatter
        formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s [%(name)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(formatter)

        logger.addHandler(console_handler)

    _loggers[name] = logger
    return logger


# Default app logger
app_logger = get_logger('truckopti')


__all__ = ['get_logger', 'app_logger']
