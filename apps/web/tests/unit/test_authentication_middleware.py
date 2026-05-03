"""Authentication middleware regression tests."""

import pytest
from flask import Flask
from flask import jsonify

import app.middleware.authentication as auth_middleware
from app.middleware.authentication import get_token_from_request


def test_get_token_from_authorization_header():
    app = Flask(__name__)

    with app.test_request_context(headers={'Authorization': 'Bearer header-token'}):
        assert get_token_from_request() == 'header-token'


def test_get_token_from_query_parameter_is_rejected():
    app = Flask(__name__)

    with app.test_request_context('/?token=query-token'):
        assert get_token_from_request() is None


def test_require_api_key_rejects_query_parameter():
    app = Flask(__name__)

    @app.route('/external')
    @auth_middleware.require_api_key
    def external_api():
        return jsonify({'ok': True})

    client = app.test_client()
    response = client.get('/external?api_key=query-key')

    assert response.status_code == 401
    assert response.get_json()['message'] == 'Provide API key in the X-API-Key header only'


def test_require_api_key_accepts_header_value():
    app = Flask(__name__)

    @app.route('/external')
    @auth_middleware.require_api_key
    def external_api():
        return jsonify({'ok': True})

    api_key = auth_middleware.api_key_manager.generate_api_key('pytest-client')
    client = app.test_client()
    response = client.get('/external', headers={'X-API-Key': api_key})

    assert response.status_code == 200
    assert response.get_json() == {'ok': True}


def test_missing_jwt_secret_in_production_raises(monkeypatch):
    monkeypatch.delenv('JWT_SECRET_KEY', raising=False)
    monkeypatch.setenv('FLASK_ENV', 'production')
    auth_middleware.get_jwt_secret.cache_clear()

    with pytest.raises(RuntimeError, match='JWT_SECRET_KEY must be set to a strong value in production'):
        auth_middleware.get_jwt_secret()

    auth_middleware.get_jwt_secret.cache_clear()


def test_generate_and_verify_token_with_dev_fallback(monkeypatch):
    monkeypatch.delenv('JWT_SECRET_KEY', raising=False)
    monkeypatch.delenv('FLASK_ENV', raising=False)
    auth_middleware.get_jwt_secret.cache_clear()

    token = auth_middleware.generate_token(7, 'driver@example.com', 'driver')
    payload = auth_middleware.verify_token(token)

    assert payload is not None
    assert payload['user_id'] == 7
    assert payload['role'] == 'driver'

    auth_middleware.get_jwt_secret.cache_clear()