// Device backup engine: PGlite tables -> canonical snapshot -> self-contained
// versioned envelope -> optional AES-GCM encryption -> revision-checked Drive
// upload. Restore is the inverse and is fail-safe by construction:
//   1. the envelope carries format/version/salt/IV/integrity metadata, so a
//      backup restores on a fresh device with no local metadata at all;
//   2. every table, column and row is authenticated (decryption + integrity
//      hash) and validated BEFORE any destructive import;
//   3. the import runs inside a single transaction — any failure rolls back
//      and leaves the original local data byte-identical.
//
// Scope note: this is the DEVICE backup path (local PGlite snapshot -> the
// user's own Google Drive). It is NOT the hosted Supabase production backup.
// Drive's revision check below is a preflight comparison against the last
// locally-known revision, NOT an atomic compare-and-swap: a concurrent writer
// can still land between the check and the upload.
import { getLocalDb } from './localDb'
import { UserFacingError } from '../utils/userFacingError'
import { downloadSnapshot, findBackupFile, readHead, uploadSnapshot } from './driveClient'
import type { DriveTransport } from './driveClient'

const enc = new TextEncoder()
const dec = new TextDecoder()

export type { DriveTransport } from './driveClient'

const BACKUP_FORMAT = 'truckopti-backup'
const ENVELOPE_VERSION = 1
const SNAPSHOT_VERSION = 2
const SUPPORTED_SNAPSHOT_VERSIONS = [1, 2]
const BACKUP_FILE_NAME = 'truckopti-agency.db'
const PBKDF2_ITERATIONS = 50000
const SALT_BYTES = 16
const IV_BYTES = 12
const GCM_TAG_BYTES = 16
// Raw provider credentials must never travel inside a snapshot. Drive tokens
// live in localStorage (driveTokenStore), never in the database; this denylist
// on sync_meta keys is defense in depth for any future credential-shaped key.
const META_KEY_DENYLIST = /(token|secret|password|credential|api[_-]?key)/i

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

// Export/import column order per table. agency_profiles includes the Google
// linkage columns added by localDb MIGRATION_V2 so account linkage survives
// backup/restore.
const TABLES: Record<string, string[]> = {
  trucks: ['id', 'name', 'name_hi', 'category', 'length', 'width', 'height', 'capacity', 'cost_per_km', 'available', 'created_at', 'updated_at'],
  cartons: ['id', 'name', 'length', 'width', 'height', 'weight', 'fragile', 'stackable', 'created_at', 'updated_at'],
  agency_profiles: ['id', 'role', 'company_name', 'contact_name', 'contact_phone', 'google_sub', 'email', 'created_at'],
  sync_meta: ['key', 'value', 'updated_at'],
}

// NOT NULL columns from the local schema, validated before any destructive
// import. Columns absent from a legacy snapshot are simply not written.
const REQUIRED_COLUMNS: Record<string, string[]> = {
  trucks: ['id', 'name', 'length', 'width', 'height', 'capacity', 'cost_per_km', 'available'],
  cartons: ['id', 'name', 'length', 'width', 'height', 'weight'],
  agency_profiles: ['id', 'company_name'],
  sync_meta: ['key', 'value'],
}

interface CipherInfo {
  algorithm: 'AES-GCM'
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number }
  salt: string
  iv: string
}

// Self-contained backup envelope: everything needed to authenticate, decrypt
// and integrity-check the snapshot travels INSIDE the stored bytes.
interface BackupEnvelope {
  format: string
  envelopeVersion: number
  createdAt: string
  cipher: CipherInfo | null
  integrity: { algorithm: string; payloadSha256: string }
  payload?: { version: number; tables: Record<string, SnapshotTable> }
  ciphertext?: string
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
    let rows = r.rows.map((row) => columns.map((c) => serializeValue(row[c])))
    if (table === 'sync_meta') {
      rows = rows.filter((row) => !META_KEY_DENYLIST.test(String(row[0])))
    }
    out[table] = { columns, rows }
    counts[table] = rows.length
  }
  return { bytes: enc.encode(JSON.stringify({ version: SNAPSHOT_VERSION, tables: out })), tables: counts }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

