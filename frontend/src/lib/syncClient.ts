// Hot-table sync client. Dormant until a backend URL is configured
// (VITE_SYNC_URL); all calls resolve null/empty without one, so the app runs
// fully offline-first. Protocol matches D:/Github/localfirst-spike/syncsrv/.
const baseUrl = (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/$/, '')

export function isSyncEnabled(): boolean {
  return !!baseUrl
}

export interface SyncRow {
  id: string
  _version: number
  [key: string]: unknown
}

export async function pullTable(table: string, sinceVersion = 0, limit = 200): Promise<SyncRow[]> {
  if (!baseUrl) return []
  const r = await fetch(`${baseUrl}/api/sync/${table}?since=${sinceVersion}&limit=${limit}`)
  if (!r.ok) throw new Error(`sync pull ${r.status}`)
  const body = (await r.json()) as { rows: SyncRow[] };
  return body.rows
}

export interface PushResult {
  applied: boolean
  version?: number
  conflict?: boolean
  server?: SyncRow
}

export async function pushRow(table: string, id: string, patch: Record<string, unknown>, baseVersion: number): Promise<PushResult> {
  if (!baseUrl) return { applied: false }
  const r = await fetch(`${baseUrl}/api/sync/${table}/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch, baseVersion }),
  })
  if (r.status === 409) {
    const body = (await r.json()) as { server: SyncRow };
    return { applied: false, conflict: true, server: body.server }
  }
  if (!r.ok) throw new Error(`sync push ${r.status}`)
  const body = (await r.json()) as { version: number };
  return { applied: true, version: body.version }
}
