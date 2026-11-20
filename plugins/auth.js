import { isSessionExpired, isTokenUsable } from '~/composables/utils/auth'

/**
 * Hydrates the Pinia auth store from the nuxt-auth session and fetches the
 * OIDC tokens (server route /api/token) so that API calls can carry a bearer.
 * A session whose token expired and could not be refreshed is treated as
 * signed out (the header then offers to sign in again).
 */
export default defineNuxtPlugin(async () => {
  const headers = useRequestHeaders(['cookie'])
  const { status, data, getSession } = useAuth()
  const authStore = useAuthStore()

  let session = data.value
  // Client side: make sure the session is fresh (this also refreshes the
  // access token server side when it expired).
  if (import.meta.client) {
    try {
      session = await getSession()
    } catch (err) {
      console.debug('[auth-plugin] getSession failed', err)
    }
  }

  if (!session?.user && status.value !== 'authenticated' && !authStore.user) {
    return
  }

  try {
    const { data: token, error } = await useFetch('/api/token', { headers })
    const payload = token.value
    if (payload && isTokenUsable(payload)) {
      authStore.setToken(payload)
      authStore.setUser(session?.user || data.value?.user || authStore.user)
    } else if (payload && isSessionExpired(payload)) {
      authStore.markExpired()
    } else if (session?.user && payload?.access_token) {
      // no expiry information: trust the token
      authStore.setToken(payload)
      authStore.setUser(session.user)
    } else if (error.value || !payload) {
      authStore.clearAuth()
    }
  } catch (error) {
    console.debug('[auth-plugin] session unavailable', error)
    authStore.clearAuth()
  }
})