// Canonical encrypted framing: salt(16) || IV(12) || AES-GCM ciphertext.
// decryptBytes consumes the COMPLETE framing — callers must not re-slice.
export async function encryptBytes(password: string, plain: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource))
  const out = new Uint8Array(SALT_BYTES + IV_BYTES + ct.length)
  out.set(salt); out.set(iv, SALT_BYTES); out.set(ct, SALT_BYTES + IV_BYTES)
  return out
}

export async function decryptBytes(password: string, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.length < SALT_BYTES + IV_BYTES + GCM_TAG_BYTES) {
    throw new UserFacingError('Encrypted backup is truncated or corrupted.')
  }
  const salt = blob.slice(0, SALT_BYTES)
  const iv = blob.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const ct = blob.slice(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource))
  } catch {
    throw new UserFacingError('Wrong password or corrupted encrypted backup.')
  }
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new UserFacingError('Encrypted backup has malformed cipher metadata.')
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function encryptWithCipherInfo(password: string, plain: Uint8Array): Promise<{ ciphertext: Uint8Array; saltHex: string; ivHex: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource))
  return { ciphertext, saltHex: toHex(salt), ivHex: toHex(iv) }
}

async function decryptWithCipherInfo(password: string, ciphertext: Uint8Array, cipher: CipherInfo): Promise<Uint8Array> {
  if (cipher.algorithm !== 'AES-GCM' || !cipher.kdf || cipher.kdf.name !== 'PBKDF2' || cipher.kdf.hash !== 'SHA-256') {
    throw new UserFacingError('This backup uses an unsupported encryption scheme.')
  }
  if (ciphertext.length < GCM_TAG_BYTES) {
    throw new UserFacingError('Encrypted backup is truncated or corrupted.')
  }
  const salt = fromHex(cipher.salt)
  const iv = fromHex(cipher.iv)
  const key = await deriveKey(password, salt, cipher.kdf.iterations)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource))
  } catch {
    throw new UserFacingError('Wrong password or corrupted backup.')
  }
}

// Validate every table, column and row of a snapshot against the current
// local schema BEFORE any destructive import. Returns row counts.
function validateSnapshot(parsed: unknown): { version: number; tables: Record<string, SnapshotTable>; counts: Record<string, number> } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UserFacingError('Backup file is not a supported TruckOpti snapshot.')
  }
  const { version, tables } = parsed as { version?: unknown; tables?: unknown }
  if (typeof version !== 'number' || !SUPPORTED_SNAPSHOT_VERSIONS.includes(version)) {
    throw new UserFacingError(`Backup snapshot version ${String(version)} is not supported by this app. Update the app or use a compatible backup.`)
  }
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    throw new UserFacingError('Backup file has no valid table data.')
  }
  const tableMap = tables as Record<string, unknown>
  if (Object.keys(tableMap).length === 0) {
    throw new UserFacingError('Backup file contains no tables.')
  }
  const counts: Record<string, number> = {}
  for (const [table, value] of Object.entries(tableMap)) {
    const known = TABLES[table]
    if (!known) throw new UserFacingError(`Backup contains unknown table "${table}".`)
    const spec = (value ?? {}) as Partial<SnapshotTable>
    const columns = spec.columns
    if (!Array.isArray(columns) || columns.length === 0 ||
        columns.some((c) => typeof c !== 'string' || !known.includes(c))) {
      throw new UserFacingError(`Backup table "${table}" has unknown or invalid columns.`)
    }
    const rows = spec.rows
    if (!Array.isArray(rows)) throw new UserFacingError(`Backup table "${table}" has no valid rows.`)
    const requiredIndexes: number[] = []
    for (const c of REQUIRED_COLUMNS[table]) {
      const i = columns.indexOf(c)
      if (i >= 0) requiredIndexes.push(i)
    }
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== columns.length) {
        throw new UserFacingError(`Backup table "${table}" has a malformed row.`)
      }
      row.forEach((v, i) => {
        if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
          throw new UserFacingError(`Backup table "${table}" has an unsupported value in column "${columns[i]}".`)
        }
        if (v === null && requiredIndexes.includes(i)) {
          throw new UserFacingError(`Backup table "${table}" is missing a required value for column "${columns[i]}".`)
        }
      })
    }
    counts[table] = rows.length
  }
  return { version: version as number, tables: tableMap as Record<string, SnapshotTable>, counts }
}

