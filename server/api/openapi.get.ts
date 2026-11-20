import $RefParser from '@apidevtools/json-schema-ref-parser'
import { createError, defineEventHandler, getHeader, getQuery, setHeader } from 'h3'

/**
 * GET /api/openapi?url=<OpenAPI document URL>
 *
 * Returns the server's OpenAPI document with every external `$ref` bundled in.
 * The ZOO-Project document references OGC schema files hosted on
 * schemas.opengis.net / raw.githubusercontent.com, and some of those files
 * (CQL2 in particular) point to their own `#/definitions`: Swagger UI resolves
 * such pointers against the root document and reports dozens of "could not
 * resolve reference" errors. Bundling with json-schema-ref-parser resolves each
 * pointer relative to the file it belongs to and keeps circular references as
 * local pointers, so Swagger UI only sees a self-contained document.
 *
 * Only documents served by the configured ZOO-Project (NUXT_ZOO_BASEURL) may be
 * bundled, and the caller's bearer token is forwarded for that first request.
 *
 * NUXT_ZOO_BASEURL is the address the *browser* uses; inside Kubernetes it is
 * often not reachable from the UI container (e.g. http://localhost:8080 behind a
 * port-forward). The document is therefore fetched from, in order:
 *   1. NUXT_ZOO_INTERNAL_BASEURL when set (e.g. http://zoo-project-dru-service),
 *   2. the public URL,
 *   3. the origin of SUBSCRIBERURL (the in-cluster kernel service) on connection errors.
 */
const originOf = (value?: string) => {
  try {
    return value ? new URL(value).origin : ''
  } catch {
    return ''
  }
}

const isConnectionError = (err: any) => {
  const code = err?.cause?.code || err?.code || ''
  const message = String(err?.cause?.message || err?.message || '')
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code) ||
    /ECONNREFUSED|ENOTFOUND|fetch failed/i.test(message)
  )
}
type CacheEntry = { at: number; doc: any }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 10 * 60 * 1000

export default defineEventHandler(async (event) => {
  const { url } = getQuery(event)
  if (typeof url !== 'string' || !url) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "url" query parameter' })
  }

  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid "url" query parameter' })
  }

  const base = (process.env.NUXT_ZOO_BASEURL || '').trim()
  if (base) {
    let allowed: URL | null = null
    try {
      allowed = new URL(base)
    } catch {
      allowed = null
    }
    if (allowed && allowed.origin !== target.origin) {
      throw createError({ statusCode: 403, statusMessage: 'Only the configured ZOO-Project server can be bundled' })
    }
  }

  const authorization = getHeader(event, 'authorization')
  const language = (getHeader(event, 'accept-language') || '').split(',')[0].trim()
  const cacheKey = `${authorization ? 'auth' : 'anon'}:${language}:${target.href}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL_MS) {
    setHeader(event, 'X-OpenAPI-Bundle', 'cache')
    return hit.doc
  }

  const headers = {
    Accept: 'application/json',
    ...(language ? { 'Accept-Language': language } : {}),
    ...(authorization ? { Authorization: authorization } : {})
  }

  // Candidate origins to reach the kernel from this container.
  const publicOrigin = originOf(base) || target.origin
  const candidates: string[] = []
  const internal = originOf(process.env.NUXT_ZOO_INTERNAL_BASEURL)
  if (internal) candidates.push(internal)
  candidates.push(target.origin)
  const subscriberOrigin = originOf(process.env.SUBSCRIBERURL)
  if (subscriberOrigin && !candidates.includes(subscriberOrigin)) candidates.push(subscriberOrigin)

  let spec: any = null
  let lastError: any = null
  for (const origin of candidates) {
    const fetchUrl = target.origin === publicOrigin || origin !== target.origin
      ? `${origin}${target.pathname}${target.search}`
      : target.href
    try {
      spec = await $fetch<any>(fetchUrl, { headers })
      lastError = null
      break
    } catch (err: any) {
      lastError = err
      if (!isConnectionError(err)) break
      console.warn(`[openapi] ${fetchUrl} unreachable from the server, trying the next origin`)
    }
  }
  if (lastError || !spec) {
    throw lastError || createError({ statusCode: 502, statusMessage: 'OpenAPI document unavailable' })
  }

  let bundled: any
  try {
    bundled = await $RefParser.bundle(target.href, spec, {
      resolve: { http: { timeout: 20000, redirects: 5 } },
      dereference: { circular: true }
    })
  } catch (err: any) {
    console.warn('[openapi] bundling failed, serving the raw document:', err?.message || err)
    setHeader(event, 'X-OpenAPI-Bundle', 'failed')
    return spec
  }

  cache.set(cacheKey, { at: Date.now(), doc: bundled })
  setHeader(event, 'X-OpenAPI-Bundle', 'ok')
  setHeader(event, 'Cache-Control', 'no-store')
  return bundled
})
