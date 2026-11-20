<template>
  <q-card flat bordered class="q-mb-md">
    <q-card-section class="row items-center q-py-sm">
      <q-icon name="output" size="sm" class="q-mr-sm text-primary" />
      <div class="text-subtitle1 text-weight-bold">{{ t('Results') }}</div>
      <q-space />
      <q-btn flat dense icon="refresh" :loading="loading" @click="load">
        <q-tooltip>{{ t('Reload results') }}</q-tooltip>
      </q-btn>
      <q-btn
        v-if="resultsUrl"
        flat
        dense
        icon="open_in_new"
        :href="resultsUrl"
        target="_blank"
        rel="noopener"
      >
        <q-tooltip>{{ t('Open raw results in a new tab') }}</q-tooltip>
      </q-btn>
    </q-card-section>
    <q-separator />

    <q-card-section v-if="loading && !results">
      <q-skeleton type="text" width="60%" />
      <q-skeleton type="rect" height="80px" class="q-mt-sm" />
    </q-card-section>

    <q-card-section v-else-if="error">
      <q-banner dense rounded class="bg-red-1 text-negative">
        <template #avatar><q-icon name="error" color="negative" /></template>
        <div class="text-weight-bold">{{ error.title || t('Failed to load results') }}</div>
        <div v-if="error.detail" class="text-body2">{{ error.detail }}</div>
      </q-banner>
    </q-card-section>

    <q-card-section v-else-if="entries.length">
      <div v-for="entry in entries" :key="entry.id" class="result-entry q-mb-md">
        <div class="row items-center q-mb-xs">
          <q-chip dense square color="primary" text-color="white" class="q-mr-sm">{{ entry.id }}</q-chip>
          <q-chip v-if="entry.mediaType" dense square outline color="grey-7">{{ entry.mediaType }}</q-chip>
          <q-space />
          <CopyButton :text="entry.copyText" :label="t('Copy value')" />
        </div>

        <!-- reference -->
        <div v-if="entry.kind === 'href'" class="q-pl-sm">
          <a :href="entry.href" target="_blank" rel="noopener" class="text-primary break-all">{{ entry.href }}</a>
          <q-img
            v-if="entry.isImage"
            :src="entry.href"
            class="q-mt-sm rounded-borders"
            style="max-width: 480px"
            fit="contain"
          />
        </div>

        <!-- geo -->
        <div v-else-if="entry.kind === 'geo'" class="q-pl-sm">
          <GeoPreview :geojson="entry.geojson" :bbox="entry.bbox" height="300px" />
          <q-list v-if="assetLinks(entry.value).length" dense class="q-mt-sm">
            <q-item v-for="asset in assetLinks(entry.value)" :key="asset.id" dense class="q-px-none">
              <q-item-section avatar class="q-pr-sm" style="min-width: 0">
                <q-icon :name="asset.isImage ? 'image' : 'attachment'" size="xs" color="grey-7" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-body2">
                  <span class="text-weight-medium">{{ asset.title }}</span>
                  <q-chip v-if="asset.mediaType" dense square outline color="grey-7" class="q-ml-xs">{{ asset.mediaType }}</q-chip>
                </q-item-label>
                <q-item-label caption class="break-all">
                  <a v-if="/^https?:/i.test(asset.href)" :href="asset.href" target="_blank" rel="noopener" class="text-primary">{{ asset.href }}</a>
                  <span v-else>{{ asset.href }}</span>
                </q-item-label>
                <q-img v-if="asset.isImage" :src="asset.href" class="q-mt-xs rounded-borders" style="max-width: 480px" fit="contain" />
              </q-item-section>
            </q-item>
          </q-list>
          <q-expansion-item dense :label="t('Show JSON')" class="q-mt-sm">
            <JsonBlock :value="entry.value" />
          </q-expansion-item>
        </div>

        <!-- scalar -->
        <div v-else-if="entry.kind === 'scalar'" class="q-pl-sm text-body1 break-all">
          <a v-if="entry.isUrl" :href="entry.text" target="_blank" rel="noopener" class="text-primary">{{ entry.text }}</a>
          <span v-else>{{ entry.text }}</span>
        </div>

        <!-- anything else -->
        <div v-else class="q-pl-sm">
          <JsonBlock :value="entry.value" max-height="320px" />
        </div>
      </div>

      <q-expansion-item dense icon="data_object" :label="t('Raw results document')">
        <JsonBlock :value="results" />
      </q-expansion-item>
    </q-card-section>

    <q-card-section v-else class="text-grey-7">
      {{ t('No results available for this job.') }}
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CopyButton from '~/components/common/CopyButton.vue'
import JsonBlock from '~/components/common/JsonBlock.vue'
import GeoPreview from '~/components/common/GeoPreview.vue'
import { isExceptionDocument, parseMultipartResults, resultsHref } from '~/composables/utils/jobs'
import type { OgcApiError } from '~/composables/utils/ogcError'

