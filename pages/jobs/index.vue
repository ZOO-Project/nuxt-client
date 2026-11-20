<template>
  <q-page class="q-pa-sm">
    <div class="row justify-center">
      <div class="col-12 q-pa-md" style="max-width: 1280px;">
        <div class="row items-center q-mb-sm">
          <div class="text-h4 text-weight-bold">{{ t('Jobs List') }}</div>
          <q-btn flat icon="help_outline" color="primary" :label="t('Help')" class="q-ml-sm" @click="helpVisible = true" />
          <q-space />
          <q-toggle v-model="autoRefresh" :label="t('Auto-refresh')" dense class="q-mr-md">
            <q-tooltip>{{ t('Reload the list every few seconds while jobs are running') }}</q-tooltip>
          </q-toggle>
          <q-btn flat dense icon="refresh" :loading="loading" @click="refresh">
            <q-tooltip>{{ t('Refresh') }}</q-tooltip>
          </q-btn>
        </div>

        <HelpDialog v-model="helpVisible" :title="t('Jobs List Help')">
          <div v-if="helpContent" v-html="helpContent" />
        </HelpDialog>

        <q-banner v-if="!canUseApi" dense rounded class="bg-orange-1 text-orange-10 q-mb-md">
          <template #avatar><q-icon name="lock" color="orange-10" /></template>
          {{ t('Sign in to list the jobs of this server.') }}
        </q-banner>

        <q-banner v-if="loadError" dense rounded class="bg-red-1 text-negative q-mb-md">
          <template #avatar><q-icon name="error" color="negative" /></template>
          {{ loadError }}
        </q-banner>

        <!-- Filters -->
        <q-card flat bordered class="q-pa-sm q-mb-md">
          <div class="row q-col-gutter-sm items-center">
            <div class="col-12 col-md-3">
              <q-select
                v-model="statusFilter"
                :options="statusOptions"
                multiple
                emit-value
                map-options
                dense
                filled
                clearable
                use-chips
                :label="t('Status')"
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <q-icon :name="statusIcon(scope.opt.value)" :color="statusColor(scope.opt.value)" />
                    </q-item-section>
                    <q-item-section>{{ scope.opt.label }}</q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
            <div class="col-12 col-md-3">
              <q-select
                v-model="processFilter"
                :options="processOptions"
                dense
                filled
                clearable
                use-input
                input-debounce="200"
                :label="t('Process')"
                @filter="filterProcesses"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="search" dense filled clearable debounce="300" :label="t('Search in this page (job ID, message)')">
                <template #prepend><q-icon name="search" /></template>
              </q-input>
            </div>
            <div class="col-12 col-md-2 text-right">
              <q-btn
                v-if="selected.length"
                color="negative"
                outline
                dense
                icon="delete"
                :label="t('Delete selected ({n})', { n: selected.length })"
                @click="confirmDeleteSelected"
              />
            </div>
          </div>
        </q-card>

        <q-table
          v-model:pagination="pagination"
          v-model:selected="selected"
          :rows="filteredRows"
          :columns="columns"
          row-key="jobID"
          :loading="loading"
          selection="multiple"
          flat
          bordered
          binary-state-sort
          :rows-per-page-options="[10, 20, 50, 100]"
          class="jobs-table rounded-borders"
          @request="onRequest"
          @row-click="(_, row) => viewJob(row)"
        >
          <template #body-cell-status="props">
            <q-td :props="props">
              <JobStatusChip :status="props.row.status" />
              <q-linear-progress
                v-if="isActiveStatus(props.row.status) && props.row.progress !== undefined"
                :value="(props.row.progress || 0) / 100"
                color="primary"
                size="4px"
                class="q-mt-xs"
                rounded
              />
            </q-td>
          </template>

          <template #body-cell-jobID="props">
            <q-td :props="props" class="mono">
              <span :title="props.row.jobID">{{ shortId(props.row.jobID) }}</span>
              <CopyButton :text="props.row.jobID" :label="t('Copy job ID')" />
            </q-td>
          </template>

          <template #body-cell-processID="props">
            <q-td :props="props">
              <NuxtLink :to="`/processes/${props.row.processID}`" class="text-primary" @click.stop>
                {{ props.row.processID }}
              </NuxtLink>
            </q-td>
          </template>

          <template #body-cell-created="props">
            <q-td :props="props">
              <span>{{ formatDateTime(props.row.created, locale) }}</span>
              <q-tooltip>{{ relativeTime(props.row.created, now, locale) }} · {{ props.row.created }}</q-tooltip>
            </q-td>
          </template>

          <template #body-cell-duration="props">
            <q-td :props="props">{{ formatDurationMs(jobDurationMs(props.row, now)) }}</q-td>
          </template>

          <template #body-cell-message="props">
            <q-td :props="props" class="message-cell">
              <span :title="props.row.message">{{ props.row.message }}</span>
            </q-td>
          </template>

          <template #body-cell-actions="props">
            <q-td :props="props" class="text-right" @click.stop>
              <q-btn flat dense round icon="visibility" @click="viewJob(props.row)">
                <q-tooltip>{{ t('View') }}</q-tooltip>
              </q-btn>
              <q-btn
                v-if="resultsHref(props.row)"
                flat
                dense
                round
                icon="output"
                :href="resultsHref(props.row)"
                target="_blank"
                rel="noopener"
              >
                <q-tooltip>{{ t('Open results') }}</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                :icon="isActiveStatus(props.row.status) ? 'cancel' : 'delete'"
                color="negative"
                @click="confirmDelete(props.row)"
              >
                <q-tooltip>{{ isActiveStatus(props.row.status) ? t('Dismiss') : t('Delete') }}</q-tooltip>
              </q-btn>
            </q-td>
          </template>

          <template #no-data>
            <div class="full-width row flex-center text-grey-7 q-py-lg">
              <q-icon name="inbox" size="md" class="q-mr-sm" />
              {{ t('No jobs match the current filters.') }}
            </div>
          </template>
        </q-table>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import HelpDialog from '~/components/help/HelpDialog.vue'
