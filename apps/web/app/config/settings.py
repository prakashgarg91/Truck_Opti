import os
import sys
import secrets
import tempfile
from pathlib import Path


def _detect_project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        apps_dir = parent / "apps" / "web"
        if apps_dir.exists():
            return parent
    return current.parent


PROJECT_ROOT = _detect_project_root()
WEB_ROOT = PROJECT_ROOT / "apps" / "web"
DEFAULT_APP_DATA = WEB_ROOT / "app_data"
INSECURE_SECRET_SENTINELS = {
    '',
    'default_dev_secret_key',
    'dev-secret-key-change-in-production',
    'testing-secret-key',
    'your-super-secret-key-change-in-production',
}
_EPHEMERAL_SECRETS: dict[str, str] = {}


def _is_production_env() -> bool:
    return (os.environ.get('FLASK_ENV') or os.environ.get('TRUCKOPTI_ENV') or '').lower() in {'production', 'prod'}


def _is_insecure_secret(value: str) -> bool:
    normalized = value.strip()
    return not normalized or normalized in INSECURE_SECRET_SENTINELS or 'change-in-production' in normalized.lower()


def _resolve_secret(env_var: str) -> str:
    configured_secret = (os.environ.get(env_var) or '').strip()

    if configured_secret and not _is_insecure_secret(configured_secret):
        return configured_secret

    if _is_production_env():
        raise RuntimeError(f'{env_var} must be set to a strong value in production')

    if env_var not in _EPHEMERAL_SECRETS:
        _EPHEMERAL_SECRETS[env_var] = secrets.token_urlsafe(48)

    return _EPHEMERAL_SECRETS[env_var]


class Config:
    """Configuration base class for TruckOpti application"""
    SECRET_KEY = _resolve_secret('SECRET_KEY')
    DEBUG = False
    TESTING = False
    LOG_LEVEL = 'INFO'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB upload limit

    @classmethod
    def get_app_data_directory(cls):
        """
        Get the appropriate application data directory
        with robust handling for development and production environments.
        """
        # Prioritize known safe directories with fallback mechanism
        possible_dirs = [
            DEFAULT_APP_DATA,
            PROJECT_ROOT / 'app_data',
            Path(os.getcwd()) / 'app_data',
            Path.home() / '.truckopti' / 'app_data',
        ]

        # Find the first writable directory
        for directory in possible_dirs:
            try:
                directory = Path(directory)
                directory.mkdir(parents=True, exist_ok=True)
                if os.access(directory, os.W_OK):
                    return str(directory)
            except Exception:
                continue

        # Fallback to system temp directory if all else fails
        fallback = Path(tempfile.gettempdir()) / 'truckopti_app_data'
        fallback.mkdir(parents=True, exist_ok=True)
        return str(fallback)

    @classmethod
    def get_database_uri(cls, testing=False):
        """Get database URI with comprehensive error handling"""
        try:
            db_dir = Path(cls.get_app_data_directory())
            db_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"Error creating database directory: {e}")
            # Fallback to system temp directory for database
            db_dir = Path(tempfile.gettempdir()) / 'truckopti_app_data'
            db_dir.mkdir(parents=True, exist_ok=True)
        
        db_filename = 'test_truck_opti.db' if testing else 'truck_opti.db'
        db_path = db_dir / db_filename
        
        # Use absolute path and normalize separators
        return f"sqlite:///{os.path.abspath(str(db_path))}"

class DevelopmentConfig(Config):
    """Configuration for development environment"""
    DEBUG = True
    TESTING = False

class TestingConfig(Config):
    """Configuration for testing environment"""
    TESTING = True
    DEBUG = True

class ProductionConfig(Config):
    """Configuration for production environment"""
    DEBUG = False
    TESTING = False

def reload_config(app_context=None):
    """
    Reload configuration based on runtime context
    
    Args:
        app_context (dict, optional): Additional configuration context
    
    Returns:
        Config: Configuration object
    """
    # Runtime environment detection
    if getattr(sys, 'frozen', False):
        # Running in a PyInstaller bundle
        config_class = ProductionConfig
    elif app_context and app_context.get('TESTING', False):
        config_class = TestingConfig
    else:
        config_class = DevelopmentConfig
    
    return config_class

def get_config(app_context=None):
    """
    Retrieve configuration settings as a dictionary
    
    Args:
        app_context (dict, optional): Additional configuration context
    
    Returns:
        dict: Configuration settings
    """
    config = reload_config(app_context)
    
    config_dict = {
        'SECRET_KEY': config.SECRET_KEY,
        'DEBUG': config.DEBUG,
        'TESTING': config.TESTING,
        'APP_DATA_DIR': config.get_app_data_directory(),
        'LOG_LEVEL': config.LOG_LEVEL,
        'MAX_CONTENT_LENGTH': config.MAX_CONTENT_LENGTH,
        'DATABASE_URI': config.get_database_uri(testing=config.TESTING),
        'PRODUCTION': not config.DEBUG
    }
    
    return config_dict
