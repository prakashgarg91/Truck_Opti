"""
Integration tests for API v1 Trucks endpoints.
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
    """Clean trucks table before every test."""
    with app.app_context():
        TruckType.query.delete()
        db.session.commit()
        yield
        db.session.rollback()


def _create_truck(client, overrides=None):
    """Helper to POST a valid truck payload."""
    payload = {
        "name": "Test Truck",
        "length": 430.0,
        "width": 200.0,
        "height": 190.0,
        "max_weight": 10000.0,
        "truck_category": "Medium",
        "availability": True,
    }
    if overrides:
        payload.update(overrides)
    return client.post(
        "/api/v1/trucks",
        data=json.dumps(payload),
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# List trucks
# ---------------------------------------------------------------------------

class TestListTrucks:
    def test_list_empty_returns_200(self, client):
        response = client.get("/api/v1/trucks")
        assert response.status_code == 200

    def test_list_empty_data_is_list(self, client):
        data = json.loads(client.get("/api/v1/trucks").data)
        assert isinstance(data["data"], list)
        assert data["data"] == []

    def test_list_returns_created_truck(self, client):
        _create_truck(client)
        data = json.loads(client.get("/api/v1/trucks").data)
        assert len(data["data"]) == 1
        assert data["data"][0]["name"] == "Test Truck"

    def test_list_pagination_keys_present(self, client):
        data = json.loads(client.get("/api/v1/trucks").data)
        assert "pagination" in data
        assert "total" in data["pagination"]

    def test_list_filter_by_availability(self, client):
        _create_truck(client, {"name": "Available", "availability": True})
        _create_truck(client, {"name": "Unavailable", "availability": False})

        data = json.loads(client.get("/api/v1/trucks?available=true").data)
        names = [t["name"] for t in data["data"]]
        assert "Available" in names
        assert "Unavailable" not in names

    def test_list_filter_by_category(self, client):
        _create_truck(client, {"name": "Heavy Truck", "truck_category": "Heavy"})
        _create_truck(client, {"name": "Light Truck", "truck_category": "Light"})

        data = json.loads(client.get("/api/v1/trucks?category=Heavy").data)
        names = [t["name"] for t in data["data"]]
        assert "Heavy Truck" in names
        assert "Light Truck" not in names


# ---------------------------------------------------------------------------
# Create truck
# ---------------------------------------------------------------------------

class TestCreateTruck:
    def test_create_returns_201(self, client):
        response = _create_truck(client)
        assert response.status_code == 201

    def test_create_success_flag(self, client):
        data = json.loads(_create_truck(client).data)
        assert data["success"] is True

    def test_create_missing_name_returns_400(self, client):
        response = client.post(
            "/api/v1/trucks",
            data=json.dumps({"length": 300.0, "width": 200.0, "height": 200.0}),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_create_missing_length_returns_400(self, client):
        response = client.post(
            "/api/v1/trucks",
            data=json.dumps({"name": "No Length", "width": 200.0, "height": 200.0}),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_create_negative_dimension_returns_400(self, client):
        response = _create_truck(client, {"length": -100.0})
        assert response.status_code == 400

    def test_create_zero_dimension_returns_400(self, client):
        response = _create_truck(client, {"height": 0})
        assert response.status_code == 400

    def test_create_negative_max_weight_returns_400(self, client):
        response = _create_truck(client, {"max_weight": -500.0})
        assert response.status_code == 400

    def test_create_stores_correct_data(self, client):
        response = _create_truck(client, {"name": "Storage Test", "length": 500.0})
        data = json.loads(response.data)
        assert data["data"]["name"] == "Storage Test"
        assert data["data"]["length"] == 500.0


# ---------------------------------------------------------------------------
# Get truck by ID
# ---------------------------------------------------------------------------

class TestGetTruck:
    def test_get_existing_returns_200(self, client):
        created = json.loads(_create_truck(client).data)
        truck_id = created["data"]["id"]
        response = client.get(f"/api/v1/trucks/{truck_id}")
        assert response.status_code == 200

    def test_get_existing_returns_correct_name(self, client):
        created = json.loads(_create_truck(client, {"name": "Fetch Me"}).data)
        truck_id = created["data"]["id"]
        data = json.loads(client.get(f"/api/v1/trucks/{truck_id}").data)
        assert data["data"]["name"] == "Fetch Me"

    def test_get_nonexistent_returns_404(self, client):
        response = client.get("/api/v1/trucks/99999")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Update truck
# ---------------------------------------------------------------------------

class TestUpdateTruck:
    def test_update_name_returns_200(self, client):
        created = json.loads(_create_truck(client).data)
        truck_id = created["data"]["id"]
        response = client.put(
            f"/api/v1/trucks/{truck_id}",
            data=json.dumps({"name": "Updated Truck"}),
            content_type="application/json",
        )
        assert response.status_code == 200

    def test_update_persists_change(self, client):
        created = json.loads(_create_truck(client).data)
        truck_id = created["data"]["id"]
        client.put(
            f"/api/v1/trucks/{truck_id}",
            data=json.dumps({"name": "Persisted Name"}),
            content_type="application/json",
        )
        data = json.loads(client.get(f"/api/v1/trucks/{truck_id}").data)
        assert data["data"]["name"] == "Persisted Name"

    def test_update_nonexistent_returns_error(self, client):
        response = client.put(
            "/api/v1/trucks/99999",
            data=json.dumps({"name": "Ghost"}),
            content_type="application/json",
        )
        assert response.status_code in (404, 500)


# ---------------------------------------------------------------------------
# Delete truck
# ---------------------------------------------------------------------------

class TestDeleteTruck:
    def test_delete_returns_200(self, client):
        created = json.loads(_create_truck(client).data)
        truck_id = created["data"]["id"]
        response = client.delete(f"/api/v1/trucks/{truck_id}")
        assert response.status_code == 200

    def test_delete_removes_truck(self, client):
        created = json.loads(_create_truck(client).data)
        truck_id = created["data"]["id"]
        client.delete(f"/api/v1/trucks/{truck_id}")
        response = client.get(f"/api/v1/trucks/{truck_id}")
        assert response.status_code == 404

    def test_delete_nonexistent_returns_error(self, client):
        response = client.delete("/api/v1/trucks/99999")
        assert response.status_code in (404, 500)


# ---------------------------------------------------------------------------
# List truck categories
# ---------------------------------------------------------------------------

class TestListCategories:
    def test_categories_endpoint_returns_200(self, client):
        response = client.get("/api/v1/trucks/categories")
        assert response.status_code == 200

    def test_categories_returns_added_category(self, client):
        _create_truck(client, {"truck_category": "UniqueCategory"})
        data = json.loads(client.get("/api/v1/trucks/categories").data)
        assert "UniqueCategory" in data["data"]
