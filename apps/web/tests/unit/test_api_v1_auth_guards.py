"""Auth guard regression tests for modular API v1 write endpoints."""

import pytest

import app.middleware.authentication as auth_middleware


def make_auth_headers() -> dict[str, str]:
    token = auth_middleware.generate_token(7, 'driver@example.com', 'driver')
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }


@pytest.mark.parametrize(
    ('method', 'path', 'json_body'),
    [
        ('post', '/api/v1/cartons', {'name': 'Guarded Carton', 'length': 1, 'width': 1, 'height': 1, 'weight': 1}),
        ('put', '/api/v1/cartons/9999', {'name': 'Updated Carton'}),
        ('delete', '/api/v1/cartons/9999', None),
        ('post', '/api/v1/cartons/bulk', [{'name': 'Bulk Carton', 'length': 1, 'width': 1, 'height': 1, 'weight': 1}]),
        ('post', '/api/v1/shipments', {'origin': 'A', 'destination': 'B'}),
        ('put', '/api/v1/shipments/9999', {'origin': 'Updated'}),
        ('delete', '/api/v1/shipments/9999', None),
        ('post', '/api/v1/trucks', {'name': 'Guarded Truck', 'length': 10, 'width': 5, 'height': 5}),
        ('put', '/api/v1/trucks/9999', {'name': 'Updated Truck'}),
        ('delete', '/api/v1/trucks/9999', None),
    ],
)
def test_v1_write_endpoints_require_auth(client, method, path, json_body):
    response = getattr(client, method)(path, json=json_body)

    assert response.status_code == 401
    assert response.get_json()['error'] == 'Authentication required'


def test_create_carton_allows_authenticated_request(client):
    response = client.post(
        '/api/v1/cartons',
        json={'name': 'Secure Carton', 'length': 1, 'width': 2, 'height': 3, 'weight': 4},
        headers=make_auth_headers(),
    )

    assert response.status_code == 201
    assert response.get_json()['success'] is True


def test_create_shipment_allows_authenticated_request(client, sample_customer):
    response = client.post(
        '/api/v1/shipments',
        json={'customer_id': sample_customer.id, 'origin': 'Mumbai', 'destination': 'Delhi'},
        headers=make_auth_headers(),
    )

    assert response.status_code == 201
    assert response.get_json()['success'] is True


def test_create_truck_allows_authenticated_request(client):
    response = client.post(
        '/api/v1/trucks',
        json={'name': 'Secure Truck', 'length': 20, 'width': 8, 'height': 8},
        headers=make_auth_headers(),
    )

    assert response.status_code == 201
    assert response.get_json()['success'] is True