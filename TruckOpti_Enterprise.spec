# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path

# Get the application directory
a = Analysis(
    ['run.py'],
    pathex=[str(Path(SPECPATH))],
    binaries=[],
    datas=[
        (str(Path(SPECPATH) / 'app' / 'static'), 'app/static'),
        (str(Path(SPECPATH) / 'app' / 'templates'), 'app/templates'),
        (str(Path(SPECPATH) / 'app' / 'config'), 'app/config'),
        (str(Path(SPECPATH) / 'test_sale_orders.csv'), '.'),
        # Enhanced Space Optimization data
        (str(Path(SPECPATH) / 'app' / 'data' / 'carton_types.json'), 'app/data'),
        (str(Path(SPECPATH) / 'app' / 'data' / 'truck_types.json'), 'app/data'),
    ],
    hiddenimports=[
        'app.models',
        'app.routes',
        'app.packer',
        'app.advanced_packer',
        'app.ml_optimizer',
        'app.cost_engine',
        'flask_sqlalchemy',
        'sqlite3',
        'sqlalchemy',
        'numpy',
        'scipy',
        'pandas',
        'werkzeug',
        # Space Optimization imports (optional)
        # 'app.space_optimizer',
        'decimal',
        'functools',
        'concurrent.futures'
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'test',
        'unittest',
        'pydoc',
        'tkinter',
        'IPython'
    ],
    noarchive=False,
    optimize=2
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TruckOpti_Enterprise_v3.6.0',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon=str(Path(SPECPATH) / 'app' / 'static' / 'favicon.ico') if os.path.exists(str(Path(SPECPATH) / 'app' / 'static' / 'favicon.ico')) else None,
    version=None
)