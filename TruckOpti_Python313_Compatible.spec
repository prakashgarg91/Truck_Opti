# -*- mode: python ; coding: utf-8 -*-
# TruckOpti Enterprise - Python 3.13 Compatible Spec File
# Addresses PyInstaller compatibility issues with Python 3.13

import sys
import os
from pathlib import Path

# Define paths
app_path = str(Path(SPECPATH))
icon_path = str(Path(SPECPATH) / 'app' / 'static' / 'favicon.ico')

# Analysis configuration with Python 3.13 compatibility
a = Analysis(
    ['run.py'],
    pathex=[app_path],
    binaries=[],
    datas=[
        # Core application files
        (str(Path(SPECPATH) / 'app' / 'static'), 'app/static'),
        (str(Path(SPECPATH) / 'app' / 'templates'), 'app/templates'),
        (str(Path(SPECPATH) / 'app' / 'config'), 'app/config'),
        
        # Data files
        (str(Path(SPECPATH) / 'test_sale_orders.csv'), '.'),
        (str(Path(SPECPATH) / 'app' / 'data' / 'carton_types.json'), 'app/data'),
        (str(Path(SPECPATH) / 'app' / 'data' / 'truck_types.json'), 'app/data'),
    ],
    hiddenimports=[
        # Core application modules
        'app',
        'app.models',
        'app.routes', 
        'app.packer',
        'app.advanced_packer',
        'app.ml_optimizer',
        'app.cost_engine',
        'app.sale_order_processor',
        'app.core',
        'app.core.logging',
        'app.core.error_capture',
        'app.core.error_monitor',
        'app.config',
        'app.config.settings',
        
        # Flask and extensions - comprehensive imports
        'flask',
        'flask.app',
        'flask.helpers',
        'flask.json',
        'flask.json.tag',
        'flask.logging',
        'flask.sessions',
        'flask.templating',
        'flask.wrappers',
        'flask_sqlalchemy',
        'flask_sqlalchemy.session',
        'flask_sqlalchemy.model',
        'flask_login',
        'flask_cors',
        'flask_jwt_extended',
        'flask_limiter',
        'bootstrap_flask',
        
        # SQLAlchemy - comprehensive imports  
        'sqlalchemy',
        'sqlalchemy.engine',
        'sqlalchemy.engine.default',
        'sqlalchemy.engine.url',
        'sqlalchemy.sql',
        'sqlalchemy.sql.sqltypes',
        'sqlalchemy.sql.type_api',
        'sqlalchemy.dialects',
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.dialects.sqlite.pysqlite',
        'sqlalchemy.orm',
        'sqlalchemy.orm.attributes',
        'sqlalchemy.orm.collections',
        'sqlalchemy.orm.decl_api',
        'sqlalchemy.orm.relationships',
        'sqlalchemy.orm.strategies',
        'sqlalchemy.pool',
        'sqlalchemy.event',
        'sqlalchemy.ext',
        'sqlalchemy.ext.declarative',
        
        # Database drivers
        'sqlite3',
        'pysqlite2',
        'pysqlite2.dbapi2',
        
        # Scientific computing - with Python 3.13 compatibility
        'numpy',
        'numpy.core',
        'numpy.core._multiarray_umath',
        'numpy.random',
        'numpy.random._common',
        'numpy.random._generator',
        'numpy.random._mt19937',
        'numpy.random._philox',
        'numpy.random._pcg64',
        'numpy.random._sfc64',
        'pandas',
        'pandas.core',
        'pandas.io',
        'pandas.io.formats',
        'pandas.io.formats.style',
        'scipy',
        'scipy.sparse',
        'scipy.sparse._matrix',
        'scipy.special',
        'scipy.special._ufuncs',
        
        # Standard library modules
        'decimal',
        'functools', 
        'concurrent.futures',
        'threading',
        'multiprocessing',
        'queue',
        'json',
        'csv',
        'datetime',
        'time',
        'os',
        'sys',
        'pathlib',
        'tempfile',
        'shutil',
        'urllib',
        'urllib.parse',
        'urllib.request',
        'webbrowser',
        'socket',
        'socketserver',
        'http.server',
        'logging',
        'logging.handlers',
        
        # Werkzeug - Flask dependency
        'werkzeug',
        'werkzeug.serving',
        'werkzeug.utils',
        'werkzeug.routing',
        'werkzeug.exceptions',
        'werkzeug.wrappers',
        'werkzeug.local',
        'werkzeug.security',
        
        # Jinja2 - Flask templating
        'jinja2',
        'jinja2.runtime',
        'jinja2.loaders',
        
        # Other dependencies
        'py3dbp',
        'requests',
        'cryptography',
        'bcrypt',
        'jsonschema',
        'lz4',
        'pytz',
        'python_dateutil',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Development and testing modules
        'test',
        'tests',
        'unittest',
        'pytest',
        'pytest_flask',
        'pytest_mock',
        'pytest_benchmark',
        'pytest_cov',
        'pylint',
        'black',
        
        # Documentation and debugging
        'pydoc',
        'doctest',
        'pdb',
        'bdb',
        'cmd',
        'code',
        'codeop',
        
        # GUI libraries not needed
        'tkinter',
        'matplotlib',
        'matplotlib.pyplot',
        'IPython',
        'jupyter',
        
        # Development servers
        'gunicorn',
        'celery',
        'redis',
        
        # Monitoring (not needed in exe)
        'prometheus_client',
        'structlog', 
        'sentry_sdk',
        
        # XML processing (if not needed)
        'lxml',
        'xml.etree',
        
        # Unused standard library modules (distutils removed for Python 3.13 compatibility)
        'setuptools',
        'pkg_resources',
        'pip',
        'ensurepip',
        'venv',
    ],
    noarchive=False,
    optimize=2,
    # Python 3.13 compatibility settings
    cipher=None,
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
    name='TruckOpti_Enterprise_v3.6.0_Python313',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # CRITICAL: Disabled UPX for Python 3.13 compatibility
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # GUI mode - no console window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path if os.path.exists(icon_path) else None,
    version=None
)