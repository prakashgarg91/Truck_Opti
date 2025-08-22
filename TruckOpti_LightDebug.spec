# -*- mode: python ; coding: utf-8 -*-

# LIGHTWEIGHT DEBUG BUILD - Minimal size with maximum profiling
# Excludes heavy dependencies, focuses on loading bottleneck identification

import sys
import os

project_root = os.path.dirname(os.path.abspath(SPEC))

datas = [
    ('app/templates', 'app/templates'),
    ('app/static', 'app/static'),
    ('app_data', 'app_data'),
    ('version.py', '.'),
    ('startup_profiler.py', '.'),
]

hiddenimports = [
    # CORE ONLY - minimal imports for profiling
    'app.models',
    'app.routes', 
    'app.packer',
    'app.cost_engine',
    'py3dbp',
    'py3dbp.main',
    'py3dbp.auxiliary_methods',
    'py3dbp.constants',
    'startup_profiler',
    'psutil',
]

a = Analysis(
    ['run_light_debug.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # EXCLUDE ALL HEAVY DEPENDENCIES
        'sklearn', 'scipy', 'pandas', 'numpy',
        'matplotlib', 'plotly', 'jupyter', 'IPython',
        'openpyxl', 'xlsxwriter',
        'app.ml_optimizer', 'app.advanced_packer',
        'app.smart_recommender', 'app.multi_order_optimizer',
        'app.advanced_3d_packer', 'app.core',
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
    name='TruckOpti_LIGHT_DEBUG_v3.7.5',
    debug=True,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)