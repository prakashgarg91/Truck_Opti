"""
Enhanced Error Logging and Debugging System
Comprehensive error tracking for easy debugging and correction
"""

import logging
import os
import sys
import traceback
import json
from datetime import datetime
from pathlib import Path


class TruckOptimumErrorLogger:
    """Comprehensive error logging and debugging system"""
    
    def __init__(self):
        # Initialize paths first
        self.error_log_path = "logs/truck_optimum_errors.log"
        self.debug_log_path = "logs/truck_optimum_debug.log"
        self.session_log_path = f"logs/session_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        
        # Create logs directory
        os.makedirs("logs", exist_ok=True)
        
        # Initialize error tracking
        self.error_count = 0
        self.session_errors = []
        
        # Setup logging after paths are defined
        self.setup_logging()
    
    def setup_logging(self):
        """Setup comprehensive logging configuration"""
        
        # Create logs directory
        os.makedirs("logs", exist_ok=True)
        
        # Configure root logger
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s',
            handlers=[
                logging.FileHandler("logs/truck_optimum_complete.log", encoding='utf-8'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        
        # Create specific loggers
        self.logger = logging.getLogger('TruckOptimum')
        self.error_logger = logging.getLogger('TruckOptimum.Errors')
        self.debug_logger = logging.getLogger('TruckOptimum.Debug')
        self.performance_logger = logging.getLogger('TruckOptimum.Performance')
        
        # Error-specific handler
        error_handler = logging.FileHandler(self.error_log_path, encoding='utf-8')
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(logging.Formatter(
            '%(asctime)s - ERROR - %(filename)s:%(lineno)d - %(funcName)s() - %(message)s\n%(pathname)s\nTraceback: %(exc_info)s\n' + '='*100 + '\n'
        ))
        self.error_logger.addHandler(error_handler)
        
        # Debug-specific handler
        debug_handler = logging.FileHandler(self.debug_log_path, encoding='utf-8')
        debug_handler.setLevel(logging.DEBUG)
        debug_handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s'
        ))
        self.debug_logger.addHandler(debug_handler)
    
    def log_error(self, error, context="", user_action="", expected_behavior="", actual_behavior=""):
        """Log detailed error information for easy debugging"""
        
        self.error_count += 1
        
        error_details = {
            "timestamp": datetime.now().isoformat(),
            "error_id": f"ERR_{self.error_count:04d}",
            "error_type": type(error).__name__,
            "error_message": str(error),
            "context": context,
            "user_action": user_action,
            "expected_behavior": expected_behavior,
            "actual_behavior": actual_behavior,
            "file_info": {
                "filename": traceback.extract_tb(error.__traceback__)[-1].filename if error.__traceback__ else "unknown",
                "line_number": traceback.extract_tb(error.__traceback__)[-1].lineno if error.__traceback__ else "unknown",
                "function": traceback.extract_tb(error.__traceback__)[-1].name if error.__traceback__ else "unknown"
            },
            "full_traceback": traceback.format_exc(),
            "system_info": {
                "python_version": sys.version,
                "platform": sys.platform,
                "executable_path": sys.executable
            }
        }
        
        # Add to session errors
        self.session_errors.append(error_details)
        
        # Log to error logger
        self.error_logger.error(
            f"ERROR {error_details['error_id']}: {error_details['error_message']}\n"
            f"Context: {context}\n"
            f"User Action: {user_action}\n"
            f"Expected: {expected_behavior}\n"
            f"Actual: {actual_behavior}\n"
            f"File: {error_details['file_info']['filename']}:{error_details['file_info']['line_number']}\n"
            f"Function: {error_details['file_info']['function']}\n"
            f"Full Traceback:\n{error_details['full_traceback']}"
        )
        
        # Save detailed JSON error report
        error_report_path = f"logs/error_report_{error_details['error_id']}.json"
        with open(error_report_path, 'w', encoding='utf-8') as f:
            json.dump(error_details, f, indent=2, ensure_ascii=False)
        
        # Print user-friendly error message
        print(f"\n{'='*60}")
        print(f"ERROR {error_details['error_id']}: {error_details['error_message']}")
        print(f"Location: {error_details['file_info']['filename']}:{error_details['file_info']['line_number']}")
        print(f"Context: {context}")
        if user_action:
            print(f"User Action: {user_action}")
        if expected_behavior:
            print(f"Expected: {expected_behavior}")
        if actual_behavior:
            print(f"Actual: {actual_behavior}")
        print(f"Detailed Report: {error_report_path}")
        print(f"All Logs: logs/truck_optimum_errors.log")
        print(f"{'='*60}\n")
    
    def log_debug(self, message, category="GENERAL", details=None):
        """Log debug information with detailed context"""
        
        debug_info = {
            "timestamp": datetime.now().isoformat(),
            "category": category,
            "message": message,
            "details": details,
            "call_info": {
                "filename": traceback.extract_stack()[-2].filename,
                "line_number": traceback.extract_stack()[-2].lineno,
                "function": traceback.extract_stack()[-2].name
            }
        }
        
        self.debug_logger.debug(f"[{category}] {message} | Details: {details}")
    
    def log_performance(self, operation, duration, details=None):
        """Log performance metrics for monitoring"""
        
        performance_info = {
            "timestamp": datetime.now().isoformat(),
            "operation": operation,
            "duration_seconds": duration,
            "details": details,
            "performance_status": "SLOW" if duration > 5.0 else "NORMAL" if duration > 1.0 else "FAST"
        }
        
        self.performance_logger.info(f"PERFORMANCE: {operation} took {duration:.3f}s - {performance_info['performance_status']}")
        
        # Log slow operations to error log for attention
        if duration > 5.0:
            self.error_logger.warning(f"SLOW OPERATION: {operation} took {duration:.3f}s - investigate performance issue")
    
    def log_user_action(self, action, page, result="SUCCESS", error=None):
        """Log user actions for debugging user workflows"""
        
        user_log = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "page": page,
            "result": result,
            "error": str(error) if error else None
        }
        
        if result == "SUCCESS":
            self.logger.info(f"USER ACTION: {action} on {page} - {result}")
        else:
            self.error_logger.error(f"USER ACTION FAILED: {action} on {page} - {error}")
    
    def generate_session_report(self):
        """Generate comprehensive session error report"""
        
        session_report = {
            "session_start": datetime.now().isoformat(),
            "total_errors": len(self.session_errors),
            "errors": self.session_errors,
            "summary": {
                "critical_errors": len([e for e in self.session_errors if "Critical" in e.get("context", "")]),
                "api_errors": len([e for e in self.session_errors if "API" in e.get("context", "")]),
                "ui_errors": len([e for e in self.session_errors if "UI" in e.get("context", "")]),
                "database_errors": len([e for e in self.session_errors if "Database" in e.get("context", "")])
            }
        }
        
        # Save session report
        with open(self.session_log_path, 'w', encoding='utf-8') as f:
            json.dump(session_report, f, indent=2, ensure_ascii=False)
        
        return session_report
    
    def get_error_summary(self):
        """Get quick error summary for dashboard"""
        
        if not os.path.exists(self.error_log_path):
            return {"total_errors": 0, "recent_errors": []}
        
        # Read recent errors
        try:
            with open(self.error_log_path, 'r', encoding='utf-8') as f:
                content = f.read()
                error_lines = [line for line in content.split('\n') if 'ERROR' in line]
                
            return {
                "total_errors": len(error_lines),
                "recent_errors": error_lines[-5:] if error_lines else [],
                "error_log_path": self.error_log_path,
                "debug_log_path": self.debug_log_path
            }
        except Exception as e:
            return {"total_errors": 0, "recent_errors": [], "read_error": str(e)}


