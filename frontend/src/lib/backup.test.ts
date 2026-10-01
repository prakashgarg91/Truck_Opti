// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite as PGliteType } from '@electric-sql/pglite'
import { getLocalDb, resetLocalDbForTests } from './localDb'
import {
  backupNow, decryptBytes, driveTokenStore, encryptBytes, exportSnapshot,
  restoreNow, sha256Hex,
} from './backup'
import type { DriveTransport } from './driveClient'
import { UserFacingError } from '../utils/userFacingError'

const enc = new TextEncoder()
const dec = new TextDecoder()

const TABLE_NAMES = ['trucks', 'cartons', 'agency_profiles', 'sync_meta']

// Hash of every supported local table: the pre-existing-data invariant that
// must hold unchanged after every failed restore/backup attempt.
async function dbHash(db: PGliteType): Promise<string> {
  const parts: string[] = []
  for (const t of TABLE_NAMES) {
    const r = await db.query(`SELECT * FROM ${t} ORDER BY 1`)
    parts.push(`${t}=${JSON.stringify(r.rows)}`)
  }
  return sha256Hex(enc.encode(parts.join('|')))
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
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

async function insertTruck(db: PGliteType, id: string, name: string): Promise<void> {
  await db.query(
    `INSERT INTO trucks(id,name,length,width,height,capacity,cost_per_km,available)
     VALUES($1,$2,1,1,1,1,1,1)`,
    [id, name]
  )
}

// Fake Drive implementing the REST surface driveClient.ts uses.
function fakeDrive() {
  const files = new Map<string, { name: string; revs: { rev: string; bytes: Uint8Array; hash: string }[] }>()
  let seq = 0
  const transport: DriveTransport = async (url, opts = {}) => {
    const u = new URL(url)
    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      const parts = u.pathname.split('/')
      const id = parts.length > 5 ? parts[5] : null
      const raw = new Uint8Array(await (opts.body as Blob).arrayBuffer())
      const text = dec.decode(raw.slice(0, 4000))
      const meta = JSON.parse(text.slice(text.indexOf('{'), text.indexOf('}\r\n--') + 1))
      const boundary = (opts.headers as Record<string, string>)['Content-Type'].split('boundary=')[1]
      const marker = enc.encode('\r\n\r\n')
      const from = text.indexOf('application/octet-stream')
      let hs = -1
      outer: for (let i = from; i + marker.length <= raw.length; i++) {
        for (let j = 0; j < marker.length; j++) {
          if (raw[i + j] !== marker[j]) continue outer
        }
        hs = i
        break
      }
      const bytes = raw.slice(hs + marker.length, raw.length - `\r\n--${boundary}--`.length)
      if (id) {
        const f = files.get(id)
        if (!f) return new Response('x', { status: 404 })
        const rev = 'r' + (++seq)
        f.revs.push({ rev, bytes, hash: meta.appProperties.snapshotHash })
        if (f.revs.length > 5) f.revs.shift()
        return Response.json({ id, headRevisionId: rev })
      }
      const nid = 'f' + (++seq)
      files.set(nid, { name: meta.name, revs: [{ rev: 'r' + seq, bytes, hash: meta.appProperties.snapshotHash }] })
      return Response.json({ id: nid, headRevisionId: 'r' + seq })
    }
    if (u.pathname.startsWith('/drive/v3/files/')) {
      const id = u.pathname.split('/').pop() as string
      const f = files.get(id)
      if (!f) return new Response('x', { status: 404 })
      if (u.searchParams.get('alt') === 'media') return new Response(f.revs[f.revs.length - 1].bytes as BodyInit)
      const top = f.revs[f.revs.length - 1]
      return Response.json({ id, name: f.name, headRevisionId: top.rev, appProperties: { snapshotHash: top.hash } })
    }
    if (u.pathname === '/drive/v3/files') {
      // files.list search: name = '<name>' and trashed = false
      const q = u.searchParams.get('q') ?? ''
      const m = q.match(/name = '([^']+)'/)
      const matches = [...files.entries()]
        .filter(([, f]) => f.name === m?.[1])
        .map(([id, f]) => ({ id, name: f.name }))
      return Response.json({ files: matches })
    }
    return new Response('x', { status: 400 })
  }
  return { transport, files }
}

