# -*- mode: python ; coding: utf-8 -*-
# TruckOpti Enterprise - Minimal Python 3.13 Compatible Spec File
# Simplified to avoid complex dependency conflicts

import sys
import os
from pathlib import Path

# Define paths
app_path = str(Path(SPECPATH))
icon_path = str(Path(SPECPATH) / 'app' / 'static' / 'favicon.ico')

# Minimal Analysis configuration for Python 3.13
a = Analysis(
    ['run.py'],
    pathex=[app_path],
    binaries=[],
    datas=[
        # Core application files - only essential ones
        (str(Path(SPECPATH) / 'app' / 'static'), 'app/static'),
        (str(Path(SPECPATH) / 'app' / 'templates'), 'app/templates'),
        (str(Path(SPECPATH) / 'app' / 'config'), 'app/config'),
        (str(Path(SPECPATH) / 'test_sale_orders.csv'), '.'),
        (str(Path(SPECPATH) / 'app' / 'data' / 'carton_types.json'), 'app/data'),
        (str(Path(SPECPATH) / 'app' / 'data' / 'truck_types.json'), 'app/data'),
    ],
    hiddenimports=[
        # Only essential hidden imports to minimize conflicts
        'app.models',
        'app.routes', 
        'app.packer',
        'app.advanced_packer',
        'app.ml_optimizer',
        'app.cost_engine',
        'app.sale_order_processor',
        'flask',
        'flask_sqlalchemy',
        'sqlalchemy',
        'sqlite3',
        'numpy',
        'pandas',
        'py3dbp',
        'werkzeug.serving',
        'jinja2',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Minimal exclusions to avoid conflicts
        'matplotlib',
        'tkinter',
        'IPython',
        'jupyter',
        'pytest',
        'pylint',
        'black',
    ],
    noarchive=False,
    optimize=1,  # Reduced optimization to avoid issues
)

# Add database file if it exists
db_path = str(Path(SPECPATH) / 'app' / 'truck_opti.db')
if os.path.exists(db_path):
    a.datas.append((db_path, 'app'))

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TruckOpti_Enterprise_Minimal',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # No UPX for compatibility
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # GUI mode
    disable_windowed_traceback=False,
    icon=icon_path if os.path.exists(icon_path) else None,
)