// Local-first service mirror of the Supabase packing-slice APIs.
// Identical method signatures to trucksSupabaseApi / cartonsSupabaseApi so
// pages switch import source without logic changes. PGlite returns NUMERIC
// columns as strings (pg wire behavior), so mappers coerce to Number —
// the UI does arithmetic on these fields.
import { getLocalDb } from '../lib/localDb'
import { UserFacingError } from '../utils/userFacingError'
import { logger } from '../utils/logger'
import type { Truck, Carton } from './supabaseApi'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg wire rows
function mapTruck(r: any): Truck {
  return {
    id: r.id,
    name: r.name,
    name_hi: r.name_hi ?? null,
    length: Number(r.length),
    width: Number(r.width),
    height: Number(r.height),
    capacity: Number(r.capacity),
    cost_per_km: Number(r.cost_per_km),
    available: Number(r.available),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg wire rows
function mapCarton(r: any): Carton {
  return {
    id: r.id,
    name: r.name,
    length: Number(r.length),
    width: Number(r.width),
    height: Number(r.height),
    weight: Number(r.weight),
    fragile: r.fragile === true,
    stackable: r.stackable !== false,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export const trucksLocalApi = {
  async getAll(): Promise<Truck[]> {
    try {
      const db = await getLocalDb()
      const r = await db.query('SELECT * FROM trucks ORDER BY name')
      return r.rows.map(mapTruck)
    } catch (error) {
      logger.error('[trucksLocalApi.getAll]', error)
      throw new UserFacingError('Unable to load trucks right now. Please try again.')
    }
  },

  async getById(id: string): Promise<Truck | null> {
    const db = await getLocalDb()
    const r = await db.query('SELECT * FROM trucks WHERE id = $1', [id])
    return r.rows.length ? mapTruck(r.rows[0]) : null
  },

  async create(truck: Omit<Truck, 'id' | 'created_at' | 'updated_at'>): Promise<Truck> {
    const db = await getLocalDb()
    const id = crypto.randomUUID()
    const r = await db.query(
      `INSERT INTO trucks(id, name, name_hi, category, length, width, height, capacity, cost_per_km, available)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passthrough of page-validated shape
      [id, truck.name, (truck as any).name_hi ?? null, (truck as any).category ?? null,
        truck.length, truck.width, truck.height, truck.capacity, truck.cost_per_km, truck.available]
    )
    return mapTruck(r.rows[0])
  },

  async update(id: string, truck: Partial<Truck>): Promise<Truck> {
    const db = await getLocalDb()
    const fields: string[] = []
    const vals: unknown[] = []
    const cols = ['name', 'name_hi', 'category', 'length', 'width', 'height', 'capacity', 'cost_per_km', 'available'] as const
    for (const c of cols) {
      const v = (truck as Record<string, unknown>)[c]
      if (v !== undefined) { fields.push(`${c} = $${vals.length + 2}`); vals.push(v) }
    }
    if (!fields.length) {
      const cur = await this.getById(id)
      if (!cur) throw new UserFacingError('Truck not found.')
      return cur
    }
    const r = await db.query(
      `UPDATE trucks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...vals]
    )
    if (!r.rows.length) throw new UserFacingError('Truck not found.')
    return mapTruck(r.rows[0])
  },

  async delete(id: string): Promise<void> {
    const db = await getLocalDb()
    await db.query('DELETE FROM trucks WHERE id = $1', [id])
  },

  async getExistingNames(names: string[]): Promise<string[]> {
    try {
      const db = await getLocalDb()
      const r = await db.query<{ name: string }>('SELECT name FROM trucks WHERE name = ANY($1::text[])', [names])
      return r.rows.map((row) => row.name)
    } catch (error) {
      logger.error('[trucksLocalApi.getExistingNames]', error)
      throw new UserFacingError('Unable to load truck catalog right now. Please try again.')
    }
  },

  async createMany(trucks: Array<Record<string, unknown>>): Promise<void> {
    try {
      const db = await getLocalDb()
      for (const t of trucks) {
        await db.query(
          `INSERT INTO trucks(id, name, length, width, height, capacity, cost_per_km, available, category)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(name) DO NOTHING`,
          [crypto.randomUUID(), t.name, t.length, t.width, t.height, t.capacity, t.cost_per_km, t.available, t.category ?? null]
        )
      }
    } catch (error) {
      logger.error('[trucksLocalApi.createMany]', error)
      throw new UserFacingError('Unable to add default trucks right now. Please try again.')
    }
  },
}

export const cartonsLocalApi = {
  async getAll(): Promise<Carton[]> {
    try {
      const db = await getLocalDb()
      const r = await db.query('SELECT * FROM cartons ORDER BY name')
      return r.rows.map(mapCarton)
    } catch (error) {
      logger.error('[cartonsLocalApi.getAll]', error)
      throw new UserFacingError('Unable to load cartons right now. Please try again.')
    }
  },

  async getById(id: string): Promise<Carton | null> {
    const db = await getLocalDb()
    const r = await db.query('SELECT * FROM cartons WHERE id = $1', [id])
    return r.rows.length ? mapCarton(r.rows[0]) : null
  },

  async create(carton: Omit<Carton, 'id' | 'created_at' | 'updated_at'>): Promise<Carton> {
    const db = await getLocalDb()
    const id = crypto.randomUUID()
    const r = await db.query(
      `INSERT INTO cartons(id, name, length, width, height, weight, fragile, stackable)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, carton.name, carton.length, carton.width, carton.height, carton.weight, carton.fragile ?? false, carton.stackable ?? true]
    )
    return mapCarton(r.rows[0])
  },

  async update(id: string, carton: Partial<Carton>): Promise<Carton> {
    const db = await getLocalDb()
    const fields: string[] = []
    const vals: unknown[] = []
    const cols = ['name', 'length', 'width', 'height', 'weight', 'fragile', 'stackable'] as const
    for (const c of cols) {
      const v = (carton as Record<string, unknown>)[c]
      if (v !== undefined) { fields.push(`${c} = $${vals.length + 2}`); vals.push(v) }
    }
    if (!fields.length) {
      const cur = await this.getById(id)
      if (!cur) throw new UserFacingError('Carton not found.')
      return cur
    }
    const r = await db.query(
      `UPDATE cartons SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...vals]
    )
    if (!r.rows.length) throw new UserFacingError('Carton not found.')
    return mapCarton(r.rows[0])
  },

  async delete(id: string): Promise<void> {
    const db = await getLocalDb()
    await db.query('DELETE FROM cartons WHERE id = $1', [id])
  },
}

export interface LocalAgencyProfile {
  id: string
  role: string
  company_name: string
  contact_name: string | null
  contact_phone: string | null
  created_at?: string
}

export const agencyProfileLocalApi = {
  async current(): Promise<LocalAgencyProfile | null> {
    const db = await getLocalDb()
    const r = await db.query('SELECT * FROM agency_profiles ORDER BY created_at LIMIT 1')
    return (r.rows[0] as LocalAgencyProfile | undefined) ?? null
  },

  async save(profile: Omit<LocalAgencyProfile, 'id' | 'created_at'>): Promise<LocalAgencyProfile> {
    const db = await getLocalDb()
    const existing = await this.current()
    if (existing) {
      const r = await db.query(
        `UPDATE agency_profiles SET role=$2, company_name=$3, contact_name=$4, contact_phone=$5 WHERE id=$1 RETURNING *`,
        [existing.id, profile.role, profile.company_name, profile.contact_name, profile.contact_phone]
      )
      return r.rows[0] as LocalAgencyProfile
    }
    const r = await db.query(
      `INSERT INTO agency_profiles(id, role, company_name, contact_name, contact_phone)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [crypto.randomUUID(), profile.role, profile.company_name, profile.contact_name, profile.contact_phone]
    )
    return r.rows[0] as LocalAgencyProfile
  },
}
