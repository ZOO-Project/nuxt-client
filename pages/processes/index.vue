<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRuntimeConfig, useRouter } from '#imports'
import { useI18n } from 'vue-i18n'
import { QCard, QCardSection, QInput, QBtn, QDialog, QForm, QUploader, QSpinnerGears, Notify } from 'quasar'
import HelpDialog from '../../components/help/HelpDialog.vue'
import processListHelp from '../../components/help/processListHelp.js'

import yaml from 'js-yaml'
import { nextTick } from 'vue'


const authStore = useAuthStore()
const { locale, t } = useI18n()
const config = useRuntimeConfig()

const data = ref<any>(null)
const filter = ref('')
const router = useRouter()
const modalContent = ref('')
const showModal = ref(false)


const helpVisible = ref(false)
const helpContent = processListHelp


const loadingCwl = ref(false)
const svgViewer = ref<any | null>(null)
const selectedProcess = ref<Record<string, any> | null>(null)

const zoomLevel = ref(1)

const dialog = ref(false)
const processName = ref('')
const fileContent = ref('')
const file = ref<File | null>(null)
const showVisualizer = ref(false)


//basic helpers 
function debug(msg: string) { console.log('[proc:index] ', msg) }

const viewProcess = (row: any) => {
  router.push(`/processes/${row.id}`)
}

// fetch package 
const packageProcess = async (row: any) => {
  try {
    const response = await fetch(`${config.public.NUXT_ZOO_BASEURL}/ogc-api/processes/${row.id}/package`, {
      method: 'GET',
      headers: {
        "Accept": "application/cwl+yaml",
        'Authorization': `Bearer ${authStore.token.access_token}`,
        'Accept-Language': locale.value
      }
    })
    if (response.ok) {
      console.log('Application Package downloaded successfully')
      modalContent.value = await response.text()
      showModal.value = true
    } else {
      console.error('Error downloading Application Package')
      showModal.value = false
    }
  } catch (error) {
    console.error('Application Package request failed', error)
    showModal.value = false
  }
}

// load cwl-svg demo bundles  
async function loadSvgScripts() {
  if (process.server || (window as any).svgScriptsLoaded) return
  const loadScript = (src: string) =>
    new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = () => resolve()
      s.onerror = (e) => reject(new Error(`Failed to load ${src}`))
      document.body.appendChild(s)
    })

  try {

    if (!(window as any).jsyaml) {
      const yamlModule = await import('js-yaml')
      ;(window as any).jsyaml = yamlModule
      console.log('✅ js-yaml exposed globally')
    }
    // order matters for your demo
    await loadScript('/cwl-demo/cwl-svg.bundle.js')
    await loadScript('/cwl-demo/cwl-svg-custom.js')
    await loadScript('/cwl-demo/cwl-visualizer-api.js')
    await loadScript('/cwl-demo/cwl-visualizer.js')
    ;(window as any).svgScriptsLoaded = true
    console.log('✅ CWL SVG bundles loaded')
  } catch (err) {
    console.error('Failed to load CWL scripts', err)
    throw err
  }
}

