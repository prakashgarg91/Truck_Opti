"""
Tests for the CO2 Emissions Estimator (roadmap ID T-09).

Covers the pure-Python logic in app.carbon_estimator and a thin Flask
test-client check of the /web/emissions/estimate JSON endpoint.
"""

import pytest

from app.carbon_estimator import (
    estimate_co2,
    get_km_per_litre,
    DIESEL_KG_CO2_PER_LITRE,
    DEFAULT_KM_PER_LITRE,
)


def test_known_numeric_case_heavy_truck():
    """100 km, heavy truck (4.0 km/l), diesel (2.68 kg/l).

    litres = 100 / 4 = 25.0 ; co2 = 25 * 2.68 = 67.0 kg
    """
    result = estimate_co2(distance_km=100, truck_type="heavy")
    assert result["km_per_litre"] == 4.0
    assert result["emission_factor"] == DIESEL_KG_CO2_PER_LITRE
    assert result["litres_used"] == pytest.approx(25.0)
    assert result["co2_kg"] == pytest.approx(67.0)
    assert result["intensity_g_per_tonne_km"] is None


def test_unknown_truck_type_falls_back_to_default():
    """Unknown truck type uses DEFAULT_KM_PER_LITRE (5.0)."""
    assert get_km_per_litre("flying_saucer") == DEFAULT_KM_PER_LITRE
    result = estimate_co2(distance_km=100, truck_type="flying_saucer")
    # litres = 100 / 5 = 20 ; co2 = 20 * 2.68 = 53.6
    assert result["km_per_litre"] == DEFAULT_KM_PER_LITRE
    assert result["co2_kg"] == pytest.approx(53.6)


def test_no_truck_type_uses_default():
    result = estimate_co2(distance_km=50, truck_type=None)
    assert result["km_per_litre"] == DEFAULT_KM_PER_LITRE
    assert result["truck_type"] == "default"


def test_payload_intensity_computed():
    """Intensity = co2_kg * 1000 / (payload_tonnes * distance_km).

    67.0 kg CO2, 10 t, 100 km -> 67000 / 1000 = 67.0 g/tonne-km
    """
    result = estimate_co2(distance_km=100, truck_type="heavy",
                          payload_tonnes=10)
    assert result["intensity_g_per_tonne_km"] == pytest.approx(67.0)


def test_zero_payload_treated_as_no_payload():
    result = estimate_co2(distance_km=100, truck_type="heavy",
                          payload_tonnes=0)
    assert result["intensity_g_per_tonne_km"] is None


def test_zero_distance_returns_zero_co2():
    result = estimate_co2(distance_km=0, truck_type="heavy",
                          payload_tonnes=10)
    assert result["co2_kg"] == 0.0
    assert result["litres_used"] == 0.0
    # No division-by-zero: intensity is None when distance is 0.
    assert result["intensity_g_per_tonne_km"] is None


def test_negative_distance_raises_value_error():
    with pytest.raises(ValueError):
        estimate_co2(distance_km=-10, truck_type="heavy")


def test_negative_payload_raises_value_error():
    with pytest.raises(ValueError):
        estimate_co2(distance_km=100, truck_type="heavy", payload_tonnes=-5)


def test_unknown_fuel_type_falls_back_to_diesel():
    result = estimate_co2(distance_km=100, truck_type="heavy",
                          fuel_type="unobtainium")
    assert result["emission_factor"] == DIESEL_KG_CO2_PER_LITRE


# --- Optional Flask integration check ------------------------------------

def _make_test_app():
    try:
        from app import create_app
        return create_app("testing")
    except Exception:  # pragma: no cover - app import unrelated to our code
        return None


def test_estimate_endpoint_json():
    """Hit the registered JSON endpoint via the Flask test client."""
    app = _make_test_app()
    if app is None:
        pytest.skip("Full app import unavailable; pure logic tests still run")

    # Route nests under web_bp(url_prefix='/web') -> /web/emissions/estimate
    client = app.test_client()
    resp = client.post(
        "/web/emissions/estimate",
        json={"distance_km": 100, "truck_type": "heavy", "payload_tonnes": 10},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["data"]["co2_kg"] == pytest.approx(67.0)
    assert body["data"]["intensity_g_per_tonne_km"] == pytest.approx(67.0)


def test_estimate_endpoint_bad_input_returns_400():
    app = _make_test_app()
    if app is None:
        pytest.skip("Full app import unavailable; pure logic tests still run")

    client = app.test_client()
    resp = client.post("/web/emissions/estimate", json={"distance_km": -5})
    assert resp.status_code == 400
    assert resp.get_json()["success"] is False


def test_emissions_page_renders():
    """GET /web/emissions renders the HTML form page (url_for resolves)."""
    app = _make_test_app()
    if app is None:
        pytest.skip("Full app import unavailable; pure logic tests still run")

    client = app.test_client()
    resp = client.get("/web/emissions")
    assert resp.status_code == 200
    assert b"CO2 Emissions Estimator" in resp.data
