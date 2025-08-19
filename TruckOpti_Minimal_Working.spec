# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['run.py'],
    pathex=['D:\\Github\\Truck_Opti'],
    binaries=[],
    datas=[
        ('app/templates', 'app/templates'),
        ('app/static', 'app/static'),
        ('app_data', 'app_data'),
        ('version.py', '.'),
    ],
    hiddenimports=[
        'app.models',
        'app.routes',
        'app.packer',
        'app.cost_engine',
        'app.routes_base_data',
        'app.sale_order_processor',
        'app.websocket_manager',
        'app.default_data',
        'app.base_data_manager',
        'app.indian_logistics_cost',
        'pkg_resources.py2_warn',
        'sklearn.utils._cython_blas',
        'sklearn.neighbors.typedefs',
        'sklearn.neighbors.quad_tree',
        'sklearn.tree._utils',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'app.ml_optimizer',  # Exclude NumPy-dependent modules
        'app.advanced_packer',
        'app.smart_recommender', 
        'app.multi_order_optimizer',
        'numpy',
        'scipy',
        'pandas',
        'matplotlib',
        'tkinter',
    ],
    noarchive=False,
    optimize=2,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='TruckOpti_Working_Minimal',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='app/static/favicon.ico'  # Removed for compatibility
)