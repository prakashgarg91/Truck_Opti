import os
import json
import traceback
import logging
from datetime import datetime
from typing import Dict, Any, Optional
import uuid
import platform
import sys
import sqlite3

class ErrorMonitor:
    """Comprehensive error monitoring and diagnostic system for TruckOpti"""
    
    ERROR_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'truck_opti_errors.db')
    LOG_PATH = os.path.join(os.path.dirname(__file__), '..', 'logs', 'error_log.json')
    
    ERROR_LEVELS = {
        'CRITICAL': 50,
        'HIGH': 40,
        'MEDIUM': 30,
        'LOW': 20
    }
    
    def __init__(self):
        # Ensure logs directory exists
        os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'logs'), exist_ok=True)
        
        # Setup error database
        self._init_error_database()
        
        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger('TruckOptiErrorMonitor')
    
    def _init_error_database(self):
        """Initialize SQLite database for error tracking"""
        with sqlite3.connect(self.ERROR_DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS errors (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT,
                    error_type TEXT,
                    error_level TEXT,
                    component TEXT,
                    message TEXT,
                    stack_trace TEXT,
                    context JSON,
                    resolved BOOLEAN DEFAULT 0,
                    resolution_notes TEXT
                )
            ''')
            conn.commit()
    
    def capture_error(
        self, 
        error: Exception, 
        component: str = 'Unknown', 
        error_level: str = 'MEDIUM',
        context: Optional[Dict[str, Any]] = None
    ):
        """
        Capture and log an error with comprehensive context
        
        :param error: The exception to capture
        :param component: Which application component the error occurred in
        :param error_level: Severity of the error (CRITICAL, HIGH, MEDIUM, LOW)
        :param context: Additional context about the error
        """
        error_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        # Prepare error context
        error_context = {
            'system': {
                'os': platform.system(),
                'os_version': platform.version(),
                'python_version': platform.python_version()
            },
            'user_context': context or {}
        }
        
        # Get stack trace
        stack_trace = traceback.format_exc()
        
        # Log to console
        self.logger.log(
            self.ERROR_LEVELS.get(error_level, logging.WARNING), 
            f"[{error_id}] {component} Error: {str(error)}"
        )
        
        # Store in database
        with sqlite3.connect(self.ERROR_DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO errors 
                (id, timestamp, error_type, error_level, component, message, stack_trace, context, resolved)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                error_id, 
                timestamp, 
                type(error).__name__, 
                error_level, 
                component, 
                str(error), 
                stack_trace, 
                json.dumps(error_context), 
                False
            ))
            conn.commit()
        
        # Optionally write to JSON log file
        try:
            with open(self.LOG_PATH, 'a+') as log_file:
                log_entry = {
                    'id': error_id,
                    'timestamp': timestamp,
                    'error_type': type(error).__name__,
                    'error_level': error_level,
                    'component': component,
                    'message': str(error),
                    'stack_trace': stack_trace,
                    'context': error_context
                }
                json.dump(log_entry, log_file)
                log_file.write('\n')
        except Exception as log_error:
            print(f"Could not write to log file: {log_error}")
        
        return error_id
    
    def get_error_report(self, days: int = 7) -> Dict[str, Any]:
        """
        Generate an error report for the last specified number of days
        
        :param days: Number of days to include in the report
        :return: Dictionary with error statistics and details
        """
        with sqlite3.connect(self.ERROR_DB_PATH) as conn:
            cursor = conn.cursor()
            # Implement error report generation logic
            cursor.execute('''
                SELECT 
                    error_level, 
                    COUNT(*) as count, 
                    COUNT(CASE WHEN resolved = 1 THEN 1 END) as resolved_count
                FROM errors
                WHERE timestamp >= datetime('now', ?)
                GROUP BY error_level
            ''', (f'-{days} days',))
            
            error_summary = {}
            for level, total, resolved in cursor.fetchall():
                error_summary[level] = {
                    'total': total,
                    'resolved': resolved,
                    'unresolved': total - resolved
                }
            
            return error_summary
    
    def resolve_error(self, error_id: str, resolution_notes: str):
        """
        Mark an error as resolved
        
        :param error_id: ID of the error to resolve
        :param resolution_notes: Notes about how the error was resolved
        """
        with sqlite3.connect(self.ERROR_DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE errors 
                SET resolved = 1, resolution_notes = ?
                WHERE id = ?
            ''', (resolution_notes, error_id))
            conn.commit()

# Global error monitor instance
error_monitor = ErrorMonitor()

def capture_error(
    error: Exception, 
    component: str = 'Unknown', 
    error_level: str = 'MEDIUM',
    context: Optional[Dict[str, Any]] = None
):
    """
    Global function to capture errors easily across the application
    
    :param error: The exception to capture
    :param component: Which application component the error occurred in
    :param error_level: Severity of the error (CRITICAL, HIGH, MEDIUM, LOW)
    :param context: Additional context about the error
    :return: Error ID for tracking
    """
    return error_monitor.capture_error(
        error, 
        component=component, 
        error_level=error_level, 
        context=context
    )
