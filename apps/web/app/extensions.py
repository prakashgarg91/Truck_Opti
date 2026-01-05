"""Application-wide extension instances."""
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO

# Shared SQLAlchemy instance accessible across modules
db = SQLAlchemy()

# Shared SocketIO instance
socketio = SocketIO(cors_allowed_origins="*")
