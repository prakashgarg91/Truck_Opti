"""
Integration tests for API v1 Cartons endpoints.
Uses Flask test client – no running server required.
"""

import json
import pytest
from app import create_app, db
from app.models import CartonType


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
    """Clean cartons table before every test."""
    with app.app_context():
        CartonType.query.delete()
        db.session.commit()
        yield
        db.session.rollback()


def _create_carton(client, overrides=None):
    """Helper to POST a valid carton payload."""
    payload = {
        "name": "Test Carton",
        "length": 50.0,
        "width": 40.0,
        "height": 30.0,
        "weight": 8.0,
        "fragile": False,
        "stackable": True,
        "priority": 1,
    }
    if overrides:
        payload.update(overrides)
    return client.post(
        "/api/v1/cartons",
        data=json.dumps(payload),
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# List cartons
# ---------------------------------------------------------------------------

class TestListCartons:
    def test_list_empty_returns_200(self, client):
        response = client.get("/api/v1/cartons")
        assert response.status_code == 200

    def test_list_empty_data_is_list(self, client):
        data = json.loads(client.get("/api/v1/cartons").data)
        assert isinstance(data["data"], list)
        assert data["data"] == []

    def test_list_returns_created_carton(self, client):
        _create_carton(client)
        data = json.loads(client.get("/api/v1/cartons").data)
        assert len(data["data"]) == 1
        assert data["data"][0]["name"] == "Test Carton"

    def test_list_pagination_keys_present(self, client):
        data = json.loads(client.get("/api/v1/cartons").data)
        assert "pagination" in data
        assert "total" in data["pagination"]

    def test_list_filter_by_fragile(self, client):
        _create_carton(client, {"name": "Glass Vase", "fragile": True})
        _create_carton(client, {"name": "Metal Box", "fragile": False})

        data = json.loads(client.get("/api/v1/cartons?fragile=true").data)
        names = [c["name"] for c in data["data"]]
        assert "Glass Vase" in names
        assert "Metal Box" not in names

    def test_list_filter_by_stackable(self, client):
        _create_carton(client, {"name": "Stackable Box", "stackable": True})
        _create_carton(client, {"name": "Non-stackable", "stackable": False})

        data = json.loads(client.get("/api/v1/cartons?stackable=false").data)
        names = [c["name"] for c in data["data"]]
        assert "Non-stackable" in names
        assert "Stackable Box" not in names


# ---------------------------------------------------------------------------
# Create carton
# ---------------------------------------------------------------------------

class TestCreateCarton:
    def test_create_returns_201(self, client):
        response = _create_carton(client)
        assert response.status_code == 201

    def test_create_success_flag(self, client):
        data = json.loads(_create_carton(client).data)
        assert data["success"] is True

    def test_create_missing_name_returns_400(self, client):
        response = client.post(
            "/api/v1/cartons",
            data=json.dumps({"length": 50.0, "width": 40.0, "height": 30.0, "weight": 8.0}),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_create_missing_weight_returns_400(self, client):
        response = client.post(
            "/api/v1/cartons",
            data=json.dumps({"name": "No Weight", "length": 50.0, "width": 40.0, "height": 30.0}),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_create_stores_correct_data(self, client):
        response = _create_carton(client, {"name": "Precision Box", "length": 75.0})
        data = json.loads(response.data)
        assert data["data"]["name"] == "Precision Box"
        assert data["data"]["length"] == 75.0

    def test_create_fragile_carton(self, client):
        response = _create_carton(client, {"name": "Fragile Item", "fragile": True})
        data = json.loads(response.data)
        assert data["data"]["fragile"] is True

    def test_create_non_stackable_carton(self, client):
        response = _create_carton(client, {"name": "Non-Stack", "stackable": False})
        data = json.loads(response.data)
        assert data["data"]["stackable"] is False


# ---------------------------------------------------------------------------
# Get carton by ID
# ---------------------------------------------------------------------------

class TestGetCarton:
    def test_get_existing_returns_200(self, client):
        created = json.loads(_create_carton(client).data)
        carton_id = created["data"]["id"]
        response = client.get(f"/api/v1/cartons/{carton_id}")
        assert response.status_code == 200

    def test_get_existing_returns_correct_name(self, client):
        created = json.loads(_create_carton(client, {"name": "Fetch Me Carton"}).data)
        carton_id = created["data"]["id"]
        data = json.loads(client.get(f"/api/v1/cartons/{carton_id}").data)
        assert data["data"]["name"] == "Fetch Me Carton"

    def test_get_nonexistent_returns_404(self, client):
        response = client.get("/api/v1/cartons/99999")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Update carton
# ---------------------------------------------------------------------------

class TestUpdateCarton:
    def test_update_name_returns_200(self, client):
        created = json.loads(_create_carton(client).data)
        carton_id = created["data"]["id"]
        response = client.put(
            f"/api/v1/cartons/{carton_id}",
            data=json.dumps({"name": "Updated Carton"}),
            content_type="application/json",
        )
        assert response.status_code == 200

    def test_update_persists_change(self, client):
        created = json.loads(_create_carton(client).data)
        carton_id = created["data"]["id"]
        client.put(
            f"/api/v1/cartons/{carton_id}",
            data=json.dumps({"name": "Persisted Carton Name"}),
            content_type="application/json",
        )
        data = json.loads(client.get(f"/api/v1/cartons/{carton_id}").data)
        assert data["data"]["name"] == "Persisted Carton Name"

    def test_update_weight_persists(self, client):
        created = json.loads(_create_carton(client).data)
        carton_id = created["data"]["id"]
        client.put(
            f"/api/v1/cartons/{carton_id}",
            data=json.dumps({"weight": 20.0}),
            content_type="application/json",
        )
        data = json.loads(client.get(f"/api/v1/cartons/{carton_id}").data)
        assert data["data"]["weight"] == 20.0

    def test_update_nonexistent_returns_error(self, client):
        response = client.put(
            "/api/v1/cartons/99999",
            data=json.dumps({"name": "Ghost"}),
            content_type="application/json",
        )
        assert response.status_code in (404, 500)


# ---------------------------------------------------------------------------
# Delete carton
# ---------------------------------------------------------------------------

class TestDeleteCarton:
    def test_delete_returns_200(self, client):
        created = json.loads(_create_carton(client).data)
        carton_id = created["data"]["id"]
        response = client.delete(f"/api/v1/cartons/{carton_id}")
        assert response.status_code == 200

    def test_delete_removes_carton(self, client):
        created = json.loads(_create_carton(client).data)
        carton_id = created["data"]["id"]
        client.delete(f"/api/v1/cartons/{carton_id}")
        response = client.get(f"/api/v1/cartons/{carton_id}")
        assert response.status_code == 404

    def test_delete_nonexistent_returns_error(self, client):
        response = client.delete("/api/v1/cartons/99999")
        assert response.status_code in (404, 500)


# ---------------------------------------------------------------------------
# Bulk create cartons
# ---------------------------------------------------------------------------

class TestBulkCreateCartons:
    def test_bulk_create_returns_201(self, client):
        payload = [
            {"name": "Bulk A", "length": 30.0, "width": 20.0, "height": 20.0, "weight": 3.0},
            {"name": "Bulk B", "length": 40.0, "width": 30.0, "height": 25.0, "weight": 5.0},
        ]
        response = client.post(
            "/api/v1/cartons/bulk",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 201

    def test_bulk_create_all_stored(self, client):
        payload = [
            {"name": "Stored A", "length": 30.0, "width": 20.0, "height": 20.0, "weight": 3.0},
            {"name": "Stored B", "length": 40.0, "width": 30.0, "height": 25.0, "weight": 5.0},
        ]
        client.post(
            "/api/v1/cartons/bulk",
            data=json.dumps(payload),
            content_type="application/json",
        )
        data = json.loads(client.get("/api/v1/cartons").data)
        names = [c["name"] for c in data["data"]]
        assert "Stored A" in names
        assert "Stored B" in names

    def test_bulk_create_non_list_returns_400(self, client):
        response = client.post(
            "/api/v1/cartons/bulk",
            data=json.dumps({"name": "Not a list"}),
            content_type="application/json",
        )
        assert response.status_code == 400