# Global error logger instance
error_logger = TruckOptimumErrorLogger()


def handle_flask_error(error):
    """Flask error handler with comprehensive logging"""
    
    error_logger.log_error(
        error,
        context="Flask Application Error",
        user_action="Accessing web interface",
        expected_behavior="Page should load correctly",
        actual_behavior=f"Flask error: {str(error)}"
    )
    
    return {
        "error": True,
        "message": "An error occurred. Details have been logged for debugging.",
        "error_id": f"ERR_{error_logger.error_count:04d}",
        "timestamp": datetime.now().isoformat()
    }, 500


def handle_api_error(error, endpoint="", method="", data=None):
    """API-specific error handler"""
    
    error_logger.log_error(
        error,
        context=f"API Error - {method} {endpoint}",
        user_action=f"API call to {endpoint}",
        expected_behavior="API should return valid response",
        actual_behavior=f"API error: {str(error)}"
    )
    
    return {
        "success": False,
        "error": str(error),
        "error_id": f"ERR_{error_logger.error_count:04d}",
        "endpoint": endpoint,
        "method": method,
        "timestamp": datetime.now().isoformat()
    }


def handle_database_error(error, operation="", table="", query=""):
    """Database-specific error handler"""
    
    error_logger.log_error(
        error,
        context=f"Database Error - {operation} on {table}",
        user_action=f"Database operation: {operation}",
        expected_behavior="Database operation should complete successfully",
        actual_behavior=f"Database error: {str(error)}"
    )


