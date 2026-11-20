<script setup lang="ts">
import { useHead } from '#imports'
import { ref, onMounted, watch, reactive, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useRuntimeConfig } from '#imports'
import { triggerRef } from 'vue'
import { useQuasar } from 'quasar'
import HelpDialog from '@/components/help/HelpDialog.vue'
import processIdHelp from '@/components/help/processIdHelp.js'
import { copyToClipboard } from 'quasar'
import { normalizeStatus, isTerminalStatus } from '~/composables/utils/jobs'
import { errorSummary } from '~/composables/utils/ogcError'
import { randomId } from '~/composables/utils/ids'
 
 
const {
  params: { processId }
} = useRoute()
 
const authStore = useAuthStore()
const { locale, t } = useI18n()
const config = useRuntimeConfig()
const { buildOgcApiUrl, getRequestHeaders, apiFetch } = useOgcApiServer()
 
const data = ref(null)
const inputValues = ref<Record<string, Array<{ mode: 'value' | 'href', value: string, href: string }>>>({})
const outputValues = ref<Record<string, any>>({})
const response = ref(null)
const loading = ref(false)
const submitting = ref(false);
const jobStatus = ref('')
const preferMode = ref<'respond-async' | 'respond-sync'>('respond-async')
const executionModeOptions = computed(() => {
  const jco: string[] = data.value?.jobControlOptions || ['sync-execute', 'async-execute']
  const options = []
  if (jco.includes('async-execute') || !jco.length) options.push({ label: t('Asynchronous (job)'), value: 'respond-async' })
  if (jco.includes('sync-execute') || !jco.length) options.push({ label: t('Synchronous (wait for the result)'), value: 'respond-sync' })
  return options.length ? options : [{ label: 'respond-async', value: 'respond-async' }, { label: 'respond-sync', value: 'respond-sync' }]
})
const jsonRequestPreview = ref('')
const showDialog = ref(false)
const requiredInputs = ref<string[]>([])
const inputRefs = ref<Record<string, HTMLElement | null>>({})
const validationErrors = ref<Record<string, boolean>>({})
const progressPercent = ref(0)
const progressMessage = ref('')
const jobId = ref("");
const channelId = ref(randomId());
const $q = useQuasar()
let ws: WebSocket | null = null
const helpVisible = ref(false)
const helpContent = processIdHelp
const bboxDialogVisible = ref(false)
const editingBboxKey = ref<string | null>(null)
let map: L.Map | null = null
let drawLayer: L.LayerGroup | null = null
let drawnFeature: L.Layer | null = null
const enabledInputs = reactive<Record<string, boolean>>({})
const isCanceling = ref(false)
const jobCanceled = ref(false)
const loadError = ref('')
const requestUrl = useRequestURL()
// Which outputs are requested (all by default). Outputs named like a disabled
// optional input are left out, unless the user decided otherwise.
const outputEnabled = reactive<Record<string, boolean>>({})
const outputTouched = reactive<Record<string, boolean>>({})
// Bumped to stop a running polling loop (dismiss, delete, new submission).
let pollingToken = 0
const stopPolling = () => {
  pollingToken += 1
}
 
 
// Helper to extract a default bbox from various schema styles (old & new)
const getDefaultBbox = (schema: any) => {
  //  Try the new schema style: ogc-bbox with allOf references
  if (schema?.schema?.allOf?.some((s: any) => s.format === 'ogc-bbox')) {
    const bbox = schema?.example?.bbox || schema?.schema?.example?.bbox
    if (Array.isArray(bbox)) return bbox.slice(0, 4)
  }
 
  //  Try the old schema style: bbox.yaml references or bbox property
  if (schema?.example?.bbox && Array.isArray(schema.example.bbox)) {
    return schema.example.bbox.slice(0, 4)
  }
 
  if (schema?.properties?.bbox?.default && Array.isArray(schema.properties.bbox.default)) {
    return schema.properties.bbox.default.slice(0, 4)
  }
 
  // fallback
  return [0, 0, 0, 0]
}
 
 
const subscriberValues = ref({
  successUri: `${config.public.SUBSCRIBERURL}?jobid=JOBSOCKET-${channelId.value}&type=success`,
  inProgressUri: `${config.public.SUBSCRIBERURL}?jobid=JOBSOCKET-${channelId.value}&type=inProgress`,
  failedUri: `${config.public.SUBSCRIBERURL}?jobid=JOBSOCKET-${channelId.value}&type=failed`
})
 
 
// Detects whether a schema describes complex content (has contentMediaType / mediaType / oneOf with contentMediaType)
const hasContentMedia = (schema: any) =>
  !!(
    schema?.contentMediaType ||
    schema?.mediaType ||
    (Array.isArray(schema?.oneOf) && schema.oneOf.some((f: any) => !!f?.contentMediaType))
  )
 

const getArrayItemType = (schema: any): string => {
  if (!schema || schema.type !== 'array') return ''

  const items = schema.items

  // Literal arrays
  if (items?.type) {
    return items.type
  }

  // Complex arrays
  if (
    items?.contentMediaType ||
    items?.mediaType ||
    (Array.isArray(items?.oneOf) && items.oneOf.some((o: any) => o?.contentMediaType))
  ) {
    return 'complex'
  }

  return 'unknown'
}

const isLiteralArraySchema = (schema: any): boolean => {
  if (schema?.type !== 'array') return false
  const t = getArrayItemType(schema)
  return ['string', 'number', 'integer', 'boolean'].includes(t)
}

// Collect supported formats (oneOf contentMediaType or contentMediaType field). Ensure application/json is present.
const getSupportedFormats = (schema: any): string[] => {
  const list: string[] = []
 
  if (Array.isArray(schema?.oneOf)) {
    for (const f of schema.oneOf) {
      if (f?.contentMediaType) list.push(f.contentMediaType)
      else if (f?.type === 'object') list.push('application/json')
    }
  }
 
  if (schema?.contentMediaType) list.push(schema.contentMediaType)
  if (schema?.mediaType) list.push(schema.mediaType)
 
  if (!list.includes('application/json')) list.push('application/json')
  // unique
  return Array.from(new Set(list))
}
 

const isUriLiteralInput = (input: any): boolean => {
  const schema = input?.schema;
  if (!schema) return false;

  if (schema.format === 'uri' || schema.format === 'url') {
    return true;
  }

  if (
    schema.contentMediaType === 'text/uri-list' ||
    schema.contentMediaType === 'application/uri'
  ) {
    return true;
  }

  const variants = schema.anyOf || schema.oneOf;
  if (Array.isArray(variants)) {
    return variants.some(
      (v) =>
        v?.format === 'uri' ||
        v?.format === 'url' ||
        v?.contentMediaType === 'text/uri-list'
    );
  }

  return false;
};


// Provide a readable label for the q-badge (so complex shows the media type OR href/value mode)
const typeLabel = (input: any, inputId: string, valForInputId?: any) => {

  if (hasContentMedia(input.schema)) {

    if (Array.isArray(valForInputId) && valForInputId.length > 0) {
      const item = valForInputId[0];

      if (item?.mode === 'href') {
        return 'complex (URL)';
      }

      if (item?.mode === 'value') {
        const fmt = item?.format;
        return fmt ? `complex (${fmt})` : 'complex (inline value)';
      }
    }

    if (valForInputId && typeof valForInputId === 'object') {
      if (valForInputId.mode === 'href') {
        return 'complex (URL)';
      }

      if (valForInputId.mode === 'value') {
        const fmt = valForInputId?.format;
        return fmt ? `complex (${fmt})` : 'complex (inline value)';
      }
    }

    return 'complex';
  }

  if (input?.schema?.type === 'array') {
    const itemType = getArrayItemType(input.schema);
    return `array(${itemType})`;
  }

  if (isUriLiteralInput(input, inputId)) {
    return 'string (URI)';
  }

  if (input?.schema?.type) {
    return input.schema.type;
  }

  return 'string';
};

 
const normalizeBboxSchema = (schema: any) => {
  if (!schema) return schema

  // Already correct — nothing to do
  if (
    schema.type === 'object' &&
    schema.format === 'ogc-bbox' &&
    schema.properties?.bbox &&
    schema.properties?.crs
  ) {
    return schema
  }

  // Case 1: flattened bbox schema (items + crs at same level)
  if (
    schema.format === 'ogc-bbox' &&
    schema.items &&
    schema.crs
  ) {
    return {
      type: 'object',
      format: 'ogc-bbox',
      required: ['bbox', 'crs'],
      properties: {
        bbox: {
          type: 'array',
          oneOf: [
            { minItems: 4, maxItems: 4 },
            { minItems: 6, maxItems: 6 }
          ],
          items: schema.items
        },
        crs: schema.crs
      },
      nullable: schema.nullable ?? false
    }
  }

  // Case 2: allOf reference (bbox.yaml / ogc-bbox)
  if (Array.isArray(schema.allOf)) {
    const hasOgcBbox = schema.allOf.some(
      s => s?.format === 'ogc-bbox' || /bbox\.yaml$/i.test(s?.['$ref'])
    )

    if (hasOgcBbox) {
      return {
        type: 'object',
        format: 'ogc-bbox',
        required: ['bbox', 'crs'],
        properties: {
          bbox: {
            type: 'array',
            oneOf: [
              { minItems: 4, maxItems: 4 },
              { minItems: 6, maxItems: 6 }
            ],
            items: { type: 'number', format: 'double' }
          },
          crs: {
            type: 'string',
            format: 'uri',
            default: 'urn:ogc:def:crs:EPSG:6.6:4326'
          }
        }
      }
    }
  }

  return schema
}