// Import a validated snapshot atomically. The TRUNCATE and every INSERT run
// inside one transaction: any failure rolls back and the original local data
// survives byte-identical.
export async function importSnapshot(bytes: Uint8Array): Promise<Record<string, number>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(dec.decode(bytes))
  } catch {
    throw new UserFacingError('Backup file is not a supported TruckOpti snapshot.')
  }
  const { tables, counts } = validateSnapshot(parsed)
  const db = await getLocalDb()
  await db.transaction(async (tx) => {
    await tx.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')
    for (const [table, t] of Object.entries(tables)) {
      const columnList = t.columns.join(',')
      for (const row of t.rows) {
        const placeholders = row.map((_, i) => `$${i + 1}`).join(',')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.query(`INSERT INTO ${table}(${columnList}) VALUES(${placeholders})`, row as any[])
      }
    }
  })
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

// Wrap canonical snapshot bytes into the self-contained envelope (optionally
// encrypted). Salt/IV/integrity metadata always travel inside the envelope.
async function buildEnvelopeBytes(payloadBytes: Uint8Array, password?: string): Promise<{ stored: Uint8Array; encrypted: boolean }> {
  const payloadSha256 = await sha256Hex(payloadBytes)
  const base = {
    format: BACKUP_FORMAT,
    envelopeVersion: ENVELOPE_VERSION,
    createdAt: new Date().toISOString(),
    integrity: { algorithm: 'sha256', payloadSha256 },
  }
  if (password) {
    const { ciphertext, saltHex, ivHex } = await encryptWithCipherInfo(password, payloadBytes)
    const envelope: BackupEnvelope = {
      ...base,
      cipher: { algorithm: 'AES-GCM', kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS }, salt: saltHex, iv: ivHex },
      ciphertext: toBase64(ciphertext),
    }
    return { stored: enc.encode(JSON.stringify(envelope)), encrypted: true }
  }
  const envelope: BackupEnvelope = {
    ...base,
    cipher: null,
    payload: JSON.parse(dec.decode(payloadBytes)) as BackupEnvelope['payload'],
  }
  return { stored: enc.encode(JSON.stringify(envelope)), encrypted: false }
}

async function verifyEnvelopeIntegrity(envelope: BackupEnvelope, payloadBytes: Uint8Array): Promise<void> {
  if (!envelope.integrity || envelope.integrity.algorithm !== 'sha256' ||
      typeof envelope.integrity.payloadSha256 !== 'string') {
    throw new UserFacingError('Backup is missing valid integrity metadata.')
  }
  const digest = await sha256Hex(payloadBytes)
  if (digest !== envelope.integrity.payloadSha256) {
    throw new UserFacingError('Backup integrity check failed: the file is corrupted or was modified.')
  }
}

// Decode stored backup bytes into canonical snapshot bytes. Reads, in order:
//   1. current envelope (format tag; encrypted payloads carry salt/IV/kdf);
//   2. legacy plain snapshot JSON ({ version, tables } without envelope);
//   3. legacy encrypted binary framing salt(16) || IV(12) || ciphertext.
// Every path authenticates the payload before it can reach the database.
async function decodeEnvelope(stored: Uint8Array, password?: string): Promise<{ payloadBytes: Uint8Array; encrypted: boolean }> {
  let parsed: unknown = null
  let jsonOk = true
  try {
    parsed = JSON.parse(dec.decode(stored))
  } catch {
    jsonOk = false
  }
  if (jsonOk && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>
    if (obj.format === BACKUP_FORMAT) {
      const envelope = parsed as BackupEnvelope
      if (envelope.envelopeVersion !== ENVELOPE_VERSION) {
        throw new UserFacingError(`Backup envelope version ${String(envelope.envelopeVersion)} is not supported. Update the app.`)
      }
      let payloadBytes: Uint8Array
      if (envelope.cipher) {
        if (!password) throw new UserFacingError('This backup is encrypted. Enter its password to restore.')
        if (typeof envelope.ciphertext !== 'string') {
          throw new UserFacingError('Encrypted backup is missing its ciphertext.')
        }
        payloadBytes = await decryptWithCipherInfo(password, fromBase64(envelope.ciphertext), envelope.cipher)
      } else {
        if (envelope.ciphertext !== undefined) {
          throw new UserFacingError('Encrypted backup is missing its cipher metadata.')
        }
        if (!envelope.payload || typeof envelope.payload !== 'object') {
          throw new UserFacingError('Backup file is missing its snapshot payload.')
        }
        payloadBytes = enc.encode(JSON.stringify(envelope.payload))
      }
      await verifyEnvelopeIntegrity(envelope, payloadBytes)
      return { payloadBytes, encrypted: !!envelope.cipher }
    }
    // Legacy read path: plain pre-envelope snapshot JSON. No integrity
    // metadata exists at this version; validation still gates the import.
    if (obj.tables) return { payloadBytes: stored, encrypted: false }
    throw new UserFacingError('Backup file is not a supported TruckOpti snapshot.')
  }
  if (!jsonOk) {
    // Legacy read path: binary encrypted framing salt||IV||ciphertext written
    // by encryptBytes. The salt travels in the blob itself — no local
    // metadata is needed (the previous implementation sliced this wrongly
    // and depended on a metadata-side salt).
    if (!password) throw new UserFacingError('This backup is encrypted. Enter its password to restore.')
    return { payloadBytes: await decryptBytes(password, stored), encrypted: true }
  }
  throw new UserFacingError('Backup file is not a supported TruckOpti snapshot.')
}