def log_startup_info():
    """Log application startup information"""
    
    error_logger.logger.info("="*60)
    error_logger.logger.info("TRUCKOPTIMUM APPLICATION STARTING")
    error_logger.logger.info("="*60)
    error_logger.logger.info(f"Python Version: {sys.version}")
    error_logger.logger.info(f"Platform: {sys.platform}")
    error_logger.logger.info(f"Working Directory: {os.getcwd()}")
    error_logger.logger.info(f"Executable Path: {sys.executable}")
    error_logger.logger.info(f"Error Logging: ENABLED")
    error_logger.logger.info(f"Debug Logging: ENABLED")
    error_logger.logger.info(f"Performance Monitoring: ENABLED")
    error_logger.logger.info("="*60)


def log_shutdown_info():
    """Log application shutdown information"""
    
    session_report = error_logger.generate_session_report()
    
    error_logger.logger.info("="*60)
    error_logger.logger.info("TRUCKOPTIMUM APPLICATION SHUTTING DOWN")
    error_logger.logger.info("="*60)
    error_logger.logger.info(f"Session Errors: {session_report['total_errors']}")
    error_logger.logger.info(f"Session Report: {error_logger.session_log_path}")
    error_logger.logger.info(f"Error Logs: {error_logger.error_log_path}")
    error_logger.logger.info(f"Debug Logs: {error_logger.debug_log_path}")
    error_logger.logger.info("="*60)


if __name__ == "__main__":
    # Test the error logging system
    print("Testing TruckOptimum Error Logging System...")
    
    # Test error logging
    try:
        raise ValueError("Test error for logging system validation")
    except Exception as e:
        error_logger.log_error(
            e,
            context="Testing error logging system",
            user_action="Running error logger test",
            expected_behavior="Error should be logged with full details",
            actual_behavior="Test error occurred as expected"
        )
    
    # Test debug logging
    error_logger.log_debug("System initialization test", "STARTUP", {"test": "successful"})
    
    # Test performance logging
    import time
    start = time.time()
    time.sleep(0.1)  # Simulate operation
    error_logger.log_performance("test_operation", time.time() - start)
    
    # Test user action logging
    error_logger.log_user_action("test_action", "test_page", "SUCCESS")
    
    # Generate session report
    report = error_logger.generate_session_report()
    
    print("Error logging system test completed!")
    print(f"Session Report: {error_logger.session_log_path}")
    print(f"Error Log: {error_logger.error_log_path}")
    print(f"Debug Log: {error_logger.debug_log_path}")