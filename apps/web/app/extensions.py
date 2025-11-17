"""Application-wide extension instances."""
from flask_sqlalchemy import SQLAlchemy

# Shared SQLAlchemy instance accessible across modules

db = SQLAlchemy()
