#!/usr/bin/env python3
"""
TruckOpti Enterprise - Python 3.13 Compatible Build Script
Builds executable with proper error handling and compatibility checks
"""

import sys
import os
import subprocess
import shutil
import time
from pathlib import Path

class TruckOptiBuildManager:
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.spec_file = self.project_root / "TruckOpti_Minimal_Python313.spec"
        self.build_dir = self.project_root / "build"
        self.dist_dir = self.project_root / "dist"
        self.exe_name = "TruckOpti_Enterprise_Minimal.exe"
        
    def check_python_version(self):
        """Verify Python 3.13 compatibility"""
        print("Checking Python version...")
        if sys.version_info < (3, 13):
            print(f"ERROR: Python 3.13+ required. Current: {sys.version}")
            return False
        print(f"OK: Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro} detected")
        return True
        
    def clean_previous_builds(self):
        """Clean previous build artifacts"""
        print("Cleaning previous builds...")
        
        # Remove existing executable
        exe_path = self.dist_dir / self.exe_name
        if exe_path.exists():
            try:
                exe_path.unlink()
                print(f"OK: Removed existing executable: {exe_path}")
            except PermissionError:
                print(f"⚠️  Cannot remove {exe_path} - may be running")
                
        # Remove build directories
        for dir_path in [self.build_dir, self.dist_dir]:
            if dir_path.exists():
                try:
                    shutil.rmtree(dir_path)
                    print(f"OK: Cleaned directory: {dir_path}")
                except Exception as e:
                    print(f"⚠️  Could not clean {dir_path}: {e}")
                    
    def kill_existing_processes(self):
        """Kill any existing TruckOpti processes"""
        print("Checking for running TruckOpti processes...")
        try:
            # Windows process termination
            subprocess.run(
                ["taskkill", "/F", "/IM", "TruckOpti_Enterprise*", "/T"],
                capture_output=True,
                timeout=10
            )
            time.sleep(2)
            print("OK: Existing processes terminated")
        except Exception as e:
            print(f"ℹ️  No existing processes to terminate: {e}")
            
    def check_dependencies(self):
        """Check critical dependencies"""
        print("Checking critical dependencies...")
        
        critical_imports = [
            'flask', 'flask_sqlalchemy', 'sqlalchemy', 
            'numpy', 'pandas', 'py3dbp', 'app'
        ]
        
        failed_imports = []
        for module in critical_imports:
            try:
                __import__(module)
                print(f"OK: {module}")
            except ImportError as e:
                failed_imports.append((module, str(e)))
                print(f"ERROR: {module}: {e}")
                
        if failed_imports:
            print("\nERROR: Missing dependencies. Install with:")
            print("pip install -r requirements_python313.txt")
            return False
            
        return True
        
    def build_executable(self):
        """Build the executable using PyInstaller"""
        print("Building TruckOpti Enterprise executable...")
        
        if not self.spec_file.exists():
            print(f"ERROR: Spec file not found: {self.spec_file}")
            return False
            
        # Build command
        cmd = [
            sys.executable, "-m", "PyInstaller",
            str(self.spec_file),
            "--clean",
            "--noconfirm",
            "--log-level", "INFO"
        ]
        
        print(f"Running: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(
                cmd,
                cwd=self.project_root,
                capture_output=False,  # Show output in real-time
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode == 0:
                print("OK: Build completed successfully!")
                return True
            else:
                print(f"ERROR: Build failed with return code: {result.returncode}")
                return False
                
        except subprocess.TimeoutExpired:
            print("ERROR: Build timed out (5 minutes)")
            return False
        except Exception as e:
            print(f"ERROR: Build error: {e}")
            return False
            
    def test_executable(self):
        """Test the built executable"""
        exe_path = self.dist_dir / self.exe_name
        
        if not exe_path.exists():
            print(f"ERROR: Executable not found: {exe_path}")
            return False
            
        print(f"Testing executable: {exe_path}")
        
        # Get file size
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"Executable size: {size_mb:.1f} MB")
        
        # Basic test - try to run for a few seconds
        print("Testing executable startup...")
        try:
            process = subprocess.Popen(
                [str(exe_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait a bit to see if it starts without errors
            time.sleep(3)
            
            # Check if process is still running
            if process.poll() is None:
                print("OK: Executable started successfully!")
                process.terminate()
                process.wait(timeout=5)
                return True
            else:
                stdout, stderr = process.communicate()
                print(f"ERROR: Executable failed to start:")
                if stderr:
                    print(f"STDERR: {stderr.decode()}")
                if stdout:
                    print(f"STDOUT: {stdout.decode()}")
                return False
                
        except Exception as e:
            print(f"ERROR: Test error: {e}")
            return False
            
    def create_launch_script(self):
        """Create a simple launch script"""
        script_path = self.project_root / "launch_truckopti.bat"
        script_content = f'''@echo off
echo Starting TruckOpti Enterprise...
cd /d "{self.project_root}"
start "" "dist\\{self.exe_name}"
echo TruckOpti Enterprise launched!
pause
'''
        
        with open(script_path, 'w') as f:
            f.write(script_content)
            
        print(f"OK: Launch script created: {script_path}")
        
    def main(self):
        """Main build process"""
        print("TruckOpti Enterprise - Python 3.13 Compatible Build")
        print("=" * 60)
        
        # Step 1: Check Python version
        if not self.check_python_version():
            return False
            
        # Step 2: Kill existing processes
        self.kill_existing_processes()
        
        # Step 3: Clean previous builds
        self.clean_previous_builds()
        
        # Step 4: Check dependencies
        if not self.check_dependencies():
            return False
            
        # Step 5: Build executable
        if not self.build_executable():
            return False
            
        # Step 6: Test executable
        if not self.test_executable():
            print("⚠️  Build completed but executable test failed")
            print("💡 Try running manually to diagnose issues")
            
        # Step 7: Create launch script
        self.create_launch_script()
        
        print("\nBuild process completed!")
        print(f"Executable location: {self.dist_dir / self.exe_name}")
        print("Ready for client delivery!")
        
        return True

if __name__ == "__main__":
    builder = TruckOptiBuildManager()
    success = builder.main()
    sys.exit(0 if success else 1)