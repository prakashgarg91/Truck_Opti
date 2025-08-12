"""
Enterprise Configuration Management
Centralized configuration with environment-specific settings
"""
import os
from dataclasses import dataclass
from typing import Optional, Dict, Any
from pathlib import Path
import logging


@dataclass
class DatabaseConfig:
    """Database configuration settings"""
    url: str
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: int = 30
    pool_recycle: int = 3600
    echo: bool = False


@dataclass
class RedisConfig:
    """Redis configuration for caching"""
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: Optional[str] = None
    max_connections: int = 20


@dataclass
class SecurityConfig:
    """Security configuration"""
    secret_key: str
    jwt_secret: str
    jwt_expires_in: int = 3600
    password_hash_rounds: int = 12
    max_login_attempts: int = 5
    lockout_duration: int = 300
    csrf_token_validity: int = 3600


@dataclass
class APIConfig:
    """API configuration"""
    version: str = "v1"
    rate_limit: str = "100/hour"
    max_request_size: int = 16 * 1024 * 1024  # 16MB
    timeout: int = 30
    cors_origins: list = None


@dataclass
class LoggingConfig:
    """Logging configuration"""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file_path: str = "logs/truckopti.log"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5
    structured_logging: bool = True


@dataclass
class MonitoringConfig:
    """Monitoring and metrics configuration"""
    enabled: bool = True
    metrics_endpoint: str = "/metrics"
    health_endpoint: str = "/health"
    prometheus_port: int = 9090


class Config:
    """Enterprise Configuration Manager"""
    
    def __init__(self, environment: str = None):
        self.environment = environment or os.getenv("ENVIRONMENT", "development")
        self.base_dir = Path(__file__).parent.parent.parent
        self._load_environment_variables()
        
        # Initialize configuration sections
        self.database = self._get_database_config()
        self.redis = self._get_redis_config()
        self.security = self._get_security_config()
        self.api = self._get_api_config()
        self.logging = self._get_logging_config()
        self.monitoring = self._get_monitoring_config()
        
        # Application settings
        self.debug = self._get_bool("DEBUG", False)
        self.testing = self._get_bool("TESTING", False)
        self.host = os.getenv("HOST", "0.0.0.0")
        self.port = int(os.getenv("PORT", "5000"))
        
    def _load_environment_variables(self):
        """Load environment-specific variables"""
        env_file = self.base_dir / f".env.{self.environment}"
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.strip() and not line.startswith("#"):
                        key, value = line.strip().split("=", 1)
                        os.environ[key] = value
    
    def _get_database_config(self) -> DatabaseConfig:
        """Configure database settings"""
        if self.environment == "production":
            url = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/truckopti_prod")
        elif self.environment == "testing":
            url = os.getenv("TEST_DATABASE_URL", "sqlite:///test_truckopti.db")
        else:
            url = os.getenv("DATABASE_URL", f"sqlite:///{self.base_dir}/app/truck_opti.db")
            
        return DatabaseConfig(
            url=url,
            pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
            echo=self._get_bool("DB_ECHO", False)
        )
    
    def _get_redis_config(self) -> RedisConfig:
        """Configure Redis settings"""
        return RedisConfig(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            db=int(os.getenv("REDIS_DB", "0")),
            password=os.getenv("REDIS_PASSWORD"),
            max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "20"))
        )
    
    def _get_security_config(self) -> SecurityConfig:
        """Configure security settings"""
        secret_key = os.getenv("SECRET_KEY")
        if not secret_key:
            if self.environment == "production":
                raise ValueError("SECRET_KEY must be set in production")
            secret_key = "dev-secret-key-not-for-production"
            
        jwt_secret = os.getenv("JWT_SECRET", secret_key)
        
        return SecurityConfig(
            secret_key=secret_key,
            jwt_secret=jwt_secret,
            jwt_expires_in=int(os.getenv("JWT_EXPIRES_IN", "3600")),
            password_hash_rounds=int(os.getenv("PASSWORD_HASH_ROUNDS", "12")),
            max_login_attempts=int(os.getenv("MAX_LOGIN_ATTEMPTS", "5")),
            lockout_duration=int(os.getenv("LOCKOUT_DURATION", "300"))
        )
    
    def _get_api_config(self) -> APIConfig:
        """Configure API settings"""
        cors_origins = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else ["*"]
        
        return APIConfig(
            version=os.getenv("API_VERSION", "v1"),
            rate_limit=os.getenv("RATE_LIMIT", "100/hour"),
            max_request_size=int(os.getenv("MAX_REQUEST_SIZE", str(16 * 1024 * 1024))),
            timeout=int(os.getenv("API_TIMEOUT", "30")),
            cors_origins=cors_origins
        )
    
    def _get_logging_config(self) -> LoggingConfig:
        """Configure logging settings"""
        log_dir = self.base_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        
        return LoggingConfig(
            level=os.getenv("LOG_LEVEL", "INFO"),
            file_path=str(log_dir / "truckopti.log"),
            max_file_size=int(os.getenv("LOG_MAX_FILE_SIZE", str(10 * 1024 * 1024))),
            backup_count=int(os.getenv("LOG_BACKUP_COUNT", "5")),
            structured_logging=self._get_bool("STRUCTURED_LOGGING", True)
        )
    
    def _get_monitoring_config(self) -> MonitoringConfig:
        """Configure monitoring settings"""
        return MonitoringConfig(
            enabled=self._get_bool("MONITORING_ENABLED", True),
            metrics_endpoint=os.getenv("METRICS_ENDPOINT", "/metrics"),
            health_endpoint=os.getenv("HEALTH_ENDPOINT", "/health"),
            prometheus_port=int(os.getenv("PROMETHEUS_PORT", "9090"))
        )
    
    def _get_bool(self, key: str, default: bool = False) -> bool:
        """Convert environment variable to boolean"""
        value = os.getenv(key, str(default)).lower()
        return value in ("true", "1", "yes", "on")
    
    def get_database_url(self) -> str:
        """Get complete database URL"""
        return self.database.url
    
    def is_production(self) -> bool:
        """Check if running in production"""
        return self.environment == "production"
    
    def is_development(self) -> bool:
        """Check if running in development"""
        return self.environment == "development"
    
    def is_testing(self) -> bool:
        """Check if running in testing"""
        return self.environment == "testing"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary (excluding secrets)"""
        config_dict = {
            "environment": self.environment,
            "debug": self.debug,
            "testing": self.testing,
            "host": self.host,
            "port": self.port,
            "database": {
                "url": "***REDACTED***" if self.is_production() else self.database.url,
                "pool_size": self.database.pool_size,
                "echo": self.database.echo
            },
            "redis": {
                "host": self.redis.host,
                "port": self.redis.port,
                "db": self.redis.db
            },
            "api": {
                "version": self.api.version,
                "rate_limit": self.api.rate_limit,
                "timeout": self.api.timeout
            },
            "logging": {
                "level": self.logging.level,
                "file_path": self.logging.file_path
            },
            "monitoring": {
                "enabled": self.monitoring.enabled,
                "metrics_endpoint": self.monitoring.metrics_endpoint,
                "health_endpoint": self.monitoring.health_endpoint
            }
        }
        return config_dict


# Global configuration instance
config = Config()


def get_config() -> Config:
    """Get the global configuration instance"""
    return config


def reload_config(environment: str = None):
    """Reload configuration (useful for testing)"""
    global config
    config = Config(environment)
    return config