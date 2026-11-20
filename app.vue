<template>
  <LoadingBar />
  <component :is="layoutComponent" />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useLayoutStore } from '~/stores/layout'
import { useI18n } from 'vue-i18n'
import { useCookie, useNuxtApp } from '#app'
import { useQuasar } from 'quasar'
// Explicit extensions: the production (nitro) build cannot resolve the bare paths.
import quasarLangFr from 'quasar/lang/fr.js'
import quasarLangEn from 'quasar/lang/en-US.js'
import { darkPreference } from '~/composables/utils/theme'
import 'leaflet/dist/leaflet.css'
import 'leaflet.pm/dist/leaflet.pm.css'

import DefaultLayout from '~/layouts/Default.vue'
import QuasarLayout from '~/layouts/quasar.vue'
import LoadingBar from '~/components/common/LoadingBar.vue'

const layoutStore = useLayoutStore()

const layoutComponent = computed(() => {
  const map: Record<string, any> = {
    Default: DefaultLayout,
    quasar: QuasarLayout,
  }
  return map[layoutStore.currentLayout] || DefaultLayout
})


const { locale } = useI18n()
const langCookie = useCookie('i18n_redirected')
const darkCookie = useCookie('dark_mode', { maxAge: 60 * 60 * 24 * 365 })
const $q = useQuasar()
const route = useRoute()

// Route changes drive the global loading bar (API calls do too, see apiFetch).
if (import.meta.client) {
  const router = useRouter()
  const loadingBar = useGlobalLoading()
  router.beforeEach(() => {
    loadingBar.start()
  })
  router.afterEach(() => {
    loadingBar.end()
  })
  router.onError(() => {
    loadingBar.end()
  })
}

// Paint the document background in the right theme before the app styles load,
// so that full page loads (first visit, reload) do not flash white in dark mode.
useHead({
  style: [
    {
      key: 'theme-bg',
      innerHTML:
        'html{background:#f9f9f9;color-scheme:light}' +
        '@media (prefers-color-scheme: dark){html{background:#121212;color-scheme:dark}}' +
        'html:has(body.body--dark){background:#121212;color-scheme:dark}' +
        'html:has(body.body--light){background:#f9f9f9;color-scheme:light}'
    }
  ]
})

// `?theme=dark|light` forces a theme (and remembers it); otherwise the cookie
// set from the settings menu applies, and without a cookie the system setting wins.
const themeParam = String(route.query.theme || '')
if (themeParam === 'dark' || themeParam === 'light') {
  darkCookie.value = themeParam === 'dark' ? '1' : '0'
}
const applyTheme = () => {
  $q.dark.set(darkPreference(darkCookie.value))
}
applyTheme()
// Quasar re-applies its static `config.dark` once the SSR markup is hydrated,
// which used to reset the cookie choice to light on every full page load.
if (import.meta.client) {
  useNuxtApp().hook('app:suspense:resolve', applyTheme)
}

if (langCookie.value && langCookie.value !== locale.value) {
  locale.value = langCookie.value
}

// Quasar components (table pagination, dialog buttons...) have their own
// language pack: keep it aligned with the UI locale.
const applyQuasarLang = (code: string) => {
  $q.lang.set(String(code || '').toLowerCase().startsWith('fr') ? quasarLangFr : quasarLangEn)
}
applyQuasarLang(locale.value)
watch(locale, applyQuasarLang)
</script>


<style>
.q-card,
.q-btn,
.q-btn-dropdown,
.q-dialog__inner,
.q-item,
.q-table{
  border-radius: 12px !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06); 
}
.q-input{
  border-radius: 12px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.q-menu {
  border-radius: 12px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); 
}

:root {
  --surface-bg: #ffffff;
  --surface-alt: #f2f2f2;
  --surface-code: #f4f4f4;
  /* progress bar: the ZOO sun yellow, slightly deeper on light backgrounds */
  --zoo-loading: #e0a500;
}
.body--dark {
  --surface-bg: #1e1e1e;
  --surface-alt: #2a2a2a;
  --surface-code: #262626;
  --zoo-loading: #f2c037;
}