const fetchData = async () => {
  try {
    data.value = await apiFetch(`/processes/${processId}`, { query: { f: 'json' }, acceptLanguage: locale.value })

    // Default execution mode follows what the process supports.
    const jco: string[] = data.value?.jobControlOptions || []
    if (jco.length && !jco.includes('async-execute') && jco.includes('sync-execute')) {
      preferMode.value = 'respond-sync'
    }
 
    if (data.value && data.value.inputs) {
      for (const [key, input] of Object.entries(data.value.inputs)) {
        if (input.minOccurs !== 0) {
          requiredInputs.value.push(key)
        }

        if (input.minOccurs === 0) {
          enabledInputs[key] = false;
        } else {
          enabledInputs[key] = true;
        }

        if (
          input.schema?.type === 'array' &&
          !hasContentMedia(input.schema)
        ) {
          const defaults = input.schema?.default ?? [];

          inputValues.value[key] = Array.isArray(defaults) && defaults.length
            ? defaults.map(v => ({
                mode: 'value',
                value: String(v),
                href: ''
              }))
            : [
                {
                  mode: 'value',
                  value: '',
                  href: ''
                }
              ];

          continue;
        }

        // COMPLEX input (single or oneOf/contentMediaType)
        if (hasContentMedia(input.schema)) {
          const supportedFormats = getSupportedFormats(input.schema)
          const hrefOptions = input?.example?.hrefOptions || []

          if (isMultiValueInput(input)) { 
            // multiple allowed → array
            inputValues.value[key] = [
              {
                mode: hrefOptions.length > 0 ? 'href' : 'value',
                href: '',
                value: '',
                format: supportedFormats[0],
                availableFormats: supportedFormats,
                hrefOptions
              }
            ]
          } else {
            // single input → object
            inputValues.value[key] = {
              mode: hrefOptions.length > 0 ? 'href' : 'value',
              href: '',
              value: '',
              format: supportedFormats[0],
              availableFormats: supportedFormats,
              hrefOptions
            }
          }
          continue
        }
 
        // COMPLEX ARRAY input
        if (input.schema?.type === 'array' && hasContentMedia(input.schema.items)) {
          const supportedFormats = getSupportedFormats(input.schema.items)
          inputValues.value[key] = [
            {
              mode: 'value',
              href: '',
              value: '',
              format: supportedFormats[0],
              availableFormats: supportedFormats
            }
          ]
          continue
        }
 
        // Bounding Box input — support old schema + new allOf/ogc-bbox/bbox.yaml variants
        const detectBboxFromSchema = (schema: any) => {
          if (!schema) return null;

          if (schema.type === 'object' && schema.properties) {
            const props = schema.properties || {};
            for (const key of Object.keys(props)) {
              const p = props[key];
              if (
                (p?.type === 'array' || p?.items) &&
                (props.crs && props.crs.type === 'string')
              ) {
                return { propName: key, crsDefault: props.crs.default ?? 'EPSG:4326' };
              }
            }
          }

          if (Array.isArray(schema.allOf)) {
            for (const s of schema.allOf) {
              if (s?.format === 'ogc-bbox') {
                return { propName: 'bbox', crsDefault: 'EPSG:4326' };
              }
              if (typeof s?.['$ref'] === 'string' && /bbox\.yaml$/i.test(s['$ref'])) {
                return { propName: 'bbox', crsDefault: 'EPSG:4326' };
              }
              const nested = detectBboxFromSchema(s);
              if (nested) return nested;
            }
          }
 
          return null;
        };
 
        const bboxInfo = detectBboxFromSchema(input.schema);
        if (bboxInfo) {
          const defaultBbox = getDefaultBbox(input);
          inputValues.value[key] = reactive({
            bbox: defaultBbox,
            crs: normalizeCrsForProj4(bboxInfo.crsDefault || 'EPSG:4326'),
            _schemaPropName: bboxInfo.propName
          });
          continue;
        }


        // Default init for literal input
        inputValues.value[key] = input.schema?.default ?? (input.schema?.type === 'number' ? 0 : '')
      }
    }
 
    // Outputs initialization
    if (data.value && data.value.outputs) {
      for (const key of Object.keys(data.value.outputs)) {
        outputEnabled[key] = !(key in enabledInputs) || enabledInputs[key] !== false
        delete outputTouched[key]
      }
      for (const [key, input] of Object.entries(data.value.outputs)) {
        if (input.schema.oneOf?.length > 0) {
          const myEnum = []
          for (var i = 0; i < input.schema.oneOf.length; i++) {
            if (input.schema.oneOf[i].type === "object")
              myEnum.push("application/json")
            else
              myEnum.push(input.schema.oneOf[i].contentMediaType)
          }
          outputValues.value[key] = [
            { id: "transmission", enum: ["reference", "value"], cval: "reference" },
            { id: "format", enum: myEnum, cval: myEnum[0] }
          ]
        } else {
          outputValues.value[key] = [
            { id: "transmission", enum: ["value", "reference"], cval: "value" }
          ]
        }
      }
    }
  } catch (error) {
    console.error('Error fetching data:', error)
    loadError.value = errorSummary(error, t('Request failed'))
  }
}
 
let L: any = null

watch(
  () => data.value,
  (val) => {
    if (!val) return

    const rawMetadata = val.metadata || []

    // Extract items by role
    const extractByRole = (role) =>
      rawMetadata
        .filter(md => md.role === role)
        .map(md => md.value)

    // Authors (may be multiple)
    const authors = extractByRole("https://schema.org/author")
      .map(a => ({
        "@type": a["@type"] || "Person",
        "name": a.name || a.fullName || ""
      }))

    // Contributors 
    const contributors = extractByRole("https://schema.org/contributor")
      .map(c => ({
        "@type": c["@type"] || "Person",
        "name": c.name || c.fullName || ""
      }))

    // Organizations 
    const organizations = extractByRole("https://schema.org/organization")
      .map(org => ({
        "@type": "Organization",
        "name": org.name || ""
      }))

    // Additional metadata (anything NOT author/contributor/organization)
    const skipRoles = [
      "https://schema.org/author",
      "https://schema.org/contributor",
      "https://schema.org/organization"
    ]

    const additionalProps = rawMetadata
      .filter(md => !skipRoles.includes(md.role))
      .map(md => ({
        "@type": "PropertyValue",
        "name": md.role,
        "value": md.value
      }))

    // Build final JSON-LD
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      "name": val.id,
      "description": val.description,
      "softwareVersion": val.version || null,
      "keywords": val.keywords || [],
      "identifier": processId,
      "url": `${requestUrl.origin}/processes/${processId}`,

      // New metadata mapping
      "author": authors,
      "contributor": contributors,
      "provider": organizations.length ? organizations[0] : {
        "@type": "Organization",
        "name": "ZOO-Project"
      },

      "additionalProperty": additionalProps
    }

    // Inject JSON-LD into <head>
    useHead({
      script: [
        {
          type: "application/ld+json",
          children: JSON.stringify(jsonLd)
        }
      ]
    })
  },
  { immediate: true }
)

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

// Convert URL - softwareVersion
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

 
onMounted(async () => {
  if (process.client) {
    // ✅ Import only on the client
    const leaflet = await import('leaflet')
    await import('@geoman-io/leaflet-geoman-free')
    await import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css')
    L = leaflet.default
    await fetchData()
  }
})
 
const convertOutputsToPayload = (outputs: Record<string, any[]>) => {
  const result: Record<string, any> = {}

  for (const [key, outputArray] of Object.entries(outputs)) {
    if (outputEnabled[key] === false) continue
    if (outputArray && outputArray.length > 0) {
      const outputConfig: any = {}

      // Iterate through each item in the array
      outputArray.forEach(item => {
        if (item.id === 'transmission') {
          outputConfig.transmissionMode = item.cval
        } else if (item.id === 'format') {
          outputConfig.format = {
            mediaType: item.cval
          }
        }
      })

      result[key] = outputConfig
    }
  }
  return result
}

// Mirror the "Enable" choice of an optional input onto the output of the same
// name (echo-like services), until the user picks the outputs by hand.
watch(enabledInputs, (enabled) => {
  for (const [key, on] of Object.entries(enabled)) {
    if (key in outputEnabled && !outputTouched[key]) outputEnabled[key] = on
  }
})

