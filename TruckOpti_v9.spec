# -*- mode: python ; coding: utf-8 -*-
# TruckOpti v9 - Advanced Sale Order System with Multi-Truck Navigation

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('app/templates', 'templates'), 
        ('app/static', 'static'),
        ('sample_sale_orders.csv', '.'),
    ],
    hiddenimports=[
        'pandas',
        'openpyxl', 
        'py3dbp',
        'py3dbp.main',
        'py3dbp.constants',
        'py3dbp.auxiliary_methods',
        'app.models',
        'app.routes', 
        'app.packer',
        'app.cost_engine',
        'app.ml_optimizer',
        'app.route_optimizer',
        'app.websocket_manager',
        'sqlalchemy.dialects.sqlite',
        'flask_sqlalchemy',
        'werkzeug.security',
        'jinja2',
        'markupsafe',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'numpy.distutils',
        'pytest',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='TruckOpti_v9_SaleOrders',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Changed to True for better debugging during initial deployment
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # You can add an icon file here if available
)