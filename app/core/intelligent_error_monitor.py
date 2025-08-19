#!/usr/bin/env python3
"""
Intelligent Error Monitor and Self-Improvement System
Captures errors automatically and provides improvement suggestions
"""

import os
import sys
import json
import sqlite3
import traceback
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from collections import defaultdict
import hashlib
from flask import request

@dataclass
class ErrorCapture:
    """Structured error capture with intelligence"""
    id: str
    timestamp: datetime
    error_type: str
    error_message: str
    stack_trace: str
    request_data: Optional[Dict] = None
    user_context: Optional[Dict] = None
    environment: Optional[Dict] = None
    frequency: int = 1
    severity: str = "medium"
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'error_type': self.error_type,
            'error_message': self.error_message,
            'stack_trace': self.stack_trace,
            'request_data': self.request_data,
            'user_context': self.user_context,
            'environment': self.environment,
            'frequency': self.frequency,
            'severity': self.severity
        }

@dataclass
class ImprovementSuggestion:
    """AI-powered improvement suggestion"""
    error_id: str
    suggestion_type: str
    description: str
    code_changes: Optional[str] = None
    priority: str = "medium"
    estimated_impact: str = "medium"
    implementation_notes: str = ""

class IntelligentErrorMonitor:
    """
    Advanced Error Monitoring System with Self-Improvement Capabilities
    """
    
    def __init__(self, db_path: str = "app/intelligent_errors.db"):
        self.db_path = db_path
        self.logger = logging.getLogger('intelligent_error_monitor')
        self.setup_database()
        self.error_patterns = self.load_error_patterns()
        
    def setup_database(self):
        """Setup SQLite database for error storage"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS error_captures (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    error_type TEXT NOT NULL,
                    error_message TEXT NOT NULL,
                    stack_trace TEXT NOT NULL,
                    request_data TEXT,
                    user_context TEXT,
                    environment TEXT,
                    frequency INTEGER DEFAULT 1,
                    severity TEXT DEFAULT 'medium',
                    status TEXT DEFAULT 'active',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS improvement_suggestions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    error_id TEXT NOT NULL,
                    suggestion_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    code_changes TEXT,
                    priority TEXT DEFAULT 'medium',
                    estimated_impact TEXT DEFAULT 'medium',
                    implementation_notes TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (error_id) REFERENCES error_captures (id)
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS error_analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    analysis_date TEXT NOT NULL,
                    total_errors INTEGER,
                    critical_errors INTEGER,
                    resolved_errors INTEGER,
                    improvement_suggestions INTEGER,
                    system_health_score REAL,
                    analytics_data TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
    
    def capture_error(self, error: Exception, request_data: Optional[Dict] = None, 
                     user_context: Optional[Dict] = None) -> str:
        """Capture and analyze error intelligently"""
        try:
            # Generate unique error ID based on error signature
            error_signature = f"{type(error).__name__}:{str(error)}"
            error_id = hashlib.md5(error_signature.encode()).hexdigest()[:12]
            
            # Extract comprehensive error information
            stack_trace = traceback.format_exc()
            error_type = type(error).__name__
            error_message = str(error)
            
            # Capture environment context
            environment = {
                'python_version': sys.version,
                'platform': sys.platform,
                'working_directory': os.getcwd(),
                'timestamp': datetime.now().isoformat()
            }
            
            # Determine severity automatically
            severity = self.analyze_error_severity(error_type, error_message, stack_trace)
            
            # Check if this error already exists
            existing_error = self.get_error_by_id(error_id)
            if existing_error:
                # Update frequency
                self.update_error_frequency(error_id)
                return error_id
            
            # Create new error capture
            error_capture = ErrorCapture(
                id=error_id,
                timestamp=datetime.now(),
                error_type=error_type,
                error_message=error_message,
                stack_trace=stack_trace,
                request_data=request_data,
                user_context=user_context,
                environment=environment,
                severity=severity
            )
            
            # Store in database
            self.store_error(error_capture)
            
            # Generate improvement suggestions
            suggestions = self.generate_improvement_suggestions(error_capture)
            for suggestion in suggestions:
                self.store_suggestion(suggestion)
            
            # Log the error
            self.logger.error(f"Error captured: {error_id} - {error_message}")
            
            return error_id
            
        except Exception as e:
            # Fallback logging if error capture itself fails
            self.logger.error(f"Failed to capture error: {e}")
            return "error_capture_failed"
    
    def analyze_error_severity(self, error_type: str, error_message: str, stack_trace: str) -> str:
        """Intelligently analyze error severity"""
        critical_patterns = [
            'database', 'connection', 'authentication', 'security', 'corruption',
            'memory', 'overflow', 'deadlock', 'timeout', 'crash'
        ]
        
        high_patterns = [
            'permission', 'access', 'file not found', 'network', 'api',
            'validation', 'parsing', 'encoding', 'json', 'xml'
        ]
        
        error_text = f"{error_type} {error_message} {stack_trace}".lower()
        
        if any(pattern in error_text for pattern in critical_patterns):
            return "critical"
        elif any(pattern in error_text for pattern in high_patterns):
            return "high"
        elif error_type in ['ValueError', 'TypeError', 'KeyError']:
            return "medium"
        else:
            return "low"
    
    def generate_improvement_suggestions(self, error_capture: ErrorCapture) -> List[ImprovementSuggestion]:
        """Generate AI-powered improvement suggestions"""
        suggestions = []
        
        error_type = error_capture.error_type
        error_message = error_capture.error_message
        stack_trace = error_capture.stack_trace
        
        # Database-related errors
        if 'database' in error_message.lower() or 'sqlite' in stack_trace.lower():
            suggestions.append(ImprovementSuggestion(
                error_id=error_capture.id,
                suggestion_type="database_optimization",
                description="Implement database connection pooling and retry logic",
                code_changes="""
