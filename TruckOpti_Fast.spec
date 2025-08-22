# -*- mode: python ; coding: utf-8 -*-

# FAST LIGHTWEIGHT BUILD - No debug overhead, optimized for speed

import sys
import os

# Add the project root to the path
project_root = os.path.dirname(os.path.abspath(SPEC))

# MINIMAL DATA FILES - Only essentials for speed
datas = [
    ('app/templates', 'app/templates'),
    ('app/static', 'app/static'),
    ('app_data', 'app_data'),
    ('version.py', '.'),
]

# ESSENTIAL HIDDEN IMPORTS ONLY - Remove heavy dependencies
hiddenimports = [
    # Core application modules only
    'app.models',
    'app.routes', 
    'app.packer',
    'app.advanced_3d_packer',
    'app.cost_engine',
    
    # Essential 3D packing
    'py3dbp',
    'py3dbp.main',
    'py3dbp.auxiliary_methods',
    'py3dbp.constants',
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
    excludes=[
        # EXCLUDE HEAVY DEPENDENCIES for speed
        'sklearn',
        'scipy',
        'pandas',
        'matplotlib',
        'plotly',
        'jupyter',
        'IPython',
        'debug_logger',  # Remove debug overhead
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
    name='TruckOpti_Enterprise_FAST_v3.7.2',
    debug=False,  # Disable debug for speed
    bootloader_ignore_signals=False,
    strip=True,  # Strip symbols for smaller size
    upx=True,  # Enable compression for faster loading
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console for faster startup
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)