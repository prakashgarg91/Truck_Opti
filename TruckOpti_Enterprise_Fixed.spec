# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path

# PyInstaller spec with NumPy 2.x compatibility fixes
a = Analysis(
    ['run.py'],
    pathex=[str(Path(SPECPATH))],
    binaries=[],
    datas=[
        (str(Path(SPECPATH) / 'app' / 'static'), 'app/static'),
        (str(Path(SPECPATH) / 'app' / 'templates'), 'app/templates'),
        (str(Path(SPECPATH) / 'app' / 'config'), 'app/config'),
        (str(Path(SPECPATH) / 'test_sale_orders.csv'), '.'),
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
        'werkzeug',
        'decimal',
        'functools',
        'concurrent.futures',
        # Minimal NumPy/SciPy imports to avoid conflicts
        'numpy.core._multiarray_umath',
        'numpy.random._pickle'
    ],
    hookspath=[],
    hooksconfig={
        # NumPy 2.x compatibility configuration
        "numpy": {
            "include_dtype_info": False,
            "include_ndarray_misc": False
        }
    },
    runtime_hooks=[],
    excludes=[
        # Exclude ALL problematic NumPy 2.x modules
        'numpy.distutils',
        'numpy.f2py',
        'numpy.testing',
        'numpy.core.overrides',
        'numpy.core._string_helpers', 
        'numpy._typing',
        'numpy._pyinstaller',
        'numpy.typing',
        'numpy.typing._generic_alias',
        'numpy.core._add_newdocs',
        'numpy.core._add_newdocs_scalars',
        'numpy.lib._scimath_impl',
        'numpy.ma.core',
        'numpy.ma.extras',
        'numpy.polynomial',
        'numpy.random._mt19937',
        'numpy.random._philox',
        'numpy.random._pcg64',
        'numpy.random._sfc64',
        'numpy.random.mtrand',
        # Exclude heavy SciPy modules not needed
        'scipy.sparse',
        'scipy.spatial.distance',
        'scipy.linalg.lapack',
        'scipy.special._ufuncs',
        'scipy.optimize',
        'scipy.integrate',
        'scipy.interpolate',
        'scipy.io',
        'scipy.signal',
        'scipy.stats',
        # Exclude matplotlib and other heavy packages
        'matplotlib',
        'pandas.plotting',
        'pandas.tests',
        'tkinter',
        'turtle',
        'test',
        'tests',
        'unittest',
        'doctest',
        'IPython',
        'jupyter',
        'notebook'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
    optimize=1,
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
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None
)