// Minimal Drive serving fixed bytes, for crafted (possibly hostile) restores.
function servingDrive(bytes: Uint8Array | null): DriveTransport {
  return async (url) => {
    const u = new URL(url)
    if (u.pathname.startsWith('/drive/v3/files/')) {
      if (!bytes) return new Response('x', { status: 404 })
      if (u.searchParams.get('alt') === 'media') return new Response(bytes as BodyInit)
      return Response.json({ id: 'f-served', name: 'truckopti-agency.db', headRevisionId: 'r-served' })
    }
    return new Response('x', { status: 400 })
  }
}

// Build a v2-format envelope around an arbitrary payload; optionally with a
// stale/foreign integrity hash to simulate tampering.
async function makeEnvelope(
  payload: unknown,
  opts: { password?: string; payloadSha256?: string } = {}
): Promise<Uint8Array> {
  const payloadBytes = enc.encode(JSON.stringify(payload))
  const digest = opts.payloadSha256 ?? (await sha256Hex(payloadBytes))
  if (opts.password) {
    const blob = await encryptBytes(opts.password, payloadBytes)
    const salt = blob.slice(0, 16)
    const iv = blob.slice(16, 28)
    const ct = blob.slice(28)
    return enc.encode(JSON.stringify({
      format: 'truckopti-backup',
      envelopeVersion: 1,
      createdAt: new Date().toISOString(),
      cipher: { algorithm: 'AES-GCM', kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 50000 }, salt: toHex(salt), iv: toHex(iv) },
      integrity: { algorithm: 'sha256', payloadSha256: digest },
      ciphertext: toBase64(ct),
    }))
  }
  return enc.encode(JSON.stringify({
    format: 'truckopti-backup',
    envelopeVersion: 1,
    createdAt: new Date().toISOString(),
    cipher: null,
    integrity: { algorithm: 'sha256', payloadSha256: digest },
    payload,
  }))
}

