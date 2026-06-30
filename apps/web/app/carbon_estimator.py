"""
CO2 Emissions Estimator for TruckOpti (roadmap ID T-09)

Pure-Python carbon footprint logic for truck shipments. No Flask imports.

Estimates tail-to-tank / well-to-wheel CO2 emissions from shipment distance and
truck type, with an optional payload to derive carbon intensity
(grams CO2 per tonne-km).
"""

from typing import Dict, Optional

# Well-to-wheel emission factors in kg CO2 per litre of fuel.
# Diesel ~2.68 kg CO2/litre is the standard well-to-wheel factor.
EMISSION_FACTORS_KG_CO2_PER_LITRE: Dict[str, float] = {
    "diesel": 2.68,
}
DIESEL_KG_CO2_PER_LITRE = EMISSION_FACTORS_KG_CO2_PER_LITRE["diesel"]

# Typical fuel efficiency (km per litre) by truck category.
# Heavy trucks ~3.5-5 km/l; medium ~5-8; light commercial ~8-12.
TRUCK_FUEL_EFFICIENCY_KMPL: Dict[str, float] = {
    "heavy": 4.0,
    "heavy_truck": 4.0,
    "truck": 4.0,
    "trailer": 3.5,
    "container": 3.8,
    "medium": 6.0,
    "medium_truck": 6.0,
    "light": 10.0,
    "light_commercial": 10.0,
    "lcv": 10.0,
    "mini": 12.0,
    "van": 11.0,
}

# Sensible default efficiency for unknown / unspecified truck types.
DEFAULT_KM_PER_LITRE = 5.0
DEFAULT_TRUCK_TYPE = "default"


def get_km_per_litre(truck_type: Optional[str]) -> float:
    """Return typical fuel efficiency (km/l) for a truck type.

    Lookup is case-insensitive and tolerates spaces/hyphens. Unknown or
    missing truck types fall back to ``DEFAULT_KM_PER_LITRE``.
    """
    if not truck_type:
        return DEFAULT_KM_PER_LITRE
    key = str(truck_type).strip().lower().replace("-", "_").replace(" ", "_")
    return TRUCK_FUEL_EFFICIENCY_KMPL.get(key, DEFAULT_KM_PER_LITRE)


def get_emission_factor(fuel_type: str = "diesel") -> float:
    """Return kg CO2 per litre for a fuel type (defaults to diesel)."""
    if not fuel_type:
        return DIESEL_KG_CO2_PER_LITRE
    return EMISSION_FACTORS_KG_CO2_PER_LITRE.get(
        str(fuel_type).strip().lower(), DIESEL_KG_CO2_PER_LITRE
    )


def estimate_co2(distance_km, truck_type=None, payload_tonnes=None,
                 fuel_type="diesel"):
    """Estimate CO2 emissions for a shipment.

    Args:
        distance_km: One-way trip distance in kilometres (>= 0).
        truck_type: Truck category; unknown values use the default efficiency.
        payload_tonnes: Optional payload in tonnes; enables carbon intensity.
        fuel_type: Fuel type; only "diesel" is defined (others fall back to it).

    Returns:
        dict with keys: co2_kg, litres_used, km_per_litre, emission_factor,
        truck_type, intensity_g_per_tonne_km (None if no usable payload),
        methodology.

    Raises:
        ValueError: if distance_km is negative or not a number.
    """
    try:
        distance_km = float(distance_km)
    except (TypeError, ValueError):
        raise ValueError("distance_km must be a number")

    if distance_km < 0:
        raise ValueError("distance_km must be non-negative")

    km_per_litre = get_km_per_litre(truck_type)
    emission_factor = get_emission_factor(fuel_type)

    # Distance 0 => no fuel burned => zero emissions (avoid division work).
    if distance_km == 0:
        litres_used = 0.0
        co2_kg = 0.0
    else:
        litres_used = distance_km / km_per_litre
        co2_kg = litres_used * emission_factor

    # Carbon intensity (grams CO2 per tonne-km). Only meaningful with a
    # positive payload and positive distance; otherwise None.
    intensity_g_per_tonne_km = None
    if payload_tonnes is not None:
        try:
            payload_tonnes = float(payload_tonnes)
        except (TypeError, ValueError):
            raise ValueError("payload_tonnes must be a number")
        if payload_tonnes < 0:
            raise ValueError("payload_tonnes must be non-negative")
        if payload_tonnes > 0 and distance_km > 0:
            intensity_g_per_tonne_km = round(
                (co2_kg * 1000.0) / (payload_tonnes * distance_km), 2
            )

    return {
        "co2_kg": round(co2_kg, 2),
        "litres_used": round(litres_used, 2),
        "km_per_litre": km_per_litre,
        "emission_factor": emission_factor,
        "truck_type": truck_type if truck_type else DEFAULT_TRUCK_TYPE,
        "intensity_g_per_tonne_km": intensity_g_per_tonne_km,
        "methodology": (
            "co2_kg = (distance_km / km_per_litre) * emission_factor "
            "[well-to-wheel, {factor} kg CO2 per litre {fuel}]".format(
                factor=emission_factor,
                fuel=str(fuel_type or "diesel").strip().lower(),
            )
        ),
    }


__all__ = [
    "estimate_co2",
    "get_km_per_litre",
    "get_emission_factor",
    "DIESEL_KG_CO2_PER_LITRE",
    "EMISSION_FACTORS_KG_CO2_PER_LITRE",
    "TRUCK_FUEL_EFFICIENCY_KMPL",
    "DEFAULT_KM_PER_LITRE",
]
