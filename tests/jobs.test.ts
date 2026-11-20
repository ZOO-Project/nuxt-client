import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatDurationMs,
  isActiveStatus,
  isLogLink,
  isTerminalStatus,
  jobDurationMs,
  jobsQuery,
  linkRelLabel,
  isExceptionDocument,
  newestFirstWindow,
  nextSkip,
  normalizeStatus,
  resultsHref,
  statusColor,
  parseMultipartResults,
} from '../composables/utils/jobs'

describe('job status helpers', () => {
  it('normalises legacy spellings onto OGC API - Processes values', () => {
    expect(normalizeStatus('succeeded')).toBe('successful')
    expect(normalizeStatus('canceled')).toBe('dismissed')
    expect(normalizeStatus('Running')).toBe('running')
    expect(normalizeStatus(undefined)).toBe('')
  })

  it('knows which statuses are terminal or active', () => {
    expect(isTerminalStatus('successful')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
    expect(isTerminalStatus('dismissed')).toBe(true)
    expect(isTerminalStatus('running')).toBe(false)
    expect(isActiveStatus('accepted')).toBe(true)
    expect(isActiveStatus('successful')).toBe(false)
  })

  it('maps statuses to colours', () => {
    expect(statusColor('successful')).toBe('positive')
    expect(statusColor('failed')).toBe('negative')
    expect(statusColor('whatever')).toBe('grey')
  })
})

describe('durations', () => {
  it('formats milliseconds', () => {
    expect(formatDurationMs(500)).toBe('< 1 s')
    expect(formatDurationMs(42_000)).toBe('42 s')
    expect(formatDurationMs(69_000)).toBe('1 min 09 s')
    expect(formatDurationMs(3_725_000)).toBe('1 h 02 min')
    expect(formatDurationMs(null)).toBe('')
  })

  it('computes a job duration from started/finished, or from now when running', () => {
    const job = { started: '2026-11-05T13:00:24.856Z', finished: '2026-11-05T13:01:33.918Z', status: 'successful' }
    expect(formatDurationMs(jobDurationMs(job))).toBe('1 min 09 s')
    const running = { created: '2026-11-05T13:00:00.000Z', status: 'running' }
    const now = new Date('2026-11-05T13:00:30.000Z').getTime()
    expect(jobDurationMs(running, now)).toBe(30_000)
    expect(formatDuration('2026-11-05T13:00:00.000Z', '2026-11-05T13:00:05.000Z')).toBe('5 s')
  })
})

describe('links', () => {
  const job = {
    links: [
      { rel: 'monitor', type: 'application/json', href: 'http://x/jobs/1' },
      { rel: 'http://www.opengis.net/def/rel/ogc/1.0/results', type: 'application/json', href: 'http://x/jobs/1/results' },
      { rel: 'related', type: 'text/plain', href: 'http://x/temp/step.log' }
    ]
  }
  it('finds the results link and labels relations', () => {
    expect(resultsHref(job)).toBe('http://x/jobs/1/results')
    expect(linkRelLabel('http://www.opengis.net/def/rel/ogc/1.0/results')).toBe('results')
    expect(linkRelLabel('monitor')).toBe('monitor')
  })
  it('detects log links', () => {
    expect(isLogLink(job.links[2])).toBe(true)
    expect(isLogLink(job.links[0])).toBe(false)
  })
})

describe('jobs list query', () => {
  it('builds the ZOO-Project query parameters', () => {
    expect(jobsQuery({ limit: 20, skip: 40, status: ['running', 'failed'], processID: 'echo' })).toEqual({
      limit: 20,
      skip: 40,
      status: 'running,failed',
      processID: 'echo'
    })
    expect(jobsQuery({})).toEqual({})
  })
  it('reads the skip of the next link', () => {
    expect(nextSkip({ jobs: [], links: [{ rel: 'next', href: 'http://x/jobs?limit=2&skip=2' }] })).toBe(2)
    expect(nextSkip({ jobs: [], links: [] })).toBeNull()
  })
})

describe('isExceptionDocument', () => {
  it('recognises OGC exception documents', () => {
    expect(isExceptionDocument({ type: 'NoApplicableCode', title: 'NoApplicableCode', detail: 'boom' })).toBe(true)
    expect(isExceptionDocument({ type: 'http://www.opengis.net/def/exceptions/x', title: 'NoSuchJob' })).toBe(true)
  })
  it('ignores result documents', () => {
    expect(isExceptionDocument({ a: 'hello world' })).toBe(false)
    expect(isExceptionDocument({ type: 'FeatureCollection', features: [] })).toBe(false)
    expect(isExceptionDocument(null)).toBe(false)
    expect(isExceptionDocument('text')).toBe(false)
  })
})

describe('newestFirstWindow', () => {
  it('reads the end of the list for page 1', () => {
    expect(newestFirstWindow(32, 1, 20)).toEqual({ skip: 12, limit: 20 })
    expect(newestFirstWindow(32, 2, 20)).toEqual({ skip: 0, limit: 12 })
  })
  it('handles small and empty lists', () => {
    expect(newestFirstWindow(5, 1, 20)).toEqual({ skip: 0, limit: 5 })
    expect(newestFirstWindow(0, 1, 20)).toEqual({ skip: 0, limit: 20 })
    expect(newestFirstWindow(40, 3, 20)).toEqual({ skip: 0, limit: 1 })
  })
})


describe('parseMultipartResults', () => {
  const sample =
    'Content-Type: Multipart/Related; boundary="--job-1"; type=text/plain; start=a\r\nStatus: 200 OK\r\n\r\n' +
    '----job-1\r\nContent-ID: a\r\nContent-Type: text/plain; charset=utf-8\r\nStatus: 200 OK\r\n\r\nContent-Disposition: INLINE\r\nBonjour' +
    '----job-1\r\nContent-ID: b\r\nContent-Type: text/xml; charset=UTF-8\r\nContent-Location: http://host/temp/result-job-1.xml\r\n' +
    '----job-1\r\nContent-ID: c\r\nContent-Type: text/plain; charset=utf-8\r\nStatus: 200 OK\r\n\r\nContent-Disposition: INLINE\r\n[ 2, 45, 3, 46 ]----job-1--\r\n'

  it('turns the kernel multipart document into a results map', () => {
    const doc = parseMultipartResults(sample)
    expect(doc).toEqual({
      a: { value: 'Bonjour', mediaType: 'text/plain' },
      b: { href: 'http://host/temp/result-job-1.xml', type: 'text/xml' },
      c: { value: { bbox: [2, 45, 3, 46] }, mediaType: 'text/plain' }
    })
  })

  it('ignores anything else', () => {
    expect(parseMultipartResults({ a: 1 })).toBeNull()
    expect(parseMultipartResults('{"a": 1}')).toBeNull()
    expect(parseMultipartResults('')).toBeNull()
  })
})
