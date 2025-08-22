# -*- mode: python ; coding: utf-8 -*-

# INSTANT STARTUP BUILD - Maximum performance, minimal overhead
# Removes ALL debug code, logging, and non-essential features for fastest startup

import sys
import os

# Add the project root to the path
project_root = os.path.dirname(os.path.abspath(SPEC))

# ABSOLUTE MINIMAL DATA FILES - Only core essentials
datas = [
    ('app/templates', 'app/templates'),
    ('app/static', 'app/static'),
    ('app_data', 'app_data'),
    ('version.py', '.'),
]

# MINIMAL HIDDEN IMPORTS - Only absolutely required modules
hiddenimports = [
    # Core application only
    'app.models',
    'app.routes', 
    'app.packer',
    'app.cost_engine',
    
    # Essential 3D packing only
    'py3dbp',
    'py3dbp.main',
    'py3dbp.auxiliary_methods',
    'py3dbp.constants',
]

block_cipher = None

a = Analysis(
    ['run_instant.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # EXCLUDE ALL HEAVY DEPENDENCIES
        'sklearn',
        'scipy', 
        'pandas',
        'matplotlib',
        'plotly',
        'jupyter',
        'IPython',
        'debug_logger',
        'numpy',  # Remove if not essential
        'openpyxl',  # Remove Excel support for speed
        'xlsxwriter',
        
        # Remove all debug and logging modules
        'app.core.advanced_logging',
        'app.core.error_capture', 
        'app.core.intelligent_error_monitor',
        'app.websocket_manager',
        
        # Remove advanced features for speed
        'app.ml_optimizer',
        'app.advanced_packer',
        'app.smart_recommender',
        'app.multi_order_optimizer',
        'app.route_optimizer',
        'app.advanced_3d_packer',
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
    [],
    exclude_binaries=True,
    name='TruckOpti_Enterprise_INSTANT_v3.7.3',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,       # Disable strip to avoid errors
    upx=False,         # Disable UPX to avoid errors
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='TruckOpti_Enterprise_INSTANT_v3.7.3',
)