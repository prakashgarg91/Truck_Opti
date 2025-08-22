# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Add the project root to the path
project_root = os.path.dirname(os.path.abspath(SPEC))

# CRITICAL FIX: Use exact same data structure as working executable
datas = [
    ('app/templates', 'app/templates'),
    ('app/static', 'app/static'),
    ('app_data', 'app_data'),
    ('version.py', '.'),
    ('debug_logger.py', '.'),  # Add debug logger
]

# CRITICAL FIX: Use exact same hidden imports as working executable
hiddenimports = [
    # Core application modules
    'app.models',
    'app.routes', 
    'app.packer',
    'app.advanced_3d_packer',  # New advanced 3D packing
    'app.cost_engine',
    'app.routes_base_data',
    'app.sale_order_processor',
    'app.websocket_manager',
    'app.default_data',
    'app.base_data_manager',
    'app.indian_logistics_cost',
    
    # Advanced features (previously excluded)
    'app.ml_optimizer',
    'app.advanced_packer',
    'app.smart_recommender',
    'app.multi_order_optimizer',
    'app.route_optimizer',
    
    # Scientific computing libraries
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
    
    # Debug logger
    'debug_logger'
]

block_cipher = None

a = Analysis(
    ['run.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
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
    name='TruckOpti_Enterprise_DEBUG_v3.7.1',
    debug=True,  # Enable debug mode
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # Disable UPX compression for better debugging
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Enable console for debug output
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='app/static/favicon.ico'  # Icon file not found
)