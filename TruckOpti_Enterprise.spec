# -*- mode: python ; coding: utf-8 -*-
"""
Enterprise PyInstaller Configuration for TruckOpti
Production-ready executable with security, monitoring, and enterprise features
"""

import sys
import os
from pathlib import Path

# Get the application directory
app_dir = Path(SPECPATH)
static_dir = app_dir / "app" / "static"
templates_dir = app_dir / "app" / "templates"
config_dir = app_dir / "app" / "config"
logs_dir = app_dir / "logs"

# Ensure logs directory exists
logs_dir.mkdir(exist_ok=True)

# Hidden imports for enterprise features
hiddenimports = [
    # Core application modules
    'app.config.settings',
    'app.core.logging',
    'app.exceptions',
    'app.middleware',
    'app.services',
    'app.repositories',
    'app.schemas',
    'app.multi_order_optimizer',  # New multi-order optimization module
    
    # Flask extensions
    'flask_sqlalchemy',
    'flask_cors',
    'flask_jwt_extended',
    'flask_limiter',
    
    # Database drivers
    'sqlite3',
    'sqlalchemy.dialects.sqlite',
    'sqlalchemy.dialects.postgresql',
    'sqlalchemy.pool',
    
    # Security modules
    'bcrypt',
    'cryptography',
    'jwt',
    
    # Monitoring and logging
    'prometheus_client',
    'structlog',
    'sentry_sdk.integrations.flask',
    
    # 3D Packing
    'py3dbp',
    
    # Data processing
    'pandas',
    'numpy',
    'scipy',
    
    # HTTP clients
    'requests',
    'urllib3',
    'urllib.parse',
    'urllib.request',
    'urllib.error',
    'http.client',
    
    # Email and XML modules (required by pkg_resources)
    'email',
    'email.mime',
    'email.mime.text',
    'xml.etree',
    'xml.etree.ElementTree',
    'xml.parsers',
    'xml.parsers.expat',
    
    # Package resources
    'pkg_resources',
    'pkg_resources._vendor',
    'setuptools',
    
    # JSON handling
    'json',
    'jsonschema',
    
    # Date/time
    'datetime',
    'dateutil',
    'pytz',
    
    # File processing
    'csv',
    'io',
    'tempfile',
    'zipfile',
    'openpyxl',
    
    # System modules
    'uuid',
    'hashlib',
    'secrets',
    'threading',
    'concurrent.futures',
    'queue',
    'asyncio',
    
    # Math and algorithms
    'math',
    'statistics',
    'random',
    'itertools',
    'functools',
    
    # Enterprise integrations
    'redis',
    'celery',
    
    # Configuration
    'configparser',
    'os',
    'sys',
    'pathlib',
    
    # Networking
    'socket',
    'ssl',
    'http.client',
    
    # Compression
    'gzip',
    'lz4',
    'zstandard',
]

# Data files to include
datas = [
    # Static web assets (absolute paths)
    (str(app_dir / "app" / "static"), 'app/static'),
    (str(app_dir / "app" / "templates"), 'app/templates'),
    
    # Configuration files
    (str(app_dir / "app" / "config"), 'app/config'),
    
    # Include database file if exists
    ('app/truck_opti.db', 'app') if os.path.exists('app/truck_opti.db') else None,
    
    # Documentation
    ('README.md', '.') if os.path.exists('README.md') else None,
    ('README_Enterprise.md', '.') if os.path.exists('README_Enterprise.md') else None,
    ('LICENSE', '.') if os.path.exists('LICENSE') else None,
    
    # Sample configuration files
    ('.env.example', '.') if os.path.exists('.env.example') else None,
    
    # Include all necessary app modules
    ('app/*.py', 'app'),
]

# Filter out None values
datas = [item for item in datas if item is not None]

# Binary excludes for smaller executable (keeping essential modules)
excludes = [
    'tkinter',
    'matplotlib',
    'IPython',
    'jupyter',
    'notebook',
    'PyQt5',
    'PyQt6',
    'PySide2',
    'PySide6',
    'test',
    'unittest',
    'doctest',
    'pdb',
    'pydoc',
    # Note: Removed email, xml.etree, xml.parsers, urllib modules as they're needed by pkg_resources
]

# Analysis configuration
a = Analysis(
    ['run.py'],
    pathex=[str(app_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    optimize=2,  # Optimize bytecode
)

# Remove duplicate files
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# Executable configuration
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TruckOpti_Enterprise',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,  # Keep symbols for debugging in enterprise
    upx=True,  # Compress executable
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # GUI mode for professional appearance
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='app/static/favicon.ico' if os.path.exists('app/static/favicon.ico') else None,
    version='version_info.txt' if os.path.exists('version_info.txt') else None,
)

# Additional enterprise configurations
if sys.platform == 'win32':
    # Windows-specific configurations
    exe.manifest = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
        <assemblyIdentity
            version="1.0.0.0"
            processorArchitecture="*"
            name="TruckOpti Enterprise"
            type="win32"
        />
        <description>Enterprise Truck Loading Optimization System</description>
        <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
            <security>
                <requestedPrivileges>
                    <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
                </requestedPrivileges>
            </security>
        </trustInfo>
        <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
            <application>
                <supportedOS Id="{35138b9a-5d96-4fbd-8e2d-a2440225f93a}"/>
                <supportedOS Id="{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}"/>
                <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>
                <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
            </application>
        </compatibility>
    </assembly>'''