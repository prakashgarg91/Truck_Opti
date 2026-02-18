"""
Integration tests for API v1 Health endpoints.
Uses Flask test client – no running server required.
"""

import json
import pytest
from app import create_app, db
from app.models import TruckType


@pytest.fixture(scope="module")
def app():
    test_app = create_app("testing")
    with test_app.app_context():
        db.create_all()
        yield test_app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def clean_db(app):
    with app.app_context():
        yield
        db.session.rollback()


class TestHealthEndpoint:
    """Tests for GET /api/v1/health"""

    def test_health_returns_200(self, client):
        response = client.get("/api/v1/health")
        assert response.status_code == 200

    def test_health_status_healthy(self, client):
        data = json.loads(client.get("/api/v1/health").data)
        assert data["status"] == "healthy"

    def test_health_response_has_timestamp(self, client):
        data = json.loads(client.get("/api/v1/health").data)
        assert "timestamp" in data

    def test_health_response_has_version(self, client):
        data = json.loads(client.get("/api/v1/health").data)
        assert "version" in data


class TestDetailedHealthEndpoint:
    """Tests for GET /api/v1/health/detailed"""

    def test_detailed_health_returns_200(self, client):
        response = client.get("/api/v1/health/detailed")
        assert response.status_code == 200

    def test_detailed_health_has_components(self, client):
        data = json.loads(client.get("/api/v1/health/detailed").data)
        assert "components" in data

    def test_detailed_health_db_component(self, client):
        data = json.loads(client.get("/api/v1/health/detailed").data)
        assert "database" in data["components"]

    def test_detailed_health_overall_status(self, client):
        data = json.loads(client.get("/api/v1/health/detailed").data)
        assert data["status"] in ("healthy", "degraded", "unhealthy")


class TestLivenessEndpoint:
    """Tests for GET /api/v1/health/live"""

    def test_liveness_returns_200(self, client):
        response = client.get("/api/v1/health/live")
        assert response.status_code == 200

    def test_liveness_alive_true(self, client):
        data = json.loads(client.get("/api/v1/health/live").data)
        assert data["alive"] is True


class TestReadinessEndpoint:
    """Tests for GET /api/v1/health/ready"""

    def test_readiness_no_trucks_returns_503(self, client, app):
        """Without trucks configured the service should not be ready."""
        with app.app_context():
            TruckType.query.delete()
            db.session.commit()

        response = client.get("/api/v1/health/ready")
        assert response.status_code == 503

    def test_readiness_with_truck_returns_200(self, client, app):
        with app.app_context():
            TruckType.query.delete()
            truck = TruckType(name="Ready Truck", length=300.0, width=200.0, height=200.0)
            db.session.add(truck)
            db.session.commit()

        response = client.get("/api/v1/health/ready")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["ready"] is True


class TestLegacyHealthEndpoint:
    """Tests for GET /api/health (legacy)"""

    def test_legacy_health_returns_200(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_legacy_health_status_healthy(self, client):
        data = json.loads(client.get("/api/health").data)
        assert data["status"] == "healthy"
