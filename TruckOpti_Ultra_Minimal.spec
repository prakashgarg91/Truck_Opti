# -*- mode: python ; coding: utf-8 -*-

# ULTRA MINIMAL BUILD - Fastest possible startup, core functionality only

import sys
import os

project_root = os.path.dirname(os.path.abspath(SPEC))

datas = [
    ('app/templates', 'app/templates'),
    ('app/static', 'app/static'),
    ('app_data', 'app_data'),
]

hiddenimports = [
    # ABSOLUTE MINIMUM
    'app.models',
    'sqlite3',
]

a = Analysis(
    ['run_ultra_minimal.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # EXCLUDE EVERYTHING HEAVY
        'sklearn', 'scipy', 'pandas', 'numpy',
        'matplotlib', 'plotly', 'jupyter', 'IPython',
        'openpyxl', 'xlsxwriter', 'requests', 'urllib3',
        'app.packer', 'app.advanced_3d_packer', 'app.cost_engine',
        'app.routes', 'app.ml_optimizer', 'app.advanced_packer',
        'py3dbp', 'psutil', 'startup_profiler',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TruckOpti_ULTRA_MINIMAL_v3.7.6',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
)