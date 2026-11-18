/**
 * Canonical agency truck types (the public.trucks catalog, keyed by `code`; see
 * supabase/migrations/20261008000000_agency_fleet_foundation.sql). Every
 * agency_trucks.vehicle_type and agency_tariff_versions.vehicle_type FK points
 * at this list, so it is the complete set a user can pick. Users only ever see
 * the human label; raw codes such as `eicher_14ft` must not reach the UI.
 */
export interface VehicleTypeOption {
  readonly code: string
  readonly label: string
}

export const VEHICLE_TYPES: ReadonlyArray<VehicleTypeOption> = [
  { code: 'tata_ace', label: 'Tata Ace (mini truck)' },
  { code: 'tata_407', label: 'Tata 407 (1T)' },
  { code: 'eicher_14ft', label: 'Eicher 14ft (3T)' },
  { code: 'eicher_17ft', label: 'Eicher 17ft (5T)' },
  { code: 'ashok_19ft', label: 'Ashok Leyland 19ft (7T)' },
  { code: 'bharatbenz_24ft', label: 'BharatBenz 24ft (10T)' },
  { code: 'bharatbenz_32ft', label: 'BharatBenz 32ft (15T)' },
  { code: 'volvo_40ft', label: 'Volvo 40ft Container (25T)' },
]

const LABEL_BY_CODE = new Map<string, string>(VEHICLE_TYPES.map((v) => [v.code, v.label]))

/**
 * Human label for a catalog vehicle code. Never returns the raw code: an empty
 * value reads as "not set" and an unknown code reads as "Other truck type".
 */
export function vehicleTypeLabel(code: string | null | undefined): string {
  if (!code) return 'Truck type not set'
  return LABEL_BY_CODE.get(code) ?? 'Other truck type'
}
