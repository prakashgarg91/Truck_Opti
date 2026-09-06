// Google Drive sync client (drive.file scope only).
// Transport-injected for tests; production passes fetch with an OAuth token.
// Drive has no server-side compare-and-swap: callers pass the last-known
// revision; a moved head returns { conflict: true } and nothing is overwritten.
export type DriveTransport = (url: string, init?: RequestInit) => Promise<Response>

const API = 'https://www.googleapis.com/drive/v3/'
const UPLOAD = 'https://www.googleapis.com/'
const abs = (u: string) => (u.startsWith('http') ? u : (u.startsWith('upload/') ? UPLOAD : API) + u)

export interface DriveHead {
  id: string
  name: string
  headRevisionId?: string
  appProperties?: Record<string, string>
}

export async function readHead(transport: DriveTransport, fileId: string): Promise<DriveHead | null> {
  const r = await transport(abs(`files/${fileId}?fields=id,name,headRevisionId,modifiedTime,appProperties`), { method: 'GET' })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`drive readHead ${r.status}`)
  return (await r.json()) as DriveHead
}

export interface UploadResult {
  conflict: boolean
  fileId?: string
  headRevisionId?: string
  head?: DriveHead
}

export async function uploadSnapshot(
  transport: DriveTransport,
  opts: { fileId: string | null; name: string; bytes: Uint8Array; baseRevisionId: string | null; snapshotHash: string }
): Promise<UploadResult> {
  const { fileId, name, bytes, baseRevisionId, snapshotHash } = opts
  if (fileId) {
    const head = await readHead(transport, fileId)
    if (head && baseRevisionId && head.headRevisionId !== baseRevisionId) {
      return { conflict: true, head }
    }
  }
  const boundary = 'truckopti-' + Math.random().toString(36).slice(2)
  const meta = { name, mimeType: 'application/octet-stream', appProperties: { snapshotHash, uploader: 'truckopti-localfirst' } }
  const enc = new TextEncoder()
  const head = enc.encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`)
  const tail = enc.encode(`\r\n--${boundary}--`)
  const body = new Blob([head as BlobPart, bytes as BlobPart, tail as BlobPart])
  const url = abs(fileId
    ? `upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,headRevisionId`
    : `upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId`)
  const r = await transport(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: body as BodyInit,
  })
  if (!r.ok) throw new Error(`drive upload ${r.status}`)
  const out = (await r.json()) as { id: string; headRevisionId: string }
  return { conflict: false, fileId: out.id, headRevisionId: out.headRevisionId }
}

export async function downloadSnapshot(transport: DriveTransport, fileId: string): Promise<Uint8Array> {
  const r = await transport(abs(`files/${fileId}?alt=media`), { method: 'GET' })
  if (!r.ok) throw new Error(`drive download ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}