// visualization: fetch package and render 
async function visualizeCwl(row: any) {
  loadingCwl.value = true
  showVisualizer.value = true
  await nextTick()

  try {
    await loadSvgScripts()

    //  Fetch the full process metadata (with inputs/outputs)
    const metaUrl = `${config.public.NUXT_ZOO_BASEURL}/ogc-api/processes/${row.id}`
    const metaRes = await fetch(metaUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authStore.token.access_token}`,
        'Accept-Language': locale.value
      }
    })
    const metaData = await metaRes.json()
    selectedProcess.value = metaData  



    const url = `${config.public.NUXT_ZOO_BASEURL}/ogc-api/processes/${row.id}/package`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/cwl+yaml',
        Authorization: `Bearer ${authStore.token.access_token}`,
        'Accept-Language': locale.value
      }
    })
    if (!res.ok) throw new Error(`Failed to fetch package (${res.status})`)
    

    const response = await fetch('/cwl-demo/example-workflow.cwl')
    const yamlText = await res.text()
    const cwlObject = yaml.load(yamlText)
    await nextTick()
    renderCwl(yamlText)
    if (!cwlObject.class) {
      cwlObject.class = "Workflow"
    }
  } catch (err: any) {
    showError(err?.message || 'Visualization failed')
  } finally {
    loadingCwl.value = false
  }
}

// render into DOM 
async function renderCwl(yamlText) {
  const container = document.getElementById('svg-container');
  if (!container) {
    console.error('svg-container not found');
    return;
  }

  let contentEl = document.getElementById('svg-content');
  if (!contentEl) {
    contentEl = document.createElement('div');
    contentEl.id = 'svg-content';
    container.appendChild(contentEl);
  }

  container.scrollTop = 0;

  if (!(window).CWLSVGCustom) {
    showError('CWLSVGCustom library not loaded');
    return;
  }

  try {
    svgViewer.value = new (window).CWLSVGCustom(contentEl, {
      width: contentEl.clientWidth || 1200,
      height: Math.max(600, contentEl.clientHeight || 600),
      nodeWidth: 150,
      nodeHeight: 70
    });

    // Pass the raw CWL YAML text
    await svgViewer.value.loadWorkflow(yamlText);

    if (typeof svgViewer.value.render === 'function') {
      svgViewer.value.render();
    }

    console.log('✅ CWL rendered successfully');
  } catch (e) {
    console.error('Render error', e);
    showError('Render failed: ' + e.message);
  }
}




// file input handling (hidden input) 
async function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const fileSelected = input?.files?.[0]
  if (!fileSelected) return
  document.getElementById('file-name')!.innerText = fileSelected.name
  document.getElementById('file-size')!.innerText = `(${(fileSelected.size / 1024).toFixed(1)} KB)`
  const text = await fileSelected.text()
  const cwlObject = yaml.load(text)
  await loadSvgScripts()
  renderCwl(yamlText)
}



// conformance check 
const isConformToCwl = ref(false)
const isCheckingConformance = ref(false)

const checkConformance = async () => {
  isCheckingConformance.value = true
  try {
    const response = await fetch(`${config.public.NUXT_ZOO_BASEURL}/ogc-api/conformance`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': locale.value
      }
    })

    if (response.ok) {
      const conformance = await response.json()
      console.log('Conformance response:', conformance)

      // Vérifier si l'API supporte le déploiement CWL
      const cwlConformanceUrl = 'http://www.opengis.net/spec/ogcapi-processes-2/1.0/conf/deploy-replace-undeploy'
      isConformToCwl.value = conformance.conformsTo?.includes(cwlConformanceUrl) || false

      console.log('CWL Conformance:', isConformToCwl.value)
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
  if (confirm(t('Are you sure you want to delete the process') + ` "${row.id}"?`)) {
    try {
      const response = await fetch(`${config.public.NUXT_ZOO_BASEURL}/ogc-api/processes/${row.id}`, {
        method: 'DELETE',
        headers: { 
          Authorization: `Bearer ${authStore.token.access_token}`,
          'Accept-Language': locale.value 
        }
      })
      if (response.ok) {
        Notify.create({ message: t('Process deleted successfully'), type: 'positive' })
        await fetchData()
      } else {
        Notify.create({ message: t('Process deletion failed'), type: 'negative' })
      }
    } catch (e) {
      Notify.create({ message: t('Delete request failed'), color: 'negative', icon: 'error' })
      console.error(e)
    }
  }
}

// add process dialog functions unchanged 
const openDialog = () => {
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
  processName.value = ''
  fileContent.value = ''
  file.value = null
  // (refs.uploader as any).reset();
}


const onFileAdded = (files: File[]) => {
  if (files.length > 0) {
    file.value = files[0]
    const reader = new FileReader()
    reader.onload = (e) => (fileContent.value = e.target?.result as string)
    reader.readAsText(file.value)
  }
}


const submitForm = async () => {
  if (!fileContent.value) {
    return
  }
 
  try {
    const formData = new FormData()
    formData.append('file', file.value)
    Notify.create({
          spinner: QSpinnerGears,
          message: t('Deploying process...'),
          timeout: 2000
    })
    const response = await fetch(`${config.public.NUXT_ZOO_BASEURL}/ogc-api/processes?w=${processName.value}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/cwl+yaml',
        'Authorization': `Bearer ${authStore.token.access_token}`,
        'Accept-Language': locale.value
      },
      body: fileContent.value,
    })
 
    if(response.ok) {
      console.log('Process deployed successfully.')
      Notify.create({
        message: t('Process deployed successfully'),
        type: 'positive'
      })
      fetchData()
    } else {
      console.error('Error deploying process.')
      Notify.create({
        message: t('Failed to deploy process'),
        color: 'negative',
        icon: 'error'
      })
    }
  } catch (error) {
    console.error('Request failed', error)
      Notify.create({
        message: t('Request failed'),
        color: 'negative',
        icon: 'error'
      })
  }
 
  closeDialog()
}

