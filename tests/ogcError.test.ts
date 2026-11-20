import { describe, expect, it } from 'vitest'
import { errorSummary, parseOgcError } from '../composables/utils/ogcError'

describe('parseOgcError', () => {
  it('reads an OGC API exception from an ofetch error', () => {
    const err = { statusCode: 404, data: { type: 'http://www.opengis.net/def/exceptions/ogcapi-processes-1/1.0/no-such-job', title: 'NoSuchJob', detail: 'The job does not exist' } }
    const parsed = parseOgcError(err)
    expect(parsed.status).toBe(404)
    expect(parsed.title).toBe('NoSuchJob')
    expect(parsed.message).toBe('NoSuchJob: The job does not exist')
  })

  it('handles string bodies and plain errors', () => {
    expect(parseOgcError({ status: 500, data: '{"title":"NoApplicableCode","detail":"boom"}' }).message).toBe('NoApplicableCode: boom')
    expect(parseOgcError({ status: 502, data: 'Bad gateway' }).message).toBe('HTTP 502: Bad gateway')
    expect(parseOgcError(new Error('network down')).message).toBe('network down')
    expect(parseOgcError(null, 'fallback').message).toBe('fallback')
  })

  it('is idempotent and summarises long messages', () => {
    const once = parseOgcError({ status: 400, data: { title: 'Bad', detail: 'x'.repeat(500) } })
    expect(parseOgcError(once)).toBe(once)
    expect(errorSummary(once).length).toBeLessThanOrEqual(240)
  })
})
