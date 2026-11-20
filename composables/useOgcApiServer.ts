import { useRuntimeConfig } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { parseOgcError } from '~/composables/utils/ogcError'
import { isTokenUsable } from '~/composables/utils/auth'

type OgcApiServerOptions = {
  acceptLanguage?: string
  forceRefresh?: boolean
}

type OgcApiEndpointOptions = {
  acceptLanguage?: string
  preferOpenApiServer?: boolean
  forceRefreshServer?: boolean
}

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  query?: Record<string, any>
  body?: any
  headers?: Record<string, string>
  acceptLanguage?: string
  /** `json` (default) or `text` */
  responseType?: 'json' | 'text'
  /** Accept header sent to the server (default application/json) */
  accept?: string
  preferOpenApiServer?: boolean
}

type OpenApiSpec = {
  servers?: Array<{
    url?: string
  }>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Shared across composable instances: the OpenAPI server base rarely changes.
let cachedServerBaseUrl: string | null = null
// Pages fire several API calls at once on load: resolve the server base once.
let pendingServerBaseUrl: Promise<string | null> | null = null

export function useOgcApiServer() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()
  const loadingBar = useGlobalLoading()
  const trackStart = () => loadingBar.start()
  const trackEnd = () => loadingBar.end()

  /** When true, the API cannot be used without a bearer token (IAM in front of it). */
  const requiresBearerToken =
    String(config.public.ZOO_OGCAPI_REQUIRES_BEARER_TOKEN ?? 'true').toLowerCase() === 'true'

  const iamEnabled = ['true', '1', 'yes', 'on'].includes(String(config.public.ZOO_IAM_ENABLED ?? '').toLowerCase())

  /** True when an OpenID Connect provider is configured for the UI login. */
  const authConfigured = !!(config.public.NUXT_OIDC_ISSUER && config.public.NUXT_OIDC_CLIENT_ID)

  const getBearerToken = () => {
    if (!authStore.isAuthenticated) {
      return null
    }
    // Never send a token known to be expired: the server would answer 401.
    if (!isTokenUsable(authStore.token)) {
      return null
    }
    return authStore.token?.access_token || null
  }

  /**
   * The server rejected our bearer token (401): the session is over. Forget the
   * token so the UI falls back to anonymous mode and offers to sign in again.
   */
  const handleUnauthorized = () => {
    if (authStore.isAuthenticated || authStore.token) {
      authStore.markExpired()
      return true
    }
    return false
  }

  const hasToken = () => !!getBearerToken()

  /** Can requests be sent now? (anonymous access allowed, or token available) */
  const isReady = () => !requiresBearerToken || hasToken()

  /**
   * Auth state hydration can lag a bit on first page load. Wait (at most
   * `timeoutMs`) until a token is available when one is required.
   */
  const waitUntilReady = async (timeoutMs = 4000) => {
    const startedAt = Date.now()
    while (!isReady() && Date.now() - startedAt < timeoutMs) {
      await sleep(100)
    }
    return isReady()
  }

  const normalizePath = (path: string) => {
    if (!path) {
      return ''
    }
    return path.startsWith('/') ? path : `/${path}`
  }

  const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

  const getFallbackBaseUrl = () => trimTrailingSlash(`${config.public.NUXT_ZOO_BASEURL}/ogc-api`)

  const getRequestHeaders = (acceptLanguage?: string) => {
    const headers: Record<string, string> = {}
    if (acceptLanguage) {
      headers['Accept-Language'] = acceptLanguage
    }

    const bearer = getBearerToken()
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`
    }

    return headers
  }

  // Common $fetch options used across pages.
  const getFetchOptions = (acceptLanguage?: string) => ({
    headers: getRequestHeaders(acceptLanguage)
  })

  const toAbsoluteServerUrl = (serverUrl: string) => {
    const trimmed = serverUrl.trim()
    if (!trimmed) {
      return null
    }

    try {
      const absoluteUrl = /^https?:\/\//i.test(trimmed)
        ? new URL(trimmed)
        : new URL(trimmed, `${config.public.NUXT_ZOO_BASEURL}/`)

      return trimTrailingSlash(absoluteUrl.toString())
    } catch {
      return null
    }
  }

  const resolveOpenApiServerBase = async (options: OgcApiServerOptions = {}) => {
    const { acceptLanguage, forceRefresh = false } = options

    if (!forceRefresh && cachedServerBaseUrl) {
      return cachedServerBaseUrl
    }
    if (!forceRefresh && pendingServerBaseUrl) {
      return pendingServerBaseUrl
    }

    pendingServerBaseUrl = (async () => {
      try {
        const spec = await $fetch<OpenApiSpec>(`${config.public.NUXT_ZOO_BASEURL}/ogc-api/api`, {
          headers: getRequestHeaders(acceptLanguage)
        })

        const rawServerUrl = spec?.servers?.find(server => server?.url)?.url
        const resolvedServerUrl = rawServerUrl ? toAbsoluteServerUrl(rawServerUrl) : null

        cachedServerBaseUrl = resolvedServerUrl
        return resolvedServerUrl
      } catch {
        return null
      } finally {
        pendingServerBaseUrl = null
      }
    })()
    return pendingServerBaseUrl
  }

  const buildOgcApiUrl = async (path: string, options: OgcApiEndpointOptions = {}) => {
    const {
      acceptLanguage,
      preferOpenApiServer = true,
      forceRefreshServer = false
    } = options

    const normalizedPath = normalizePath(path)

    if (!preferOpenApiServer) {
      return `${getFallbackBaseUrl()}${normalizedPath}`
    }

    const serverBase = await resolveOpenApiServerBase({
      acceptLanguage,
      forceRefresh: forceRefreshServer
    })

    if (!serverBase) {
      return `${getFallbackBaseUrl()}${normalizedPath}`
    }

    return `${serverBase}${normalizedPath}`
  }

  /**
   * Call the OGC API. `path` is relative to the API root (e.g. `/jobs`) or an
   * absolute URL (links returned by the server). Errors are normalised into
   * `OgcApiError` objects (see composables/utils/ogcError.ts).
   */
  const apiFetch = async <T = any>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
    const {
      method = 'GET',
      query,
      body,
      headers = {},
      acceptLanguage,
      responseType = 'json',
      accept = 'application/json',
      preferOpenApiServer = true
    } = options

    const url = /^https?:\/\//i.test(path)
      ? path
      : await buildOgcApiUrl(path, { acceptLanguage, preferOpenApiServer })

    const send = () =>
      $fetch<T>(url, {
        method,
        query,
        body,
        responseType,
        headers: {
          Accept: accept,
          ...getRequestHeaders(acceptLanguage),
          ...headers
        }
      })

    trackStart()
    try {
      return await send()
    } catch (err) {
      const parsed = parseOgcError(err)
      // Our token was refused: drop it and, when anonymous calls are allowed,
      // retry once without it so the page keeps working.
      if (parsed.status === 401 && handleUnauthorized() && !requiresBearerToken) {
        try {
          return await send()
        } catch (retryErr) {
          throw parseOgcError(retryErr)
        }
      }
      throw parsed
    } finally {
      trackEnd()
    }
  }

  return {
    requiresBearerToken,
    iamEnabled,
    authConfigured,
    hasToken,
    isReady,
    waitUntilReady,
    buildOgcApiUrl,
    getRequestHeaders,
    getFetchOptions,
    resolveOpenApiServerBase,
    apiFetch,
    handleUnauthorized
  }
}
