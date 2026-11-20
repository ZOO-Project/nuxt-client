<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from '#imports'
import { useI18n } from 'vue-i18n'
import { QCard, QCardSection, QInput, QBtn, QDialog, QForm, QUploader, QSpinnerGears, Notify } from 'quasar'
import HelpDialog from '../../components/help/HelpDialog.vue'
import processListHelp from '../../components/help/processListHelp.js'

import AppDialog from '~/components/modal/AppDialog.vue'
import CwlGraph from '~/components/common/CwlGraph.vue'

import yaml from 'js-yaml'
import { nextTick, watch } from 'vue'
import { Dialog, useQuasar } from 'quasar'
import { summarizeCwl, validateCwlText } from '~/composables/utils/cwl'
import { errorSummary } from '~/composables/utils/ogcError'


const authStore = useAuthStore()
const { locale, t } = useI18n()
const { buildOgcApiUrl, getRequestHeaders, apiFetch } = useOgcApiServer()
const loadingBar = useGlobalLoading()
const $q = useQuasar()
const isDark = computed(() => $q.dark.isActive)

const data = ref<any>(null)
const filter = ref('')
const router = useRouter()
const modalContent = ref<string | null>(null)
const packageError = ref<string | null>(null)
const showModal = ref(false)
const selectedPackageProcessId = ref('')



const helpVisible = ref(false)
const helpContent = processListHelp


const loadingCwl = ref(false)
const cwlText = ref<string | null>(null)
const cwlError = ref<string | null>(null)
const selectedProcess = ref<Record<string, any> | null>(null)

const dialog = ref(false)
const processName = ref('')
const fileContent = ref('')
const file = ref<File | null>(null)
const deployMode = ref<'file' | 'paste' | 'url'>('file')
const packageUrl = ref('')
const replaceTarget = ref<string | null>(null)
const deploying = ref(false)
const uploader = ref<any>(null)

const cwlSummary = computed(() => (fileContent.value?.trim() ? summarizeCwl(fileContent.value) : null))
// The graph is redrawn from the pasted text, a little after the user stops typing.
const graphSource = ref('')
let graphTimer: ReturnType<typeof setTimeout> | null = null
watch(fileContent, (text) => {
  if (graphTimer) clearTimeout(graphTimer)
  graphTimer = setTimeout(() => {
    graphSource.value = text?.trim() ? text : ''
  }, 600)
}, { immediate: true })
const cwlValidation = computed(() => (fileContent.value?.trim() ? validateCwlText(fileContent.value) : null))

// Suggest the process identifier from the package itself.
watch(cwlSummary, (summary) => {
  if (!replaceTarget.value && summary?.id && !processName.value) {
    processName.value = summary.id
  }
})



//basic helpers 
function debug(msg: string) { console.log('[proc:index] ', msg) }

const viewProcess = (row: any) => {
  router.push(`/processes/${row.id}`)
}

// fetch package 
const packageProcess = async (row: any) => {
  selectedPackageProcessId.value = row.id //store Id for filename
  modalContent.value = null
  packageError.value = null
  try {
    const packageUrl = await buildOgcApiUrl(`/processes/${row.id}/package`, {
      acceptLanguage: locale.value
    })
    const response = await fetch(packageUrl, {
      method: 'GET',
      headers: {
        "Accept": "application/cwl+yaml",
        ...getRequestHeaders(locale.value)
      }
    })
    if (response.ok) {
      modalContent.value = await response.text()
    } else if (response.status === 404) {
      packageError.value = t(
        'Application package is not available. It may have been removed after a service restart.'
      )
    } else {
      packageError.value = t(
        'Failed to load application package.'
      )
    }

    showModal.value = true
  } catch (error) {
    console.error('Application Package request failed', error)
    packageError.value = t(
      'Unable to reach the server to retrieve the application package.'
    )
    showModal.value = true
  }
}

const downloadCWL = () => {
  if (!modalContent.value) return;

  // Create a blob from the modal content
  const blob = new Blob([modalContent.value], {
    type: "text/yaml"
  });

  // Create a temporary download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  // Use processId from packageProcess()
  const filename = `${selectedPackageProcessId.value || 'application-package'}.cwl`

  a.href = url;
  a.download = filename
  a.click();

  // Clean up
  URL.revokeObjectURL(url);
};

