# -*- mode: python ; coding: utf-8 -*-

import os
from pathlib import Path

# Define paths
SPECPATH = Path('D:/Github/Truck_Opti')

a = Analysis(
    ['simple_truckopti.py'],
    pathex=[str(SPECPATH)],
    binaries=[],
    datas=[],
    hiddenimports=[
        'flask',
        'numpy',
        'dataclasses',
        'typing',
        'threading',
        'webbrowser',
        'socket',
        'json',
        'math',
        'datetime'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'distutils',
        'tkinter',
        'matplotlib',
        'scipy',
        'pandas',
        'pytest',
        'setuptools'
    ],
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='SimpleTruckOpti',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version=None
)