import { describe, expect, it } from 'vitest'
import { darkPreference } from '../composables/utils/theme'

describe('darkPreference', () => {
  it('reads the cookie whether it was decoded as a string or a number', () => {
    expect(darkPreference('1')).toBe(true)
    expect(darkPreference(1)).toBe(true)
    expect(darkPreference('0')).toBe(false)
    expect(darkPreference(0)).toBe(false)
  })
  it('falls back to the system setting', () => {
    expect(darkPreference(null)).toBe('auto')
    expect(darkPreference(undefined)).toBe('auto')
    expect(darkPreference('')).toBe('auto')
    expect(darkPreference('maybe')).toBe('auto')
  })
})
