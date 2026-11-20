<template>
    <q-btn flat round dense icon="settings">
      <q-menu>
        <q-list style="min-width: 200px">
          <q-item>
            <q-item-section>
              <q-select
                v-model="selectedLang"
                :options="options"
                dense borderless emit-value map-options
                :label="t('Language')"
              />
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-toggle v-model="darkMode" :label="t('Dark mode')" icon="dark_mode" dense />
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-select
                v-model="selectedLayout"
                :options="[
                  { label: 'Default', value: 'Default' },
                  { label: 'Quasar', value: 'quasar' }
                ]"
                dense borderless emit-value map-options
                label="Layout"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useLayoutStore } from '~/stores/layout'
import { useI18n } from 'vue-i18n'
import { useCookie } from '#app'
import { useQuasar } from 'quasar'
import { darkPreference } from '~/composables/utils/theme'


const options = [
  { label: 'English', value: 'en-US' },
  { label: 'Français', value: 'fr-FR' }
]

const { locale, t } = useI18n()
const langCookie = useCookie('i18n_redirected')


const selectedLang = ref(langCookie.value || 'en-US')

// Sync changes
watch(selectedLang, (val) => {
  langCookie.value = val
  locale.value = val 
  window.location.reload()
})




const layoutStore = useLayoutStore()
const selectedLayout = ref(layoutStore.currentLayout)
watch(selectedLayout, (val) => {
  layoutStore.setLayout(val)
})

// Dark mode, persisted in a cookie so that SSR renders the right theme.
const $q = useQuasar()
const darkCookie = useCookie<string>('dark_mode', { maxAge: 60 * 60 * 24 * 365 })
// Without a cookie the theme follows the system: reflect the active state.
const preference = darkPreference(darkCookie.value)
const darkMode = ref(preference === 'auto' ? $q.dark.isActive : preference)
onMounted(() => {
  darkMode.value = $q.dark.isActive
})
watch(darkMode, (val) => {
  if (val === $q.dark.isActive) return
  darkCookie.value = val ? '1' : '0'
  $q.dark.set(val)
})
</script>
