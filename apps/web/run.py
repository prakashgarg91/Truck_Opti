"""Development entrypoint for the TruckOpti Flask application."""
from __future__ import annotations

import os

from app import create_app


def _create_application():
    config_context = os.environ.get("FLASK_ENV")
    return create_app(config_context=config_context)


app = _create_application()


if __name__ == "__main__":
    from app.extensions import socketio
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    socketio.run(app, host=host, port=port, debug=debug)
