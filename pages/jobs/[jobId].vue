<template>
  <q-page class="q-pa-md">
    <div class="row justify-center">
      <div class="col-12" style="max-width: 1100px;">
        <q-breadcrumbs class="q-mb-sm text-grey-7">
          <q-breadcrumbs-el :label="t('Jobs')" to="/jobs" icon="work" />
          <q-breadcrumbs-el :label="shortId" />
        </q-breadcrumbs>

        <q-banner v-if="!canUseApi" dense rounded class="bg-orange-1 text-orange-10 q-mb-md">
          <template #avatar><q-icon name="lock" color="orange-10" /></template>
          {{ t('Sign in to view this job.') }}
        </q-banner>

        <q-banner v-if="loadError" dense rounded class="bg-red-1 text-negative q-mb-md">
          <template #avatar><q-icon name="error" color="negative" /></template>
          {{ loadError }}
        </q-banner>

        <template v-if="job">
          <!-- Header card -->
          <q-card flat bordered class="q-mb-md">
            <q-card-section>
              <div class="row items-center q-col-gutter-sm">
                <div class="col-auto">
                  <JobStatusChip :status="job.status" />
                </div>
                <div class="col" style="min-width: 0">
                  <div class="text-h5 text-weight-bold">
                    <NuxtLink :to="`/processes/${job.processID}`" class="text-primary">{{ job.processID }}</NuxtLink>
                  </div>
                  <div class="text-caption text-grey-7 mono row items-center">
                    <span style="word-break: break-all">{{ job.jobID }}</span>
                    <CopyButton :text="job.jobID" :label="t('Copy job ID')" />
                  </div>
                </div>
                <!-- On phones the actions take their own line instead of overlapping the identifier. -->
                <div class="col-12 col-sm-auto row items-center justify-end q-gutter-xs">
                  <q-btn flat dense icon="refresh" :loading="loading" @click="load">
                    <q-tooltip>{{ t('Refresh') }}</q-tooltip>
                  </q-btn>
                  <q-btn flat dense icon="link" @click="copyPageUrl">
                    <q-tooltip>{{ t('Copy the link to this page') }}</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="isActive"
                    color="negative"
                    outline
                    dense
                    icon="cancel"
                    :label="t('Dismiss')"
                    :loading="deleting"
                    @click="confirmDelete"
                  />
                  <q-btn
                    v-else
                    color="negative"
                    outline
                    dense
                    icon="delete"
                    :label="t('Delete')"
                    :loading="deleting"
                    @click="confirmDelete"
                  />
                </div>
              </div>

              <div v-if="isActive" class="q-mt-md">
                <q-linear-progress
                  :value="(job.progress ?? 0) / 100"
                  :indeterminate="job.progress === undefined"
                  color="primary"
                  size="10px"
                  rounded
                  animated
                />
                <div class="row justify-between text-caption q-mt-xs">
                  <span>{{ job.message || t('Processing...') }}</span>
                  <span class="text-weight-bold">{{ job.progress ?? 0 }}%</span>
                </div>
              </div>
              <div v-else-if="job.message" class="q-mt-md text-body2" :class="isFailed ? 'text-negative' : 'text-grey-8'">
                {{ job.message }}
              </div>
            </q-card-section>

            <q-separator />

            <!-- Timeline -->
            <q-card-section class="row q-col-gutter-md">
              <div v-for="step in timeline" :key="step.key" class="col-6 col-md-3">
                <div class="text-caption text-grey-7">{{ step.label }}</div>
                <div class="text-body2" :title="step.iso || ''">{{ step.text || '—' }}</div>
              </div>
              <div class="col-6 col-md-3">
                <div class="text-caption text-grey-7">{{ t('Duration') }}</div>
                <div class="text-body2">{{ duration || '—' }}</div>
              </div>
            </q-card-section>
          </q-card>

          <!-- Results -->
          <JobResultsPanel
            v-if="isSuccessful || isFailed"
            ref="resultsPanel"
            :job-id="jobId"
            :status="job.status"
            :links="job.links"
          />

          <!-- Logs -->
          <JobLinksList
            v-if="logLinks.length"
            :links="logLinks"
            :title="t('Logs')"
            icon="article"
            group="logs"
            as-text
          />

          <!-- Links -->
          <JobLinksList :links="otherLinks" :title="t('Links')" :empty-text="t('No links')" group="links" />

          <q-expansion-item dense icon="data_object" :label="t('Raw job document')" class="q-mb-lg">
            <JsonBlock :value="job" />
          </q-expansion-item>
        </template>

        <div v-else-if="loading" class="q-mt-lg">
          <q-skeleton type="rect" height="120px" />
          <q-skeleton type="rect" height="200px" class="q-mt-md" />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useQuasar, copyToClipboard } from 'quasar'
