import hashlib
import sqlite3

from app import TruckOptimum


def make_truck_optimum_instance():
    return TruckOptimum.__new__(TruckOptimum)


def test_hash_password_uses_pbkdf2_format():
    app_instance = make_truck_optimum_instance()
    password_hash = app_instance.hash_password('TestPassword123')

    assert password_hash.startswith('pbkdf2_sha256$')
    assert app_instance.verify_password(password_hash, 'TestPassword123')
    assert not app_instance.verify_password(password_hash, 'WrongPassword123')


def test_verify_password_supports_legacy_sha256_hash():
    app_instance = make_truck_optimum_instance()
    legacy_salt = 'abc123def4567890abc123def4567890'
    legacy_hash = f"{legacy_salt}:" + hashlib.sha256(('LegacyPass123' + legacy_salt).encode()).hexdigest()

    assert app_instance.verify_password(legacy_hash, 'LegacyPass123')
    assert app_instance.password_needs_rehash(legacy_hash)


def test_create_default_admin_uses_bootstrap_password_env(monkeypatch):
    app_instance = make_truck_optimum_instance()
    monkeypatch.setenv('TRUCKOPTIMUM_BOOTSTRAP_ADMIN_PASSWORD', 'BootstrapPass123')

    with sqlite3.connect(':memory:') as conn:
        conn.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT,
                last_name TEXT,
                role TEXT DEFAULT 'user',
                is_active BOOLEAN DEFAULT 1
            )
        ''')

        app_instance.create_default_admin(conn)
        username, password_hash = conn.execute(
            'SELECT username, password_hash FROM users WHERE username = ?',
            ('admin',)
        ).fetchone()

    assert username == 'admin'
    assert app_instance.verify_password(password_hash, 'BootstrapPass123')
    assert not app_instance.verify_password(password_hash, 'admin123')