"""
Tests for the Instant Rate / Price Estimate API (roadmap ID O-08).

Endpoint: POST/GET /api/v1/rate-estimate
"""

import json

import pytest

from app import create_app


@pytest.fixture(scope='module')
def client():
    app = create_app('testing')
    app.config['TESTING'] = True
    return app.test_client()


def _breakdown(payload):
    """The success response is the flat breakdown dict (no envelope)."""
    assert 'total_estimate' in payload
    return payload


def _assert_sum_matches(b):
    """total_estimate must equal base + distance + weight + fuel (within rounding)."""
    expected = (
        b['base_fare']
        + b['distance_charge']
        + b['weight_charge']
        + b['fuel_surcharge']
    )
    assert b['total_estimate'] == pytest.approx(expected, abs=0.01)


# ---------------------------------------------------------------------------
# POST
# ---------------------------------------------------------------------------
def test_post_valid_estimate_returns_200_and_breakdown(client):
    resp = client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({'distance_km': 100, 'weight_kg': 200, 'truck_type': 'standard'}),
        content_type='application/json',
    )
    assert resp.status_code == 200
    b = _breakdown(resp.get_json())

    # All breakdown keys present
    for key in (
        'currency', 'distance_km', 'weight_kg', 'truck_type',
        'base_fare', 'distance_charge', 'weight_charge',
        'fuel_surcharge', 'total_estimate', 'disclaimer',
    ):
        assert key in b

    assert b['currency'] == 'INR'
    assert isinstance(b['total_estimate'], (int, float))
    assert b['total_estimate'] > 0
    _assert_sum_matches(b)


def test_post_known_values_exact_math(client):
    # standard multiplier = 1.0
    # base=500, distance=12*100=1200, weight=1.5*200=300
    # subtotal=2000, fuel=10% -> 200, total=2200
    resp = client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({'distance_km': 100, 'weight_kg': 200, 'truck_type': 'standard'}),
        content_type='application/json',
    )
    assert resp.status_code == 200
    b = _breakdown(resp.get_json())
    assert b['base_fare'] == 500.0
    assert b['distance_charge'] == 1200.0
    assert b['weight_charge'] == 300.0
    assert b['fuel_surcharge'] == 200.0
    assert b['total_estimate'] == 2200.0


def test_post_truck_type_optional(client):
    resp = client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({'distance_km': 50, 'weight_kg': 100}),
        content_type='application/json',
    )
    assert resp.status_code == 200
    b = _breakdown(resp.get_json())
    # Defaults to 'standard' (multiplier 1.0)
    assert b['truck_type'] == 'standard'
    _assert_sum_matches(b)


def test_post_unknown_truck_type_defaults_multiplier(client):
    resp = client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({'distance_km': 100, 'weight_kg': 200, 'truck_type': 'spaceship'}),
        content_type='application/json',
    )
    # Unknown truck type is NOT an error; it just uses the default multiplier.
    assert resp.status_code == 200
    b = _breakdown(resp.get_json())
    assert b['distance_charge'] == 1200.0  # 12 * 100 * 1.0
    _assert_sum_matches(b)


def test_post_heavier_truck_costs_more(client):
    body = {'distance_km': 100, 'weight_kg': 200}
    std = _breakdown(client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({**body, 'truck_type': 'standard'}),
        content_type='application/json',
    ).get_json())
    trailer = _breakdown(client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({**body, 'truck_type': 'trailer'}),
        content_type='application/json',
    ).get_json())
    assert trailer['total_estimate'] > std['total_estimate']


def test_post_missing_param_returns_400(client):
    resp = client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({'weight_kg': 200}),  # distance_km missing
        content_type='application/json',
    )
    assert resp.status_code == 400
    assert resp.get_json()['success'] is False


def test_post_negative_param_returns_400(client):
    resp = client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({'distance_km': -10, 'weight_kg': 200}),
        content_type='application/json',
    )
    assert resp.status_code == 400
    assert resp.get_json()['success'] is False


def test_post_non_numeric_param_returns_400(client):
    resp = client.post(
        '/api/v1/rate-estimate',
        data=json.dumps({'distance_km': 'abc', 'weight_kg': 200}),
        content_type='application/json',
    )
    assert resp.status_code == 400
    assert resp.get_json()['success'] is False


def test_post_no_body_returns_400(client):
    # No JSON body / wrong content type -> get_json(silent=True) is None -> 400, not 500.
    resp = client.post('/api/v1/rate-estimate')
    assert resp.status_code == 400
    assert resp.get_json()['success'] is False


# ---------------------------------------------------------------------------
# GET
# ---------------------------------------------------------------------------
def test_get_valid_estimate_returns_200(client):
    resp = client.get('/api/v1/rate-estimate?distance_km=100&weight_kg=200&truck_type=standard')
    assert resp.status_code == 200
    b = _breakdown(resp.get_json())
    assert b['total_estimate'] == 2200.0
    _assert_sum_matches(b)


def test_get_missing_param_returns_400(client):
    resp = client.get('/api/v1/rate-estimate?distance_km=100')  # weight_kg missing
    assert resp.status_code == 400
    assert resp.get_json()['success'] is False


def test_get_negative_param_returns_400(client):
    resp = client.get('/api/v1/rate-estimate?distance_km=100&weight_kg=-5')
    assert resp.status_code == 400
    assert resp.get_json()['success'] is False


def test_get_non_numeric_param_returns_400(client):
    resp = client.get('/api/v1/rate-estimate?distance_km=foo&weight_kg=200')
    assert resp.status_code == 400
    assert resp.get_json()['success'] is False
