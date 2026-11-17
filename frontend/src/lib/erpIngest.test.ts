import { describe, expect, it } from 'vitest'
import {
  mapErpOutcome,
  mapParseError,
  MAX_ERP_BODY_BYTES,
  parseErpBytes,
  parseErpRequest,
  secretFromHeaders,
} from '../../../supabase/functions/_shared/erpIngest.ts'
import { readCappedBytes } from '../../../supabase/functions/_shared/razorpay.ts'

const CONN = '3f0c1d2e-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ connection_id: CONN, secret: 'body-secret', external_event_id: 'evt-1', lines: [{ sku: 'A' }], ...extra })

describe('secretFromHeaders', () => {
  it('reads Bearer, then the custom header, else null', () => {
    expect(secretFromHeaders({ authorization: 'Bearer abc' })).toBe('abc')
    expect(secretFromHeaders({ authorization: 'bearer  abc ' })).toBe('abc')
    expect(secretFromHeaders({ secretHeader: ' xyz ' })).toBe('xyz')
    expect(secretFromHeaders({ authorization: 'Basic abc' })).toBeNull()
    expect(secretFromHeaders({})).toBeNull()
  })
})

describe('parseErpRequest', () => {
  it('accepts a body and prefers the header secret over the body secret', () => {
    const fromBody = parseErpRequest(body(), {})
    expect(fromBody).toEqual({
      ok: true,
      value: { connectionId: CONN, secret: 'body-secret', externalEventId: 'evt-1', lines: [{ sku: 'A' }] },
    })
    const fromHeader = parseErpRequest(body(), { authorization: 'Bearer hdr' })
    expect(fromHeader.ok && fromHeader.value.secret).toBe('hdr')
    const fromCustom = parseErpRequest(body(), { secretHeader: 'custom' })
    expect(fromCustom.ok && fromCustom.value.secret).toBe('custom')
  })

  it('accepts a header secret without a body secret', () => {
    const r = parseErpRequest(JSON.stringify({ connection_id: CONN, external_event_id: 'e', lines: [] }), { authorization: 'Bearer s' })
    expect(r.ok).toBe(true)
  })

  it('rejects malformed requests with fixed codes', () => {
    expect(parseErpRequest('{nope', {})).toEqual({ ok: false, error: 'invalid_json' })
    expect(parseErpRequest('[]', {})).toEqual({ ok: false, error: 'invalid_body' })
    expect(parseErpRequest(body({ connection_id: 'x' }), {})).toEqual({ ok: false, error: 'invalid_connection_id' })
    expect(parseErpRequest(body({ secret: undefined }), {})).toEqual({ ok: false, error: 'missing_secret' })
    expect(parseErpRequest(body({ secret: 'x'.repeat(513) }), {})).toEqual({ ok: false, error: 'missing_secret' })
    expect(parseErpRequest(body({ external_event_id: '  ' }), {})).toEqual({ ok: false, error: 'invalid_event_id' })
    expect(parseErpRequest(body({ external_event_id: 'e'.repeat(201) }), {})).toEqual({ ok: false, error: 'invalid_event_id' })
    expect(parseErpRequest(body({ lines: 'x' }), {})).toEqual({ ok: false, error: 'invalid_lines' })
  })

  it('rejects invalid UTF-8 bytes', () => {
    expect(parseErpBytes(new Uint8Array([0xff, 0xfe, 0x7b]), {})).toEqual({ ok: false, error: 'invalid_body' })
    expect(parseErpBytes(new TextEncoder().encode(body()), {}).ok).toBe(true)
  })

  it('never echoes the secret in a parse error', () => {
    const r = mapParseError('missing_secret')
    expect(JSON.stringify(r)).not.toContain('body-secret')
    expect(r.status).toBe(400)
  })
})

describe('size cap', () => {
  it('stops a streamed body above 1 MB', async () => {
    const chunk = new Uint8Array(256 * 1024)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= 6) return c.close()
        sent += 1
        c.enqueue(chunk)
      },
    })
    const r = await readCappedBytes(stream, MAX_ERP_BODY_BYTES, null)
    expect(r).toEqual({ ok: false, reason: 'too_large' })
    expect(sent).toBeLessThan(6)
  })
})

describe('mapErpOutcome', () => {
  const ok = (data: unknown) => mapErpOutcome({ data, error: null })

  it('200 for accepted, duplicate and rejected (problems in the body)', () => {
    const a = ok({ ok: true, outcome: 'accepted', batch_id: 'b1', import: { secret: 'leak' } })
    expect(a).toMatchObject({ status: 200, body: { ok: true, outcome: 'accepted', batch_id: 'b1' } })
    expect(a.body).not.toHaveProperty('import')
    expect(ok({ ok: true, outcome: 'duplicate', batch_id: 'b1' })).toMatchObject({ status: 200, body: { outcome: 'duplicate' } })
    const problems = [{ line_no: 1, code: 'sku_required' }]
    expect(ok({ ok: false, outcome: 'rejected', error: 'invalid_lines', problems })).toMatchObject({
      status: 200,
      body: { ok: false, outcome: 'rejected', error: 'invalid_lines', problems },
    })
    expect(ok({ ok: false, outcome: 'duplicate', error: 'invalid_lines', problems })).toMatchObject({
      status: 200,
      body: { outcome: 'duplicate', problems },
    })
  })

  it('401 with a uniform body for bad credentials', () => {
    expect(ok({ ok: false, error: 'bad_credentials' })).toMatchObject({ status: 401, body: { ok: false, error: 'bad_credentials' } })
  })

  it('maps the other typed refusals', () => {
    expect(ok({ ok: false, error: 'connection_not_active' }).status).toBe(403)
    expect(ok({ ok: false, error: 'agency_not_operational' }).status).toBe(403)
    expect(ok({ ok: false, error: 'payload_too_large' }).status).toBe(413)
    expect(ok({ ok: false, error: 'event_id_reused' }).status).toBe(409)
    for (const code of ['event_id_required', 'no_lines', 'too_many_lines']) expect(ok({ ok: false, error: code }).status).toBe(400)
    expect(ok({ ok: false, error: 'order_in_use', refs: ['A'] })).toMatchObject({ status: 422, body: { error: 'order_in_use', refs: ['A'] } })
    expect(ok({ ok: false })).toMatchObject({ status: 422, body: { error: 'import_refused' } })
  })

  it('subscription refusals are 403, other database errors are retryable 500 without details', () => {
    expect(mapErpOutcome({ data: null, error: { code: 'SB001', message: 'limit secret-ish' } })).toMatchObject({
      status: 403,
      body: { error: 'subscription_limit' },
    })
    const e = mapErpOutcome({ data: null, error: { code: '40001', message: 'could not serialize with secret' } })
    expect(e.status).toBe(500)
    expect(e.level).toBe('error')
    expect(JSON.stringify(e)).not.toContain('secret')
  })

  it('500 for an unexpected result shape', () => {
    expect(ok(null).status).toBe(500)
    expect(ok({ nope: 1 }).status).toBe(500)
  })
})