# Add to database connection handler
try:
    with sqlite3.connect(db_path, timeout=30) as conn:
        conn.execute('PRAGMA journal_mode=WAL')  # Better concurrency
        # Your database operations here
except sqlite3.OperationalError as e:
    if 'locked' in str(e):
        time.sleep(0.1)  # Brief wait and retry
        # Retry logic here
""",
                priority="high",
                estimated_impact="high",
                implementation_notes="Add connection pooling and WAL mode for better concurrency"
            ))
        
        # Validation errors
        if error_type in ['ValueError', 'TypeError']:
            suggestions.append(ImprovementSuggestion(
                error_id=error_capture.id,
                suggestion_type="input_validation",
                description="Add comprehensive input validation and sanitization",
                code_changes="""
def validate_input(data, schema):
    \"\"\"Add comprehensive input validation\"\"\"
    if not isinstance(data, dict):
        raise ValueError("Input must be a dictionary")
    
    for field, requirements in schema.items():
        if field not in data:
            raise ValueError(f"Missing required field: {field}")
        
        value = data[field]
        if 'type' in requirements and not isinstance(value, requirements['type']):
            raise TypeError(f"Field {field} must be of type {requirements['type']}")
        
        if 'range' in requirements:
            min_val, max_val = requirements['range']
            if not (min_val <= value <= max_val):
                raise ValueError(f"Field {field} must be between {min_val} and {max_val}")
    
    return True
""",
                priority="medium",
                estimated_impact="medium",
                implementation_notes="Implement schema-based validation for all user inputs"
            ))
        
        # API/Network errors
        if 'network' in error_message.lower() or 'connection' in error_message.lower():
            suggestions.append(ImprovementSuggestion(
                error_id=error_capture.id,
                suggestion_type="network_resilience",
                description="Implement exponential backoff and circuit breaker pattern",
                code_changes="""
import time
import random

def retry_with_backoff(func, max_retries=3, base_delay=1):
    \"\"\"Implement exponential backoff retry logic\"\"\"
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)
    
    raise Exception("Max retries exceeded")
""",
                priority="high",
                estimated_impact="high",
                implementation_notes="Add retry logic for all network operations"
            ))
        
        # Memory/Performance errors
        if 'memory' in error_message.lower() or 'performance' in stack_trace.lower():
            suggestions.append(ImprovementSuggestion(
                error_id=error_capture.id,
                suggestion_type="performance_optimization",
                description="Implement memory optimization and caching strategies",
                code_changes="""
from functools import lru_cache
import gc

@lru_cache(maxsize=128)
def cached_expensive_operation(param):
    \"\"\"Cache expensive operations\"\"\"
    # Your expensive operation here
    pass

def optimize_memory():
    \"\"\"Periodic memory optimization\"\"\"
    gc.collect()  # Force garbage collection
    # Clear unnecessary caches
    cached_expensive_operation.cache_clear()