watch(
  [inputValues, outputValues, subscriberValues, enabledInputs, outputEnabled],
  ([newInputs, newOutputs, newSubscribers]) => {
    const formattedInputs: Record<string, any> = {}

    for (const [key, val] of Object.entries(newInputs)) {
      // Optional inputs that are not enabled must not be sent at all.
      if (enabledInputs[key] === false) continue
      if (
        val === undefined ||
        val === '' ||
        (Array.isArray(val) && val.every(v => !v || (typeof v === 'object' && !v.value && !v.href))) ||
        (typeof val === 'object' && 'mode' in val && !val.value && !val.href)
      ) {
        continue
      }
 
      // ✅ ADD THIS: handle Bounding Box inputs first
      if (val && typeof val === 'object' && 'bbox' in val) {
        const toUrn = (crs: string) => {
        const epsg = normalizeCrsForProj4(crs)
        const code = epsg.split(':')[1]
        return `urn:ogc:def:crs:EPSG:6.6:${code}`
      }
      formattedInputs[key] = {
        bbox: val.bbox,
        crs: toUrn(val.crs || 'EPSG:4326')
      }
        continue
      }

      if (
        Array.isArray(val) &&
        data.value.inputs[key]?.schema &&
        isLiteralArraySchema(data.value.inputs[key].schema)
      ) {
        formattedInputs[key] = val
          .filter(v => v?.value !== undefined && v?.value !== '')
          .map(v => v.value)
        continue
      }
 
      // If multiple inputs (array)
      if (Array.isArray(val)) {
        if (val.every(v => typeof v === 'string' || typeof v === 'number')) {
          formattedInputs[key] = val
        } else {
          formattedInputs[key] = val
            .filter(v => v.value || v.href) // only keep filled
            .map(v =>
              v.mode === 'href'
                ? { href: v.href }
                : { value: v.value, format: { mediaType: v.format } }
            )
        }
      } else if (val && typeof val === 'object' && 'mode' in val) {
        if (val.mode === 'href' && val.href) {
          formattedInputs[key] = { href: val.href }
        } else if (val.mode === 'value' && val.value) {
          formattedInputs[key] = {
            value: val.value,
            format: { mediaType: val.format?.mediaType ?? val.format }
          }
        }
      } else {
        // Literal inputs: the number widget emits strings, the request wants JSON numbers
        const type = data.value.inputs[key]?.schema?.type
        formattedInputs[key] =
          (type === 'number' || type === 'integer') && typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val))
            ? Number(val)
            : val
      }
    }
 
    const payload = {
      inputs: formattedInputs,
      outputs: convertOutputsToPayload(newOutputs),
      subscriber: {
        successUri: newSubscribers.successUri,
        inProgressUri: newSubscribers.inProgressUri,
        failedUri: newSubscribers.failedUri
      }
    }
 
    jsonRequestPreview.value = JSON.stringify(payload, null, 2)
  },
  { deep: true }
)
 
const pollJobStatus = async (id: string) => {
  const token = ++pollingToken

  while (token === pollingToken) {
    try {
      // apiFetch handles the bearer token, expired sessions and the loading bar.
      const job = await apiFetch(`/jobs/${id}`, { acceptLanguage: locale.value })
      if (token !== pollingToken) break
      const status = normalizeStatus(job.status)
      jobStatus.value = status
      if (job.progress !== undefined) progressPercent.value = job.progress
      if (job.message) progressMessage.value = job.message

      // Stop polling when job is finished or dismissed
      if (isTerminalStatus(status)) {
        if (status === 'successful') {
          progressPercent.value = 100
          response.value = job
        } else if (status === 'failed') {
          response.value = { error: job.message ? `${t('Job failed')}: ${job.message}` : t('Job failed'), details: job }
        } else {
          response.value = { info: t('Job was dismissed'), details: job }
        }

        loading.value = false
        stopJobTracking()
        break
      }

      // Poll every 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (err: any) {
      if (token !== pollingToken) break
      if (err?.status === 404 || err?.statusCode === 404) {
        jobStatus.value = 'dismissed'
      } else {
        console.error('Polling error:', err)
      }
      loading.value = false
      break
    }
  }
}
 
 
 
 
const validateRequiredInputs = (): boolean => {
  for (const inputId of requiredInputs.value) {
    const val = inputValues.value[inputId]
 
    if (val === undefined || val === '' || (Array.isArray(val) && val.every(v => !v.value && !v.href))) {
      return false
    }
 
    // Bounding box case
    if (val && typeof val === 'object' && 'bbox' in val) {
      if (val.bbox.some(coord => coord === null || coord === undefined || coord === '')) {
        return false
      }
    }
  }
 
  return true
}
 
function setInputRef(id: string, el: HTMLElement | null) {
  if (el) {
    inputRefs.value[id] = el
  }
}
 
function validateAndSubmit() {
  validationErrors.value = {}
 
  let firstInvalid: string | null = null
 
  for (const key of requiredInputs.value) {
    const value = inputValues.value[key]
    let isEmpty = false
 
    if (isEmpty) {
      validationErrors.value[key] = true
      if (!firstInvalid) firstInvalid = key
    }
  }
 
  if (firstInvalid) {
    // show notification here
    $q.notify({
      type: "negative",
      message: "Please fill all required inputs before submitting."
    })
 
    const el = inputRefs.value[firstInvalid]
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return
  }
 
  submitProcess()
}
 
 
const submitProcess = async () => {
  if (loading.value || submitting.value) return;

  if (!validateRequiredInputs()) {
    $q.notify({
      type: "negative",
      message: t('Please fill all required inputs before submitting.'),
    });
    return;
  }


  stopPolling();
  stopJobTracking();
  jobId.value = "";
  response.value = null;
  jobStatus.value = "submitted";
  progressPercent.value = 0;
  progressMessage.value = t('Submitting job...');
 
    let wsUrl = "";
    if (typeof window !== "undefined") {
      const configuredWsUrl = String(config.public.NUXT_WS_URL || "").trim();

      if (configuredWsUrl) {
        // Accept ws://, wss:// and convert http(s):// for convenience.
        if (configuredWsUrl.startsWith('ws://') || configuredWsUrl.startsWith('wss://')) {
          wsUrl = configuredWsUrl;
        } else if (configuredWsUrl.startsWith('http://')) {
          wsUrl = `ws://${configuredWsUrl.slice('http://'.length)}`;
        } else if (configuredWsUrl.startsWith('https://')) {
          wsUrl = `wss://${configuredWsUrl.slice('https://'.length)}`;
        } else {
          wsUrl = configuredWsUrl;
        }

        if (!wsUrl.endsWith('/')) {
          wsUrl += '/';
        }
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Use wss or ws to access the WebSocket
        const hostname = window.location.hostname.replace(/^webui\./, 'ws.');
        wsUrl = `${protocol}//${hostname}/`;
      }
    }
 
  // subscriber URLs for async only
  const subscribers = {
    successUri: `${config.public.SUBSCRIBERURL}?jobid=JOBSOCKET-${channelId.value}&type=success`,
    inProgressUri: `${config.public.SUBSCRIBERURL}?jobid=JOBSOCKET-${channelId.value}&type=inProgress`,
    failedUri: `${config.public.SUBSCRIBERURL}?jobid=JOBSOCKET-${channelId.value}&type=failed`,
  };

  try {
    const originalPayload = JSON.parse(jsonRequestPreview.value || "{}");

    if (preferMode.value === "respond-async") {
      // Only the standard OGC API - Processes `subscriber` block: sending it a
      // second time under `executionOptions` leaves ZOO jobs stuck in "running".
      originalPayload.subscriber = { ...subscribers };
      delete originalPayload.executionOptions;
      loading.value = true;
    } else {
      // Synchronous run: no notifications, and ask for a JSON document so that
      // several outputs do not come back as a multipart/related body.
      delete originalPayload.subscriber;
      delete originalPayload.executionOptions;
      originalPayload.response = "document";
      submitting.value = true;
    }
 
    const res = await apiFetch(`/processes/${processId}/execution`, {
      method: "POST",
      acceptLanguage: locale.value,
      headers: {
        "Content-Type": "application/json",
        // No `return=representation` on asynchronous runs: asking ZOO-Project for
        // the full response document (this preference or `response: document`)
        // makes its worker crash after a CWL job succeeds, leaving the job in
        // "running" forever; the job status is polled anyway.
        Prefer: preferMode.value,
      },
      body: JSON.stringify(originalPayload),
    });
 
   
    if (preferMode.value === "respond-async") {
      if (!res || !res.jobID) {
        throw new Error("Expected async response with jobID, but got none");
      }
 
      jobId.value = res.jobID;

      // Polling is the source of truth; the WebSocket only speeds progress up.
      pollJobStatus(res.jobID);

      try {
        ws = new WebSocket(wsUrl);
      } catch (wsErr) {
        console.warn("WebSocket unavailable, polling only", wsErr);
        ws = null;
      }

      if (ws) {
        ws.onopen = () => {
          ws?.send("SUB JOBSOCKET-" + channelId.value);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (!msg || typeof msg !== "object") return; // "1" acknowledges the subscription

            const msgJobId = msg.jobid ?? msg.jobID ?? null;
            const msgId = msg.id ?? null;
            // Messages about other jobs on the shared channel are ignored.
            if (msgJobId !== "JOBSOCKET-" + channelId.value && msgId !== jobId.value) return;

            if (msg.progress !== undefined) progressPercent.value = msg.progress;
            if (msg.message) progressMessage.value = msg.message;

            if (msg.status === "succeeded" || msg.type === "success") {
              progressPercent.value = 100;
              progressMessage.value = t('Completed successfully');
              stopJobTracking();
            } else if (msg.status === "failed" || msg.type === "failed") {
              progressMessage.value = t('Execution failed');
              stopJobTracking();
            } else if (!isTerminalStatus(jobStatus.value)) {
              jobStatus.value = "running";
            }
          } catch (e) {
            console.error("Invalid WS message:", event.data, e);
          }
        };

        ws.onerror = () => {
          // Progress keeps coming through polling.
          console.warn("WebSocket error: falling back to polling only");
        };
      }

    } else {
      // Synchronous execution: the body is the results document.
      if (res && typeof res === "object" && res.error) {
        progressMessage.value = res.error.description || t('Execution failed');
        jobStatus.value = "failed";
        response.value = res;
      } else {
        progressPercent.value = 100;
        progressMessage.value = t('Completed successfully');
        jobStatus.value = "successful";
        response.value = res;
      }
    }
  } catch (error: any) {
    console.error("Execution error (POST):", error);
    const raw = errorSummary(error, t('Process execution failed.'));
    const networkFailure = !error?.status && /Failed to fetch|NetworkError|<no response>|Load failed/i.test(String(raw));
    const detail = networkFailure
      ? t('Network error: the server could not be reached (CORS or connection problem).')
      : raw;
    $q.notify({ type: "negative", message: detail, timeout: 10000 });
    jobStatus.value = "failed";
    progressMessage.value = detail;
    response.value = { error: detail };
    loading.value = false;
  } finally {
    submitting.value = false;
  }
};