// Preview: fetch the process description and its application package; the graph
// itself is drawn by <CwlGraph> (cwl-svg).
const visualizeCwl = async (row: any) => {
  loadingCwl.value = true
  cwlText.value = null
  cwlError.value = null
  try {
    const metaUrl = await buildOgcApiUrl(`/processes/${row.id}`, { acceptLanguage: locale.value })
    const metaRes = await fetch(metaUrl, {
      headers: { Accept: 'application/json', ...getRequestHeaders(locale.value) }
    })
    if (metaRes.ok) selectedProcess.value = await metaRes.json()

    const url = await buildOgcApiUrl(`/processes/${row.id}/package`, { acceptLanguage: locale.value })
    const res = await fetch(url, {
      headers: { Accept: 'application/cwl+yaml', ...getRequestHeaders(locale.value) }
    })
    if (!res.ok) {
      cwlError.value =
        res.status === 404 || res.status === 406
          ? t('Application package is not available. It may have been removed after a service restart.')
          : t('Failed to load application package.')
      return
    }
    cwlText.value = await res.text()
  } catch (err: any) {
    cwlError.value = errorSummary(err, t('Unable to reach the server to retrieve the application package.'))
  } finally {
    loadingCwl.value = false
  }
}

const iconMap: Record<string, string> = {
  softwareVersion: "apps",
  author: "person",
  contributor: "group",
  organization: "business",
  license: "description",
  keywords: "tag",
  address: 'place',
  codeRepository: "cloud_upload",
};


const SCHEMA_INTERNAL_KEYS = ['class', '@context', '@type'];

const extractMetaType = (role: string) => {
  if (!role) return '';
  return role.split("/").pop(); 
}; 

const isUrl = (value) => {
  if (typeof value !== "string") return false;
  return value.startsWith("http://") || value.startsWith("https://");
};

const openSchema = (url) => {
  window.open(url, "_blank");
};


const normalizeType = (type: string) => {
  if (!type) return null;

  // Remove namespace prefix 
  if (type.includes(':')) {
    return type.split(':')[1];
  }

  return type;
};

const getEntityType = (value: any) => {
  const type = value?.['@type'];
  return type ? normalizeType(type) : null;
};


const getEntitySchemaUrl = (value: any) => {
  const type = normalizeType(value?.['@type']);
  return type ? `https://schema.org/${type}` : null;
};

const getRenderableFields = (value: any) => {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).filter(
    ([key]) => !SCHEMA_INTERNAL_KEYS.includes(key)
  )
}

const prettyAddressKey = (key: string) => {
  if (key === 's:addressCountry' || key === 'addressCountry') return 'Country'
  return key
}


const onRowClick = async (evt, row, index) => {
  selectedProcess.value = row

  //  If the process has a package do not open cwl, just open details
  if (row.mutable === false) {
    router.push(`/processes/${row.id}`)
    return
  }

  // Normal process , show CWL preview automatically
  await visualizeCwl(row)
}




// conformance check 
const isConformToCwl = ref(false)
const isCheckingConformance = ref(false)

const checkConformance = async () => {
  isCheckingConformance.value = true
  try {
    const conformanceUrl = await buildOgcApiUrl('/conformance', {
      acceptLanguage: locale.value
    })

    const response = await fetch(conformanceUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getRequestHeaders(locale.value)
      }
    })

    if (response.ok) {
      const conformance = await response.json()

      // Does the API support CWL deployment (OGC API - Processes - Part 2)?
      const cwlConformanceUrl = 'http://www.opengis.net/spec/ogcapi-processes-2/1.0/conf/deploy-replace-undeploy'
      isConformToCwl.value = conformance.conformsTo?.includes(cwlConformanceUrl) || false
    } else {
      console.error('Error fetching conformance:', response.status)
      isConformToCwl.value = false
    }
  } catch (error) {
    console.error('Error fetching conformance', error)
    isConformToCwl.value = false
  } finally {
    isCheckingConformance.value = false
  }
}

// delete process
const deleteProcess = async (row: any) => {
  Dialog.create({
    title: t('Delete process'),
    message: `${t('Are you sure you want to delete the process')} "${row.id}"?`,
    cancel: true,
    persistent: true,
    ok: { label: t('Delete'), color: 'negative' }
  }).onOk(async () => {
    try {
      const processUrl = await buildOgcApiUrl(`/processes/${row.id}`, {
        acceptLanguage: locale.value
      })

      const response = await fetch(processUrl, {
        method: 'DELETE',
        headers: getRequestHeaders(locale.value)
      })
      if (response.ok) {
        Notify.create({ message: t('Process deleted successfully'), type: 'positive' })
        if (selectedProcess.value?.id === row.id) selectedProcess.value = null
        await fetchData()
      } else {
        const detail = await readErrorDetail(response)
        Notify.create({ message: `${t('Process deletion failed')}: ${detail}`, type: 'negative', timeout: 8000 })
      }
    } catch (e) {
      Notify.create({ message: errorSummary(e, t('Delete request failed')), color: 'negative', icon: 'error' })
      console.error(e)
    }
  })
}

