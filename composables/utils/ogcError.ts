/**
 * Normalises errors thrown by $fetch / fetch when calling an OGC API - Processes
 * server into a single shape. OGC API exceptions are JSON documents such as
 * `{"type": "...", "title": "NoSuchJob", "detail": "..."}` (RFC 7807 style).
 */
export interface OgcApiError {
  /** HTTP status code when known */
  status?: number
  /** Exception title / code (e.g. NoSuchJob, NoApplicableCode) */
  title?: string
  /** Exception type URI or code */
  type?: string
  /** Human readable detail */
  detail?: string
  /** Parsed response body, when any */
  raw?: any
  /** Message suitable for display: "title: detail" */
  message: string
}

const tryParseJson = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

export function parseOgcError(err: any, fallback = 'Request failed'): OgcApiError {
  if (err && typeof err === 'object' && 'message' in err && 'isOgcApiError' in err) {
    return err as OgcApiError
  }

  const status: number | undefined =
    err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.response?.statusCode

  const body = err?.data ?? err?.response?._data ?? err?.body ?? null
  const parsed = tryParseJson(body) ?? (body && typeof body === 'object' ? body : null)

  const title: string | undefined =
    parsed?.title ?? parsed?.code ?? parsed?.error?.code ?? (status ? `HTTP ${status}` : undefined)
  const detail: string | undefined =
    parsed?.detail ??
    parsed?.description ??
    parsed?.error?.description ??
    parsed?.error?.message ??
    parsed?.message ??
    (typeof body === 'string' && !parsed ? body.slice(0, 500) : undefined)

  const parts = [title, detail].filter((part) => !!part && String(part).trim().length)
  const message = parts.length ? parts.join(': ') : err?.message || fallback

  return {
    status,
    title,
    type: parsed?.type,
    detail,
    raw: parsed ?? body,
    message,
    // marker so that already-parsed errors are returned as-is
    ...( { isOgcApiError: true } as any )
  }
}

/** Short, user-facing summary of an error (never longer than `max` chars). */
export function errorSummary(err: any, fallback = 'Request failed', max = 240): string {
  const message = parseOgcError(err, fallback).message
  return message.length > max ? `${message.slice(0, max - 1)}…` : message
}
