"""
CO2 Emissions Estimator UI Web Routes (roadmap ID T-09)
Minimal UI + JSON endpoint for carbon footprint estimation.
"""

from flask import Blueprint, render_template_string, request, jsonify
from app.carbon_estimator import (
    estimate_co2,
    TRUCK_FUEL_EFFICIENCY_KMPL,
)

emissions_bp = Blueprint('emissions', __name__, url_prefix='/emissions')


_EMISSIONS_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CO2 Emissions Estimator</title>
  <style>
    body { font-family: system-ui, Arial, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
    input, select { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 1rem; padding: 0.6rem 1.2rem; cursor: pointer; }
    #result { margin-top: 1.5rem; padding: 1rem; background: #f4f6f8; border-radius: 6px; white-space: pre-wrap; }
    .muted { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>CO2 Emissions Estimator</h1>
  <p class="muted">Estimate shipment CO2 from distance and truck type. Payload is optional (enables intensity in g CO2 per tonne-km).</p>
  <form id="co2-form">
    <label for="distance_km">Distance (km)</label>
    <input id="distance_km" name="distance_km" type="number" step="any" min="0" value="100" required>

    <label for="truck_type">Truck type</label>
    <select id="truck_type" name="truck_type">
      <option value="">(default)</option>
      {% for t in truck_types %}<option value="{{ t }}">{{ t }}</option>{% endfor %}
    </select>

    <label for="payload_tonnes">Payload (tonnes, optional)</label>
    <input id="payload_tonnes" name="payload_tonnes" type="number" step="any" min="0" placeholder="e.g. 10">

    <button type="submit">Estimate</button>
  </form>
  <div id="result" hidden></div>

  <script>
    const form = document.getElementById('co2-form');
    const out = document.getElementById('result');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        distance_km: document.getElementById('distance_km').value,
        truck_type: document.getElementById('truck_type').value || null,
      };
      const pl = document.getElementById('payload_tonnes').value;
      if (pl !== '') payload.payload_tonnes = pl;
      out.hidden = false;
      out.textContent = 'Estimating...';
      try {
        const resp = await fetch('{{ estimate_url }}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json();
        if (!resp.ok) { out.textContent = 'Error: ' + (data.error || resp.status); return; }
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'Request failed: ' + err;
      }
    });
  </script>
</body>
</html>"""


def _extract_params():
    """Pull params from JSON body, form, or query string (in that order)."""
    data = {}
    if request.is_json:
        body = request.get_json(silent=True) or {}
        if isinstance(body, dict):
            data.update(body)
    # Form / query params override only when not already supplied via JSON.
    for src in (request.form, request.args):
        for key in ("distance_km", "truck_type", "payload_tonnes", "fuel_type"):
            if key not in data and key in src:
                data[key] = src.get(key)
    return data


def _clean_optional(value):
    """Treat empty strings / 'none' as Python None for optional fields."""
    if value is None:
        return None
    if isinstance(value, str) and value.strip().lower() in ("", "none", "null"):
        return None
    return value


@emissions_bp.route('')
@emissions_bp.route('/')
def emissions_page():
    """Minimal self-contained HTML page with an estimate form."""
    from flask import url_for
    return render_template_string(
        _EMISSIONS_PAGE,
        truck_types=sorted(TRUCK_FUEL_EFFICIENCY_KMPL.keys()),
        estimate_url=url_for('web.emissions.estimate'),
    )


@emissions_bp.route('/estimate', methods=['GET', 'POST'])
def estimate():
    """Estimate CO2 emissions; returns JSON. 400 on bad input."""
    params = _extract_params()

    if "distance_km" not in params or _clean_optional(params.get("distance_km")) is None:
        return jsonify({
            "success": False,
            "error": "distance_km is required",
        }), 400

    truck_type = _clean_optional(params.get("truck_type"))
    payload_tonnes = _clean_optional(params.get("payload_tonnes"))
    fuel_type = _clean_optional(params.get("fuel_type")) or "diesel"

    try:
        result = estimate_co2(
            distance_km=params.get("distance_km"),
            truck_type=truck_type,
            payload_tonnes=payload_tonnes,
            fuel_type=fuel_type,
        )
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    return jsonify({"success": True, "data": result}), 200


__all__ = ['emissions_bp']