const fetchData = async () => {
  try {
    data.value = await $fetch(`${config.public.NUXT_ZOO_BASEURL}/ogc-api/processes`, {
      headers: {
        Authorization: `Bearer ${authStore.token.access_token}`,
        'Accept-Language': locale.value
      }
    })
  } catch (error) {
    console.error('Error fetching data:', error)
  }
}

onMounted(() => {
  checkConformance()
  fetchData()
})

// table helpers and computed 
const columns = [
  { name: 'id', label: '#', field: 'id', align: 'left', sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left', sortable: true },
  {
    name: 'link',
    label: 'Lien',
    field: row => row.links?.[0]?.href || '',
    align: 'left',
    sortable: false
  }
]

const rows = computed(() => {
  if (!data.value?.processes) return []
  const term = filter.value.toLowerCase()
  return data.value.processes.filter(p => {
    const idMatch = p.id.toLowerCase().includes(term)
    const descMatch = (p.description ?? '').toLowerCase().includes(term)
    return idMatch || descMatch
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
          <q-btn flat icon="help_outline" color="primary" :label="t('Help')" @click="helpVisible = true" />
          <q-space />
          <q-btn
            v-if="isConformToCwl === true"
            color="primary"
            icon="add"
            :label="t('Add Process')"
            @click="openDialog"
            :loading="isCheckingConformance"
            id="file-input-button"
          />
        </div>

        <HelpDialog v-model="helpVisible" title="Processes List Help" :help-content="helpContent" />
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


            <q-table :title="t('Processes List')" :rows="rows" :columns="columns" row-key="id">
              <template v-slot:body-cell-link="{ row }">
                <q-td class="text-center">
                  <q-btn-dropdown v-if="row.mutable === true" color="primary" label="Actions" flat>
                    <q-list>
                      <q-item clickable v-close-popup @click="viewProcess(row)"><q-item-section>{{ t('View') }}</q-item-section></q-item>
                      <q-item clickable v-close-popup @click="packageProcess(row)"><q-item-section>{{ t('Package') }}</q-item-section></q-item>
                      <q-item clickable v-close-popup @click="visualizeCwl(row)"><q-item-section>{{ t('Visualize CWL') }}</q-item-section></q-item>
                      <q-item clickable v-close-popup @click="deleteProcess(row)"><q-item-section class="text-negative">{{ t('Delete') }}</q-item-section></q-item>
                    </q-list>
                  </q-btn-dropdown>
                  <NuxtLink v-else :to="`/processes/${row.id}`">{{ row.id }}</NuxtLink>
                </q-td>
              </template>
            </q-table>

      </div>
    </div>

    <!-- Add Process Dialog -->
    <q-dialog v-model="dialog" persistent>
      <q-card style="min-width: 800px; max-width: 90vw;">
        <q-card-section>
          <div class="text-h6">{{t('Add a Process')}}</div>
        </q-card-section>
 
        <q-card-section>
          <q-form @submit.prevent="submitForm">
            <q-input v-model="processName" :label="t('Process Name')" />
 
            <q-uploader
              :label="t('Upload a .cwl file')"
              accept=".cwl"
              @added="onFileAdded"
              ref="uploader"
              :hide-upload-btn="true"
              :hide-upload-progress="true"
              style="width: 100%;"
            />
 
            <q-input
              v-model="fileContent"
              :label="t('File Content')"
              type="textarea"
              @change="fileContent = $event.target.value"
              required
            />
 
            <div class="q-mt-md">
              <q-btn type="submit" :label="t('Submit')" color="primary" />
              <q-btn flat :label="t('Cancel')" @click="closeDialog" color="negative" />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Package Modal -->
    <q-dialog v-model="showModal" persistent>
      <q-card style="min-width:600px; max-width:90vw;" class="rounded-borders">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Application Package</div>
          <q-space />
          <q-btn icon="close" flat round dense @click="showModal = false" />
        </q-card-section>
        <q-card-section>
          <div v-if="modalContent"><pre style="max-width:100%;max-height:250px;overflow:auto;">{{ modalContent }}</pre></div>
          <div v-else class="text-negative">No data or failed to fetch.</div>
        </q-card-section>
      </q-card>
    </q-dialog>
    <!-- Visualization Modal -->
    <q-dialog v-model="showVisualizer" persistent>
      <q-card flat bordered style="min-width:990px; max-width: 90vw; min-height:700px; max-height: 90vw;">
        <q-card-section class="row items-center justify-between">
          <div class="text-h6">
            {{ selectedProcess ? `${t('CWL Visualization for')} ${selectedProcess.id}` : t('CWL Visualizer') }}
          </div>
          <q-btn icon="close" flat round dense @click="showVisualizer = false" />
        </q-card-section>

        <q-separator />

        <q-card-section>
          <div v-show="loadingCwl" class="absolute-center">
            <q-spinner-gears size="2em" color="primary" />
          </div>

          <div class="row q-col-gutter-md">
            <!-- Left: visualization -->
            <div class="col-8">
              <div id="svg-container" class="bg-white" style="width:100%; height:600px; overflow:auto; border:1px solid #ddd;">
                <div id="svg-content" style="width:100%; height:100%"></div>
              </div>
                <div id="workflow-info" style="display:none;"></div>
                <div id="selection-details" style="display:none;"></div>
                <pre id="debug-panel" style="display:none; white-space: pre-wrap; background:#111; color:#fff; padding:8px; border-radius:6px;"></pre>
            </div>

            <!-- Right: metadata -->
            <div class="col-4">
              <q-card flat bordered>
                <q-card-section>
                  <p class="text-subtitle1 text-weight-bold">{{ t('Metadata') }}</p>
                  <p><b>{{ t('Description') }}:</b> {{ selectedProcess?.description ?? '—' }}</p>

                  <p><b>{{ t('Inputs') }}:</b></p>
                  <ul>
                    <li v-for="(val, key) in selectedProcess?.inputs || {}" :key="key">
                      {{ key }} ({{ val?.schema?.type || val?.type || 'unknown' }})
                    </li>
                  </ul>

                  <p><b>{{ t('Outputs') }}:</b></p>
                  <ul>
                    <li v-for="(val, key) in selectedProcess?.outputs || {}" :key="key">
                      {{ key }} ({{ val?.schema?.type || val?.type || 'unknown' }})
                    </li>
                  </ul>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

  </q-page>
</template>
