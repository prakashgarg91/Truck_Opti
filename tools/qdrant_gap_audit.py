r"""
TruckOpti -- Qdrant Gap Audit wrapper  (v3, standalone, no Roo Code required)
Delegates to the shared generic auditor at D:/Github/tools/qdrant_gap_audit.py

Quickstart:
  # Step 1 - index once (or after significant code changes):
  .\.venv\Scripts\python D:/Github/tools/index_codebase.py \
      --workspace . --include frontend/src,supabase

  # Step 2 - audit:
  .\.venv\Scripts\python tools\qdrant_gap_audit.py

  # Or audit + auto-index in one command:
  .\.venv\Scripts\python tools\qdrant_gap_audit.py --auto-index

Advanced usage (pass any flag through to the shared script):
  .\.venv\Scripts\python tools\qdrant_gap_audit.py --checks 1,2,3,27,28,29
  .\.venv\Scripts\python tools\qdrant_gap_audit.py --help
"""
import os, sys, subprocess

SHARED_SCRIPT = r"D:\Github\tools\qdrant_gap_audit.py"
WORKSPACE     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Our own standalone index lives at http://localhost:6333  collection: gap-truck_opti
# Falls back to Roo Code's Qdrant automatically if 6333 is empty.
# Pass --collection ws-6df6af38d373c83b to force Roo Code's index.

if not os.path.exists(SHARED_SCRIPT):
    print(f"ERROR: Shared script not found at {SHARED_SCRIPT}")
    print("Run from D:\\Github\\tools\\: git pull")
    sys.exit(1)

sys.exit(subprocess.call([
    sys.executable, SHARED_SCRIPT,
    "--workspace",   WORKSPACE,
    "--src-subpath", "frontend/src",
    "--framework",   "react",
    "--qdrant",      "http://localhost:6335",  # collection ws-6df6af38d373c83b lives on Roo Code Qdrant
    *sys.argv[1:],   # pass through any extra CLI args (can override --qdrant)
]))