// "Copy as curl" for the execute request shown in the preview dialog.
const copyAsCurl = async () => {
  try {
    const executionUrl = await buildOgcApiUrl(`/processes/${processId}/execution`, { acceptLanguage: locale.value })
    const headers = getRequestHeaders(locale.value)
    const parts = [`curl -X POST '${executionUrl}'`, `-H 'Content-Type: application/json'`, `-H 'Prefer: ${preferMode.value}'`]
    if (headers.Authorization) parts.push(`-H 'Authorization: ${headers.Authorization}'`)
    // The subscriber block only serves the UI's own WebSocket notifications
    // (cluster-internal URLs): leave it out of a command meant to be run elsewhere.
    let body = jsonRequestPreview.value || '{}'
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object') {
        delete parsed.subscriber
        body = JSON.stringify(parsed, null, 2)
      }
    } catch {
      /* keep the preview text as is */
    }
    parts.push(`-d '${body.replace(/'/g, "'\\''")}'`)
    await copyToClipboard(parts.join(' \\\n  '))
    $q.notify({ type: 'positive', message: t('curl command copied') })
  } catch (err) {
    $q.notify({ type: 'negative', message: t('Copy failed') })
  }
}

 
 
 
 
const isMultipleInput = (input: any) => {
  return isMultiValueInput(input)
}
 
const isBoundingBoxInput = (input: any): boolean => {
  if (!input?.schema) return false;
  const schema = input.schema;
 
  // Old-style
  if (schema.type === 'object' && schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (
        (prop as any)?.type === 'array' ||
        (prop as any)?.items
      ) {
        if (schema.properties?.crs?.type === 'string') return true;
      }
    }
  }
 
  // New-style (allOf with ogc-bbox or bbox.yaml)
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.some(s =>
      s?.format === 'ogc-bbox' ||
      (typeof s?.['$ref'] === 'string' && /bbox\.yaml$/i.test(s['$ref'])) ||
      (s?.type === 'object' && isBoundingBoxInput({ schema: s }))
    );
  }
 
  return false;
};
 
const isComplexInput = (input: any) => {
  return (
    input?.schema &&
    (
      input.schema.contentMediaType ||
      input.schema.mediaType ||
      (Array.isArray(input.schema.oneOf) && input.schema.oneOf.some(x => x.contentMediaType))
    )
  )
}

const isMultiValueInput = (input: any): boolean => {
  // New OGC API – Processes schema
  if (input?.schema?.type === 'array') {
    return true
  }

  // Old EOEPCA / CWL schemas
  if (input?.['extended-schema']?.type === 'array') {
    return true
  }

  if (typeof input?.maxOccurs === 'number' && input.maxOccurs > 1) {
    return true
  }

  const cwlType = input?.metadata?.find(
    (m: any) => m.title === 'cwl:type'
  )?.value

  if (typeof cwlType === 'string' && cwlType.includes('[]')) {
    return true
  }

  return false
}

const DEFAULT_SUPPORTED_FORMATS = ['application/json', 'text/plain']
 
const addInputField = (inputId: string) => {
  const input = data.value.inputs[inputId];

  if (!Array.isArray(inputValues.value[inputId])) {
    inputValues.value[inputId] = [];
  }

  if (input.schema?.type === 'array' && !isComplexInput(input)) {
    inputValues.value[inputId].push({
      mode: 'value',
      value: '',
      href: ''
    });
    triggerRef(inputValues);
    return;
  }

  const currentFormats = inputValues.value[inputId][0]?.availableFormats || DEFAULT_SUPPORTED_FORMATS;

  inputValues.value[inputId].push({
    mode: 'value',
    value: '',
    href: '',
    format: currentFormats[0],
    availableFormats: currentFormats
  });

  triggerRef(inputValues);
}
 
const removeInputField = (inputId: string, index: number) => {
  if (Array.isArray(inputValues.value[inputId]) && inputValues.value[inputId].length > 1) {
    inputValues.value[inputId].splice(index, 1)
    triggerRef(inputValues)
  }
}
 
//  Open map popup for editing bounding box
const openBboxPopup = (inputKey: string) => {
  editingBboxKey.value = inputKey
  bboxDialogVisible.value = true
  nextTick(() => initMap())
}

const normalizeCrsForProj4 = (crs: string): string => {
  if (!crs) return 'EPSG:4326'
  // urn:ogc:def:crs:EPSG:6.6:4326 → EPSG:4326
  const urnMatch = crs.match(/EPSG(?::\d+\.\d+)?:?(\d+)/i)
  if (urnMatch) {
    return `EPSG:${urnMatch[1]}`
  }
  // numeric only
  if (/^\d+$/.test(crs)) {
    return `EPSG:${crs}`
  }
  return crs
}
 
const initMap = () => {
  if (!process.client || !L) return
  const mapContainer = document.getElementById('bbox-map')
  if (!mapContainer) return
 
  if (map) {
    map.off()
    map.remove()
    map = null
  }
 
  //  Initialize map
  map = L.map('bbox-map').setView([0, 0], 0) // default center (adjust as needed)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)
 
  //  Add Geoman controls
  map.pm.addControls({
    position: 'topleft',
    drawCircle: false,
    drawMarker: false,
    drawPolygon: false,
    drawPolyline: false,
    drawCircleMarker: false,
    drawText: false,
    drawRectangle: true,
    editMode: true,
    dragMode: false,
    cutPolygon: false,
    removalMode: true
  })
 
  // Layer to hold drawings
  drawLayer = L.layerGroup().addTo(map)
 
  // draw current bbox for editing (convert to 4326 for Leaflet if needed)
  const current = editingBboxKey.value ? inputValues.value[editingBboxKey.value] : null
    if (current && Array.isArray(current.bbox) && current.bbox.length === 4) {
    const rawCrs = current.crs || 'EPSG:4326'
    const crs = normalizeCrsForProj4(rawCrs)
    if (crs !== 'EPSG:4326') {
      ensureProj4().then(() => {
        try {
          const sw = proj4(crs, 'EPSG:4326', [current.bbox[0], current.bbox[1]])
          const ne = proj4(crs, 'EPSG:4326', [current.bbox[2], current.bbox[3]])
          const displayBbox = [
            Math.min(sw[0], ne[0]),
            Math.min(sw[1], ne[1]),
            Math.max(sw[0], ne[0]),
            Math.max(sw[1], ne[1])
          ].map(Number)
          drawBboxOnMap(displayBbox)
        } catch (e) {
          console.warn('Could not convert bbox to 4326 for display', e)
        }
      })
    } else {
      drawBboxOnMap(current.bbox.map(Number))
    }
  }
  //  Handle rectangle draw event
  map.on('pm:create', e => {
    // remove existing drawnFeature (only one bbox supported)
    if (drawnFeature) {
      try { drawLayer.removeLayer(drawnFeature) } catch (err) {}
      drawnFeature = null
    }
 
    drawnFeature = e.layer
    drawLayer.addLayer(drawnFeature)
 
    // Ensure the new layer is editable right away
    if (drawnFeature.pm && typeof drawnFeature.pm.enable === 'function') {
      drawnFeature.pm.enable({ allowSelfIntersection: false })
    }
 
    // update the bbox value from the new layer
    updateBboxFromLayer()
 
    // attach edit/remove handlers to keep inputValues in sync
    drawnFeature.on('pm:edit', () => updateBboxFromLayer())
    drawnFeature.on('pm:remove', () => {
      if (editingBboxKey.value) {
        inputValues.value[editingBboxKey.value].bbox = [0, 0, 0, 0]
      }
      drawnFeature = null
    })
  })
 
}
 

