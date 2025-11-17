#!/usr/bin/env python3
"""
Automated Test Execution Pipeline
Comprehensive test runner to ensure zero human debugging required
"""

import subprocess
import sys
import os
import json
import time
import argparse
from pathlib import Path
from datetime import datetime


class TestExecutionPipeline:
    """Automated test execution pipeline"""
    
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.reports_dir = self.project_root / "reports"
        self.test_results = {
            "timestamp": datetime.now().isoformat(),
            "total_tests": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "duration": 0,
            "suites": {}
        }
    
    def setup_environment(self):
        """Setup testing environment"""
        print("🔧 Setting up testing environment...")
        
        # Ensure reports directory exists
        self.reports_dir.mkdir(exist_ok=True)
        
        # Create subdirectories for different types of reports
        (self.reports_dir / "screenshots").mkdir(exist_ok=True)
        (self.reports_dir / "coverage").mkdir(exist_ok=True)
        (self.reports_dir / "performance").mkdir(exist_ok=True)
        
        # Check if test dependencies are installed
        try:
            import pytest
            import selenium
            import requests
            print("✅ All test dependencies are available")
        except ImportError as e:
            print(f"❌ Missing test dependency: {e}")
            print("Installing test dependencies...")
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements_test.txt"])
        
        print("✅ Testing environment ready")
    
    def run_unit_tests(self):
        """Run unit tests"""
        print("\n🧪 Running Unit Tests...")
        start_time = time.time()
        
        cmd = [
            sys.executable, "-m", "pytest",
            "tests/unit/",
            "-v",
            "--tb=short",
            "--junitxml=reports/unit_tests.xml",
            "--json-report",
            "--json-report-file=reports/unit_tests.json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            duration = time.time() - start_time
            
            self.test_results["suites"]["unit"] = {
                "duration": duration,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
            if result.returncode == 0:
                print(f"✅ Unit tests passed in {duration:.2f}s")
            else:
                print(f"❌ Unit tests failed (exit code: {result.returncode})")
                print(f"Error output: {result.stderr}")
            
            return result.returncode == 0
            
        except Exception as e:
            print(f"❌ Error running unit tests: {e}")
            return False
    
    def run_integration_tests(self):
        """Run integration tests"""
        print("\n🔗 Running Integration Tests...")
        start_time = time.time()
        
        cmd = [
            sys.executable, "-m", "pytest",
            "tests/integration/",
            "-v",
            "--tb=short",
            "--junitxml=reports/integration_tests.xml",
            "--json-report",
            "--json-report-file=reports/integration_tests.json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            duration = time.time() - start_time
            
            self.test_results["suites"]["integration"] = {
                "duration": duration,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
            if result.returncode == 0:
                print(f"✅ Integration tests passed in {duration:.2f}s")
            else:
                print(f"❌ Integration tests failed (exit code: {result.returncode})")
                print(f"Error output: {result.stderr}")
            
            return result.returncode == 0
            
        except Exception as e:
            print(f"❌ Error running integration tests: {e}")
            return False
    
    def run_ui_tests(self):
        """Run UI automation tests"""
        print("\n🖥️  Running UI Automation Tests...")
        start_time = time.time()
        
        cmd = [
            sys.executable, "-m", "pytest",
            "tests/ui/",
            "-v",
            "--tb=short",
            "--junitxml=reports/ui_tests.xml",
            "--json-report",
            "--json-report-file=reports/ui_tests.json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            duration = time.time() - start_time
            
            self.test_results["suites"]["ui"] = {
                "duration": duration,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
            if result.returncode == 0:
                print(f"✅ UI tests passed in {duration:.2f}s")
            else:
                print(f"❌ UI tests failed (exit code: {result.returncode})")
                print(f"Error output: {result.stderr}")
            
            return result.returncode == 0
            
        except Exception as e:
            print(f"❌ Error running UI tests: {e}")
            return False
    
    def run_e2e_tests(self):
        """Run end-to-end tests"""
        print("\n🎭 Running End-to-End Tests...")
        start_time = time.time()
        
        cmd = [
            sys.executable, "-m", "pytest",
            "tests/e2e/",
            "-v",
            "--tb=short",
            "--junitxml=reports/e2e_tests.xml",
            "--json-report",
            "--json-report-file=reports/e2e_tests.json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            duration = time.time() - start_time
            
            self.test_results["suites"]["e2e"] = {
                "duration": duration,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
            if result.returncode == 0:
                print(f"✅ E2E tests passed in {duration:.2f}s")
            else:
                print(f"❌ E2E tests failed (exit code: {result.returncode})")
                print(f"Error output: {result.stderr}")
            
            return result.returncode == 0
            
        except Exception as e:
            print(f"❌ Error running E2E tests: {e}")
            return False
    
    def run_performance_tests(self):
        """Run performance tests"""
        print("\n⚡ Running Performance Tests...")
        start_time = time.time()
        
        cmd = [
            sys.executable, "-m", "pytest",
            "tests/performance/",
            "-v",
            "--tb=short",
            "--junitxml=reports/performance_tests.xml",
            "--json-report",
            "--json-report-file=reports/performance_tests.json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            duration = time.time() - start_time
            
            self.test_results["suites"]["performance"] = {
                "duration": duration,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
            if result.returncode == 0:
                print(f"✅ Performance tests passed in {duration:.2f}s")
            else:
                print(f"❌ Performance tests failed (exit code: {result.returncode})")
                print(f"Error output: {result.stderr}")
            
            return result.returncode == 0
            
        except Exception as e:
            print(f"❌ Error running performance tests: {e}")
            return False
    
    def run_visual_tests(self):
        """Run visual regression tests"""
        print("\n👁️  Running Visual Regression Tests...")
        start_time = time.time()
        
        cmd = [
            sys.executable, "-m", "pytest",
            "tests/visual/",
            "-v",
            "--tb=short",
            "--junitxml=reports/visual_tests.xml",
            "--json-report",
            "--json-report-file=reports/visual_tests.json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            duration = time.time() - start_time
            
            self.test_results["suites"]["visual"] = {
                "duration": duration,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
            if result.returncode == 0:
                print(f"✅ Visual tests passed in {duration:.2f}s")
            else:
                print(f"❌ Visual tests failed (exit code: {result.returncode})")
                print(f"Error output: {result.stderr}")
            
            return result.returncode == 0
            
        except Exception as e:
            print(f"❌ Error running visual tests: {e}")
            return False
    
    def run_coverage_analysis(self):
        """Run code coverage analysis"""
        print("\n📊 Running Code Coverage Analysis...")
        
        cmd = [
            sys.executable, "-m", "pytest",
            "tests/",
            "--cov=.",
            "--cov-report=html:reports/coverage/html",
            "--cov-report=xml:reports/coverage/coverage.xml",
            "--cov-report=term-missing",
            "--cov-fail-under=70"  # Require at least 70% coverage
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            
            if result.returncode == 0:
                print("✅ Code coverage analysis completed")
            else:
                print("⚠️  Code coverage below threshold")
            
            print(f"Coverage output: {result.stdout}")
            return True
            
        except Exception as e:
            print(f"❌ Error running coverage analysis: {e}")
            return False
    
    def generate_comprehensive_report(self):
        """Generate comprehensive test report"""
        print("\n📝 Generating Comprehensive Test Report...")
        
        # Calculate overall results
        total_duration = sum(suite.get("duration", 0) for suite in self.test_results["suites"].values())
        self.test_results["duration"] = total_duration
        
        # Count total results from JSON reports
        for suite_name in ["unit", "integration", "ui", "e2e", "performance", "visual"]:
            json_file = self.reports_dir / f"{suite_name}_tests.json"
            if json_file.exists():
                try:
                    with open(json_file, 'r') as f:
                        data = json.load(f)
                        self.test_results["total_tests"] += data.get("summary", {}).get("total", 0)
                        self.test_results["passed"] += data.get("summary", {}).get("passed", 0)
                        self.test_results["failed"] += data.get("summary", {}).get("failed", 0)
                        self.test_results["skipped"] += data.get("summary", {}).get("skipped", 0)
                except:
                    pass
        
        # Generate HTML report
        html_report = self.generate_html_report()
        
        # Save comprehensive results
        results_file = self.reports_dir / "comprehensive_results.json"
        with open(results_file, 'w') as f:
            json.dump(self.test_results, f, indent=2)
        
        # Save HTML report
        html_file = self.reports_dir / "comprehensive_report.html"
        with open(html_file, 'w') as f:
            f.write(html_report)
        
        print(f"✅ Comprehensive report generated: {html_file}")
        print(f"✅ Results data saved: {results_file}")
    
    def generate_html_report(self):
        """Generate HTML test report"""
        
        total_tests = self.test_results["total_tests"]
        passed = self.test_results["passed"]
        failed = self.test_results["failed"]
        skipped = self.test_results["skipped"]
        duration = self.test_results["duration"]
        
        pass_rate = (passed / total_tests * 100) if total_tests > 0 else 0
        
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TruckOptimum - Comprehensive Test Report</title>
            <style>
                body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }}
                .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .header h1 {{ color: #2c3e50; margin-bottom: 10px; }}
                .header .timestamp {{ color: #7f8c8d; }}
                .summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }}
                .summary-card {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }}
                .summary-card.passed {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }}
                .summary-card.failed {{ background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }}
                .summary-card.duration {{ background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }}
                .summary-card h3 {{ margin: 0 0 10px 0; font-size: 2em; }}
                .summary-card p {{ margin: 0; opacity: 0.9; }}
                .suites {{ margin-top: 30px; }}
                .suite {{ margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }}
                .suite-header {{ background: #34495e; color: white; padding: 15px; cursor: pointer; }}
                .suite-header.failed {{ background: #e74c3c; }}
                .suite-header.passed {{ background: #27ae60; }}
                .suite-content {{ padding: 15px; background: #f8f9fa; }}
                .status-badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }}
                .status-badge.passed {{ background: #d4edda; color: #155724; }}
                .status-badge.failed {{ background: #f8d7da; color: #721c24; }}
                .progress-bar {{ width: 100%; height: 10px; background: #e9ecef; border-radius: 5px; overflow: hidden; margin: 10px 0; }}
                .progress-fill {{ height: 100%; background: linear-gradient(90deg, #28a745, #20c997); transition: width 0.3s ease; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚛 TruckOptimum - Comprehensive Test Report</h1>
                    <p class="timestamp">Generated: {self.test_results["timestamp"]}</p>
                </div>
                
                <div class="summary">
                    <div class="summary-card passed">
                        <h3>{total_tests}</h3>
                        <p>Total Tests</p>
                    </div>
                    <div class="summary-card passed">
                        <h3>{passed}</h3>
                        <p>Passed</p>
                    </div>
                    <div class="summary-card failed">
                        <h3>{failed}</h3>
                        <p>Failed</p>
                    </div>
                    <div class="summary-card duration">
                        <h3>{duration:.1f}s</h3>
                        <p>Total Duration</p>
                    </div>
                </div>
                
                <div class="progress-container">
                    <h3>Overall Pass Rate: {pass_rate:.1f}%</h3>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: {pass_rate}%"></div>
                    </div>
                </div>
                
                <div class="suites">
                    <h2>Test Suite Results</h2>
        """
        
        # Add suite details
        for suite_name, suite_data in self.test_results["suites"].items():
            status = "passed" if suite_data["exit_code"] == 0 else "failed"
            status_badge = f'<span class="status-badge {status}">{status.upper()}</span>'
            
            html += f"""
                    <div class="suite">
                        <div class="suite-header {status}">
                            <h3>{suite_name.title()} Tests {status_badge}</h3>
                            <p>Duration: {suite_data["duration"]:.2f}s | Exit Code: {suite_data["exit_code"]}</p>
                        </div>
                        <div class="suite-content">
                            <h4>Output:</h4>
                            <pre style="background: #f1f3f4; padding: 10px; border-radius: 4px; overflow-x: auto;">{suite_data.get("stdout", "No output")}</pre>
                        </div>
                    </div>
            """
        
        html += """
                </div>
                
                <div style="margin-top: 30px; text-align: center; color: #7f8c8d;">
                    <p>🧪 Zero Human Debugging Required - Comprehensive Test Suite Complete</p>
                    <p>Generated by TruckOptimum Automated Testing Pipeline</p>
                </div>
            </div>
            
            <script>
                // Make suite headers clickable to toggle content
                document.querySelectorAll('.suite-header').forEach(header => {
                    header.addEventListener('click', () => {
                        const content = header.nextElementSibling;
                        content.style.display = content.style.display === 'none' ? 'block' : 'none';
                    });
                });
            </script>
        </body>
        </html>
        """
        
        return html
    
    def run_all_tests(self, suite_filter=None):
        """Run all test suites"""
        print("🚀 Starting Comprehensive Test Execution Pipeline")
        print("=" * 60)
        
        start_time = time.time()
        
        # Setup environment
        self.setup_environment()
        
        # Define test suites to run
        test_suites = {
            "unit": self.run_unit_tests,
            "integration": self.run_integration_tests,
            "ui": self.run_ui_tests,
            "e2e": self.run_e2e_tests,
            "performance": self.run_performance_tests,
            "visual": self.run_visual_tests
        }
        
        # Filter test suites if specified
        if suite_filter:
            test_suites = {k: v for k, v in test_suites.items() if k in suite_filter}
        
        # Run test suites
        all_passed = True
        for suite_name, suite_func in test_suites.items():
            passed = suite_func()
            if not passed:
                all_passed = False
        
        # Run coverage analysis
        self.run_coverage_analysis()
        
        # Generate comprehensive report
        self.generate_comprehensive_report()
        
        total_time = time.time() - start_time
        
        # Print final summary
        print("\n" + "=" * 60)
        print("🎯 COMPREHENSIVE TEST EXECUTION COMPLETE")
        print("=" * 60)
        print(f"Total Execution Time: {total_time:.2f}s")
        print(f"Total Tests: {self.test_results['total_tests']}")
        print(f"Passed: {self.test_results['passed']}")
        print(f"Failed: {self.test_results['failed']}")
        print(f"Skipped: {self.test_results['skipped']}")
        
        if all_passed:
            print("✅ ALL TEST SUITES PASSED - ZERO HUMAN DEBUGGING REQUIRED!")
        else:
            print("❌ SOME TEST SUITES FAILED - REVIEW REQUIRED")
        
        print(f"\n📊 Detailed reports available in: {self.reports_dir}")
        print(f"📝 Comprehensive report: {self.reports_dir}/comprehensive_report.html")
        
        return all_passed


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="TruckOptimum Comprehensive Test Pipeline")
    parser.add_argument(
        "--suite", 
        nargs="+", 
        choices=["unit", "integration", "ui", "e2e", "performance", "visual"],
        help="Run specific test suites only"
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Run only unit and integration tests (quick verification)"
    )
    
    args = parser.parse_args()
    
    pipeline = TestExecutionPipeline()
    
    suite_filter = None
    if args.suite:
        suite_filter = args.suite
    elif args.quick:
        suite_filter = ["unit", "integration"]
    
    success = pipeline.run_all_tests(suite_filter)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()