describe('backup engine', () => {
  beforeEach(async () => {
    await resetLocalDbForTests(await getLocalDb())
    driveTokenStore.clear()
  })

  it('exports canonical bytes with a stable hash', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't1', 'T')
    const a = await exportSnapshot()
    const b = await exportSnapshot()
    expect(await sha256Hex(a.bytes)).toBe(await sha256Hex(b.bytes))
    expect(a.tables.trucks).toBe(1)
  })

  it('encryption round-trips from the complete stored blob; wrong password fails', async () => {
    const plain = new TextEncoder().encode('hello-truckopti')
    const blob = await encryptBytes('pw', plain)
    expect(blob.length).toBeGreaterThan(plain.length)
    // decryptBytes consumes the COMPLETE stored framing (salt||iv||ciphertext):
    // the exact bug class that broke password-protected restore before.
    const roundTripped = await decryptBytes('pw', blob)
    expect(roundTripped).toEqual(plain)
    await expect(decryptBytes('wrong', blob)).rejects.toThrow(UserFacingError)
  })

  it('backup uploads; wipe + restore brings back identical data (plain roundtrip)', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await insertTruck(db, 't9', 'Hash Truck')
    const trucksHash = async () => {
      const r = await db.query('SELECT * FROM trucks ORDER BY id')
      return sha256Hex(enc.encode(JSON.stringify(r.rows)))
    }
    const before = await trucksHash()

    const up = await backupNow({ transport: drive.transport })
    expect(up.conflict).toBeFalsy()
    expect(up.fileId).toBeTruthy()
    expect(up.encrypted).toBe(false)
    expect(up.tables.trucks).toBe(1)

    await db.exec('TRUNCATE trucks')
    const down = await restoreNow({ transport: drive.transport })
    expect(down.tables.trucks).toBe(1)
    const rows = await db.query<{ name: string }>('SELECT name FROM trucks')
    expect(rows.rows[0].name).toBe('Hash Truck')
    // sync_meta legitimately differs post-restore (new lastRestoreAt), so
    // content equality is proven on the data table hash.
    expect(await trucksHash()).toBe(before)
  })

  it('encrypted backup -> wipe -> restore with password recovers data without local salt metadata', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await insertTruck(db, 't-enc', 'Encrypted Truck')
    const up = await backupNow({ password: 'hunter2', transport: drive.transport })
    expect(up.encrypted).toBe(true)

    await db.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')
    const saltRows = await db.query(`SELECT value FROM sync_meta WHERE key = 'drive.salt'`)
    expect(saltRows.rows).toEqual([])

    const down = await restoreNow({ password: 'hunter2', transport: drive.transport })
    expect(down.encrypted).toBe(true)
    const rows = await db.query<{ name: string }>('SELECT name FROM trucks')
    expect(rows.rows).toEqual([{ name: 'Encrypted Truck' }])
  })

  it('wrong password on restore fails and leaves local data intact', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await backupNow({ password: 'right', transport: drive.transport })
    await insertTruck(db, 't2', 'Local Only')
    const before = await dbHash(db)

    await expect(restoreNow({ password: 'wrong', transport: drive.transport }))
      .rejects.toThrow(/wrong password|corrupt/i)
    expect(await dbHash(db)).toBe(before)
  })

  it('truncated ciphertext fails closed and leaves local data intact', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await insertTruck(db, 't3', 'Survivor')
    const up = await backupNow({ password: 'pw', transport: drive.transport })
    const before = await dbHash(db)

    const stored = drive.files.get(up.fileId as string)!.revs[0].bytes
    const env = JSON.parse(dec.decode(stored)) as { ciphertext: string }
    const ct = fromBase64(env.ciphertext)
    env.ciphertext = toBase64(ct.slice(0, ct.length - 10))
    const truncated = enc.encode(JSON.stringify(env))

    await expect(restoreNow({ password: 'pw', transport: servingDrive(truncated), fileId: 'f-served' }))
      .rejects.toThrow(/password|corrupt|truncated/i)
    expect(await dbHash(db)).toBe(before)
  })

  it('tampered payload fails the integrity check and leaves local data intact', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await insertTruck(db, 't4', 'Original')
    await backupNow({ transport: drive.transport })
    const before = await dbHash(db)

    const { bytes } = await exportSnapshot()
    const payload = JSON.parse(dec.decode(bytes)) as { tables: { trucks: { rows: unknown[][] } } }
    payload.tables.trucks.rows[0][1] = 'Tampered'
    // honest-looking envelope carrying the hash of the ORIGINAL bytes
    const evil = await makeEnvelope(payload, { payloadSha256: await sha256Hex(bytes) })

    await expect(restoreNow({ transport: servingDrive(evil), fileId: 'f-served' }))
      .rejects.toThrow(/integrity|corrupt|modified/i)
    expect(await dbHash(db)).toBe(before)
  })

  it('unsupported snapshot version is rejected and leaves local data intact', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't5', 'Keeper')
    const before = await dbHash(db)
    const payload = JSON.parse(dec.decode((await exportSnapshot()).bytes))
    payload.version = 99
    const evil = await makeEnvelope(payload)

    await expect(restoreNow({ transport: servingDrive(evil), fileId: 'f-served' }))
      .rejects.toThrow(/not supported/i)
    expect(await dbHash(db)).toBe(before)
  })

  it('malformed row is rejected before import and leaves local data intact', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't6', 'Intact')
    const before = await dbHash(db)
    const payload = JSON.parse(dec.decode((await exportSnapshot()).bytes))
    payload.tables.trucks.rows.push(['only-an-id']) // 1 value for 12 columns
    const evil = await makeEnvelope(payload)

    await expect(restoreNow({ transport: servingDrive(evil), fileId: 'f-served' }))
      .rejects.toThrow(/malformed row/i)
    expect(await dbHash(db)).toBe(before)
  })

  it('forced mid-import failure rolls back: original data is not erased', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't1', 'Orig')
    const before = await dbHash(db)

    const payload = JSON.parse(dec.decode((await exportSnapshot()).bytes))
    // passes row validation but violates the trucks primary key mid-import
    payload.tables.trucks.rows.push(['t1', 'Dup', null, null, 1, 1, 1, 1, 1, 1, null, null])
    const evil = await makeEnvelope(payload)

    await expect(restoreNow({ transport: servingDrive(evil), fileId: 'f-served' }))
      .rejects.toThrow()
    expect(await dbHash(db)).toBe(before)
    const names = await db.query<{ name: string }>('SELECT name FROM trucks')
    expect(names.rows).toEqual([{ name: 'Orig' }])
  })

  it('fresh-device restore finds the backup by name after local metadata loss', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await insertTruck(db, 't-enc2', 'Recovered Truck')
    await backupNow({ password: 'pw2', transport: drive.transport })

    // Simulate losing every local linkage row (drive.fileId, drive.rev, salt…)
    await db.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')

    const down = await restoreNow({ password: 'pw2', transport: drive.transport })
    expect(down.fileId).toBeTruthy()
    const rows = await db.query<{ name: string }>('SELECT name FROM trucks')
    expect(rows.rows).toEqual([{ name: 'Recovered Truck' }])
  })

  it('aligns export with the local schema: Google linkage round-trips and legacy v1 snapshots import', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await db.query(
      `INSERT INTO agency_profiles(id, role, company_name, google_sub, email)
       VALUES('a1','agency','Acme','sub-123','a@b.c')`
    )

    // Export column list must match the migrated local schema.
    const { bytes } = await exportSnapshot()
    const text = dec.decode(bytes)
    expect(text).toContain('google_sub')
    expect(text).toContain('"sub-123"')

    // Full roundtrip recovers the Google linkage columns.
    const up = await backupNow({ transport: drive.transport })
    expect(up.conflict).toBeFalsy()
    await db.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')
    await restoreNow({ transport: drive.transport })
    const link = await db.query<{ google_sub: string | null; email: string | null }>(
      'SELECT google_sub, email FROM agency_profiles WHERE id = $1', ['a1'])
    expect(link.rows[0]).toEqual({ google_sub: 'sub-123', email: 'a@b.c' })

    // Legacy v1 snapshot (pre-Google-linkage columns) still imports.
    const legacy = enc.encode(JSON.stringify({
      version: 1,
      tables: {
        agency_profiles: {
          columns: ['id', 'role', 'company_name', 'contact_name', 'contact_phone', 'created_at'],
          rows: [['a2', 'agency', 'Beta', null, null, '2026-01-01T00:00:00.000Z']],
        },
      },
    }))
    await db.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')
    await restoreNow({ transport: servingDrive(legacy), fileId: 'f-served' })
    const legacyRow = await db.query<{ company_name: string; google_sub: string | null }>(
      'SELECT company_name, google_sub FROM agency_profiles WHERE id = $1', ['a2'])
    expect(legacyRow.rows[0]).toEqual({ company_name: 'Beta', google_sub: null })
  })

  it('legacy encrypted binary blob (salt||iv||ciphertext) restores with correct framing', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't-legacy', 'Legacy Truck')
    const payload = (await exportSnapshot()).bytes
    // Framing written by encryptBytes: salt(16) || iv(12) || ciphertext.
    const blob = await encryptBytes('old-pw', payload)
    const before = await dbHash(db)
    await db.exec('TRUNCATE trucks')

    const down = await restoreNow({ password: 'old-pw', transport: servingDrive(blob), fileId: 'f-served' })
    expect(down.encrypted).toBe(true)
    const rows = await db.query<{ name: string }>('SELECT name FROM trucks')
    expect(rows.rows).toEqual([{ name: 'Legacy Truck' }])
    const afterRestore = await dbHash(db)

    // wrong password against the legacy blob must not erase anything
    await expect(restoreNow({ password: 'nope', transport: servingDrive(blob), fileId: 'f-served' }))
      .rejects.toThrow(/wrong password|corrupt/i)
    expect(await dbHash(db)).toBe(afterRestore)
    expect(before).not.toBe(afterRestore) // sanity: restore actually changed rows
  })

  it('missing Drive token fails closed on backup and restore', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't7', 'Untouched')
    const before = await dbHash(db)
    await expect(backupNow({})).rejects.toThrow(UserFacingError)
    await expect(restoreNow({})).rejects.toThrow(/connect your google drive/i)
    expect(await dbHash(db)).toBe(before)
  })

  it('revoked Drive token (HTTP 401) fails closed and leaves local data intact', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't8', 'Untouched')
    const before = await dbHash(db)
    const revoked: DriveTransport = async () => new Response('x', { status: 401 })
    await expect(backupNow({ transport: revoked })).rejects.toThrow()
    await expect(restoreNow({ transport: revoked, fileId: 'f-served' })).rejects.toThrow()
    expect(await dbHash(db)).toBe(before)
  })

  it('Drive file deleted mid-restore reports gone and leaves local data intact', async () => {
    const db = await getLocalDb()
    await insertTruck(db, 't10', 'Untouched')
    await db.query(`INSERT INTO sync_meta(key, value, updated_at) VALUES('drive.fileId','gone-file',NOW())`)
    const before = await dbHash(db)

    await expect(restoreNow({ transport: servingDrive(null) })).rejects.toThrow(/gone from drive/i)
    expect(await dbHash(db)).toBe(before)
  })

  it('stale revision conflicts instead of overwriting', async () => {
    const drive = fakeDrive()
    const first = await backupNow({ transport: drive.transport })
    expect(first.conflict).toBeFalsy()
    const db = await getLocalDb()
    await db.query(`UPDATE sync_meta SET value='r-stale' WHERE key='drive.rev'`)
    const second = await backupNow({ transport: drive.transport })
    expect(second.conflict).toBe(true)
    // recorded rev untouched: next honest backup still compares against real head
    const rev = await db.query<{ value: string }>(`SELECT value FROM sync_meta WHERE key='drive.rev'`)
    expect(rev.rows[0].value).toBe('r-stale')
    expect(drive.files.get(first.fileId as string)?.revs.length).toBe(1)
  })

  it('excludes provider credentials from snapshots but keeps ordinary sync metadata', async () => {
    const db = await getLocalDb()
    await db.query(`INSERT INTO sync_meta(key, value, updated_at) VALUES('drive.token','sup3r-secret-token',NOW())`)
    await db.query(`INSERT INTO sync_meta(key, value, updated_at) VALUES('drive.lastHash','abc123',NOW())`)

    const { bytes } = await exportSnapshot()
    const text = dec.decode(bytes)
    expect(text).not.toContain('sup3r-secret-token')
    expect(text).toContain('abc123')

    // restore drops the credential-shaped key entirely
    const drive = fakeDrive()
    await backupNow({ transport: drive.transport })
    await db.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')
    await restoreNow({ transport: drive.transport })
    const token = await db.query(`SELECT value FROM sync_meta WHERE key='drive.token'`)
    expect(token.rows).toEqual([])
    const lastHash = await db.query<{ value: string }>(`SELECT value FROM sync_meta WHERE key='drive.lastHash'`)
    expect(lastHash.rows[0].value).toBe('abc123')
  })
})
