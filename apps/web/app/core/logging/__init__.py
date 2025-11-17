"""Centralized logging utilities for TruckOpti."""

from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, Optional


def get_logger(name: str = "TruckOpti") -> logging.Logger:
    """Return (and lazily create) a standard library logger."""

    return logging.getLogger(name)


class PerformanceLogger:
    """Simple helper for structured performance logs."""

    def __init__(self) -> None:
        self.logger = get_logger("TruckOpti.Performance")

    def log_operation(
        self,
        operation: str,
        duration: float,
        success: bool = True,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        status = "SUCCESS" if success else "FAILED"
        payload = details.copy() if details else {}
        payload.update({
            "operation": operation,
            "duration": duration,
            "success": success,
        })
        self.logger.info(
            "Operation %s %s in %.3fs", operation, status, duration, extra=payload
        )


class BusinessLogger:
    """Domain-specific logger that emits enriched business events."""

    def __init__(self) -> None:
        self.logger = get_logger("TruckOpti.Business")

    def info(self, message: str, **extra: Any) -> None:
        self.logger.info(message, extra=extra or None)

    def log_optimization_completed(
        self,
        *,
        carton_count: int,
        truck_count: int,
        strategy: str,
        optimization_score: float,
    ) -> None:
        self.logger.info(
            "Optimization completed",
            extra={
                "event_type": "optimization_completed",
                "carton_count": carton_count,
                "truck_count": truck_count,
                "strategy": strategy,
                "optimization_score": optimization_score,
            },
        )

    def log_packing_job_created(
        self,
        *,
        job_id: Any,
        truck_id: Any,
        carton_count: int,
    ) -> None:
        self.logger.info(
            "Packing job created",
            extra={
                "event_type": "packing_job_created",
                "job_id": job_id,
                "truck_id": truck_id,
                "carton_count": carton_count,
            },
        )


def setup_logging(log_level: str = "INFO", log_dir: Optional[str] = None) -> logging.Logger:
    """Configure the root TruckOpti logger with console + rotating file handlers."""

    if log_dir is None:
        if getattr(sys, "frozen", False):
            log_dir = os.path.join(sys._MEIPASS, "logs")  # type: ignore[attr-defined]
        else:
            log_dir = os.path.join(Path.home(), ".truckopti", "logs")

    Path(log_dir).mkdir(parents=True, exist_ok=True)
    log_file = os.path.join(log_dir, "truckopti.log")

    logger = get_logger("TruckOpti")
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    if not any(isinstance(h, RotatingFileHandler) for h in logger.handlers):
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        )

        logger.addHandler(console_handler)
        logger.addHandler(file_handler)

    return logger


def log_exception(logger: logging.Logger, message: str, exc_info: Any = True) -> None:
    """Helper for logging exceptions with optional context."""

    logger.exception(message, exc_info=exc_info)


# Shared logger instances
app_logger = get_logger("TruckOpti.App")
performance_logger = PerformanceLogger()
business_logger = BusinessLogger()
security_logger = get_logger("TruckOpti.Security")


__all__ = [
    "get_logger",
    "setup_logging",
    "log_exception",
    "app_logger",
    "performance_logger",
    "business_logger",
    "security_logger",
    "PerformanceLogger",
    "BusinessLogger",
    ]

# Dedicated loggers for specialized domains
performance_logger = get_logger('truckopti.performance')
business_logger = get_logger('truckopti.business')
security_logger = get_logger('truckopti.security')


__all__ = ['get_logger', 'app_logger', 'performance_logger', 'business_logger', 'security_logger']
