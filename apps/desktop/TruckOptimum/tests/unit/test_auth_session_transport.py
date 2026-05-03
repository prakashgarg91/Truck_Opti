import sqlite3
from datetime import datetime, timedelta, timezone

from flask import Flask

from app import AUTH_SESSION_COOKIE_NAME, TruckOptimum


def make_truck_optimum_instance():
    app_instance = TruckOptimum.__new__(TruckOptimum)
    app_instance.app = Flask(__name__)
    return app_instance


def register_guarded_routes(app_instance: TruckOptimum):
    @app_instance.app.route('/api/health')
    def api_health():
        return {'success': True}

    @app_instance.app.route('/api/trucks')
    def api_trucks():
        return {'success': True}

    app_instance.app.before_request(app_instance.enforce_authenticated_routes)


def seed_auth_tables(db_path: str):
    with sqlite3.connect(db_path) as conn:
        conn.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT,
                last_name TEXT,
                role TEXT DEFAULT 'user',
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                failed_login_attempts INTEGER DEFAULT 0,
                account_locked_until DATETIME
            )
        ''')
        conn.execute('''
            CREATE TABLE user_sessions (
                id INTEGER PRIMARY KEY,
                session_id TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                ip_address TEXT,
                user_agent TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')
        conn.execute(
            '''
            INSERT INTO users (id, username, email, password_hash, first_name, last_name, role)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''',
            (1, 'admin', 'admin@example.com', 'pbkdf2_sha256$1$aa$bb', 'Admin', 'User', 'admin')
        )
        conn.commit()


def test_is_account_locked_handles_utc_timestamps_without_type_errors():
    app_instance = make_truck_optimum_instance()
    future_lock = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace('+00:00', 'Z')
    expired_lock = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace('+00:00', 'Z')

    assert app_instance.is_account_locked(future_lock)
    assert not app_instance.is_account_locked(expired_lock)


def test_get_request_session_id_prefers_cookie_over_json_body():
    app_instance = make_truck_optimum_instance()

    with app_instance.app.test_request_context(
        '/',
        headers={'Cookie': f'{AUTH_SESSION_COOKIE_NAME}=cookie-session', 'User-Agent': 'pytest-client'},
        environ_base={'REMOTE_ADDR': '127.0.0.1'},
    ):
        assert app_instance.get_request_session_id({'session_id': 'body-session'}) == 'cookie-session'


def test_attach_session_cookie_sets_http_only_strict_cookie():
    app_instance = make_truck_optimum_instance()
    response = app_instance.app.make_response(('ok', 200))

    app_instance.attach_session_cookie(response, 'cookie-session')

    set_cookie_header = response.headers.get('Set-Cookie', '')
    assert f'{AUTH_SESSION_COOKIE_NAME}=cookie-session' in set_cookie_header
    assert 'HttpOnly' in set_cookie_header
    assert 'SameSite=Strict' in set_cookie_header


def test_create_user_session_stores_hashed_token_and_validates_request_metadata(tmp_path):
    app_instance = make_truck_optimum_instance()
    db_path = tmp_path / 'desktop-auth.db'
    app_instance.db_path = str(db_path)
    seed_auth_tables(app_instance.db_path)

    with app_instance.app.test_request_context(
        '/',
        headers={'User-Agent': 'pytest-client'},
        environ_base={'REMOTE_ADDR': '127.0.0.1'},
    ):
        session_id = app_instance.create_user_session(1)
        session_user = app_instance.validate_session(session_id)

    with sqlite3.connect(app_instance.db_path) as conn:
        stored_session_id = conn.execute('SELECT session_id FROM user_sessions WHERE user_id = ?', (1,)).fetchone()[0]

    assert stored_session_id != session_id
    assert session_user is not None
    assert session_user['username'] == 'admin'


def test_is_loopback_address_rejects_non_local_hosts_by_default():
    app_instance = make_truck_optimum_instance()

    assert app_instance.is_loopback_address('127.0.0.1')
    assert app_instance.is_loopback_address('::1')
    assert not app_instance.is_loopback_address('192.168.1.20')


def test_enforce_authenticated_routes_keeps_health_endpoint_public(tmp_path):
    app_instance = make_truck_optimum_instance()
    app_instance.db_path = str(tmp_path / 'desktop-auth.db')
    seed_auth_tables(app_instance.db_path)
    register_guarded_routes(app_instance)

    with app_instance.app.test_client() as client:
        response = client.get('/api/health', environ_base={'REMOTE_ADDR': '127.0.0.1'})

    assert response.status_code == 200
    assert response.get_json() == {'success': True}


def test_enforce_authenticated_routes_blocks_private_api_without_session(tmp_path):
    app_instance = make_truck_optimum_instance()
    app_instance.db_path = str(tmp_path / 'desktop-auth.db')
    seed_auth_tables(app_instance.db_path)
    register_guarded_routes(app_instance)

    with app_instance.app.test_client() as client:
        response = client.get('/api/trucks', environ_base={'REMOTE_ADDR': '127.0.0.1'})

    assert response.status_code == 401
    assert response.get_json() == {
        'success': False,
        'error': 'Authentication is required to access this desktop route'
    }


def test_enforce_authenticated_routes_allows_private_api_with_valid_session(tmp_path):
    app_instance = make_truck_optimum_instance()
    app_instance.db_path = str(tmp_path / 'desktop-auth.db')
    seed_auth_tables(app_instance.db_path)
    register_guarded_routes(app_instance)

    with app_instance.app.test_request_context(
        '/',
        headers={'User-Agent': 'pytest-client'},
        environ_base={'REMOTE_ADDR': '127.0.0.1'},
    ):
        session_id = app_instance.create_user_session(1)

    with app_instance.app.test_client() as client:
        response = client.get(
            '/api/trucks',
            headers={
                'Authorization': f'Bearer {session_id}',
                'User-Agent': 'pytest-client',
            },
            environ_base={'REMOTE_ADDR': '127.0.0.1'},
        )

    assert response.status_code == 200
    assert response.get_json() == {'success': True}