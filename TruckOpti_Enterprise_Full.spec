# -*- mode: python ; coding: utf-8 -*-
# TruckOpti Enterprise Full Build - All Features Enabled
# Includes advanced 3D packing, ML optimization, and complete feature set

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
        # Core application modules
        'app.models',
        'app.routes', 
        'app.packer',
        'app.advanced_3d_packer',  # New advanced 3D packing
        'app.cost_engine',
        'app.routes_base_data',
        'app.sale_order_processor',
        'app.websocket_manager',
        'app.default_data',
        'app.base_data_manager',
        'app.indian_logistics_cost',
        
        # Advanced features (previously excluded)
        'app.ml_optimizer',
        'app.advanced_packer',
        'app.smart_recommender',
        'app.multi_order_optimizer',
        'app.route_optimizer',
        
        # Scientific computing libraries
        'numpy',
        'scipy',
        'pandas',
        'sklearn',
        'sklearn.utils._cython_blas',
        'sklearn.neighbors.typedefs', 
        'sklearn.neighbors.quad_tree',
        'sklearn.tree._utils',
        'sklearn.ensemble',
        'sklearn.linear_model',
        'sklearn.cluster',
        
        # 3D bin packing
        'py3dbp',
        'py3dbp.main',
        'py3dbp.auxiliary_methods',
        'py3dbp.constants',
        
        # Additional dependencies
        'pkg_resources.py2_warn',
        'openpyxl',
        'xlsxwriter',
        'requests',
        'urllib3',
        'certifi',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary GUI libraries for smaller build
        'tkinter',
        'matplotlib.pyplot',
        'IPython',
        'jupyter',
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
    name='TruckOpti_Enterprise_FORCE_TEMPLATE_UPDATE_v3.7.0',
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
    # icon='app/static/favicon.ico'  # Icon file not found
)