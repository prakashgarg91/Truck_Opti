import subprocess
import sys

# Build and start preview
result = subprocess.run(["npm", "run", "build"], cwd="D:/Github/Truck_Opti/frontend", capture_output=True, text=True)
print("Build output:")
print(result.stdout)
if result.stderr:
    print("Build stderr:", result.stderr)
print(f"Build returncode: {result.returncode}")

if result.returncode == 0:
    # Start preview in background
    import os
    # On Windows, use START to launch background
    subprocess.Popen(["npm", "run", "preview"], cwd="D:/Github/Truck_Opti/frontend", creationflags=subprocess.CREATE_NEW_CONSOLE)
    print("Preview server started in new console window")
else:
    print("Build failed, not starting preview")
    sys.exit(1)