<template>
  <q-page class="q-pa-sm">
    <div class="row justify-center">
      <div class="col-12 q-pa-md" style="max-width: 1080px;">
        <div class="text-h4 text-weight-bold q-mb-md">{{ t('Landing page') }}</div>
        <q-banner v-if="error" dense rounded class="bg-red-1 text-negative q-mb-md">{{ error }}</q-banner>
        <JsonBlock v-if="data" :value="data" max-height="70vh" />
        <q-spinner v-else-if="!error" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import JsonBlock from '~/components/common/JsonBlock.vue'
import { errorSummary } from '~/composables/utils/ogcError'

const { t, locale } = useI18n()
const { apiFetch, waitUntilReady } = useOgcApiServer()
const data = ref<any>(null)
const error = ref('')

onMounted(async () => {
  try {
    await waitUntilReady()
    // No `f=json` here: the kernel answers 400 to it on the landing route (the other routes accept it).
    data.value = await apiFetch('/', { acceptLanguage: locale.value })
  } catch (err) {
    error.value = errorSummary(err, t('Request failed'))
  }
})
</script>