import JobStatusChip from '~/components/jobs/JobStatusChip.vue'
import JobResultsPanel from '~/components/jobs/JobResultsPanel.vue'
import JobLinksList from '~/components/jobs/JobLinksList.vue'
import CopyButton from '~/components/common/CopyButton.vue'
import JsonBlock from '~/components/common/JsonBlock.vue'
import {
  formatDateTime,
  formatDurationMs,
  isActiveStatus,
  isLogLink,
  isTerminalStatus,
  jobDurationMs,
  normalizeStatus
} from '~/composables/utils/jobs'
import { errorSummary } from '~/composables/utils/ogcError'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const $q = useQuasar()
const { getJob, dismissJob } = useJobsApi()
const { waitUntilReady } = useOgcApiServer()

const jobId = String(route.params.jobId)
const job = ref<any>(null)
const loading = ref(false)
const deleting = ref(false)
const loadError = ref('')
const canUseApi = ref(true)
const now = ref(Date.now())
const resultsPanel = ref<InstanceType<typeof JobResultsPanel> | null>(null)

const shortId = computed(() => (jobId.length > 13 ? `${jobId.slice(0, 8)}…${jobId.slice(-4)}` : jobId))
const status = computed(() => normalizeStatus(job.value?.status))
const isActive = computed(() => isActiveStatus(status.value))
const isSuccessful = computed(() => status.value === 'successful')
const isFailed = computed(() => status.value === 'failed')

const timeline = computed(() => {
  const steps = [
    { key: 'created', label: t('Created') },
    { key: 'started', label: t('Started') },
    { key: 'updated', label: t('Updated') },
    { key: 'finished', label: t('Finished') }
  ]
  return steps.map((step) => ({
    ...step,
    iso: job.value?.[step.key],
    text: formatDateTime(job.value?.[step.key], locale.value)
  }))
})

const duration = computed(() => formatDurationMs(jobDurationMs(job.value, now.value)))

const logLinks = computed(() => (job.value?.links || []).filter((link: any) => isLogLink(link)))
const otherLinks = computed(() => (job.value?.links || []).filter((link: any) => !isLogLink(link)))

let timer: ReturnType<typeof setTimeout> | null = null
let polls = 0

const scheduleNext = () => {
  stopPolling()
  if (!job.value || isTerminalStatus(job.value.status)) return
  // 3 s for the first two minutes, then 10 s
  const delay = polls < 40 ? 3000 : 10000
  timer = setTimeout(load, delay)
}

const stopPolling = () => {
  if (timer) clearTimeout(timer)
  timer = null
}

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const ready = await waitUntilReady()
    canUseApi.value = ready
    if (!ready) return
    job.value = await getJob(jobId)
    now.value = Date.now()
    polls += 1
    scheduleNext()
  } catch (err: any) {
    loadError.value = errorSummary(err, t('Failed to load the job'))
    if (err?.status === 404) stopPolling()
    else scheduleNext()
  } finally {
    loading.value = false
  }
}

const copyPageUrl = async () => {
  try {
    await copyToClipboard(window.location.href)
    $q.notify({ type: 'positive', message: t('Link copied') })
  } catch {
    /* ignore */
  }
}

const confirmDelete = () => {
  const active = isActive.value
  $q.dialog({
    title: active ? t('Dismiss job') : t('Delete job'),
    message: active
      ? t('The running job will be dismissed and removed. Continue?')
      : t('The job and its results will be removed from the server. Continue?'),
    cancel: true,
    persistent: true,
    ok: { label: active ? t('Dismiss') : t('Delete'), color: 'negative' }
  }).onOk(async () => {
    deleting.value = true
    try {
      await dismissJob(jobId)
      stopPolling()
      $q.notify({ type: 'positive', message: t('Job deleted successfully') })
      router.push('/jobs')
    } catch (err) {
      $q.notify({ type: 'negative', message: errorSummary(err, t('Failed to delete job')) })
    } finally {
      deleting.value = false
    }
  })
}

let clock: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 1000)
  load()
})
onBeforeUnmount(() => {
  stopPolling()
  if (clock) clearInterval(clock)
})
</script>

<style scoped>
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
