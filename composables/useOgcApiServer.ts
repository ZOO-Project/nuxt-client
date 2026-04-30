import { useRuntimeConfig } from '#imports'
import { useAuthStore } from '~/stores/auth'

type OgcApiServerOptions = {
  acceptLanguage?: string
  forceRefresh?: boolean
}

type OgcApiEndpointOptions = {
  acceptLanguage?: string
  preferOpenApiServer?: boolean
  forceRefreshServer?: boolean
}

type OpenApiSpec = {
  servers?: Array<{
    url?: string
  }>
}

export function useOgcApiServer() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()

  let cachedServerBaseUrl: string | null = null

  const getBearerToken = () => {
    if (!authStore.isAuthenticated) {
      return null
    }
    return authStore.token?.access_token || null
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
    }
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

  return {
    buildOgcApiUrl,
    getRequestHeaders,
    resolveOpenApiServerBase
  }
}