.q-page {
  background: #f9f9f9;
}
.body--dark .q-page {
  background: #121212;
}
.body--dark .q-card,
.body--dark .q-table {
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}

/* Quasar components that may miss their --dark variant (e.g. tables rendered
   before the theme is known): paint them from the dark palette anyway. */
.body--dark .q-table__card,
.body--dark .q-card,
.body--dark .q-menu,
.body--dark .q-dialog__inner > .q-card,
.body--dark .q-uploader,
.body--dark .q-expansion-item__container > .q-card {
  background: #1e1e1e;
  color: #e6e6e6;
}
.body--dark .q-table thead th,
.body--dark .q-table__title,
.body--dark .q-table__bottom {
  color: #e6e6e6;
}
.body--dark .q-table tbody td,
.body--dark .q-table thead th {
  border-color: rgba(255, 255, 255, 0.12);
}
.body--dark .q-table--horizontal-separator tbody tr:not(:last-child) > td {
  border-bottom-color: rgba(255, 255, 255, 0.12);
}
.body--dark .q-table tbody tr:hover > td {
  background: rgba(255, 255, 255, 0.04);
}
.body--dark .q-field--filled .q-field__control {
  background: rgba(255, 255, 255, 0.07);
}
.body--dark .q-field--filled .q-field__control:hover {
  background: rgba(255, 255, 255, 0.1);
}
.body--dark .q-chip.bg-grey-3 {
  background: #3a3a3a !important;
  color: #e6e6e6 !important;
}
.body--dark .q-chip.text-grey-9 {
  color: #e6e6e6 !important;
}

/* Brand brown is too dark for text on dark surfaces: use a golden tint for
   links, flat buttons and headings that use the primary colour as text. */
.body--dark .text-primary,
.body--dark a:not(.q-btn):not(.q-item),
.body--dark .q-footer a {
  color: #e0b96a !important;
}
.body--dark .q-btn--flat.text-primary .q-icon,
.body--dark .q-icon.text-primary {
  color: #e0b96a !important;
}
.body--dark .q-chip--outline.text-primary {
  border-color: #e0b96a;
}

/* Dark theme overrides for the utility classes used across the pages. */
.body--dark .bg-white,
.body--dark .q-header,
.body--dark .q-footer,
.body--dark .q-toolbar.bg-white {
  background: #1e1e1e !important;
}
.body--dark .bg-grey-1 {
  background: #262626 !important;
}
.body--dark .bg-grey-2,
.body--dark .bg-grey-3 {
  background: #2e2e2e !important;
}
.body--dark .text-grey-10,
.body--dark .text-grey-9,
.body--dark .text-grey-8,
.body--dark .text-black {
  color: #e6e6e6 !important;
}
.body--dark .text-grey-7 {
  color: #bdbdbd !important;
}
.body--dark .text-grey-6 {
  color: #a3a3a3 !important;
}
.body--dark .bg-red-1 {
  background: rgba(244, 67, 54, 0.16) !important;
}
.body--dark .bg-orange-1 {
  background: rgba(255, 152, 0, 0.16) !important;
}
.body--dark .text-orange-10 {
  color: #ffb74d !important;
}
.body--dark .custom-table th {
  border-color: #3a3a3a;
}
.body--dark .custom-table td {
  border-color: #333;
}
.body--dark .help-container {
  color: #e0e0e0 !important;
}
.body--dark .help-container .help-section {
  background: #262626 !important;
}
.body--dark .help-container .help-title {
  color: #f0f0f0 !important;
}
.body--dark .help-container .help-intro,
.body--dark .help-container p,
.body--dark .help-container li {
  color: #d0d0d0 !important;
}
.body--dark .response-pre,
.body--dark .dialog-pre {
  background: #262626;
}
.body--dark .map,
.body--dark .geo-preview,
.body--dark #svg-container {
  border-color: #333;
}
.body--dark .hoverable-link:hover {
  background-color: #2a2a2a;
}

.hoverable-link {
  transition: background-color 0.3s ease;
  border-radius: 8px;
  padding: 6px 12px;
}

.hoverable-link:hover {
  background-color: #f5f5f5; /* soft hover effect */
}

.map {
  border: 1px solid #ccc;
  margin-top: 20px;
}
</style>