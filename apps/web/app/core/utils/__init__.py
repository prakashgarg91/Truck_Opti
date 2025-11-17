"""
Core Utilities Module
General utility functions for TruckOpti
"""

from typing import Any, Dict, Optional
from datetime import datetime
import json


def safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert value to float"""
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    """Safely convert value to int"""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_bool(value: Any, default: bool = False) -> bool:
    """Safely convert value to bool"""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes', 'y')
    return default


def serialize_datetime(dt: Optional[datetime]) -> Optional[str]:
    """Serialize datetime to ISO format string"""
    if dt is None:
        return None
    return dt.isoformat()


def parse_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse ISO format datetime string"""
    if not dt_str:
        return None
    try:
        return datetime.fromisoformat(dt_str)
    except (ValueError, TypeError):
        return None


def to_json_safe(obj: Any) -> Any:
    """
    Convert object to JSON-safe format
    Handles datetime, decimals, and other non-serializable types
    """
    if obj is None:
        return None
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, 'as_dict'):
        return obj.as_dict()
    if isinstance(obj, (list, tuple)):
        return [to_json_safe(item) for item in obj]
    if isinstance(obj, dict):
        return {key: to_json_safe(value) for key, value in obj.items()}
    try:
        json.dumps(obj)
        return obj
    except TypeError:
        return str(obj)


def paginate_query(query, page: int = 1, per_page: int = 20) -> Dict[str, Any]:
    """
    Paginate SQLAlchemy query

    Args:
        query: SQLAlchemy query object
        page: Page number (1-indexed)
        per_page: Items per page

    Returns:
        Dict with items and pagination info
    """
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        'items': pagination.items,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
            'has_prev': pagination.has_prev,
            'has_next': pagination.has_next
        }
    }


def calculate_volume(length: float, width: float, height: float) -> float:
    """Calculate volume from dimensions"""
    return length * width * height


def calculate_utilization(used: float, total: float) -> float:
    """Calculate utilization percentage"""
    if total == 0:
        return 0.0
    return (used / total) * 100.0


__all__ = [
    'safe_float', 'safe_int', 'safe_bool',
    'serialize_datetime', 'parse_datetime',
    'to_json_safe', 'paginate_query',
    'calculate_volume', 'calculate_utilization'
]
