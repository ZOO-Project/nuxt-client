import { describe, expect, it } from 'vitest'
import { isSessionExpired, isTokenUsable } from '../composables/utils/auth'

const now = Date.UTC(2026, 10, 17, 12, 0, 0)
const sec = Math.floor(now / 1000)

describe('session tokens', () => {
  it('accepts a live token and refuses an expired or errored one', () => {
    expect(isTokenUsable({ access_token: 'a', access_token_expires_at: sec + 600 }, now)).toBe(true)
    expect(isTokenUsable({ access_token: 'a', access_token_expires_at: sec + 5 }, now)).toBe(false)
    expect(isTokenUsable({ access_token: 'a', access_token_expires_at: sec - 1 }, now)).toBe(false)
    expect(isTokenUsable({ access_token: 'a', error: 'RefreshAccessTokenError' }, now)).toBe(false)
    expect(isTokenUsable({ access_token: 'a' }, now)).toBe(true)
    expect(isTokenUsable(null, now)).toBe(false)
  })
  it('detects a dead session', () => {
    expect(isSessionExpired({ error: 'RefreshAccessTokenError' }, now)).toBe(true)
    expect(isSessionExpired({ access_token: 'a', access_token_expires_at: sec - 10 }, now)).toBe(true)
    expect(isSessionExpired({ access_token: 'a', access_token_expires_at: sec + 10 }, now)).toBe(false)
    expect(isSessionExpired(null, now)).toBe(false)
  })
})