// Replace existing updateBboxFromLayer() with this code
const updateBboxFromLayer = async () => {
  if (!drawnFeature || !editingBboxKey.value) return;

  const bounds = drawnFeature.getBounds();
  // Leaflet provides lon/lat in these values (we treat as EPSG:4326)
  const bbox4326 = [
    Number(bounds.getWest().toFixed(6)),  // minx (lon)
    Number(bounds.getSouth().toFixed(6)), // miny (lat)
    Number(bounds.getEast().toFixed(6)),  // maxx (lon)
    Number(bounds.getNorth().toFixed(6))  // maxy (lat)
  ];

  // Get the desired / user-selected CRS for this input (normalize to EPSG:####)
  let desiredCrs = normalizeCrsForProj4(
    inputValues.value[editingBboxKey.value]?.crs || 'EPSG:4326'
  )

  // If desired is not 4326 we must convert the drawn (4326) bbox to desiredCrs
  if (desiredCrs !== 'EPSG:4326') {
    try {
      await ensureProj4(); // loader already present in your file
      // Ensure proj defs are known (reuse logic from reprojectBbox if needed)
      // Convert SW and NE corner from 4326 -> desiredCrs
      const sw = proj4('EPSG:4326', desiredCrs, [bbox4326[0], bbox4326[1]]);
      const ne = proj4('EPSG:4326', desiredCrs, [bbox4326[2], bbox4326[3]]);

      // Build min/max in target CRS (in case coords swapped)
      const converted = [
        Math.min(sw[0], ne[0]),
        Math.min(sw[1], ne[1]),
        Math.max(sw[0], ne[0]),
        Math.max(sw[1], ne[1])
      ].map(Number);

      // Save in inputValues using the user-selected CRS
      if (!inputValues.value[editingBboxKey.value]) {
        inputValues.value[editingBboxKey.value] = { bbox: converted, crs: desiredCrs, _schemaPropName: 'bbox' };
      } else {
        inputValues.value[editingBboxKey.value].bbox = converted;
        inputValues.value[editingBboxKey.value].crs = desiredCrs;
      }
    } catch (e) {
      console.error('Could not reproject drawn bbox to desired CRS', desiredCrs, e);
      // fallback: store as EPSG:4326 (old behaviour) but notify user
      inputValues.value[editingBboxKey.value].bbox = bbox4326;
      inputValues.value[editingBboxKey.value].crs = 'EPSG:4326';
      $q.notify({ type: 'warning', message: `Could not convert bbox to ${desiredCrs}. Saved as EPSG:4326.` });
    }
  } else {
    // desired is EPSG:4326 — no reprojection needed
    if (!inputValues.value[editingBboxKey.value]) {
      inputValues.value[editingBboxKey.value] = { bbox: bbox4326, crs: 'EPSG:4326', _schemaPropName: 'bbox' };
    } else {
      inputValues.value[editingBboxKey.value].bbox = bbox4326;
      inputValues.value[editingBboxKey.value].crs = 'EPSG:4326';
    }
  }
};
 
 
 
const closeBboxPopup = () => {
  bboxDialogVisible.value = false
  editingBboxKey.value = null
}
 
const confirmBboxSelection = () => {
  if (editingBboxKey.value && inputValues.value[editingBboxKey.value]?.bbox) {
    console.log('Confirmed bbox:', inputValues.value[editingBboxKey.value].bbox)
  }
  closeBboxPopup()
}
 
// ----- reprojection helpers -----
let proj4: any = null
 
// ensure proj4 loaded on client
const ensureProj4 = async () => {
  if (proj4) return proj4
  if (!process.client) throw new Error('proj4 can only be loaded on client')
  const mod = await import('proj4')
  proj4 = mod.default ?? mod
  return proj4
}
 
/**
 * Fetch a proj4 definition (text like "+proj=...") for a given EPSG code
 * using epsg.io proj4 endpoint as fallback. Returns a proj4 definition string or null.
 * Example: fetchProjDef("EPSG:3857") => "+proj=...".
 */
const fetchProjDef = async (epsgCode: string): Promise<string | null> => {
  // Normalize input (accept "EPSG:4326" or "4326")
  let code = (epsgCode || '').toString()
  if (/^\d+$/.test(code)) code = `EPSG:${code}`
  if (!/^EPSG:/i.test(code)) code = `EPSG:${code}`
 
  try {
    // epsg.io provides a proj4 text endpoint at https://epsg.io/<code>.proj4
    // e.g. https://epsg.io/3857.proj4 returns proj4 string for EPSG:3857
    const numeric = code.split(':')[1]
    const res = await fetch(`https://epsg.io/${numeric}.proj4`)
    if (!res.ok) return null
    const text = await res.text()
    if (text && text.trim().length > 0) return text.trim()
    return null
  } catch (e) {
    console.warn('Could not fetch proj def for', code, e)
    return null
  }
}
 
/**
 * Reproject a bbox from 'fromCrs' to 'toCrs'.
 * bbox expected as [minx,miny,maxx,maxy].
 * Returns new bbox [minx,miny,maxx,maxy].
 */
const reprojectBbox = async (inputKey: string, fromCrs: string, toCrs: string) => {
  if (!inputKey) return
 
  try {
    await ensureProj4()
    // Normalize codes
    const f = normalizeCrsForProj4(fromCrs || 'EPSG:4326')
    const t = normalizeCrsForProj4(toCrs || 'EPSG:4326')
 
    // If proj4 already knows the code, use directly; otherwise fetch def and register alias.
    const ensureDef = async (code: string) => {
      const numeric = code.split(':')[1]
      // proj4 has built-ins for common codes (EPSG:4326, EPSG:3857). Test if it resolves.
      try {
        // try a dummy transform to see if proj4 knows it
        proj4(code, code, [0, 0])
        return code
      } catch (e) {
        // not known — try fetch
      }
      const def = await fetchProjDef(code)
      if (def) {
        proj4.defs(code, def)
        return code
      } else {
        console.warn('No proj definition for', code)
        return null
      }
    }
 
    const fCode = await ensureDef(f)
    const tCode = await ensureDef(t)
    if (!fCode || !tCode) {
      $q.notify({ type: 'warning', message: `Projection definition missing for ${!fCode ? f : t}. Reprojection skipped.` })
      return
    }
 
    const input = inputValues.value[inputKey]
    if (!input || !Array.isArray(input.bbox) || input.bbox.length < 4) return
 
    const [minx, miny, maxx, maxy] = input.bbox.map(Number)
 
    // Reproject the four corners
    const corners = [
      [minx, miny],
      [minx, maxy],
      [maxx, miny],
      [maxx, maxy]
    ]
 
    const reprojected = corners.map(([x, y]) => {
      try {
        const out = proj4(fCode, tCode, [x, y])
        return [Number(out[0]), Number(out[1])]
      } catch (e) {
        console.error('proj4 transform failed', e)
        return [NaN, NaN]
      }
    }).filter(c => !isNaN(c[0]) && !isNaN(c[1]))
 
    if (reprojected.length === 0) {
      $q.notify({ type: 'negative', message: 'Reprojection failed: no valid corner points' })
      return
    }
 
    const xs = reprojected.map(c => c[0])
    const ys = reprojected.map(c => c[1])
    const newBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Number)
 
    // Update the inputValues with new bbox and the new crs
    inputValues.value[inputKey].bbox = newBbox
    inputValues.value[inputKey].crs = tCode
 
    // If map open, update drawn rectangle to reflect reprojected bbox (Leaflet expects lat/lng)
    // We'll convert to EPSG:4326 for Leaflet display if needed
    if (map) {
      // If target CRS is not EPSG:4326, transform to 4326 for display
      if (tCode !== 'EPSG:4326') {
        const displayPts = [
          [newBbox[0], newBbox[1]],
          [newBbox[2], newBbox[3]]
        ].map(pt => proj4(tCode, 'EPSG:4326', pt))
        const displayBbox = [
          Math.min(displayPts[0][0], displayPts[1][0]),
          Math.min(displayPts[0][1], displayPts[1][1]),
          Math.max(displayPts[0][0], displayPts[1][0]),
          Math.max(displayPts[0][1], displayPts[1][1])
        ].map(Number)
        drawBboxOnMap(displayBbox)
      } else {
        drawBboxOnMap(newBbox)
      }
    }
 
  } catch (e) {
    console.error('reprojectBbox error', e)
    $q.notify({ type: 'negative', message: 'Reprojection failed (see console)' })
  }
}
 
