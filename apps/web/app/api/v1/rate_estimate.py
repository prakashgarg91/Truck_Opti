"""
Instant Rate / Price Estimate API (roadmap ID O-08)
Porter-style "Instant Estimate Calculator".

Returns an estimated shipping price breakdown from distance + weight +
(optional) truck type, so customers can get an instant quote before booking.

This is a deliberately lightweight, DB-free, deterministic calculator. The
heavier engines in ``app.cost_engine`` and ``app.indian_logistics_cost`` require
truck DB objects / full route + truck spec dataclasses and (for cost_engine)
non-deterministic mock fuel prices, so neither is callable from the three simple
public inputs this endpoint accepts. We therefore use a transparent fallback
formula with documented, module-level rate constants:

    base_fare
  + distance_charge = PER_KM_RATE * distance_km
  + weight_charge   = PER_KG_RATE * weight_kg
  + fuel_surcharge  = FUEL_SURCHARGE_PCT * (base + distance + weight)
  = total_estimate

A ``truck_type`` multiplier scales the variable charges so heavier vehicles
quote higher. Constants are indicative of the Indian logistics market and are
loosely aligned with the published rates in ``app.indian_logistics_cost``
(e.g. diesel ~Rs.95/l, per-km toll/maintenance bands by vehicle class); they are
kept self-contained here so the endpoint has no import coupling and stays
deterministic for testing.
"""

from flask import Blueprint, request, jsonify

# ---------------------------------------------------------------------------
# Rate constants (INR). Documented, module-level, easy to tune.
# ---------------------------------------------------------------------------
CURRENCY = "INR"

BASE_FARE = 500.0          # Flat fixed fare per trip (Rs.)
PER_KM_RATE = 12.0         # Distance charge per kilometre (Rs./km)
PER_KG_RATE = 1.5          # Weight charge per kilogram (Rs./kg)
FUEL_SURCHARGE_PCT = 0.10  # Fuel surcharge as a fraction of the pre-surcharge subtotal (10%)

# Truck-type multiplier applied to the variable (distance + weight) charges.
# Unknown / unspecified truck types fall back to the default multiplier (1.0).
TRUCK_TYPE_MULTIPLIERS = {
    "mini": 0.8,    # small last-mile / LCV-ish
    "lcv": 0.9,     # light commercial vehicle
    "standard": 1.0,
    "mcv": 1.2,     # medium commercial vehicle
    "container": 1.4,
    "hcv": 1.5,     # heavy commercial vehicle
    "trailer": 1.8,
}
DEFAULT_TRUCK_MULTIPLIER = 1.0

DISCLAIMER = (
    "This is an indicative estimate only and not a final quote. Actual price may "
    "vary based on route, tolls, taxes, fuel prices, loading/unloading and "
    "vehicle availability."
)

rate_estimate_bp = Blueprint('rate_estimate', __name__, url_prefix='/rate-estimate')


def _truck_multiplier(truck_type):
    """Return the variable-charge multiplier for a truck type (default 1.0)."""
    if not truck_type:
        return DEFAULT_TRUCK_MULTIPLIER
    return TRUCK_TYPE_MULTIPLIERS.get(str(truck_type).strip().lower(), DEFAULT_TRUCK_MULTIPLIER)


def calculate_rate_estimate(distance_km, weight_kg, truck_type=None):
    """
    Compute a transparent price breakdown.

    The total is computed as the sum of the already-rounded components so that
    ``total_estimate == base_fare + distance_charge + weight_charge + fuel_surcharge``
    holds exactly (no off-by-a-paisa rounding drift).
    """
    multiplier = _truck_multiplier(truck_type)

    base_fare = round(BASE_FARE, 2)
    distance_charge = round(PER_KM_RATE * distance_km * multiplier, 2)
    weight_charge = round(PER_KG_RATE * weight_kg * multiplier, 2)

    pre_surcharge_subtotal = base_fare + distance_charge + weight_charge
    fuel_surcharge = round(FUEL_SURCHARGE_PCT * pre_surcharge_subtotal, 2)

    total_estimate = round(base_fare + distance_charge + weight_charge + fuel_surcharge, 2)

    return {
        'currency': CURRENCY,
        'distance_km': distance_km,
        'weight_kg': weight_kg,
        'truck_type': truck_type if truck_type else 'standard',
        'base_fare': base_fare,
        'distance_charge': distance_charge,
        'weight_charge': weight_charge,
        'fuel_surcharge': fuel_surcharge,
        'total_estimate': total_estimate,
        'disclaimer': DISCLAIMER,
    }


def _parse_inputs(source):
    """
    Extract and validate distance_km / weight_kg / truck_type from a mapping.

    Returns (data_dict, None) on success, or (None, (error_response, status)).
    """
    if source is None:
        return None, ({'success': False, 'error': 'Request body must be valid JSON'}, 400)

    # distance_km and weight_kg are required.
    for field in ('distance_km', 'weight_kg'):
        if source.get(field) is None or (isinstance(source.get(field), str) and source.get(field).strip() == ''):
            return None, ({'success': False, 'error': f'Missing required field: {field}'}, 400)

    try:
        distance_km = float(source.get('distance_km'))
        weight_kg = float(source.get('weight_kg'))
    except (TypeError, ValueError):
        return None, ({
            'success': False,
            'error': 'distance_km and weight_kg must be valid numbers'
        }, 400)

    if distance_km < 0 or weight_kg < 0:
        return None, ({
            'success': False,
            'error': 'distance_km and weight_kg must not be negative'
        }, 400)

    truck_type = source.get('truck_type')
    if truck_type is not None:
        truck_type = str(truck_type).strip() or None

    return {
        'distance_km': distance_km,
        'weight_kg': weight_kg,
        'truck_type': truck_type,
    }, None


@rate_estimate_bp.route('', methods=['GET', 'POST'])
def rate_estimate():
    """
    Instant shipping price estimate.

    POST: JSON body with ``distance_km``, ``weight_kg`` and optional ``truck_type``.
    GET:  same values as query-string params (convenient for quick testing).

    Returns 200 with a price breakdown, or 400 + JSON error for missing /
    non-numeric / negative inputs.
    """
    if request.method == 'POST':
        source = request.get_json(silent=True)
    else:
        # GET query params arrive as strings; _parse_inputs casts them.
        source = request.args.to_dict()

    data, error = _parse_inputs(source)
    if error is not None:
        body, status = error
        return jsonify(body), status

    result = calculate_rate_estimate(
        distance_km=data['distance_km'],
        weight_kg=data['weight_kg'],
        truck_type=data['truck_type'],
    )

    # Flat success response: the breakdown keys sit at the top level, matching
    # the documented output contract (and the flat style of health.py). Error
    # responses keep the {'success': False, 'error': ...} envelope.
    return jsonify(result), 200


__all__ = ['rate_estimate_bp']
