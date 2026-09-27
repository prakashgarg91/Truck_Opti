import subprocess
import sys

# Syntax check
result = subprocess.run([sys.executable, "-m", "py_compile", "scripts/webwright/full_app_smoke.py"], cwd="D:/Github/Truck_Opti", capture_output=True, text=True)
print("py_compile output:")
print(result.stdout)
if result.stderr:
    print("stderr:", result.stderr)
print(f"returncode: {result.returncode}")
sys.exit(result.returncode)