// helper to draw bbox rectangle on Leaflet map (bbox in EPSG:4326 lat/lon expected)
const drawBboxOnMap = (bbox4326: number[]) => {
  if (!map || !drawLayer) return
 
  // ensure numeric values (sometimes they are strings)
  const nums = bbox4326.map(n => Number(n))
  if (
    nums.some(n => Number.isNaN(n)) ||
    (nums[0] === 0 && nums[1] === 0 && nums[2] === 0 && nums[3] === 0)
  ) {
    return
  }
  if (nums.some(n => Number.isNaN(n))) return
 
  // remove previous drawn
  if (drawnFeature) {
    try { drawLayer.removeLayer(drawnFeature) } catch (e) { /* ignore */ }
    drawnFeature = null
  }
 
  // bbox4326 expected [minx,miny,maxx,maxy] where x=lon, y=lat
  const [minx, miny, maxx, maxy] = nums
  const bounds = [[miny, minx], [maxy, maxx]] // leaflet: [[southWestLat, westLng], [northEastLat, eastLng]]
 
  // create rectangle and add to drawLayer
  drawnFeature = L.rectangle(bounds)
  drawLayer.addLayer(drawnFeature)
 
  // enable Geoman editing for this layer (so user can drag corners later)
  if (drawnFeature.pm && typeof drawnFeature.pm.enable === 'function') {
    drawnFeature.pm.enable({ allowSelfIntersection: false })
  } else if (map.pm && map.pm.enableGlobalEditMode) {
    // fallback: enable map-level edit mode (not ideal but safer)
    // map.pm.enableGlobalEditMode()
  }
 
  // wire edit events on the layer so changes update the bounding box in inputValues
  drawnFeature.on('pm:edit', () => updateBboxFromLayer())
  drawnFeature.on('pm:remove', () => {
    if (editingBboxKey.value) {
      inputValues.value[editingBboxKey.value].bbox = [0, 0, 0, 0]
    }
    drawnFeature = null
  })
 
  // fit map to the rectangle
  try {
    map.fitBounds(bounds, { maxZoom: 12 })
  } catch (e) {
    console.warn('fitBounds failed', e)
  }
}
 
// Watch for changes to bbox crs values and reproject when user changes it
watch(
  inputValues,
  (newInputs, oldInputs) => {
    // iterate inputs, find bbox entries where crs changed
    for (const [key, val] of Object.entries(newInputs)) {
      // Skip optional inputs that are not enabled
     if (data.value?.inputs?.[key]?.minOccurs === 0 && !enabledInputs[key]) {
        continue
      }
      const old = oldInputs ? (oldInputs as any)[key] : undefined
      if (val && typeof val === 'object' && 'bbox' in val && 'crs' in val) {
        const newCrs = val.crs
        const oldCrs = old && typeof old === 'object' ? old.crs : undefined
        if (oldCrs && newCrs && oldCrs !== newCrs) {
          // call reprojection (fire-and-forget)
          reprojectBbox(key, oldCrs, newCrs)
        }
      }
    }
  },
  { deep: true }
)

watch(
  () => editingBboxKey.value ? inputValues.value[editingBboxKey.value]?.crs : null,
  async (newCrs, oldCrs) => {
    if (!map || !drawnFeature || !editingBboxKey.value) return
    if (!newCrs || newCrs === oldCrs) return

    try {
      await ensureProj4()

      const t = normalizeCrsForProj4(newCrs)

      const input = inputValues.value[editingBboxKey.value]
      if (!input || !Array.isArray(input.bbox) || input.bbox.length < 4) return

      // Convert stored bbox → EPSG:4326 for Leaflet display
      if (t !== 'EPSG:4326') {
        const sw = proj4(t, 'EPSG:4326', [input.bbox[0], input.bbox[1]])
        const ne = proj4(t, 'EPSG:4326', [input.bbox[2], input.bbox[3]])

        const displayBbox = [
          Math.min(sw[0], ne[0]),
          Math.min(sw[1], ne[1]),
          Math.max(sw[0], ne[0]),
          Math.max(sw[1], ne[1])
        ].map(Number)

        drawBboxOnMap(displayBbox)
      } else {
        drawBboxOnMap(input.bbox.map(Number))
      }
    } catch (e) {
      console.warn('Could not update displayed bbox after CRS change', e)
    }
  }
)

// Initialize for optional inputs after `data` is loaded
watch(data, (val) => {
  if (!val?.inputs) return

  for (const [key, input] of Object.entries(val.inputs)) {
    if (input.minOccurs === 0 && !(key in enabledInputs)) {
      enabledInputs[key] = false
    }
  }
})

// Cancel job while it is running or submitted
async function cancelJob() {
  if (!jobId.value) return

  isCanceling.value = true

  try {
    stopPolling()
    await apiFetch(`/jobs/${jobId.value}`, { method: 'DELETE', acceptLanguage: locale.value })

    jobStatus.value = 'dismissed'
    loading.value = false
    submitting.value = false
    response.value = null

    stopJobTracking()
    $q.notify({
      type: 'positive',
      message: t('Execution dismissed')
    })
    // The server removes dismissed jobs: nothing left to delete.
    jobId.value = ''
  } catch (err) {
    console.error(err)
    $q.notify({
      type: 'negative',
      message: errorSummary(err, t('Failed to cancel job'))
    })
  } finally {
    isCanceling.value = false
  }
}

const deleteJob = async () => {
  if (!jobId.value) return
  isCanceling.value = true
  try {
    stopPolling()
    await apiFetch(`/jobs/${jobId.value}`, { method: 'DELETE', acceptLanguage: locale.value })
    jobStatus.value = ''
    response.value = null
    jobId.value = ''
    $q.notify({ type: 'positive', message: t('Job deleted successfully') })
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: errorSummary(err, t('Failed to delete job')) })
  } finally {
    isCanceling.value = false
  }
}

function stopJobTracking() {
  if (ws) {
    ws.close()
    ws = null
  }
}

function getFormatAndRef(input) {
  const schemaCandidates = [
    input['original-schema'],
    input.schema
  ].filter(Boolean);

  for (const schema of schemaCandidates) {
    if (Array.isArray(schema.allOf)) {
      let format, ref;

      for (const item of schema.allOf) {
        if (item.format) format = item.format;
        if (item.$ref) ref = item.$ref;
      }

      if (format || ref) {
        return { format, ref };
      }
    }
  }

  // fallback
  return {
    format: input.schema?.format || input.schema?.type,
    ref: input.schema?.$ref
  };
}

</script>