import jobListHelp from '~/components/help/jobListHelp.js'
import JobStatusChip from '~/components/jobs/JobStatusChip.vue'
import CopyButton from '~/components/common/CopyButton.vue'
import {
  JOB_STATUSES,
  formatDateTime,
  formatDurationMs,
  isActiveStatus,
  jobDurationMs,
  relativeTime,
  newestFirstWindow,
  resultsHref,
  statusColor,
  statusIcon
} from '~/composables/utils/jobs'
import { errorSummary } from '~/composables/utils/ogcError'

const { t, locale } = useI18n()
const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const { listJobs, dismissJob } = useJobsApi()
const { apiFetch, waitUntilReady, isReady } = useOgcApiServer()

const helpVisible = ref(false)
const helpContent = jobListHelp

const rows = ref<any[]>([])
const loading = ref(false)
const loadError = ref('')
const canUseApi = ref(true)
const selected = ref<any[]>([])
const search = ref('')
const autoRefresh = ref(true)
const now = ref(Date.now())

const queryStatus = String(route.query.status || '')
const statusFilter = ref<string[]>(queryStatus ? queryStatus.split(',').filter(Boolean) : [])
const processFilter = ref<string | null>((route.query.processID as string) || null)
const allProcessIds = ref<string[]>([])
const processOptions = ref<string[]>([])

const pagination = ref({
  sortBy: 'created',
  descending: true,
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0
})

const statusOptions = computed(() => JOB_STATUSES.map((s) => ({ label: t(`status.${s}`), value: s })))

const columns = computed(() => [
  { name: 'status', label: t('Status'), field: 'status', align: 'left', sortable: false, style: 'width: 140px' },
  { name: 'jobID', label: t('Job ID'), field: 'jobID', align: 'left', style: 'width: 170px' },
  { name: 'processID', label: t('Process'), field: 'processID', align: 'left', sortable: true },
  { name: 'created', label: t('Created'), field: 'created', align: 'left', sortable: true, style: 'width: 180px' },
  { name: 'duration', label: t('Duration'), field: 'duration', align: 'left', style: 'width: 110px' },
  { name: 'message', label: t('Message'), field: 'message', align: 'left' },
  { name: 'actions', label: '', field: 'actions', align: 'right', style: 'width: 130px' }
])

const shortId = (id: string) => (id && id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id)

const filteredRows = computed(() => {
  const term = (search.value || '').trim().toLowerCase()
  if (!term) return rows.value
  return rows.value.filter(
    (job) =>
      String(job.jobID || '').toLowerCase().includes(term) ||
      String(job.message || '').toLowerCase().includes(term) ||
      String(job.processID || '').toLowerCase().includes(term)
  )
})

const hasActiveJobs = computed(() => rows.value.some((job) => isActiveStatus(job.status)))