// Extract the OGC exception detail from a failed fetch() response.
const readErrorDetail = async (response: Response) => {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text)
    return body?.detail || body?.title || body?.message || `HTTP ${response.status}`
  } catch {
    return text?.slice(0, 300) || `HTTP ${response.status}`
  }
}

// add / replace process dialog
const openDialog = () => {
  replaceTarget.value = null
  dialog.value = true
}

const openReplaceDialog = (row: any) => {
  replaceTarget.value = row.id
  processName.value = row.id
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
  processName.value = ''
  fileContent.value = ''
  packageUrl.value = ''
  file.value = null
  replaceTarget.value = null
  deployMode.value = 'file'
  try {
    uploader.value?.reset?.()
  } catch {
    /* ignore */
  }
}

const onFileAdded = (files: File[]) => {
  if (files.length > 0) {
    file.value = files[0]
    const reader = new FileReader()
    reader.onload = (e) => (fileContent.value = e.target?.result as string)
    reader.readAsText(file.value)
  }
}

const onFileSelected = (selected: File | File[] | null) => {
  const picked = Array.isArray(selected) ? selected[0] : selected
  if (!picked) {
    file.value = null
    fileContent.value = ''
    return
  }
  onFileAdded([picked])
}

const loadPackageFromUrl = async () => {
  const url = packageUrl.value.trim()
  if (!url) return
  try {
    const res = await fetch(url, { headers: { Accept: 'application/cwl+yaml, text/yaml, application/json, */*' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    fileContent.value = await res.text()
    deployMode.value = 'paste'
    Notify.create({ type: 'positive', message: t('Package loaded, review it before deploying.') })
  } catch (err: any) {
    Notify.create({
      type: 'warning',
      timeout: 8000,
      message: t('Could not fetch the package in the browser (CORS?). It will be fetched by the server instead.')
    })
  }
}

const submitForm = async () => {
  if (deploying.value) return
  const isUrlMode = deployMode.value === 'url'

  if (isUrlMode) {
    if (!packageUrl.value.trim()) {
      Notify.create({ type: 'negative', message: t('Please provide the URL of the application package.') })
      return
    }
  } else {
    const check = validateCwlText(fileContent.value)
    if (!check.ok) {
      Notify.create({ type: 'negative', message: check.error || t('Invalid application package') })
      return
    }
  }

  deploying.value = true
  loadingBar.start()
  const replacing = !!replaceTarget.value
  Notify.create({
    spinner: QSpinnerGears,
    message: replacing ? t('Replacing process...') : t('Deploying process...'),
    timeout: 2000
  })

  try {
    const name = processName.value.trim()
    const path = replacing
      ? `/processes/${encodeURIComponent(replaceTarget.value as string)}`
      : `/processes${name ? `?w=${encodeURIComponent(name)}` : ''}`
    const url = await buildOgcApiUrl(path, { acceptLanguage: locale.value })

    const response = isUrlMode
      ? await fetch(url, {
          method: replacing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/ogcapppkg+json', ...getRequestHeaders(locale.value) },
          body: JSON.stringify({
            executionUnit: { href: packageUrl.value.trim(), type: 'application/cwl+yaml' }
          })
        })
      : await fetch(url, {
          method: replacing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/cwl+yaml', ...getRequestHeaders(locale.value) },
          body: fileContent.value
        })

    if (response.ok) {
      let body: any = null
      try {
        body = await response.clone().json()
      } catch {
        /* non JSON body */
      }
      const newId = body?.id || replaceTarget.value || name || cwlSummary.value?.id
      Notify.create({
        message: replacing ? t('Process replaced successfully') : t('Process deployed successfully'),
        type: 'positive'
      })
      closeDialog()
      await fetchData()
      if (newId) router.push(`/processes/${newId}`)
    } else {
      const detail = await readErrorDetail(response)
      const hint = response.status === 409 ? ` ${t('A process with this identifier already exists: use Replace to update it.')}` : ''
      Notify.create({
        message: `${replacing ? t('Failed to replace process') : t('Failed to deploy process')}: ${detail}${hint}`,
        color: 'negative',
        icon: 'error',
        timeout: 10000
      })
    }
  } catch (error) {
    console.error('Request failed', error)
    Notify.create({ message: errorSummary(error, t('Request failed')), color: 'negative', icon: 'error' })
  } finally {
    deploying.value = false
    loadingBar.end()
  }
}

const listLoading = ref(false)
const fetchData = async () => {
  listLoading.value = true
  try {
    data.value = await apiFetch('/processes', { query: { f: 'json' }, acceptLanguage: locale.value })
  } catch (error) {
    console.error('Error fetching data:', error)
    Notify.create({ type: 'negative', message: errorSummary(error, t('Request failed')) })
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  checkConformance()
  fetchData()
})

// table helpers and computed
const columns = computed(() => [
  { name: 'id', label: t('Identifier'), field: 'id', align: 'left', sortable: true, style: 'width: 200px' },
  { name: 'title', label: t('Title'), field: 'title', align: 'left', sortable: true, style: 'width: 220px' },
  { name: 'description', label: t('Description'), field: 'description', align: 'left', sortable: false, style: 'width: 100%;' },
  { name: 'version', label: t('Version'), field: 'version', align: 'left', sortable: true, style: 'width: 90px' },
  { name: 'kind', label: t('Kind'), field: 'mutable', align: 'left', sortable: true, style: 'width: 120px' },
  { name: 'link', label: t('Actions'), align: 'center', style: 'width: 120px', sortable: false }
])

const goToJobs = (row: any) => router.push({ path: '/jobs', query: { processID: row.id } })

const getInputType = (input: any) => {
  const schema =
    input?.['original-schema'] ||   
    input?.schema ||
    input

  // Handle allOf
  if (schema?.allOf && Array.isArray(schema.allOf)) {
    const refObj = schema.allOf.find((s: any) => s.$ref)
    const formatObj = schema.allOf.find((s: any) => s.format)

    if (formatObj?.format && refObj?.$ref) {
      return {
        label: formatObj.format,
        link: refObj.$ref
      }
    }
  }

  if (schema?.type) {
    return { label: schema.type }
  }

  return { label: 'object' }
}

const rows = computed(() => {
  if (!data.value?.processes) return []
  const term = filter.value.toLowerCase()
  return data.value.processes.filter((p: any) => {
    if (!term) return true
    const haystack = [p.id, p.title, p.description, ...(p.keywords || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(term)
  })
})


const formattedData = computed(() => JSON.stringify(data.value, null, 2))

const onClearSearch = async () => {
  filter.value = ''
  await fetchData()
}
</script>


<template>
  <q-page class="q-pa-sm">
    <div class="row justify-center">
      <div class="col-12 q-pa-md" style="max-width: 1080px;">

        <p class="text-h4 q-mb-md text-weight-bold">{{ t('Processes List') }}</p>

        <!-- Buttons row -->
        <div class="row items-center q-mb-md">
          <!-- Help Button -->
          <q-btn
            flat
            icon="help_outline"
            color="primary"
            :label="t('Help')"
            @click="helpVisible = true"
          />

          <q-space />

          <!-- Add Process Button -->
          <q-btn
            v-if="isConformToCwl === true"
            color="primary"
            icon="add"
            :label="t('Add Process')"
            @click="openDialog"
            :loading="isCheckingConformance"
          />
          <q-btn flat dense icon="refresh" class="q-ml-sm" @click="fetchData">
            <q-tooltip>{{ t('Refresh') }}</q-tooltip>
          </q-btn>
        </div>

        <HelpDialog
          v-model="helpVisible"
          :title="t('Processes List Help')"
        >
          <div
            v-if="helpContent"
            v-html="helpContent"
          />
        </HelpDialog>
        <q-separator />

        <div class="q-mb-md">
          <q-input
            filled
            v-model="filter"
            :label="t('Search')"
            debounce="300"
            clearable
            prepend-icon="search"
            @clear="onClearSearch"
          />
        </div>


            <q-table
              :title="t('Processes List')"
              :rows="rows"
              :columns="columns"
              row-key="id"
              :dark="isDark"
              :loading="listLoading"
              wrap-cells
              table-layout="fixed"
              flat
              bordered
              :rows-per-page-options="[10, 25, 50, 0]"
              class="processes-table rounded-borders"
              @row-click="onRowClick"
            >
              <template v-slot:body-cell-id="{ row }">
                <q-td class="id-td">
                  <NuxtLink :to="`/processes/${row.id}`" class="text-primary text-weight-bold" @click.stop>{{ row.id }}</NuxtLink>
                  <div v-if="row.keywords?.length" class="q-mt-xs">
                    <q-chip v-for="kw in row.keywords.slice(0, 4)" :key="kw" dense size="sm" color="grey-3" text-color="grey-9">{{ kw }}</q-chip>
                  </div>
                </q-td>
              </template>
              <template v-slot:body-cell-title="{ row }">
                <q-td class="description-td">
                  <div class="description-cell">{{ row.title || '—' }}</div>
                </q-td>
              </template>
              <template v-slot:body-cell-description="{ row }">
                <q-td class="description-td">
                  <div class="description-cell">
                    {{ row.description || '—' }}
                  </div>
                </q-td>
              </template>
              <template v-slot:body-cell-version="{ row }">
                <q-td>{{ row.version || '—' }}</q-td>
              </template>
              <template v-slot:body-cell-kind="{ row }">
                <q-td>
                  <q-badge :color="row.mutable ? 'primary' : 'grey-7'" :label="row.mutable ? t('Deployed') : t('Built-in')" />
                  <div class="q-mt-xs">
                    <q-icon v-if="(row.jobControlOptions || []).includes('async-execute')" name="schedule" size="xs" class="q-mr-xs">
                      <q-tooltip>{{ t('Asynchronous execution') }}</q-tooltip>
                    </q-icon>
                    <q-icon v-if="(row.jobControlOptions || []).includes('sync-execute')" name="bolt" size="xs" class="q-mr-xs">
                      <q-tooltip>{{ t('Synchronous execution') }}</q-tooltip>
                    </q-icon>
                    <q-icon v-if="(row.jobControlOptions || []).includes('dismiss')" name="cancel" size="xs">
                      <q-tooltip>{{ t('Jobs can be dismissed') }}</q-tooltip>
                    </q-icon>
                  </div>
                </q-td>
              </template>
              <template v-slot:body-cell-link="{ row }">
                <q-td class="text-center">
                  <q-btn-dropdown color="primary" :label="t('Actions')" flat dense @click.stop>
                    <q-list dense>
                      <q-item clickable v-close-popup @click="viewProcess(row)">
                        <q-item-section avatar><q-icon name="play_arrow" /></q-item-section>
                        <q-item-section>{{ t('View & execute') }}</q-item-section>
                      </q-item>
                      <q-item clickable v-close-popup @click="goToJobs(row)">
                        <q-item-section avatar><q-icon name="work" /></q-item-section>
                        <q-item-section>{{ t('Jobs') }}</q-item-section>
                      </q-item>
                      <q-item v-if="row.mutable" clickable v-close-popup @click="packageProcess(row)">
                        <q-item-section avatar><q-icon name="inventory_2" /></q-item-section>
                        <q-item-section>{{ t('Package') }}</q-item-section>
                      </q-item>
                      <q-item v-if="row.mutable" clickable v-close-popup @click="openReplaceDialog(row)">
                        <q-item-section avatar><q-icon name="published_with_changes" /></q-item-section>
                        <q-item-section>{{ t('Replace') }}</q-item-section>
                      </q-item>
                      <q-separator v-if="row.mutable" />
                      <q-item v-if="row.mutable" clickable v-close-popup @click="deleteProcess(row)">
                        <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
                        <q-item-section class="text-negative">{{ t('Delete') }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-btn-dropdown>
                </q-td>
              </template>
              <template #no-data>
                <div class="full-width row flex-center text-grey-7 q-py-lg">
                  <q-icon :name="listLoading ? 'hourglass_empty' : 'inbox'" size="md" class="q-mr-sm" />
                  {{ listLoading ? t('Loading...') : t('No process matches your search.') }}
                </div>
              </template>
            </q-table>
            <!-- CWL Preview Section (UNDER the table) -->
            <div v-if="selectedProcess" class="row q-col-gutter-lg q-mt-lg">
              <div class="col-12 col-md-8">
                <div class="row items-center q-mb-sm">
                  <div class="text-h6 text-weight-bold">{{ t('CWL Preview') }}</div>
                  <q-space />
                  <q-btn
                    v-if="cwlText"
                    flat
                    dense
                    no-caps
                    icon="code"
                    :label="t('Application Package')"
                    @click="packageProcess(selectedProcess)"
                  />
                </div>
                <q-banner v-if="cwlError" dense rounded class="bg-orange-1 text-orange-10">
                  <template #avatar><q-icon name="warning" color="warning" /></template>
                  {{ cwlError }}
                </q-banner>
                <q-skeleton v-else-if="loadingCwl" type="rect" height="560px" class="rounded-borders" />
                <CwlGraph v-else-if="cwlText" :cwl="cwlText" :name="selectedProcess?.id" height="560px" />
              </div>
              <!-- Right: metadata -->
              <div class="col-12 col-md-4">
                <q-card flat bordered>
                  <q-card-section>
                    <p class="text-h6 text-weight-bold">{{ t('Metadata') }}</p>
                    <q-separator class="q-my-sm" />

                    <p><b>Description</b> {{ selectedProcess?.description || '—' }}</p>
                    
                    <div class="row q-mb-sm items-center">
                      <div class="text-weight-bold">{{ t('Software Version') }}</div>
                      <div class="q-ml-sm">{{ selectedProcess?.version || '—' }}</div>
                    </div>


                    <div class="row q-mb-sm items-center">
                      <div class="text-weight-bold">{{ t('Keywords') }}</div>
                      <div class="q-ml-sm">
                        <span v-if="selectedProcess?.keywords?.length">
                          {{ selectedProcess.keywords.join(', ') }}
                        </span>
                        <span v-else>—</span>
                      </div>
                    </div>

                    <q-separator class="q-my-sm" />

                    <!-- Inputs Table -->
                    <p class="text-weight-bold q-mt-md">{{ t('Inputs') }}</p>

                    <table class="custom-table">
                      <thead>
                        <tr>
                          <th>{{ t('Label') }}</th>
                          <th>{{ t('Type') }}</th>
                          <th>{{ t('Description') }}</th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr v-for="([key, val]) in Object.entries(selectedProcess?.inputs || {})" :key="key">
                          <td>{{ key }}</td>
                          <td>
                            <template v-if="getInputType(val).link">
                              <a
                                :href="getInputType(val).link"
                                target="_blank"
                                class="text-primary"
                              >
                                {{ getInputType(val).label }}
                              </a>
                            </template>

                            <template v-else>
                              {{ getInputType(val).label }}
                            </template>
                          </td>
                          <td>{{ val?.description || '—' }}</td>
                        </tr>

                        <tr v-if="!Object.keys(selectedProcess?.inputs || {}).length">
                          <td colspan="3" class="text-center text-grey">{{ t('No inputs') }}</td>
                        </tr>
                      </tbody>
                    </table>


                    <q-separator class="q-my-sm" />

                    <!-- Outputs Table -->
                    <p class="text-weight-bold q-mt-md">{{ t('Outputs') }}</p>

                    <table class="custom-table">
                      <thead>
                        <tr>
                          <th>{{ t('Label') }}</th>
                          <th>{{ t('Type') }}</th>
                          <th>{{ t('Description') }}</th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr v-for="([key, val]) in Object.entries(selectedProcess?.outputs || {})" :key="key">
                          <td>{{ key }}</td>
                          <td>
                            <template v-if="getInputType(val).link">
                              <a
                                :href="getInputType(val).link"
                                target="_blank"
                                class="text-primary"
                              >
                                {{ getInputType(val).label }}
                              </a>
                            </template>

                            <template v-else>
                              {{ getInputType(val).label }}
                            </template>
                          </td>
                          <td>{{ val?.description || '—' }}</td>
                        </tr>

                        <tr v-if="!Object.keys(selectedProcess?.outputs || {}).length">
                          <td colspan="3" class="text-center text-grey">{{ t('No outputs') }}</td>
                        </tr>
                      </tbody>
                    </table>

                <q-separator class="q-my-sm" />

                <q-expansion-item
                  expand-separator
                  icon="info"
                  :label="t('Additional Metadata')"
                  dense
                  dense-toggle
                  class="rounded-borders bg-white q-mt-md shadow-1"
                >
                  <q-card-section>

                    <div v-if="selectedProcess.metadata?.length">

                      <div
                        v-for="(md, i) in selectedProcess.metadata"
                        :key="i"
                        class="q-py-sm q-mb-sm border-bottom"
                        style="border-bottom: 1px solid #eee;"
                      >

                    <div class="row items-center q-mb-xs">

                      <!-- ICON (left side, decorative only) -->
                      <q-icon
                        :name="iconMap[extractMetaType(md.role)] || 'info'"
                        size="18px"
                        class="text-primary q-mr-sm"
                      />

                      <!-- LABEL (clickable - schema.org page) -->
                        <div
                          class="text-weight-bold text-primary"
                          :class="{ 'cursor-pointer': md.role }"
                          @click="md.role && openSchema(md.role)"
                        >
                        {{ md.role ? extractMetaType(md.role) : md.title }}
                      </div>

                    </div>
                      <!--title-only metadata -->
                      <div v-if="md.title && !md.value" class="q-mt-xs text-grey-8">
                        {{ md.title }}
                      </div>


                      <!-- Simple string value -->
                      <div v-else-if="typeof md.value === 'string'" class="q-mt-xs text-grey-8 long-text">
                        <template v-if="isUrl(md.value)">
                          <a :href="md.value" target="_blank" class="text-primary">
                            {{ md.value }}
                          </a>
                        </template>
                        <template v-else>
                          {{ md.value }}
                        </template>
                      </div>

                      <!-- Object value -->
                      <div v-else-if="typeof md.value === 'object'" class="q-mt-xs">

                        <!-- ENTITY TYPE -->
                        <div
                          v-if="getEntityType(md.value)"
                          class="text-caption text-primary cursor-pointer q-mb-xs"
                          @click="openSchema(getEntitySchemaUrl(md.value))"
                        >
                          {{ getEntityType(md.value) }}
                        </div>



                        <!-- ENTITY FIELDS -->
                          <div
                            v-for="([key, v], i) in getRenderableFields(md.value)"
                            :key="i"
                            class="q-mb-xs text-grey-8"
                          >

                        <template v-if="key === 'address' && typeof v === 'object'">
                          <div class="q-mt-sm">
                            <strong>
                              <q-icon name="place" size="14px" class="q-mr-xs text-primary" />
                              address:
                            </strong>

                            <div class="q-ml-lg q-mt-xs">
                              <div
                                v-for="([addrKey, addrVal], i) in getRenderableFields(v)"
                                :key="i"
                                class="q-mb-xs"
                              >
                                <strong>{{ prettyAddressKey(addrKey) }}:</strong>
                                <span class="q-ml-xs">{{ addrVal }}</span>
                              </div>
                            </div>
                          </div>
                        </template>

                          
                        <template v-else>
                          <strong class="q-mr-xs">{{ key }}:</strong>

                          <!--  If nested object -->
                          <template v-if="typeof v === 'object'">
                            <div class="q-ml-md q-mt-xs">

                              <div
                                v-if="getEntityType(v)"
                                class="text-caption text-primary cursor-pointer q-mb-xs"
                                @click="openSchema(getEntitySchemaUrl(v))"
                              >
                                {{ getEntityType(v) }}
                              </div>

                              <div
                                v-for="([nestedKey, nestedVal], j) in getRenderableFields(v)"
                                :key="j"
                                class="q-mb-xs"
                              >
                                <strong>{{ normalizeType(nestedKey) }}:</strong>

                                <span class="q-ml-xs">
                                  <template v-if="isUrl(nestedVal)">
                                    <a :href="nestedVal" target="_blank" class="text-primary">
                                      {{ nestedVal }}
                                    </a>
                                  </template>
                                  <template v-else>
                                    {{ nestedVal }}
                                  </template>
                                </span>

                              </div>
                            </div>
                          </template>

                          <!-- If string -->
                          <template v-else>
                            <span class="long-text">
                              <template v-if="isUrl(v)">
                                <a :href="v" target="_blank" class="text-primary">
                                  {{ v }}
                                </a>
                              </template>
                              <template v-else>
                                {{ v }}
                              </template>
                            </span>
                          </template>
                        </template>
                        </div>

                      </div>

                      </div>

                    </div>

                    <div v-else class="text-grey-6">
                      —
                    </div>

                  </q-card-section>
                </q-expansion-item>

                  </q-card-section>
                </q-card>
              </div>
            </div>


      </div>
    </div>

    <!-- Add / Replace Process Dialog -->
    <q-dialog v-model="dialog" persistent>
      <q-card style="width: 760px; max-width: 92vw;">
        <q-card-section class="row items-center">
          <q-icon :name="replaceTarget ? 'published_with_changes' : 'add_circle'" color="primary" size="sm" class="q-mr-sm" />
          <div class="text-h6">
            {{ replaceTarget ? t('Replace process "{id}"', { id: replaceTarget }) : t('Add a Process') }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" :disable="deploying" @click="closeDialog" />
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-tabs v-model="deployMode" dense align="left" class="text-grey-7" active-color="primary" indicator-color="primary" narrow-indicator>
            <q-tab name="file" icon="upload_file" :label="t('Upload a .cwl file')" />
            <q-tab name="paste" icon="content_paste" :label="t('Paste')" />
            <q-tab name="url" icon="link" :label="t('From a URL')" />
          </q-tabs>
          <q-separator class="q-mb-md" />

          <q-form @submit.prevent="submitForm">
            <q-input
              v-model="processName"
              :label="replaceTarget ? t('Process identifier') : t('Process Name')"
              :hint="replaceTarget ? '' : t('Optional: defaults to the identifier declared in the package')"
              :readonly="!!replaceTarget"
              dense
              filled
              class="q-mb-md"
            />

            <q-tab-panels v-model="deployMode" animated>
              <q-tab-panel name="file" class="q-pa-none">
                <q-file
                  v-model="file"
                  :label="t('Upload a .cwl file')"
                  accept=".cwl,.yaml,.yml,.json"
                  filled
                  clearable
                  @update:model-value="onFileSelected"
                >
                  <template #prepend><q-icon name="upload_file" /></template>
                </q-file>
              </q-tab-panel>
              <q-tab-panel name="paste" class="q-pa-none">
                <q-input
                  v-model="fileContent"
                  :label="t('File Content')"
                  type="textarea"
                  filled
                  autogrow
                  input-style="min-height: 180px; max-height: 45vh; font-family: ui-monospace, monospace; font-size: 12px"
                />
              </q-tab-panel>
              <q-tab-panel name="url" class="q-pa-none">
                <q-input v-model="packageUrl" :label="t('URL of the CWL application package')" filled dense type="url">
                  <template #append>
                    <q-btn flat dense icon="download" :label="t('Preview')" @click="loadPackageFromUrl">
                      <q-tooltip>{{ t('Fetch the package in the browser to review it before deploying') }}</q-tooltip>
                    </q-btn>
                  </template>
                </q-input>
                <div class="text-caption text-grey-7 q-mt-sm">
                  {{ t('The server downloads the package itself (application/ogcapppkg+json with an executionUnit href).') }}
                </div>
              </q-tab-panel>
            </q-tab-panels>

            <!-- package summary -->
            <div v-if="deployMode !== 'url' && cwlValidation" class="q-mt-md">
              <q-banner v-if="!cwlValidation.ok" dense rounded class="bg-red-1 text-negative">
                <template #avatar><q-icon name="error" color="negative" /></template>
                {{ cwlValidation.error }}
              </q-banner>
              <div v-else class="row items-center q-gutter-xs">
                <q-chip dense color="positive" text-color="white" icon="check">{{ t('Valid CWL') }}</q-chip>
                <q-chip v-if="cwlSummary?.id" dense outline color="primary">id: {{ cwlSummary.id }}</q-chip>
                <q-chip v-if="cwlSummary?.cwlClass" dense outline color="grey-8">{{ cwlSummary.cwlClass }}</q-chip>
                <q-chip v-if="cwlSummary?.cwlVersion" dense outline color="grey-8">{{ cwlSummary.cwlVersion }}</q-chip>
                <q-chip v-if="cwlSummary?.version" dense outline color="grey-8">v{{ cwlSummary.version }}</q-chip>
                <q-chip v-if="cwlSummary?.graphSize" dense outline color="grey-8">$graph: {{ cwlSummary.graphSize }}</q-chip>
              </div>
              <!-- Live graph of the package about to be deployed -->
              <div v-if="cwlValidation.ok && graphSource" class="q-mt-md">
                <div class="text-caption text-grey-7 q-mb-xs">{{ t('Workflow graph') }}</div>
                <CwlGraph :cwl="graphSource" height="300px" />
              </div>
            </div>

            <div class="row justify-end q-gutter-sm q-mt-md">
              <q-btn flat :label="t('Cancel')" color="grey-8" :disable="deploying" @click="closeDialog" />
              <q-btn
                type="submit"
                :label="replaceTarget ? t('Replace') : t('Deploy')"
                color="primary"
                :loading="deploying"
                :disable="deployMode !== 'url' && !!cwlValidation && !cwlValidation.ok"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Package Modal -->
    <AppDialog
      v-model="showModal"
      :title="t('Application Package')"
    >
      <div v-if="modalContent">
        <pre class="dialog-pre">{{ modalContent }}</pre>
        </div>
          <!-- ERROR -->
          <div v-else-if="packageError" class="text-negative">
            <q-icon name="warning" size="18px" class="q-mr-sm" />
            {{ packageError }}
          </div>

          <!-- LOADING / EMPTY -->
          <div v-else class="text-grey-6">
            {{ t('Loading package information...') }}
          </div>
        <template #footer>
          <div class="row justify-end">
            <q-btn
              color="primary"
              :label="t('Download CWL')"
              @click="downloadCWL"
            />
          </div>
        </template>
      </AppDialog>

  </q-page>
</template>
<style>
.custom-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  background: var(--surface-bg, #fff);
  border-radius: 4px;
  overflow: hidden;
  font-size: 14px;
}

.custom-table th {
  background: var(--surface-alt, #f2f2f2);
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ddd;
  font-weight: bold;
}

.custom-table td {
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.custom-table tr:last-child td {
  border-bottom: none;
}

.long-text {
  word-break: break-all;
  overflow-wrap: anywhere;
}

.description-cell {
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.dialog-pre {
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
}

.description-td,
.id-td {
  vertical-align: top;
}

.processes-table :deep(tbody tr) {
  cursor: pointer;
}
</style>