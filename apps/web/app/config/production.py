"""
Production Configuration
Secure configuration for production deployment
"""

import os
from datetime import timedelta


class ProductionConfig:
    """Production environment configuration"""

    # Flask configuration
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.getenv('SECRET_KEY')  # Must be set in environment

    # Security
    SESSION_COOKIE_SECURE = True  # HTTPS only
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'postgresql://user:password@localhost/truckopti'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 20
    }

    # Redis (for caching and sessions)
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    CACHE_TYPE = 'redis'
    CACHE_REDIS_URL = REDIS_URL
    CACHE_DEFAULT_TIMEOUT = 300

    # JWT Authentication
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')  # Must be set
    JWT_ALGORITHM = 'HS256'
    JWT_EXPIRATION_HOURS = 24

    # Rate Limiting
    RATELIMIT_ENABLED = True
    RATELIMIT_STORAGE_URL = REDIS_URL
    RATELIMIT_STRATEGY = 'fixed-window'
    RATELIMIT_HEADERS_ENABLED = True

    # Email Configuration (SendGrid example)
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.sendgrid.net')
    MAIL_PORT = int(os.getenv('MAIL_PORT', 587))
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.getenv('MAIL_DEFAULT_SENDER', 'noreply@truckopti.com')

    # File Upload
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max
    UPLOAD_FOLDER = '/var/truckopti/uploads'
    ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls', 'json'}

    # Cloud Storage (AWS S3)
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
    AWS_S3_BUCKET = os.getenv('AWS_S3_BUCKET', 'truckopti-files')
    AWS_S3_REGION = os.getenv('AWS_S3_REGION', 'us-east-1')

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = '/var/log/truckopti/app.log'
    LOG_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
    LOG_BACKUP_COUNT = 10

    # Monitoring (Sentry)
    SENTRY_DSN = os.getenv('SENTRY_DSN')
    SENTRY_ENVIRONMENT = 'production'
    SENTRY_TRACES_SAMPLE_RATE = 0.1  # 10% of transactions

    # Performance
    ENABLE_GZIP_COMPRESSION = True
    SEND_FILE_MAX_AGE_DEFAULT = 31536000  # 1 year for static files

    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '').split(',')
    CORS_ALLOW_CREDENTIALS = True

    # Feature Flags
    FEATURE_REGISTRATION_ENABLED = True
    FEATURE_SOCIAL_LOGIN_ENABLED = True
    FEATURE_WEBHOOKS_ENABLED = True
    FEATURE_ANALYTICS_ENABLED = True

    # Business Settings
    DEFAULT_TIMEZONE = 'UTC'
    DEFAULT_CURRENCY = 'INR'
    DEFAULT_LANGUAGE = 'en'

    # API Settings
    API_TITLE = 'TruckOpti API'
    API_VERSION = 'v1'
    API_DESCRIPTION = 'Truck Loading Optimization API'

    # Celery (for background tasks)
    CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', REDIS_URL)

    @staticmethod
    def validate():
        """Validate required environment variables"""
        required_vars = [
            'SECRET_KEY',
            'JWT_SECRET_KEY',
            'DATABASE_URL',
        ]

        missing_vars = []
        for var in required_vars:
            if not os.getenv(var):
                missing_vars.append(var)

        if missing_vars:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing_vars)}"
            )


class DevelopmentConfig:
    """Development environment configuration"""

    DEBUG = True
    TESTING = False
    SECRET_KEY = 'dev-secret-key-change-in-production'

    # Database (SQLite for development)
    SQLALCHEMY_DATABASE_URI = 'sqlite:///truckopti_dev.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = 'dev-jwt-secret-change-in-production'
    JWT_ALGORITHM = 'HS256'
    JWT_EXPIRATION_HOURS = 24

    # Rate Limiting (more lenient for development)
    RATELIMIT_ENABLED = False

    # Logging
    LOG_LEVEL = 'DEBUG'

    # CORS (allow all for development)
    CORS_ORIGINS = ['*']

    # Feature Flags (all enabled for development)
    FEATURE_REGISTRATION_ENABLED = True
    FEATURE_SOCIAL_LOGIN_ENABLED = True
    FEATURE_WEBHOOKS_ENABLED = True
    FEATURE_ANALYTICS_ENABLED = True


class TestingConfig:
    """Testing environment configuration"""

    TESTING = True
    DEBUG = True
    SECRET_KEY = 'testing-secret-key'

    # Database (in-memory for tests)
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = 'testing-jwt-secret'
    JWT_ALGORITHM = 'HS256'
    JWT_EXPIRATION_HOURS = 1

    # Rate Limiting (disabled for tests)
    RATELIMIT_ENABLED = False

    # Faster password hashing for tests
    BCRYPT_LOG_ROUNDS = 4


# Configuration dictionary
config_by_name = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config(env_name: str = None):
    """
    Get configuration by environment name

    Args:
        env_name: Environment name (development, production, testing)

    Returns:
        Configuration class
    """
    if env_name is None:
        env_name = os.getenv('FLASK_ENV', 'development')

    return config_by_name.get(env_name, DevelopmentConfig)