export async function backupNow(opts: { password?: string; transport?: DriveTransport } = {}): Promise<BackupReport> {
  const token = driveTokenStore.get()
  if (!token && !opts.transport) {
    throw new UserFacingError('Connect your Google Drive first (paste an access token in Backup settings).')
  }
  const transport = opts.transport ?? authed(token as string)
  const { bytes: payloadBytes, tables } = await exportSnapshot()
  const hash = await sha256Hex(payloadBytes)
  const { stored, encrypted } = await buildEnvelopeBytes(payloadBytes, opts.password)
  const fileId = await metaGet('drive.fileId')
  const rev = await metaGet('drive.rev')
  const up = await uploadSnapshot(transport, {
    fileId, name: BACKUP_FILE_NAME, bytes: stored, baseRevisionId: rev, snapshotHash: hash,
  })
  if (up.conflict) {
    return { tables, plainBytes: payloadBytes.length, storedBytes: stored.length, sha256: hash, encrypted, conflict: true }
  }
  await metaSet('drive.fileId', up.fileId as string)
  await metaSet('drive.rev', up.headRevisionId as string)
  await metaSet('drive.lastBackupAt', new Date().toISOString())
  await metaSet('drive.lastHash', hash)
  return {
    tables, plainBytes: payloadBytes.length, storedBytes: stored.length, sha256: hash,
    encrypted, fileId: up.fileId, revision: up.headRevisionId,
  }
}

export async function restoreNow(opts: { password?: string; transport?: DriveTransport; fileId?: string } = {}): Promise<BackupReport> {
  const token = driveTokenStore.get()
  if (!token && !opts.transport) {
    throw new UserFacingError('Connect your Google Drive first (paste an access token in Backup settings).')
  }
  const transport = opts.transport ?? authed(token as string)
  let fileId = opts.fileId ?? (await metaGet('drive.fileId'))
  if (!fileId) fileId = await findBackupFile(transport, BACKUP_FILE_NAME)
  if (!fileId) throw new UserFacingError('No backup found on this device or in Drive yet. Back up first, then restore.')
  const head = await readHead(transport, fileId)
  if (!head) throw new UserFacingError('Backup file is gone from Drive.')
  const stored = await downloadSnapshot(transport, fileId)
  const { payloadBytes, encrypted } = await decodeEnvelope(stored, opts.password)
  const hash = await sha256Hex(payloadBytes)
  // Cross-check the downloaded bytes against Drive-stored integrity metadata
  // (snapshotHash of the plain payload, set on every upload).
  const remoteHash = head.appProperties?.snapshotHash
  if (remoteHash && remoteHash !== hash) {
    throw new UserFacingError('Backup integrity check failed: Drive metadata does not match the downloaded file.')
  }
  const tables = await importSnapshot(payloadBytes)
  await metaSet('drive.lastRestoreAt', new Date().toISOString())
  return { tables, plainBytes: payloadBytes.length, storedBytes: stored.length, sha256: hash, encrypted, fileId }
}
