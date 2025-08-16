import os
import platform
import sys
import tempfile
from pathlib import Path

class Config:
    """Configuration base class for TruckOpti application"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'default_dev_secret_key')
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
            os.path.join(os.getcwd(), 'app_data'),  # Current working directory
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'app_data'),  # Project root
            os.path.join(os.path.expanduser('~'), '.truckopti', 'app_data'),  # User home directory
        ]

        # Find the first writable directory
        for directory in possible_dirs:
            try:
                os.makedirs(directory, exist_ok=True)
                if os.access(directory, os.W_OK):
                    return directory
            except Exception:
                continue

        # Fallback to system temp directory if all else fails
        return os.path.join(tempfile.gettempdir(), 'truckopti_app_data')

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
