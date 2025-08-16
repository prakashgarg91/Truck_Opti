import os
import sys
import subprocess
import json
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('build_v3.6.0.log', mode='w'),
        logging.StreamHandler(sys.stdout)
    ]
)

class TruckOptiBuildManager:
    def __init__(self, base_path=None):
        """Initialize build manager with optional base path"""
        self.base_path = base_path or Path(__file__).parent
        self.version = "v3.6.0"
        
    def validate_environment(self):
        """Validate development environment"""
        logging.info("Validating development environment...")
        
        # Check Python version
        logging.info(f"Python version: {sys.version}")
        if sys.version_info < (3, 10):
            logging.error("Requires Python 3.10+")
            return False
        
        # Check required dependencies
        try:
            import flask
            import sqlalchemy
            import numpy
            import pandas
        except ImportError as e:
            logging.error(f"Missing dependency: {e}")
            return False
        
        return True
    
    def run_tests(self):
        """Run comprehensive test suite"""
        logging.info("Running comprehensive test suite...")
        test_scripts = [
            'test_final_comprehensive_all_features.py',
            'test_sale_order_comprehensive_safe.py',
            'test_fleet_optimization.py',
            'test_file_upload.py'
        ]
        
        for test_script in test_scripts:
            try:
                result = subprocess.run(
                    [sys.executable, test_script], 
                    capture_output=True, 
                    text=True, 
                    cwd=self.base_path
                )
                if result.returncode != 0:
                    logging.error(f"Test {test_script} failed: {result.stderr}")
                    return False
            except Exception as e:
                logging.error(f"Error running {test_script}: {e}")
                return False
        
        return True
    
    def generate_dimensional_report(self):
        """Generate dimensional validation report"""
        logging.info("Generating dimensional validation report...")
        
        # Import validate_dimensional_integrity dynamically
        sys.path.append(str(self.base_path))
        from app.packer import validate_dimensional_integrity
        
        report = validate_dimensional_integrity()
        
        # Write comprehensive report
        with open(self.base_path / 'DIMENSIONAL_VALIDATION_REPORT.md', 'w') as f:
            f.write("# TruckOpti Enterprise v3.6.0 - Dimensional Validation Report\n\n")
            f.write(f"**Validation Timestamp:** {report['validation_timestamp']}\n\n")
            f.write(f"**Overall Status:** {report['overall_status']}\n\n")
            
            # Critical Issues
            f.write("## Critical Issues\n")
            for issue in report['critical_issues']:
                f.write(f"- {issue}\n")
            
            # Warnings
            f.write("\n## Warnings\n")
            for warning in report['warnings']:
                f.write(f"- {warning}\n")
            
            # Recommendations
            f.write("\n## Recommendations\n")
            for recommendation in report['recommendations']:
                f.write(f"- {recommendation}\n")
        
        return report['overall_status'] == 'PASSED'
    
    def build_executable(self):
        """Build executable with PyInstaller"""
        logging.info("Building executable...")
        
        try:
            result = subprocess.run(
                ['pyinstaller', 'TruckOpti_Enterprise.spec', '--clean', '--noconfirm'], 
                capture_output=True, 
                text=True,
                cwd=self.base_path
            )
            
            if result.returncode != 0:
                logging.error(f"Build failed: {result.stderr}")
                return False
            
            logging.info("Executable built successfully")
            return True
        
        except Exception as e:
            logging.error(f"Build error: {e}")
            return False
    
    def validate_executable(self):
        """Validate the built executable"""
        logging.info("Validating executable...")
        executable_path = self.base_path / 'dist' / f'TruckOpti_Enterprise_v{self.version}.exe'
        
        if not executable_path.exists():
            logging.error(f"Executable not found: {executable_path}")
            return False
        
        # You could add more validation steps here, like checking file size, version info, etc.
        return True
    
    def generate_build_report(self, build_success, test_success, validation_success):
        """Generate comprehensive build report"""
        report = {
            "version": self.version,
            "build_status": "SUCCESS" if build_success else "FAILED",
            "test_status": "PASSED" if test_success else "FAILED",
            "dimensional_validation_status": "PASSED" if validation_success else "FAILED",
            "build_timestamp": logging.Formatter().formatTime(logging.LogRecord("", 0, "", 0, "", (), None)),
            "overall_status": all([build_success, test_success, validation_success])
        }
        
        with open(self.base_path / 'BUILD_REPORT_v3.6.0.json', 'w') as f:
            json.dump(report, f, indent=4)
        
        return report
    
    def run_build_process(self):
        """Orchestrate complete build process"""
        logging.info(f"Starting TruckOpti Enterprise {self.version} Build Process")
        
        # Environment Validation
        if not self.validate_environment():
            logging.error("Environment validation failed")
            return False
        
        # Run Tests
        test_success = self.run_tests()
        
        # Generate Dimensional Report
        validation_success = self.generate_dimensional_report()
        
        # Build Executable
        build_success = self.build_executable()
        
        # Validate Executable
        executable_valid = self.validate_executable()
        
        # Generate Build Report
        build_report = self.generate_build_report(
            build_success and executable_valid, 
            test_success, 
            validation_success
        )
        
        logging.info(f"Build Process Completed: {build_report['overall_status']}")
        return build_report['overall_status']

if __name__ == "__main__":
    build_manager = TruckOptiBuildManager()
    success = build_manager.run_build_process()
    sys.exit(0 if success else 1)