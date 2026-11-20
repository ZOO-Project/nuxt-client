import { NuxtAuthHandler } from '#auth'

/**
 * OpenID Connect (Keycloak) login for the WebUI, based on @sidebase/nuxt-auth
 * (authjs provider). Configuration comes from the environment:
 *   NUXT_OIDC_ISSUER, NUXT_OIDC_CLIENT_ID, NUXT_OIDC_CLIENT_SECRET, AUTH_ORIGIN.
 * When no provider is configured the handler still answers (with an empty
 * provider list) so that anonymous deployments keep working.
 */
const issuer = process.env.NUXT_OIDC_ISSUER || ''
const clientId = process.env.NUXT_OIDC_CLIENT_ID || ''
const clientSecret = process.env.NUXT_OIDC_CLIENT_SECRET || ''
const oidcConfigured = !!(issuer && clientId && clientSecret)

const OIDC_WELL_KNOWN_URL = `${issuer}/.well-known/openid-configuration`

interface RefreshToken {
  access_token: string
  expires_in: number
  token_type: string
  scope: string
  refresh_token: string
}

async function refreshAccessToken(token: any) {
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token'
    })
    const refreshedToken = await $fetch<RefreshToken>(`${issuer}/protocol/openid-connect/token`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      method: 'POST',
      body
    })

    return {
      ...token,
      access_token: refreshedToken.access_token,
      access_token_expires_at: Math.floor(Date.now() / 1000) + refreshedToken.expires_in,
      refresh_token: refreshedToken.refresh_token || token.refresh_token,
      error: undefined
    }
  } catch (error) {
    console.debug('Token refresh failed (expected after logout or an expired SSO session):', error)
    // Drop the dead tokens: the UI must not keep sending them to the API.
    return {
      ...token,
      access_token: undefined,
      refresh_token: undefined,
      access_token_expires_at: undefined,
      error: 'RefreshAccessTokenError'
    }
  }
}

if (!oidcConfigured) {
  console.warn(
    '[auth] NUXT_OIDC_ISSUER / NUXT_OIDC_CLIENT_ID / NUXT_OIDC_CLIENT_SECRET are not all set: login is disabled.'
  )
}

function isTokenExpired(expiresAt: any) {
  if (!expiresAt) return false
  // 30 s of safety margin so that a request sent right before expiry still succeeds
  return Date.now() >= (Number(expiresAt) - 30) * 1000
}

/** Only redirect to same-origin URLs; fall back to the configured origin. */
function safeRedirect(url: string, baseUrl: string) {
  const origin = (process.env.AUTH_ORIGIN || baseUrl || '').replace(/\/$/, '')
  if (!url) return origin || baseUrl
  if (url.startsWith('/')) return `${origin}${url}`
  try {
    const target = new URL(url)
    const allowed = new URL(origin || baseUrl)
    if (target.origin === allowed.origin) return url
  } catch {
    /* ignore */
  }
  return origin || baseUrl
}

export default NuxtAuthHandler({
  secret: useRuntimeConfig().authSecret,

  providers: oidcConfigured
    ? [
        {
          id: 'keycloak',
          name: 'Keycloak',
          type: 'oauth',

          issuer,
          wellKnown: OIDC_WELL_KNOWN_URL,
          clientId,
          clientSecret,
          authorization: {
            params: {
              scope: 'openid profile email',
              prompt: 'login'
            }
          },
          async profile(profile: any) {
            profile.id = profile.sub
            return profile
          }
        }
      ]
    : [],

  callbacks: {
    async session({ session, token }) {
      if (token && token.user) {
        session.user = token.user
      }
      if (token?.error) {
        ;(session as any).error = token.error
      }
      return session
    },

    async jwt({ token, account, trigger }) {
      if (trigger === 'signOut') {
        return null as any
      }
      if (token) {
        if (account) {
          token = {
            ...token,
            id: account.providerAccountId,
            provider: account.provider,
            scope: account.scope,
            token_type: account.token_type,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            id_token: account.id_token,
            access_token_expires_at: account.expires_at
          }
        }

        if (token.error === 'RefreshAccessTokenError') {
          return token
        }
        if (isTokenExpired(token.access_token_expires_at) && token.refresh_token) {
          return await refreshAccessToken(token)
        }

        return token
      }
      return token
    },

    async redirect({ url, baseUrl }) {
      return safeRedirect(url, baseUrl)
    },

    async signIn() {
      return true
    }
  },

  pages: {}
})
