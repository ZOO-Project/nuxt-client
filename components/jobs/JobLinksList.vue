<template>
  <q-card flat bordered class="q-mb-md">
    <q-card-section class="row items-center q-py-sm">
      <q-icon :name="icon" size="sm" class="q-mr-sm text-primary" />
      <div class="text-subtitle1 text-weight-bold">{{ title }}</div>
      <q-badge v-if="links.length" color="grey-6" class="q-ml-sm">{{ links.length }}</q-badge>
    </q-card-section>
    <q-separator />
    <q-list v-if="links.length" separator dense>
      <q-expansion-item
        v-for="(link, index) in links"
        :key="index"
        :group="group"
        dense
        expand-icon-toggle
        :model-value="false"
        @show="loadContent(index, link)"
      >
        <template #header>
          <q-item-section avatar>
            <q-chip dense square outline color="primary" class="rel-chip">{{ linkRelLabel(link.rel) }}</q-chip>
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ link.title || link.href }}</q-item-label>
            <q-item-label caption class="break-all">{{ link.href }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center no-wrap">
              <CopyButton :text="link.href" :label="t('Copy link')" />
              <q-btn flat dense round icon="open_in_new" :href="link.href" target="_blank" rel="noopener" @click.stop>
                <q-tooltip>{{ t('Open in a new tab') }}</q-tooltip>
              </q-btn>
            </div>
          </q-item-section>
        </template>
        <q-card>
          <q-card-section class="q-pt-none">
            <q-inner-loading :showing="!!loadingIndex[index]" />
            <q-banner v-if="errors[index]" dense rounded class="bg-red-1 text-negative">
              {{ errors[index] }}
            </q-banner>
            <pre v-else-if="contents[index] !== undefined" class="link-content">{{ contents[index] }}</pre>
          </q-card-section>
        </q-card>
      </q-expansion-item>
    </q-list>
    <q-card-section v-else class="text-grey-7">{{ emptyText }}</q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import CopyButton from '~/components/common/CopyButton.vue'
import { linkRelLabel } from '~/composables/utils/jobs'
import { errorSummary } from '~/composables/utils/ogcError'

const props = withDefaults(
  defineProps<{ links: any[]; title: string; icon?: string; emptyText?: string; group?: string; asText?: boolean }>(),
  { icon: 'link', emptyText: '', group: 'links', asText: false }
)
const { t } = useI18n()
const { fetchLink } = useJobsApi()

const contents = reactive<Record<number, string>>({})
const errors = reactive<Record<number, string>>({})
const loadingIndex = reactive<Record<number, boolean>>({})

const loadContent = async (index: number, link: any) => {
  if (contents[index] !== undefined || loadingIndex[index]) return
  loadingIndex[index] = true
  delete errors[index]
  try {
    const asText = props.asText || /text\//i.test(link.type || '')
    const body = await fetchLink(link.href, asText)
    contents[index] = typeof body === 'string' ? body : JSON.stringify(body, null, 2)
  } catch (err) {
    errors[index] = errorSummary(err, t('Failed to fetch link content'))
  } finally {
    loadingIndex[index] = false
  }
}
</script>

<style scoped>
.break-all {
  word-break: break-all;
}
.rel-chip {
  font-size: 11px;
}
.link-content {
  max-height: 420px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  background: var(--surface-code, #f4f4f4);
  color: inherit;
  border-radius: 8px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
