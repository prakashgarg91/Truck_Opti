// Device backup engine: PGlite tables -> canonical snapshot -> optional
// AES-GCM encryption -> revision-checked Drive upload. Restore reverses it
// with hash verification. Proven in D:/Github/localfirst-spike/sync/.
import { getLocalDb } from './localDb'
import { UserFacingError } from '../utils/userFacingError'
import { downloadSnapshot, readHead, uploadSnapshot } from './driveClient'
import type { DriveTransport } from './driveClient'

const enc = new TextEncoder()
const dec = new TextDecoder()

export type { DriveTransport } from './driveClient'

export interface BackupReport {
  tables: Record<string, number>
  plainBytes: number
  storedBytes: number
  sha256: string
  encrypted: boolean
  fileId?: string
  revision?: string
  conflict?: boolean
}

interface SnapshotTable {
  columns: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[][]
}

const TABLES: Record<string, string[]> = {
  trucks: ['id', 'name', 'name_hi', 'category', 'length', 'width', 'height', 'capacity', 'cost_per_km', 'available', 'created_at', 'updated_at'],
  cartons: ['id', 'name', 'length', 'width', 'height', 'weight', 'fragile', 'stackable', 'created_at', 'updated_at'],
  agency_profiles: ['id', 'role', 'company_name', 'contact_name', 'contact_phone', 'created_at'],
  sync_meta: ['key', 'value', 'updated_at'],
}

function serializeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'bigint') return v.toString()
  return v ?? null
}

export async function exportSnapshot(): Promise<{ bytes: Uint8Array; tables: Record<string, number> }> {
  const db = await getLocalDb()
  const out: Record<string, SnapshotTable> = {}
  const counts: Record<string, number> = {}
  for (const [table, columns] of Object.entries(TABLES)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await db.query<any>(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY 1`)
    out[table] = { columns, rows: r.rows.map((row) => columns.map((c) => serializeValue(row[c]))) }
    counts[table] = r.rows.length
  }
  return { bytes: enc.encode(JSON.stringify({ version: 1, tables: out })), tables: counts }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 50000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

export async function encryptBytes(password: string, plain: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource))
  const out = new Uint8Array(16 + 12 + ct.length)
  out.set(salt); out.set(iv, 16); out.set(ct, 28)
  return out
}

export async function decryptBytes(password: string, blob: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const key = await deriveKey(password, salt)
  const iv = blob.slice(0, 12)
  const ct = blob.slice(12)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource))
}

export async function importSnapshot(bytes: Uint8Array): Promise<Record<string, number>> {
  const parsed = JSON.parse(dec.decode(bytes)) as { version: number; tables: Record<string, SnapshotTable> }
  if (parsed.version !== 1 || !parsed.tables) throw new UserFacingError('Backup file is not a supported TruckOpti snapshot.')
  const db = await getLocalDb()
  const counts: Record<string, number> = {}
  await db.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')
  for (const [table, columns] of Object.entries(TABLES)) {
    const t = parsed.tables[table]
    if (!t) continue
    counts[table] = t.rows.length
    for (const row of t.rows) {
      const placeholders = row.map((_, i) => `$${i + 1}`).join(',')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.query<any>(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders})`, row as any[])
    }
  }
  return counts
}

function authed(token: string): DriveTransport {
  return (url, init = {}) => fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  })
}

async function metaGet(key: string): Promise<string | null> {
  const db = await getLocalDb()
  const r = await db.query<{ value: string }>('SELECT value FROM sync_meta WHERE key = $1', [key])
  return r.rows.length ? r.rows[0].value : null
}

async function metaSet(key: string, value: string): Promise<void> {
  const db = await getLocalDb()
  await db.query(
    `INSERT INTO sync_meta(key, value, updated_at) VALUES($1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  )
}

const memToken = { value: null as string | null }
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const driveTokenStore = {
  get: () => storage()?.getItem('truckopti-drive-token') ?? memToken.value,
  set: (t: string) => { storage()?.setItem('truckopti-drive-token', t); memToken.value = t },
  clear: () => { storage()?.removeItem('truckopti-drive-token'); memToken.value = null },
}

export async function backupNow(opts: { password?: string; transport?: DriveTransport } = {}): Promise<BackupReport> {
  const token = driveTokenStore.get()
  if (!token && !opts.transport) {
    throw new UserFacingError('Connect your Google Drive first (paste an access token in Backup settings).')
  }
  const transport = opts.transport ?? authed(token as string)
  const { bytes: plain, tables } = await exportSnapshot()
  const hash = await sha256Hex(plain)
  let stored = plain
  let encrypted = false
  let saltHex = ''
  if (opts.password) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey(opts.password, salt)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource))
    stored = new Uint8Array(16 + 12 + ct.length)
    stored.set(salt); stored.set(iv, 16); stored.set(ct, 28)
    saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('')
    encrypted = true
    await metaSet('drive.salt', saltHex)
  }
  const fileId = await metaGet('drive.fileId')
  const rev = await metaGet('drive.rev')
  const up = await uploadSnapshot(transport, {
    fileId, name: 'truckopti-agency.db', bytes: stored, baseRevisionId: rev, snapshotHash: hash,
  })
  if (up.conflict) {
    return { tables, plainBytes: plain.length, storedBytes: stored.length, sha256: hash, encrypted, conflict: true }
  }
  await metaSet('drive.fileId', up.fileId as string)
  await metaSet('drive.rev', up.headRevisionId as string)
  await metaSet('drive.lastBackupAt', new Date().toISOString())
  await metaSet('drive.lastHash', hash)
  return {
    tables, plainBytes: plain.length, storedBytes: stored.length, sha256: hash,
    encrypted, fileId: up.fileId, revision: up.headRevisionId,
  }
}

export async function restoreNow(opts: { password?: string; transport?: DriveTransport } = {}): Promise<BackupReport> {
  const token = driveTokenStore.get()
  if (!token && !opts.transport) {
    throw new UserFacingError('Connect your Google Drive first (paste an access token in Backup settings).')
  }
  const transport = opts.transport ?? authed(token as string)
  const fileId = await metaGet('drive.fileId')
  if (!fileId) throw new UserFacingError('No backup found on this device yet. Back up first, then restore.')
  const head = await readHead(transport, fileId)
  if (!head) throw new UserFacingError('Backup file is gone from Drive.')
  const stored = await downloadSnapshot(transport, fileId)
  let plain = stored
  let encrypted = false
  if (opts.password) {
    const saltHex = await metaGet('drive.salt')
    if (!saltHex) throw new UserFacingError('This backup needs its encryption password, but no salt is recorded.')
    const salt = new Uint8Array(saltHex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [])
    plain = await decryptBytes(opts.password, stored, salt)
    encrypted = true
  }
  const hash = await sha256Hex(plain)
  const tables = await importSnapshot(plain)
  await metaSet('drive.lastRestoreAt', new Date().toISOString())
  return { tables, plainBytes: plain.length, storedBytes: stored.length, sha256: hash, encrypted, fileId }
}
