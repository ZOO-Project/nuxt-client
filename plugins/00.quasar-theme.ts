/**
 * Choose the Quasar dark mode before Quasar is installed, so that the SSR
 * markup already carries `body--dark` and the hydration keeps it. The choice
 * comes from the `dark_mode` cookie written by the settings menu, or from a
 * `?theme=dark|light` query parameter; otherwise the system setting applies
 * (resolved on the client, see app.vue).
 */
import { darkPreference } from '~/composables/utils/theme'

export default defineNuxtPlugin({
  name: 'quasar-theme',
  enforce: 'pre',
  setup() {
    const darkCookie = useCookie<string | null>('dark_mode', { maxAge: 60 * 60 * 24 * 365 })

    let theme = ''
    try {
      theme = String(useRequestURL().searchParams.get('theme') || '')
    } catch {
      /* no request URL (should not happen) */
    }
    if (theme === 'dark' || theme === 'light') {
      darkCookie.value = theme === 'dark' ? '1' : '0'
    }

    const dark = darkPreference(darkCookie.value)

    // nuxt-quasar-ui merges `appConfig.nuxtQuasar` into Quasar's `config`.
    const appConfig = useAppConfig() as Record<string, any>
    appConfig.nuxtQuasar = { ...(appConfig.nuxtQuasar || {}), dark }
  }
})