""",
                priority="medium",
                estimated_impact="high",
                implementation_notes="Add caching and memory management"
            ))
        
        # UI/UX errors
        if 'template' in stack_trace.lower() or 'render' in error_message.lower():
            suggestions.append(ImprovementSuggestion(
                error_id=error_capture.id,
                suggestion_type="ui_error_handling",
                description="Implement graceful UI error handling and fallbacks",
                code_changes="""
function handleUIError(error, fallbackContent) {
    console.error('UI Error:', error);
    
    // Capture error for monitoring
    captureError({
        type: 'ui_error',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
    
    // Show user-friendly fallback
    showErrorFallback(fallbackContent);
}

function showErrorFallback(content) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-fallback';
    errorDiv.innerHTML = content || 'Something went wrong. Please try again.';
    document.body.appendChild(errorDiv);
}
""",
                priority="medium",
                estimated_impact="medium",
                implementation_notes="Add comprehensive frontend error boundaries"
            ))
        
        return suggestions
    
    def store_error(self, error_capture: ErrorCapture):
        """Store error in database"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT OR REPLACE INTO error_captures 
                (id, timestamp, error_type, error_message, stack_trace, 
                 request_data, user_context, environment, frequency, severity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                error_capture.id,
                error_capture.timestamp.isoformat(),
                error_capture.error_type,
                error_capture.error_message,
                error_capture.stack_trace,
                json.dumps(error_capture.request_data),
                json.dumps(error_capture.user_context),
                json.dumps(error_capture.environment),
                error_capture.frequency,
                error_capture.severity
            ))
    
    def store_suggestion(self, suggestion: ImprovementSuggestion):
        """Store improvement suggestion"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT INTO improvement_suggestions 
                (error_id, suggestion_type, description, code_changes, 
                 priority, estimated_impact, implementation_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                suggestion.error_id,
                suggestion.suggestion_type,
                suggestion.description,
                suggestion.code_changes,
                suggestion.priority,
                suggestion.estimated_impact,
                suggestion.implementation_notes
            ))
    
    def get_error_by_id(self, error_id: str) -> Optional[Dict]:
        """Get error by ID"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                'SELECT * FROM error_captures WHERE id = ?', 
                (error_id,)
            )
            row = cursor.fetchone()
            if row:
                columns = [description[0] for description in cursor.description]
                return dict(zip(columns, row))
        return None
    
    def update_error_frequency(self, error_id: str):
        """Update error frequency"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                UPDATE error_captures 
                SET frequency = frequency + 1,
                    timestamp = ?
                WHERE id = ?
            ''', (datetime.now().isoformat(), error_id))
    
    def get_error_analytics(self, days: int = 7) -> Dict:
        """Get comprehensive error analytics"""
        since_date = datetime.now() - timedelta(days=days)
        
        with sqlite3.connect(self.db_path) as conn:
            # Total errors
            cursor = conn.execute('''
                SELECT COUNT(*), severity FROM error_captures 
                WHERE timestamp > ? 
                GROUP BY severity
            ''', (since_date.isoformat(),))
            severity_counts = dict(cursor.fetchall())
            
            # Most frequent errors
            cursor = conn.execute('''
                SELECT error_type, error_message, frequency, severity
                FROM error_captures 
                WHERE timestamp > ?
                ORDER BY frequency DESC
                LIMIT 10
            ''', (since_date.isoformat(),))
            frequent_errors = cursor.fetchall()
            
            # Improvement suggestions
            cursor = conn.execute('''
                SELECT suggestion_type, priority, COUNT(*) as count
                FROM improvement_suggestions s
                JOIN error_captures e ON s.error_id = e.id
                WHERE e.timestamp > ?
                GROUP BY suggestion_type, priority
                ORDER BY count DESC
            ''', (since_date.isoformat(),))
            suggestions_summary = cursor.fetchall()
            
            # Calculate health score
            total_errors = sum(severity_counts.values())
            critical_errors = severity_counts.get('critical', 0)
            high_errors = severity_counts.get('high', 0)
            
            health_score = max(0, 100 - (critical_errors * 10 + high_errors * 5 + total_errors * 1))
            
            return {
                'total_errors': total_errors,
                'severity_breakdown': severity_counts,
                'frequent_errors': frequent_errors,
                'suggestions_summary': suggestions_summary,
                'health_score': health_score,
                'analysis_period_days': days,
                'generated_at': datetime.now().isoformat()
            }
    
    def get_improvement_suggestions(self, limit: int = 10) -> List[Dict]:
        """Get latest improvement suggestions"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute('''
                SELECT s.*, e.error_message, e.frequency
                FROM improvement_suggestions s
                JOIN error_captures e ON s.error_id = e.id
                WHERE s.status = 'pending'
                ORDER BY e.frequency DESC, s.priority DESC
                LIMIT ?
            ''', (limit,))
            
            columns = [description[0] for description in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    def mark_suggestion_implemented(self, suggestion_id: int):
        """Mark suggestion as implemented"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                UPDATE improvement_suggestions 
                SET status = 'implemented', 
                    implemented_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (suggestion_id,))
    
    def load_error_patterns(self) -> Dict:
        """Load known error patterns for intelligent analysis"""
        return {
            'database_patterns': [
                'database is locked',
                'no such table',
                'sql syntax error',
                'constraint failed'
            ],
            'network_patterns': [
                'connection refused',
                'timeout',
                'network unreachable',
                'dns resolution failed'
            ],
            'validation_patterns': [
                'invalid input',
                'missing required field',
                'out of range',
                'invalid format'
            ]
        }
    
    def generate_error_report(self) -> str:
        """Generate comprehensive error report"""
        analytics = self.get_error_analytics()
        suggestions = self.get_improvement_suggestions()
        
        report = f"""
# Intelligent Error Analysis Report
Generated: {analytics['generated_at']}
Analysis Period: {analytics['analysis_period_days']} days

## System Health Score: {analytics['health_score']}/100

## Error Summary
- Total Errors: {analytics['total_errors']}
- Critical: {analytics['severity_breakdown'].get('critical', 0)}
- High: {analytics['severity_breakdown'].get('high', 0)}
- Medium: {analytics['severity_breakdown'].get('medium', 0)}
- Low: {analytics['severity_breakdown'].get('low', 0)}

## Top Improvement Suggestions
"""
        
        for i, suggestion in enumerate(suggestions[:5], 1):
            report += f"""
### {i}. {suggestion['suggestion_type'].title()} (Priority: {suggestion['priority']})
**Error**: {suggestion['error_message']} (Frequency: {suggestion['frequency']})
**Suggestion**: {suggestion['description']}
**Implementation Notes**: {suggestion['implementation_notes']}
"""
        
        return report

# Global error monitor instance
error_monitor = IntelligentErrorMonitor()

# Decorator for automatic error capture
def capture_errors(func):
    """Decorator to automatically capture errors"""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            error_id = error_monitor.capture_error(e, {
                'function': func.__name__,
                'args': str(args)[:200],  # Limit size
                'kwargs': str(kwargs)[:200]
            })
            raise e
    return wrapper

# Flask error handler integration
def setup_flask_error_capture(app):
    """Setup Flask error capture"""
    @app.errorhandler(Exception)
    def handle_exception(e):
        error_id = error_monitor.capture_error(e, {
            'endpoint': request.endpoint,
            'method': request.method,
            'url': request.url,
            'user_agent': request.headers.get('User-Agent')
        })
        
        # Check if this is an API request or HTML request
        is_api_request = (request.endpoint and request.endpoint.startswith('api.')) or \
                        request.path.startswith('/api/') or \
                        'application/json' in (request.headers.get('Accept', ''))
        
        if is_api_request:
            return {
                'error': 'An error occurred',
                'error_id': error_id,
                'message': 'This error has been captured for analysis and improvement'
            }, 500
        else:
            # For HTML requests, let Flask handle the error normally
            # This allows template rendering to work properly
            import traceback
            print(f"[ERROR] Template rendering error: {str(e)}")
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            
            # Re-raise the exception to let Flask handle it normally
            raise e

if __name__ == "__main__":
    # Test the error monitor
    monitor = IntelligentErrorMonitor()
    
    # Simulate some errors
    try:
        raise ValueError("Test validation error")
    except Exception as e:
        monitor.capture_error(e)
    
    try:
        raise ConnectionError("Test network error") 
    except Exception as e:
        monitor.capture_error(e)
    
    # Generate report
    print(monitor.generate_error_report())