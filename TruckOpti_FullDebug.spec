# -*- mode: python ; coding: utf-8 -*-

# FULL FUNCTIONAL DEBUG BUILD - Complete feature set with comprehensive debugging
# Includes all features, advanced 3D packing, ML optimization, and deep performance analysis

import sys
import os

# Add the project root to the path
project_root = os.path.dirname(os.path.abspath(SPEC))

# COMPLETE DATA FILES - All features included
datas = [
    ('app/templates', 'app/templates'),
    ('app/static', 'app/static'),
    ('app_data', 'app_data'),
    ('version.py', '.'),
    ('debug_logger.py', '.'),
    ('startup_profiler.py', '.'),  # Add startup profiler
]

# COMPLETE HIDDEN IMPORTS - All modules for full functionality
hiddenimports = [
    # Core application modules
    'app.models',
    'app.routes', 
    'app.packer',
    'app.advanced_3d_packer',
    'app.cost_engine',
    'app.routes_base_data',
    'app.sale_order_processor',
    'app.websocket_manager',
    'app.default_data',
    'app.base_data_manager',
    'app.indian_logistics_cost',
    
    # Advanced features - ALL included
    'app.ml_optimizer',
    'app.advanced_packer',
    'app.smart_recommender',
    'app.multi_order_optimizer',
    'app.route_optimizer',
    
    # Core architecture
    'app.core.advanced_logging',
    'app.core.error_capture',
    'app.core.intelligent_error_monitor',
    'app.core.performance',
    'app.core.container',
    'app.core.logging',
    
    # Controllers
    'app.controllers.optimization_controller',
    'app.controllers.truck_controller',
    'app.controllers.analytics_controller',
    'app.controllers.base',
    
    # Repositories
    'app.repositories.truck_repository',
    'app.repositories.carton_repository',
    'app.repositories.packing_job_repository',
    'app.repositories.analytics_repository',
    'app.repositories.base',
    
    # Services
    'app.services.base',
    'app.application.services.truck_optimization_service',
    
    # Scientific computing libraries - ALL included
    'numpy',
    'scipy',
    'pandas',
    'sklearn',
    'sklearn.utils._cython_blas',
    'sklearn.neighbors.typedefs', 
    'sklearn.neighbors.quad_tree',
    'sklearn.tree._utils',
    'sklearn.ensemble',
    'sklearn.linear_model',
    'sklearn.cluster',
    
    # 3D bin packing
    'py3dbp',
    'py3dbp.main',
    'py3dbp.auxiliary_methods',
    'py3dbp.constants',
    
    # Excel/CSV processing
    'openpyxl',
    'xlsxwriter',
    'xlrd',
    'csv',
    
    # Web and networking
    'requests',
    'urllib3',
    'certifi',
    'flask_cors',
    
    # Database
    'sqlite3',
    'sqlalchemy.dialects.sqlite',
    
    # Additional dependencies
    'pkg_resources.py2_warn',
    'werkzeug.security',
    'jinja2.ext',
    
    # Debug and profiling
    'debug_logger',
    'startup_profiler',
    'cProfile',
    'pstats',
    'traceback',
    'psutil',
]

block_cipher = None

a = Analysis(
    ['run_full_debug.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Only exclude what's truly unnecessary
        'tkinter',
        'matplotlib.pyplot',  # Keep matplotlib but exclude pyplot for GUI
        'IPython.terminal',   # Keep IPython core but exclude terminal
        'jupyter_client',     # Exclude jupyter client but keep core
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TruckOpti_Enterprise_FULL_DEBUG_v3.7.4',
    debug=True,           # Enable full debug mode
    bootloader_ignore_signals=False,
    strip=False,          # Keep all symbols for debugging
    upx=False,            # No compression for debugging
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,         # Enable console for debug output
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)