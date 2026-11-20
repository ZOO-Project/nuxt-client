/**
 * Pure helpers for OGC API - Processes jobs (no Nuxt/Vue imports so they can be
 * unit tested with vitest).
 */
export const JOB_STATUSES = ['accepted', 'running', 'successful', 'failed', 'dismissed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const TERMINAL_STATUSES: readonly string[] = ['successful', 'failed', 'dismissed']

/** Map legacy / vendor spellings onto the OGC API - Processes status values. */
export function normalizeStatus(status?: string | null): string {
  const value = String(status ?? '').trim().toLowerCase()
  switch (value) {
    case 'succeeded':
    case 'success':
    case 'succeded':
      return 'successful'
    case 'canceled':
    case 'cancelled':
      return 'dismissed'
    case 'error':
      return 'failed'
    case 'started':
    case 'running...':
      return 'running'
    default:
      return value
  }
}

export function isTerminalStatus(status?: string | null): boolean {
  return TERMINAL_STATUSES.includes(normalizeStatus(status))
}

export function isActiveStatus(status?: string | null): boolean {
  const value = normalizeStatus(status)
  return value === 'accepted' || value === 'running'
}

export function statusColor(status?: string | null): string {
  switch (normalizeStatus(status)) {
    case 'successful':
      return 'positive'
    case 'failed':
      return 'negative'
    case 'running':
      return 'primary'
    case 'accepted':
      return 'info'
    case 'dismissed':
      return 'grey-7'
    default:
      return 'grey'
  }
}

export function statusIcon(status?: string | null): string {
  switch (normalizeStatus(status)) {
    case 'successful':
      return 'check_circle'
    case 'failed':
      return 'error'
    case 'running':
      return 'autorenew'
    case 'accepted':
      return 'schedule'
    case 'dismissed':
      return 'block'
    default:
      return 'help_outline'
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Format an ISO date for display in the given locale ("" when missing/invalid). */
export function formatDateTime(iso?: string | null, locale = 'en-US'): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

/** Human readable duration between two instants, e.g. "1 min 09 s". */
export function formatDurationMs(ms?: number | null): string {
  if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) return ''
  if (ms < 1000) return '< 1 s'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} h ${pad(minutes)} min`
  if (minutes > 0) return `${minutes} min ${pad(seconds)} s`
  return `${seconds} s`
}

export function formatDuration(startIso?: string | null, endIso?: string | null, now = Date.now()): string {
  if (!startIso) return ''
  const start = new Date(startIso).getTime()
  if (Number.isNaN(start)) return ''
  const end = endIso ? new Date(endIso).getTime() : now
  if (Number.isNaN(end)) return ''
  return formatDurationMs(end - start)
}

/** Duration of a job in milliseconds (running jobs are measured against `now`). */
export function jobDurationMs(job: any, now = Date.now()): number | null {
  const start = job?.started ?? job?.created
  if (!start) return null
  const startMs = new Date(start).getTime()
  if (Number.isNaN(startMs)) return null
  const endIso = job?.finished ?? (isTerminalStatus(job?.status) ? job?.updated : null)
  const endMs = endIso ? new Date(endIso).getTime() : now
  if (Number.isNaN(endMs)) return null
  return Math.max(0, endMs - startMs)
}

/** Relative time such as "3 min ago" (English) — used in tooltips/captions. */
export function relativeTime(iso?: string | null, now = Date.now(), locale = 'en-US'): string {
  if (!iso) return ''
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const diffSeconds = Math.round((time - now) / 1000)
  const abs = Math.abs(diffSeconds)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ]
  const [unit, size] = units.find(([, s]) => abs >= s) ?? ['second', 1]
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(diffSeconds / size), unit)
  } catch {
    return ''
  }
}

export const REL_RESULTS = 'http://www.opengis.net/def/rel/ogc/1.0/results'

/** Short label for a link relation ("results", "monitor", "related", ...). */
export function linkRelLabel(rel?: string | null): string {
  if (!rel) return 'link'
  const last = rel.split('/').filter(Boolean).pop() || rel
  return last
}

export function findLink(links: any[] | undefined, rel: string): any | undefined {
  return (links || []).find((link) => link?.rel === rel)
}

export function resultsHref(job: any): string | undefined {
  return findLink(job?.links, REL_RESULTS)?.href
}

/** Log links published by the ZOO-Project DRU: rel=related with a text/plain type. */
export function isLogLink(link: any): boolean {
  if (!link?.href) return false
  const rel = String(link.rel || '').toLowerCase()
  const type = String(link.type || '').toLowerCase()
  const href = String(link.href).toLowerCase()
  return (
    rel === 'related' ||
    type.startsWith('text/plain') ||
    /\.(log|txt)(\?|$)/.test(href)
  )
}

export interface JobsPage {
  jobs: any[]
  numberTotal?: number
  links?: any[]
}

/** Build the query string parameters understood by the ZOO-Project jobs list. */
export function jobsQuery(options: {
  limit?: number
  skip?: number
  status?: string[]
  processID?: string
  minDuration?: number
  maxDuration?: number
}): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  if (options.limit) query.limit = options.limit
  if (options.skip) query.skip = options.skip
  if (options.status?.length) query.status = options.status.join(',')
  if (options.processID) query.processID = options.processID
  if (options.minDuration !== undefined) query.minDuration = options.minDuration
  if (options.maxDuration !== undefined) query.maxDuration = options.maxDuration
  return query
}

/** Try to read the `skip` value of the `next` link of a jobs page. */
export function nextSkip(page: JobsPage | null | undefined): number | null {
  const next = findLink(page?.links, 'next')?.href
  if (!next) return null
  try {
    const url = new URL(next, 'http://localhost')
    const skip = url.searchParams.get('skip') ?? url.searchParams.get('offset')
    return skip !== null ? Number(skip) : null
  } catch {
    return null
  }
}

/**
 * OGC API exception document ({ type, title, detail, status? }): the server
 * answers the results request of a failed job with one, sometimes with a 200.
 */
export function isExceptionDocument(doc: any): boolean {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false
  const keys = Object.keys(doc)
  if (typeof doc.type !== 'string' || !('title' in doc || 'detail' in doc)) return false
  const allowed = ['type', 'title', 'detail', 'status', 'instance', 'code', 'links']
  return keys.every((key) => allowed.includes(key))
}

/**
 * Window (`skip`/`limit`) to request so that page `page` holds the newest jobs
 * of a server that lists them oldest first. Page 1 is the end of the list; the
 * first page may be shorter when the total is not a multiple of `pageSize`.
 */
export function newestFirstWindow(total: number, page: number, pageSize: number): { skip: number; limit: number } {
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const count = Math.max(0, Math.floor(total) || 0)
  const current = Math.max(1, Math.floor(page) || 1)
  if (!count) return { skip: 0, limit: size }
  const end = Math.max(0, count - (current - 1) * size)
  const skip = Math.max(0, end - size)
  return { skip, limit: Math.max(1, end - skip) }
}

/**
 * ZOO-Project answers `/jobs/{id}/results` of a multi-output job executed in
 * "raw" mode with a `Multipart/Related` document (its headers included in the
 * body, labelled `application/json`). Turn it into an OGC results document:
 * one entry per `Content-ID`, as `{ href, type }` for referenced parts and
 * `{ value, mediaType }` for inline ones. Returns null when the text is not
 * such a document.
 */
export function parseMultipartResults(text: unknown): Record<string, any> | null {
  if (typeof text !== 'string') return null
  const head = text.slice(0, 400)
  const boundaryMatch = /^Content-Type:\s*multipart\/related;[^\n]*boundary="?([^";\r\n]+)"?/im.exec(head)
  if (!boundaryMatch) return null
  const boundary = boundaryMatch[1]
  // The kernel writes the delimiter as `--` + boundary (boundary itself starts with `--`).
  const parts = text.split('--' + boundary).slice(1)
  const results: Record<string, any> = {}
  for (let raw of parts) {
    raw = raw.replace(/^--\s*$/, '')
    if (!raw.trim()) continue
    let headerBlock = raw
    let body = ''
    const split = raw.search(/\r?\n\r?\n/)
    if (split >= 0) {
      headerBlock = raw.slice(0, split)
      body = raw.slice(split).replace(/^(\r?\n)+/, '')
    }
    const headers: Record<string, string> = {}
    for (const line of headerBlock.split(/\r?\n/)) {
      const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line.trim())
      if (m) headers[m[1].toLowerCase()] = m[2].trim()
    }
    const id = headers['content-id']
    if (!id) continue
    const mediaType = (headers['content-type'] || '').split(';')[0].trim() || undefined
    if (headers['content-location']) {
      results[id] = { href: headers['content-location'], type: mediaType }
      continue
    }
    // The kernel puts `Content-Disposition` after the blank line: drop it from the body.
    body = body.replace(/^Content-Disposition:[^\n]*\r?\n?/i, '').replace(/\r?\n$/, '')
    let value: any = body
    if (/json/i.test(mediaType || '') || /^\s*[\[{]/.test(body)) {
      try {
        value = JSON.parse(body)
      } catch {
        value = body
      }
    }
    if (Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number')) {
      value = { bbox: value }
    }
    results[id] = mediaType ? { value, mediaType } : { value }
  }
  return Object.keys(results).length ? results : null
}

