/**
 * Theme preference stored in the `dark_mode` cookie: "1" (dark), "0" (light) or
 * nothing (follow the system). Nuxt's `useCookie` decodes "1" into the number 1,
 * so the comparison must not be strict on strings.
 */
export type DarkPreference = true | false | 'auto'

export function darkPreference(value: unknown): DarkPreference {
  const text = value === null || value === undefined ? '' : String(value)
  if (text === '1' || text === 'true' || text === 'dark') return true
  if (text === '0' || text === 'false' || text === 'light') return false
  return 'auto'
}