<template>
  <div>
    <q-btn
      flat
      icon="help_outline"
      color="primary"
      :label="t('Help')"
      @click="helpVisible = true"
      class="q-mb-md"
    />
    <HelpDialog
      v-model="helpVisible"
      :title="t('Processes Help')"
    >
      <div
        v-if="helpContent"
        v-html="helpContent"
      />
    </HelpDialog>
  <q-page class="q-pa-md">
    <div v-if="data">
   
      <div class="q-mb-lg">
        <div class="text-h3 text-weight-bold text-primary q-mb-sm">
          {{ data.id }}
        </div>
        <div class="text-subtitle1 text-grey-7">
          {{ data.description }}
        </div>
        <q-card class="q-pa-md rounded-borders bg-grey-1">

          <div class="row q-mb-sm">
            <div class="col-3 text-weight-bold text-grey-7">{{ t('Software Version') }}</div>
            <div class="col">
              {{ data.version || '—' }}
            </div>
          </div>

          <div class="row q-mb-sm">
            <div class="col-3 text-weight-bold text-grey-7">{{ t('Keywords') }}</div>
            <div class="col">
              <span v-if="data.keywords?.length">
                {{ data.keywords.join(', ') }}
              </span>
              <span v-else>—</span>
            </div>
          </div>

          <q-expansion-item
            expand-separator
            icon="info"
            :label="t('Additional Metadata')"
            dense
            dense-toggle
            class="rounded-borders bg-white q-mt-md shadow-1"
            >
            <q-card-section>

              <div v-if="data.metadata?.length">

                <div
                  v-for="(md, i) in data.metadata"
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

        </q-card>

        <q-separator class="q-mt-md" />
      </div>
 
      <!-- <h4>{{ data.id }} - {{ data.description }}</h4> -->
 
      <q-form @submit.prevent="validateAndSubmit">
 
        <div class="q-mb-lg">
          <div class="text-h4 text-weight-bold text-primary q-mb-sm">
            {{ t('Inputs') }}
          </div>
          <q-separator class="q-mt-md" />
        </div>
 
        <div v-for="(input, inputId) in data.inputs" :key="inputId" class="q-mb-md">
          <q-card class="q-pa-md" :ref="el => setInputRef(inputId, el)">
            <div class="row items-center justify-between q-mb-sm">
              <div class="text-blue text-bold">
                {{ inputId.toUpperCase() }}
                <span v-if="requiredInputs.includes(inputId)" class="text-red">*</span>
              </div>

              <!-- Enable checkbox for optional input -->
              <q-checkbox
                v-if="input.minOccurs === 0"
                v-model="enabledInputs[inputId]"
                :label="t('Enable')"
                dense
              />
            </div>
          <div v-if="enabledInputs[inputId] || input.minOccurs !== 0"
           :class="input.minOccurs === 0 ? 'q-pa-sm bg-grey-1 rounded-borders' : ''">
 
            <div class="q-gutter-sm">
              <q-badge
                v-if="!isBoundingBoxInput(input)"
                color="grey-3"
                text-color="black"
                class="q-mb-sm"
              >
                {{ typeLabel(input, inputId) }}
              </q-badge>
              
              <!-- Complex Input (Multiple or Single) -->
              <template v-if="isComplexInput(input)">
                <template v-if="Array.isArray(inputValues[inputId])">
                  <div
                    v-for="(item, idx) in inputValues[inputId]"
                    :key="idx"
                    class="q-gutter-sm q-mb-md"
                  >
                    <q-option-group
                      v-model="item.mode"
                      :options="[
                        { label: t('Provide URL (href)'), value: 'href' },
                        { label: t('Provide Value Inline'), value: 'value' }
                      ]"
                      type="radio"
                      inline
                    />
 
                    <template v-if="item.mode === 'href'">
                      <q-option-group
                        v-if="item.hrefOptions && item.hrefOptions.length > 0"
                        v-model="item.href"
                        :options="item.hrefOptions.map(h => ({ label: h, value: h }))"
                        type="radio"
                        inline
                      />
                      <q-input
                        v-else
                        v-model="item.href"
                        label="Reference URL (href)"
                        filled
                        dense
                        :error="validationErrors[inputId]"
                        :error-message="validationErrors[inputId] ? 'This field is required' : ''"
                      />
                    </template>
 
                    <div v-else>
                      <q-select
                        v-model="item.format"
                        :options="item.availableFormats"
                        :label="t('Content Format')"
                        dense
                        filled
                      />
                      <q-input
                        v-model="item.value"
                        :label="t('Input Value')"
                        type="textarea"
                        autogrow
                        filled
                        dense
                        :error="validationErrors[inputId]"
                        :error-message="validationErrors[inputId] ? 'This field is required' : ''"
                      />
                    </div>
 
                    <!-- Remove button -->
                    <q-btn
                      icon="delete"
                      round
                      dense
                      flat
                      color="red"
                      size="sm"
                      @click="removeInputField(inputId, idx)"
                      v-if="inputValues[inputId].length > 1"
                    >
                      <q-tooltip>Remove</q-tooltip>
                    </q-btn>
                  </div>
 
                  <!-- Add button -->
                  <q-btn
                    v-if="isMultiValueInput(input)"
                    flat
                    icon="add"
                    label="Add Another"
                    @click="addInputField(inputId)"
                    size="sm"
                    class="q-mt-sm"
                  />
                </template>
 
                <!-- Single Complex Input -->
                <template v-else>
                  <q-option-group
                    v-model="inputValues[inputId].mode"
                    :options="[
                      { label: t('Provide URL (href)'), value: 'href' },
                      { label: t('Provide Value Inline'), value: 'value' }
                    ]"
                    type="radio"
                    inline
                  />
                  <template v-if="inputValues[inputId].mode === 'href'">
                    <q-option-group
                      v-if="inputValues[inputId].hrefOptions && inputValues[inputId].hrefOptions.length > 0"
                      v-model="inputValues[inputId].href"
                      :options="inputValues[inputId].hrefOptions.map(h => ({ label: h, value: h }))"
                      type="radio"
                      inline
                    />
                    <q-input
                      v-else
                      v-model="inputValues[inputId].href"
                      label="Reference URL (href)"
                      filled
                      dense
                    />
                  </template>
                  <div v-else>
                    <q-select
                      v-model="inputValues[inputId].format"
                      :options="inputValues[inputId].availableFormats"
                      :label="t('Content Format')"
                      dense
                      filled
                    />
                    <q-input
                      v-model="inputValues[inputId].value"
                      :label="t('Input Value')"
                      type="textarea"
                      autogrow
                      filled
                      dense
                      :error="validationErrors[inputId]"
                      :error-message="validationErrors[inputId] ? 'This field is required' : ''"
                    />
                  </div>
                </template>
              </template>
 
              <!--  Bounding Box Input with Leaflet Popup -->
              <template v-else-if="isBoundingBoxInput(input)">
                <div class="bbox-input q-pa-sm bg-grey-1 rounded-borders">

                  <div class="q-mb-sm row items-center">

                    <a
                      v-if="getFormatAndRef(input).ref && getFormatAndRef(input).format"
                      :href="getFormatAndRef(input).ref"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary text-weight-medium q-mr-sm"
                    >
                      {{ getFormatAndRef(input).format }}:
                    </a>

                    <span
                      v-else
                      class="text-primary text-weight-medium q-mr-sm"
                    >
                      {{ getFormatAndRef(input).format || input.schema.type || input.schema?.$ref || '—' }}:
                    </span>
                    
                    <span class="text-grey-8">
                      [{{ inputValues[inputId].bbox.join(', ') }}]
                    </span>

                    
                    <q-btn
                      flat
                      dense
                      icon="edit"
                      class="q-ml-xs"
                      @click="openBboxPopup(inputId)"
                    >
                      <q-tooltip>Edit Bounding Box on Map</q-tooltip>
                    </q-btn>
                  </div>
 
                  <!-- CRS selector -->
                  <q-select
                    v-model="inputValues[inputId].crs"
                    :options="['EPSG:4326', 'EPSG:3857', 'EPSG:32611']"
                    :label="t('CRS / EPSG')"
                    filled
                    dense
                    emit-value
                    map-options
                  />
 
                  <!-- Optional: numeric bbox edit fields -->
                  <div class="row q-gutter-sm q-mt-sm">
                    <q-input
                      v-for="(coord, idx) in inputValues[inputId].bbox"
                      :key="idx"
                      v-model.number="inputValues[inputId].bbox[idx]"
                      :label="['minX','minY','maxX','maxY'][idx]"
                      type="number"
                      filled
                      dense
                      style="flex: 1"
                    />
                  </div>
                </div>
              </template>
 
              <!-- Multiple Value Input -->
              <template v-else-if="isMultiValueInput(input) && Array.isArray(inputValues[inputId]) && !isComplexInput(input)">
                <div
                  v-for="(val, idx) in inputValues[inputId]"
                  :key="idx"
                  class="row items-center q-gutter-sm q-mb-sm"
                >
                  <q-input
                    filled
                    v-model="inputValues[inputId][idx].value"
                    :type="input.schema?.items?.type === 'number' ? 'number' : 'text'"
                    :label="`${input.title || inputId} ${idx + 1}`"
                    dense
                    style="flex: 1"
                    :error="validationErrors[inputId]"
                    :error-message="validationErrors[inputId] ? 'This field is required' : ''"
                  />
                  <q-btn
                    icon="delete"
                    round
                    dense
                    flat
                    color="red"
                    size="sm"
                    @click="removeInputField(inputId, idx)"
                    v-if="inputValues[inputId].length > 1"
                  >
                    <q-tooltip>Remove</q-tooltip>
                  </q-btn>
                </div>

                <!-- ✅ THIS WAS MISSING -->
                <q-btn
                  v-if="isMultiValueInput(input)"
                  flat
                  icon="add"
                  label="Add Another"
                  size="sm"
                  class="q-mt-sm"
                  @click="addInputField(inputId)"
                />
              </template>
 
              <!-- Literal Input -->
              <template v-else-if="!input.schema?.enum">
                <q-input
                  v-model="inputValues[inputId]"
                  :type="input.schema?.type === 'number' ? 'number' : 'text'"
                  :label="input.title || inputId"
                  dense
                  class="q-ml-sm"
                  style="flex: 1"
                  :error="validationErrors[inputId]"
                  :error-message="validationErrors[inputId] ? 'This field is required' : ''"
                />
              </template>
 
              <!-- Enum Input -->
              <template v-else>
                <q-select
                  filled
                  v-model="inputValues[inputId]"
                  :options="input.schema.enum"
                  :label="input.title || inputId"
                  dense
                  class="q-ml-sm"
                  style="flex: 1"
                />
              </template>
            </div>
          </div>
          </q-card>
        </div>
 
        <!-- Map Dialog (Only one global instance outside v-for) -->
        <q-dialog v-model="bboxDialogVisible" persistent>
          <q-card style="width: 90vw; max-width: 1000px; height: 80vh;">
            <!-- Header Section -->
            <q-bar class="bg-primary text-white">
              <q-icon name="map" size="sm" class="q-mr-sm" />
              <div class="text-h6">Bounding Box Map</div>
              <q-space />
              <q-btn dense flat icon="close" v-close-popup />
            </q-bar>
 
            <!-- Map Section -->
            <q-card-section class="q-pa-none" style="height: calc(100% - 100px);">
              <div id="bbox-map" style="width:100%; height:100%;"></div>
            </q-card-section>
 
            <!-- Action Buttons -->
            <q-card-actions align="right" class="bg-grey-2">
              <q-btn flat label="Cancel" color="negative" @click="closeBboxPopup" />
              <q-btn color="primary" glossy label="Confirm Bounding Box" @click="confirmBboxSelection" />
            </q-card-actions>
          </q-card>
        </q-dialog>
 
 
        <div class="q-mb-lg">
          <div class="text-h4 text-weight-bold text-primary q-mb-sm">
            {{ t('Outputs') }}
          </div>
          <q-separator class="q-mt-md" />
        </div>
 
        <div v-for="(output, outputId) in data.outputs" :key="outputId" class="q-mb-md">
          <q-card class="q-pa-md">
              <div class="row items-center q-mb-sm">
                <div class="text-blue text-bold">{{ outputId.toUpperCase() }}</div>
                <q-space />
                <q-checkbox
                  v-model="outputEnabled[outputId]"
                  dense
                  :label="t('Request this output')"
                  @update:model-value="outputTouched[outputId] = true"
                />
              </div>
              <q-select
                filled
                v-if="outputValues[outputId].length > 1"
                v-model="outputValues[outputId][1].cval"
                :options="outputValues[outputId][1].enum"
                :label="t('Format')"
                dense
                class="q-ml-sm"
                style="flex: 1"
              >
                <template v-slot:prepend>
                  <q-icon name="description" color="blue" />
                </template>
              </q-select>
              <q-select
                filled
                v-if="outputValues[outputId].length > 0"
                v-model="outputValues[outputId][0].cval"
                :options="outputValues[outputId][0].enum"
                :label="t('Transmission')"
                dense
                class="q-ml-sm"
                style="flex: 1"
              >
              </q-select>
 
          </q-card>
        </div>
 
        <div class="q-mb-md">
          <q-card class="q-pa-md">
            <div class="row items-center q-mb-sm">
              <div class="text-blue text-bold">{{ t('Notification endpoints') }}</div>
              <q-space />
              <q-icon name="info" color="grey-6" size="sm">
                <q-tooltip>{{ t('URLs to receive status notifications') }}</q-tooltip>
              </q-icon>
            </div>
 
            <div class="q-gutter-md">
              <!-- Success URI -->
              <div class="q-gutter-sm row items-center">
                <q-badge color="green" text-color="white">
                  {{ t('Success') }}
                </q-badge>
                <q-input
                  filled
                  v-model="subscriberValues.successUri"
                  :label="t('Success URI')"
                  placeholder="URL called in case of success"
                  dense
                  @change="subscriberValues.successUri = $event.target.value"
                  class="q-ml-sm"
                  style="flex: 1"
                >
                  <template v-slot:prepend>
                    <q-icon name="check_circle" color="green" />
                  </template>
                </q-input>
              </div>
 
              <!-- In Progress URI -->
              <div class="q-gutter-sm row items-center">
                <q-badge color="orange" text-color="white">
                  {{ t('Progress') }}
                </q-badge>
                <q-input
                  filled
                  v-model="subscriberValues.inProgressUri"
                  :label="t('In Progress URI')"
                  placeholder="URL called during execution"
                  @change="subscriberValues.inProgressUri = $event.target.value"
                  dense
                  class="q-ml-sm"
                  style="flex: 1"
                >
                  <template v-slot:prepend>
                    <q-icon name="hourglass_empty" color="orange" />
                  </template>
                </q-input>
              </div>
 
              <!-- Failed URI -->
              <div class="q-gutter-sm row items-center">
                <q-badge color="red" text-color="white">
                  {{ t('Failed') }}
                </q-badge>
                <q-input
                  filled
                  v-model="subscriberValues.failedUri"
                  :label="t('Failed URI')"
                  placeholder="URL called in case of failure"
                  @change="subscriberValues.failedUri = $event.target.value"
                  dense
                  class="q-ml-sm"
                  style="flex: 1"
                >
                  <template v-slot:prepend>
                    <q-icon name="error" color="red" />
                  </template>
                </q-input>
              </div>
            </div>
          </q-card>
        </div>
          <q-select
            v-model="preferMode"
            :options="executionModeOptions"
            emit-value
            map-options
            :label="t('Execution Mode')"
            filled
            dense
            class="q-mb-md"
          />
        <div class="q-mt-md row q-gutter-sm items-center">
          <q-btn
            :label="t('Execute')"
            icon="play_arrow"
            type="submit"
            color="primary"
            :loading="loading || submitting"
            :disable="jobStatus === 'running' || jobStatus === 'submitted' || jobStatus === 'accepted'"
          />
          <q-btn color="primary" outline :label="t('Show JSON Preview')" @click="showDialog = true" />
          <q-btn
            v-if="jobId"
            color="secondary"
            text-color="primary"
            icon="work"
            :label="t('Open the job page')"
            :to="`/jobs/${jobId}`"
          />
          <!-- Cancel while job is running / submitted -->
          <div
            v-if="jobId && (jobStatus === 'submitted' || jobStatus === 'accepted' || jobStatus === 'running')"
            class="q-mt-md"
          >
            <q-btn
              color="negative"
              icon="cancel"
              :loading="isCanceling"
              @click="cancelJob"
              :label="isCanceling ? t('Canceling…') : t('Dismiss job')"
            />
          </div>

          <!-- Delete after job finished -->
          <div
            v-else-if="jobId && (jobStatus === 'successful' || jobStatus === 'failed')"
            class="q-mt-md"
          >
            <q-btn
              color="negative"
              outline
              icon="delete"
              :loading="isCanceling"
              @click="deleteJob"
              :label="isCanceling ? t('Deleting…') : t('Delete job')"
            />
          </div> 
        </div>
      </q-form>
 
      <q-dialog v-model="showDialog" persistent>
        <q-card style="min-width: 70vw; max-width: 90vw;">
          <q-card-section class="row items-center">
            <div class="text-h6">{{ t('Execute Request Confirmation') }}</div>
            <q-space />
            <q-btn flat dense icon="terminal" :label="t('Copy as curl')" @click="copyAsCurl" />
          </q-card-section>
 
          <q-card-section class="q-pt-none">
            <q-banner dense class="bg-grey-2 text-black q-pa-sm">
              {{ t('This is the full request that will be sent to the Execute endpoint:') }}
            </q-banner>
            <q-input
              v-model="jsonRequestPreview"
              label="execute request"
              type="textarea"
              @change="jsonRequestPreview = $event.target.value"
              required
            />
            <!-- <pre class="q-pa-sm scroll bg-grey-2" style="max-height: 400px; overflow-y: auto; white-space: pre-wrap;">
      {{ jsonRequestPreview }}
            </pre> -->
          </q-card-section>
 
          <q-card-actions align="right">
            <q-btn flat :label="t('Cancel')" color="primary" v-close-popup />
            <q-btn
              :label="t('Submit Request')"
              color="primary"
              :loading="loading || submitting"
              :disable="loading || submitting"
              @click="() => { showDialog = false; submitProcess() }"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
 
      <div v-if="submitting" class="text-caption text-primary q-mt-sm">
        {{ t('Submitting...') }}
      </div>
 
      <div class="q-mt-md" v-if="loading">
        <q-linear-progress
          :value="progressPercent / 100"
          color="primary"
          size="lg"
          rounded
        />
 
     
        <div class="row items-center justify-between q-mt-xs">
          <div class="text-caption text-primary">
            <span v-if="progressMessage">{{ progressMessage }}</span>
            <span v-else>{{ t('Status') }}: {{ jobStatus }}</span>
          </div>
 
         
          <div class="text-caption text-primary text-bold">
            {{ progressPercent }}%
          </div>
        </div>
      </div>

      <div class="q-mt-lg" v-if="response">
        <div class="row items-center q-mb-sm">
          <div class="text-h6 q-my-none">{{ t('Execution Response') }}</div>
          <q-space />
          <q-btn
            v-if="jobId"
            flat
            dense
            color="primary"
            icon="work"
            :label="t('Open the job page')"
            :to="`/jobs/${jobId}`"
          />
        </div>
        <q-banner v-if="response.error" dense rounded class="bg-red-1 text-negative q-mb-sm">
          <template #avatar><q-icon name="error" color="negative" /></template>
          {{ typeof response.error === 'string' ? response.error : (response.error.description || response.error.detail || response.error.title || t('Execution failed')) }}
        </q-banner>
        <details open>
          <summary class="text-primary text-bold cursor-pointer">{{ t('Show Raw JSON') }}</summary>
          <pre class="response-pre">{{ JSON.stringify(response, null, 2) }}</pre>
        </details>
      </div>
    </div>
    <q-banner v-else-if="loadError" dense rounded class="bg-red-1 text-negative q-ma-md">
      <template #avatar><q-icon name="error" color="negative" /></template>
      <div class="text-weight-bold">{{ t('Process not found') }}</div>
      <div class="text-body2">{{ loadError }}</div>
      <template #action>
        <q-btn flat color="primary" icon="arrow_back" :label="t('Back to the processes list')" to="/processes" />
      </template>
    </q-banner>
    <q-spinner v-else />
  </q-page>
  </div>
</template>

<style scoped>
.response-pre {
  max-height: 480px;
  overflow: auto;
  /* theme token from app.vue: light grey by day, dark grey in dark mode */
  background: var(--surface-code, #f4f4f4);
  color: inherit;
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
