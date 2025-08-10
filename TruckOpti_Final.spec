# -*- mode: python ; coding: utf-8 -*-
# TruckOpti Final - Complete Truck Optimization System
# Comprehensive build configuration for standalone executable

import os
from PyInstaller.utils.hooks import collect_data_files

# Collect all template files
template_files = []
for root, dirs, files in os.walk('app/templates'):
    for file in files:
        if file.endswith('.html'):
            template_files.append((os.path.join(root, file), os.path.relpath(root, 'app')))

# Collect all static files including JS subdirectory
static_files = []
for root, dirs, files in os.walk('app/static'):
    for file in files:
        if file.endswith(('.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg')):
            static_files.append((os.path.join(root, file), os.path.relpath(root, 'app')))

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=[],
    datas=[
        # Template files
        ('app/templates', 'templates'),
        # Static files including JS subdirectory
        ('app/static', 'static'),
        # Sample data files
        ('sample_sale_orders.csv', '.'),
    ] + collect_data_files('py3dbp'),
    hiddenimports=[
        # Flask and extensions
        'flask',
        'flask_sqlalchemy',
        'werkzeug.security',
        'jinja2',
        'markupsafe',
        'click',
        
        # SQLAlchemy
        'sqlalchemy',
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.pool',
        'sqlalchemy.engine',
        
        # 3D Bin Packing
        'py3dbp',
        'py3dbp.main',
        'py3dbp.constants',
        'py3dbp.auxiliary_methods',
        
        # Data processing
        'pandas',
        'openpyxl',
        'numpy',
        'csv',
        'json',
        
        # Application modules
        'app',
        'app.models',
        'app.routes', 
        'app.packer',
        'app.cost_engine',
        'app.ml_optimizer',
        'app.route_optimizer',
        'app.websocket_manager',
        
        # System modules
        'threading',
        'socket',
        'webbrowser',
        'os',
        'sys',
        'datetime',
        'uuid',
        
        # Bootstrap Flask
        'bootstrap_flask',
        
        # Other dependencies
        'email.mime.text',
        'email.mime.multipart',
        'urllib.parse',
        'base64',
        'hashlib',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary packages to reduce size
        'tkinter',
        'matplotlib',
        'scipy',
        'pytest',
        'IPython',
        'jupyter',
        'notebook',
        'tornado',
        'zmq',
    ],
    noarchive=False,
    optimize=0,
)

# Remove duplicates and sort
a.datas = list(set(a.datas))

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='TruckOpti',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window for cleaner user experience
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Add icon file path here if available
    version=None,  # Add version info file here if available
)