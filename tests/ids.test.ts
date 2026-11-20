import { describe, expect, it } from 'vitest'
import { randomId } from '../composables/utils/ids'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomId', () => {
  it('returns RFC 4122 version 4 identifiers', () => {
    expect(randomId()).toMatch(UUID_V4)
  })

  it('returns distinct values', () => {
    const ids = new Set(Array.from({ length: 500 }, () => randomId()))
    expect(ids.size).toBe(500)
  })

  it('falls back to getRandomValues when randomUUID is unavailable (plain http origin)', () => {
    const getRandomValues = <T extends ArrayBufferView>(array: T) => {
      const bytes = new Uint8Array(array.buffer)
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 0xff
      return array
    }
    const id = randomId({ getRandomValues })
    expect(id).toMatch(UUID_V4)
    expect(randomId({ getRandomValues })).toBe(id)
  })

  it('still produces a valid identifier without any crypto API', () => {
    expect(randomId(undefined)).toMatch(UUID_V4)
  })
})