const props = defineProps<{ jobId: string; status?: string | null; links?: any[] }>()
const { t } = useI18n()
const { getJobResults } = useJobsApi()

const results = ref<any>(null)
const loading = ref(false)
const error = ref<OgcApiError | null>(null)

const resultsUrl = computed(() => resultsHref({ links: props.links }))

const isUrl = (value: unknown) => typeof value === 'string' && /^(https?|s3|gs|ftp):\/\//i.test(value)
const isImageHref = (href: string, mediaType?: string) =>
  /^image\//i.test(mediaType || '') || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(href)

const isGeo = (value: any) =>
  value &&
  typeof value === 'object' &&
  (value.type === 'FeatureCollection' || value.type === 'Feature' || Array.isArray(value.bbox))

const entries = computed(() => {
  const doc = results.value
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return doc === null || doc === undefined
      ? []
      : [toEntry('result', doc)]
  }
  // CWL (DRU) jobs answer with the STAC FeatureCollection itself, not with a
  // map of outputs: show it as one geographic result instead of one entry per key.
  if (isGeo(doc)) return [toEntry('result', doc)]
  return Object.entries(doc).map(([id, value]) => toEntry(id, value))
})

// STAC items carry their files in `assets`: list them as links under the map.
const assetLinks = (value: any) => {
  const features = value?.type === 'FeatureCollection' ? value.features || [] : value?.type === 'Feature' ? [value] : []
  const links: { id: string; href: string; title: string; mediaType?: string; isImage: boolean }[] = []
  for (const feature of features) {
    for (const [key, asset] of Object.entries(feature?.assets || {})) {
      const href = (asset as any)?.href
      if (typeof href !== 'string') continue
      const mediaType = (asset as any)?.type
      links.push({
        id: `${feature.id || 'item'}/${key}`,
        href,
        title: (asset as any)?.title || key,
        mediaType,
        isImage: isImageHref(href, mediaType) && /^https?:/i.test(href)
      })
    }
  }
  return links
}

function toEntry(id: string, raw: any) {
  let value = raw
  let mediaType: string | undefined
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    mediaType = value.mediaType || value.format?.mediaType || value.type
    if ('href' in value && typeof value.href === 'string') {
      return {
        id,
        kind: 'href',
        href: value.href,
        mediaType: value.mediaType || value.type,
        isImage: isImageHref(value.href, value.mediaType || value.type),
        value,
        copyText: value.href
      }
    }
    if ('value' in value && Object.keys(value).every((k) => ['value', 'mediaType', 'format', 'encoding', 'schema'].includes(k))) {
      value = value.value
    }
  }
  if (isGeo(value)) {
    const geojson = value.type ? value : null
    const bbox = Array.isArray(value.bbox) && value.bbox.length >= 4 ? value.bbox.slice(0, 4) : null
    return { id, kind: 'geo', geojson, bbox, value, mediaType, copyText: JSON.stringify(value) }
  }
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    const text = String(value)
    return { id, kind: 'scalar', text, isUrl: isUrl(text), value, mediaType, copyText: text }
  }
  return { id, kind: 'json', value, mediaType, copyText: JSON.stringify(value, null, 2) }
}

const load = async () => {
  if (!props.jobId) return
  loading.value = true
  error.value = null
  try {
    const doc = await getJobResults(props.jobId)
    // A failed job answers its results request with an exception document
    // (sometimes with a 200): show it as an error, not as outputs.
    if (isExceptionDocument(doc)) {
      error.value = {
        status: 200,
        title: doc.title,
        type: doc.type,
        detail: doc.detail,
        raw: doc,
        message: doc.detail || doc.title || ''
      } as OgcApiError
      results.value = null
    } else {
      // Multi-output jobs run in "raw" mode answer with a multipart document.
      results.value = parseMultipartResults(doc) ?? doc
    }
  } catch (err: any) {
    error.value = err
    results.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.status, (status, previous) => {
  if (status !== previous && status) load()
})

defineExpose({ load })
</script>

<style scoped>
.break-all {
  word-break: break-all;
}
.result-entry + .result-entry {
  border-top: 1px dashed #e0e0e0;
  padding-top: 12px;
}
</style>
