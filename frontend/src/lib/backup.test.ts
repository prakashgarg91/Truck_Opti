// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { getLocalDb, resetLocalDbForTests } from './localDb'
import {
  backupNow, decryptBytes, driveTokenStore, encryptBytes, exportSnapshot,
  restoreNow, sha256Hex,
} from './backup'
import type { DriveTransport } from './driveClient'

// Fake Drive implementing the REST surface driveClient.ts uses.
function fakeDrive() {
  const files = new Map<string, { name: string; revs: { rev: string; bytes: Uint8Array; hash: string }[] }>()
  let seq = 0
  const enc = new TextEncoder()
  const dec = new TextDecoder()
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
    return new Response('x', { status: 400 })
  }
  return { transport, files }
}

describe('backup engine', () => {
  beforeEach(async () => {
    await resetLocalDbForTests(await getLocalDb())
    driveTokenStore.clear()
  })

  it('exports canonical bytes with a stable hash', async () => {
    const db = await getLocalDb()
    await db.query(`INSERT INTO trucks(id,name,length,width,height,capacity,cost_per_km,available)
      VALUES('t1','T',1,1,1,1,1,1)`)
    const a = await exportSnapshot()
    const b = await exportSnapshot()
    expect(await sha256Hex(a.bytes)).toBe(await sha256Hex(b.bytes))
    expect(a.tables.trucks).toBe(1)
  })

  it('encryption round-trips; wrong password fails', async () => {
    const plain = new TextEncoder().encode('hello-truckopti')
    const enc = await encryptBytes('pw', plain)
    expect(enc.length).toBeGreaterThan(plain.length)
    const roundTripped = await decryptBytes('pw', enc.slice(16), enc.slice(0, 16))
    expect(roundTripped).toEqual(plain)
    await expect(decryptBytes('wrong', enc.slice(16), enc.slice(0, 16))).rejects.toThrow()
  })

  it('backup uploads; wipe + restore brings back identical data', async () => {
    const drive = fakeDrive()
    const db = await getLocalDb()
    await db.query(`INSERT INTO trucks(id,name,length,width,height,capacity,cost_per_km,available)
      VALUES('t9','Hash Truck',2,2,2,2,2,2)`)
    const trucksHash = async () => {
      const r = await db.query('SELECT * FROM trucks ORDER BY id')
      return sha256Hex(new TextEncoder().encode(JSON.stringify(r.rows)))
    }
    const before = await trucksHash()

    const up = await backupNow({ transport: drive.transport })
    expect(up.conflict).toBeFalsy()
    expect(up.fileId).toBeTruthy()
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
})