const fetchPage = async (page = pagination.value.page, rowsPerPage = pagination.value.rowsPerPage) => {
  loading.value = true
  loadError.value = ''
  try {
    const ready = await waitUntilReady()
    canUseApi.value = ready
    if (!ready) {
      rows.value = []
      return
    }
    const limit = rowsPerPage || 20
    const filters = { status: statusFilter.value, processID: processFilter.value || undefined }
    // The server lists jobs oldest first and has no sort parameter: read the
    // window from the end of the list so that page 1 shows the latest jobs.
    const probe = await listJobs({ limit: 1, ...filters })
    const total = Number(probe?.numberTotal ?? 0)
    const window = newestFirstWindow(total, page, limit)
    const result = await listJobs({ limit: window.limit, skip: window.skip, ...filters })
    let jobs = result?.jobs || []
    if (pagination.value.sortBy) {
      const key = pagination.value.sortBy
      const dir = pagination.value.descending ? -1 : 1
      jobs = [...jobs].sort((a, b) => (String(a[key] || '') > String(b[key] || '') ? dir : -dir))
    }
    rows.value = jobs
    pagination.value = {
      ...pagination.value,
      page,
      rowsPerPage: limit,
      rowsNumber: Number(result?.numberTotal ?? total)
    }
    now.value = Date.now()
  } catch (err) {
    loadError.value = errorSummary(err, t('Failed to fetch jobs list'))
  } finally {
    loading.value = false
  }
}

const onRequest = (props: any) => {
  const { page, rowsPerPage, sortBy, descending } = props.pagination
  pagination.value = { ...pagination.value, sortBy, descending }
  fetchPage(page, rowsPerPage)
}

const refresh = () => fetchPage()

const viewJob = (row: any) => router.push(`/jobs/${row.jobID}`)

const deleteJobs = async (jobs: any[]) => {
  let failures = 0
  for (const job of jobs) {
    try {
      await dismissJob(job.jobID)
    } catch (err) {
      failures += 1
      $q.notify({ type: 'negative', message: errorSummary(err, t('Failed to delete job')) })
    }
  }
  if (failures < jobs.length) {
    $q.notify({ type: 'positive', message: t('Job deleted successfully') })
  }
  selected.value = []
  // The server may still list a job for a moment after its DELETE answered:
  // drop the deleted rows right away and refresh the page a little later.
  const deleted = new Set(jobs.map((job) => job.jobID))
  rows.value = rows.value.filter((row) => !deleted.has(row.jobID))
  pagination.value.rowsNumber = Math.max(0, (pagination.value.rowsNumber || 0) - jobs.length)
  await new Promise((resolve) => setTimeout(resolve, 800))
  await fetchPage()
}

const confirmDelete = (row: any) => {
  const active = isActiveStatus(row.status)
  $q.dialog({
    title: active ? t('Dismiss job') : t('Delete job'),
    message: active
      ? t('The running job will be dismissed and removed. Continue?')
      : t('The job and its results will be removed from the server. Continue?'),
    cancel: true,
    persistent: true,
    ok: { label: active ? t('Dismiss') : t('Delete'), color: 'negative' }
  }).onOk(() => deleteJobs([row]))
}

const confirmDeleteSelected = () => {
  $q.dialog({
    title: t('Delete selected jobs'),
    message: t('{n} job(s) will be removed from the server. Continue?', { n: selected.value.length }),
    cancel: true,
    persistent: true,
    ok: { label: t('Delete'), color: 'negative' }
  }).onOk(() => deleteJobs(selected.value))
}

const loadProcesses = async () => {
  try {
    const result = await apiFetch<any>('/processes', { query: { f: 'json' }, acceptLanguage: locale.value })
    allProcessIds.value = (result?.processes || []).map((p: any) => p.id).sort()
    processOptions.value = allProcessIds.value
  } catch {
    // the filter simply stays free-text
  }
}

const filterProcesses = (val: string, update: (fn: () => void) => void) => {
  update(() => {
    const needle = val.toLowerCase()
    processOptions.value = needle ? allProcessIds.value.filter((id) => id.toLowerCase().includes(needle)) : allProcessIds.value
  })
}

const syncQuery = () => {
  const query: Record<string, string> = {}
  if (statusFilter.value.length) query.status = statusFilter.value.join(',')
  if (processFilter.value) query.processID = processFilter.value
  router.replace({ query })
}

watch([statusFilter, processFilter], () => {
  syncQuery()
  fetchPage(1)
})

let timer: ReturnType<typeof setInterval> | null = null
let ticks = 0
const startTimer = () => {
  stopTimer()
  timer = setInterval(() => {
    now.value = Date.now()
    ticks += 1
    if (!autoRefresh.value || loading.value || !isReady()) return
    // every 5 s while jobs are active, every 30 s otherwise
    if (hasActiveJobs.value || ticks % 6 === 0) fetchPage()
  }, 5000)
}
const stopTimer = () => {
  if (timer) clearInterval(timer)
  timer = null
}

onMounted(async () => {
  await Promise.all([fetchPage(), loadProcesses()])
  startTimer()
})
onBeforeUnmount(stopTimer)
</script>

<style scoped>
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
}
.message-cell {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jobs-table :deep(tbody tr) {
  cursor: pointer;
}
</style>
