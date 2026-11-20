/**
 * Pure helpers about OIDC tokens kept in the session (no Nuxt imports).
 */
export interface SessionToken {
  access_token?: string | null
  /** Expiry of the access token, epoch seconds */
  access_token_expires_at?: number | string | null
  error?: string | null
  [key: string]: any
}

/** Seconds of safety margin: a token about to expire is not worth sending. */
export const TOKEN_MARGIN_SECONDS = 15

export function tokenExpiresAt(token?: SessionToken | null): number | null {
  const raw = token?.access_token_expires_at
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** True when the token can still be sent to the API. */
export function isTokenUsable(token?: SessionToken | null, nowMs = Date.now()): boolean {
  if (!token?.access_token) return false
  if (token.error) return false
  const expiresAt = tokenExpiresAt(token)
  if (expiresAt === null) return true
  return nowMs / 1000 < expiresAt - TOKEN_MARGIN_SECONDS
}

/** True when the session carries a token that is dead for good (expired and not refreshable). */
export function isSessionExpired(token?: SessionToken | null, nowMs = Date.now()): boolean {
  if (!token) return false
  if (token.error) return true
  const expiresAt = tokenExpiresAt(token)
  return expiresAt !== null && nowMs / 1000 >= expiresAt
}
