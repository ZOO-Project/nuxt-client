<template>
  <q-card flat bordered class="q-mb-md">
    <q-card-section class="row items-center q-py-sm">
      <q-icon name="verified" size="sm" class="q-mr-sm text-primary" />
      <div class="text-subtitle1 text-weight-bold">{{ t('Capabilities') }}</div>
      <q-space />
      <NuxtLink to="/conformance" class="text-primary text-caption">{{ t('All conformance classes') }}</NuxtLink>
    </q-card-section>
    <q-separator />
    <q-card-section>
      <div v-if="loading" class="row q-gutter-xs">
        <q-skeleton v-for="i in 6" :key="i" type="QChip" />
      </div>
      <div v-else-if="badges.length" class="row q-gutter-xs">
        <q-chip
          v-for="badge in badges"
          :key="badge.key"
          dense
          :color="badge.supported ? 'positive' : 'grey-4'"
          :text-color="badge.supported ? 'white' : 'grey-8'"
          :icon="badge.supported ? 'check' : 'remove'"
          :class="{ 'capability-chip--off': !badge.supported }"
        >
          {{ badge.label }}
          <q-tooltip>{{ badge.uri }}</q-tooltip>
        </q-chip>
      </div>
      <div v-else class="text-grey-7">{{ t('Conformance information is not available.') }}</div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Summarises the OGC API - Processes conformance classes declared by the
 * server as a row of badges.
 */
const { t, locale } = useI18n()
const { apiFetch, waitUntilReady } = useOgcApiServer()
const conformsTo = ref<string[]>([])
const loading = ref(true)

const KNOWN: Array<{ key: string; label: string; match: RegExp }> = [
  { key: 'core', label: 'Core', match: /ogcapi-processes-1\/[\d.]+\/conf\/core$/ },
  { key: 'json', label: 'JSON', match: /ogcapi-processes-1\/[\d.]+\/conf\/json$/ },
  { key: 'html', label: 'HTML', match: /ogcapi-processes-1\/[\d.]+\/conf\/html$/ },
  { key: 'oas30', label: 'OpenAPI 3.0', match: /ogcapi-processes-1\/[\d.]+\/conf\/oas30$/ },
  { key: 'desc', label: 'Process description', match: /conf\/ogc-process-description$/ },
  { key: 'joblist', label: 'Job list', match: /conf\/job-list$/ },
  { key: 'dismiss', label: 'Dismiss', match: /conf\/dismiss$/ },
  { key: 'callback', label: 'Callback', match: /conf\/callback$/ },
  { key: 'dru', label: 'Deploy / Replace / Undeploy', match: /conf\/deploy-replace-undeploy$/ },
  { key: 'cwl', label: 'CWL packages', match: /conf\/cwl$/ },
  { key: 'ogcapppkg', label: 'OGC Application Package', match: /conf\/ogcapppkg$/ }
]

const badges = computed(() =>
  conformsTo.value.length
    ? KNOWN.map((item) => {
        const uri = conformsTo.value.find((c) => item.match.test(c))
        return { key: item.key, label: item.label, supported: !!uri, uri: uri || item.match.source }
      })
    : []
)

onMounted(async () => {
  try {
    await waitUntilReady()
    const data = await apiFetch<any>('/conformance', { query: { f: 'json' }, acceptLanguage: locale.value })
    conformsTo.value = data?.conformsTo || []
  } catch (err) {
    console.warn('conformance unavailable', err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.body--dark .capability-chip--off {
  background: #3a3a3a !important;
  color: #cfcfcf !important;
}
</style>
