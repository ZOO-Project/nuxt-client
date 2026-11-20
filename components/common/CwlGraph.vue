<template>
  <div
    ref="rootEl"
    class="cwl-graph"
    :class="{ 'cwl-graph--fullscreen': isFullscreen, 'cwl-graph--panel': panelOpen }"
    :style="{ '--cwl-height': height }"
  >
    <div class="cwl-graph__toolbar row items-center no-wrap">
      <div class="cwl-graph__legend row items-center no-wrap">
        <span class="cwl-graph__legend-item"><i class="cwl-graph__swatch cwl-graph__swatch--input" />{{ counts.inputs }} {{ t('Inputs') }}</span>
        <span class="cwl-graph__legend-item"><i class="cwl-graph__swatch cwl-graph__swatch--step" />{{ counts.steps }} {{ t('Steps') }}</span>
        <span class="cwl-graph__legend-item"><i class="cwl-graph__swatch cwl-graph__swatch--output" />{{ counts.outputs }} {{ t('Outputs') }}</span>
      </div>
      <q-space />
      <div class="row items-center no-wrap">
        <q-btn flat dense round size="sm" icon="zoom_in" :disable="!ready" @click="zoomBy(1.25)"><q-tooltip>{{ t('Zoom in') }}</q-tooltip></q-btn>
        <q-btn flat dense round size="sm" icon="zoom_out" :disable="!ready" @click="zoomBy(0.8)"><q-tooltip>{{ t('Zoom out') }}</q-tooltip></q-btn>
        <q-btn flat dense round size="sm" icon="fit_screen" :disable="!ready" @click="fit"><q-tooltip>{{ t('Fit to view') }}</q-tooltip></q-btn>
        <q-btn flat dense round size="sm" icon="auto_fix_high" :disable="!ready" @click="rearrange"><q-tooltip>{{ t('Rearrange') }}</q-tooltip></q-btn>
        <q-btn flat dense round size="sm" icon="download" :disable="!ready" @click="downloadSvg"><q-tooltip>{{ t('Download SVG') }}</q-tooltip></q-btn>
        <q-btn flat dense round size="sm" :icon="panelOpen ? 'info' : 'info_outline'" :color="panelOpen ? 'primary' : undefined" @click="panelOpen = !panelOpen"><q-tooltip>{{ t('Details') }}</q-tooltip></q-btn>
        <q-btn flat dense round size="sm" :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'" @click="toggleFullscreen"><q-tooltip>{{ isFullscreen ? t('Exit fullscreen') : t('Fullscreen') }}</q-tooltip></q-btn>
      </div>
    </div>

    <div class="cwl-graph__body">
      <div class="cwl-graph__canvas">
        <svg ref="svgEl" class="cwl-workflow" xmlns="http://www.w3.org/2000/svg" />
        <div v-if="error" class="cwl-graph__overlay">
          <q-icon name="error_outline" size="md" color="negative" />
          <div class="text-weight-medium q-mt-sm">{{ t('The application package could not be displayed as a graph.') }}</div>
          <div class="text-caption q-mt-xs">{{ error }}</div>
        </div>
        <div v-else-if="loading" class="cwl-graph__overlay">
          <q-spinner-gears size="40px" color="primary" />
        </div>
        <div v-else-if="ready" class="cwl-graph__hint">{{ t('Scroll to zoom, drag the background to pan, drag a node to move it.') }}</div>
      </div>

      <aside v-if="panelOpen" class="cwl-graph__panel">
        <div v-if="!selected" class="cwl-graph__panel-empty">
          <q-icon name="touch_app" size="sm" class="q-mb-xs" />
          <div>{{ t('Select a node or a link to see its details.') }}</div>
        </div>
        <template v-else>
          <div class="row items-center no-wrap q-mb-xs">
            <span class="cwl-graph__kind" :class="`cwl-graph__kind--${selected.kind}`">{{ kindLabel(selected.kind) }}</span>
            <q-space />
            <q-btn flat dense round size="sm" icon="close" @click="clearSelection" />
          </div>
          <div class="text-subtitle1 text-weight-bold cwl-graph__break">{{ selected.label || selected.id }}</div>
          <div v-if="selected.label && selected.label !== selected.id" class="cwl-graph__mono text-caption cwl-graph__break">{{ selected.id }}</div>

          <dl class="cwl-graph__facts">
            <template v-if="selected.type">
              <dt>{{ t('Type') }}</dt>
              <dd class="cwl-graph__mono">{{ selected.type }}</dd>
            </template>
            <template v-if="selected.from">
              <dt>{{ t('From') }}</dt>
              <dd class="cwl-graph__mono">{{ selected.from }}</dd>
              <dt>{{ t('To') }}</dt>
              <dd class="cwl-graph__mono">{{ selected.to }}</dd>
            </template>
            <template v-if="selected.run">
              <dt>{{ t('Runs') }}</dt>
              <dd><span class="cwl-graph__mono">{{ selected.run.class }}</span><span v-if="selected.run.id" class="cwl-graph__mono"> · {{ selected.run.id }}</span></dd>
              <template v-if="selected.run.baseCommand">
                <dt>{{ t('Command') }}</dt>
                <dd class="cwl-graph__mono cwl-graph__break">{{ selected.run.baseCommand }}</dd>
              </template>
              <template v-if="selected.run.docker">
                <dt>{{ t('Container image') }}</dt>
                <dd class="cwl-graph__mono cwl-graph__break">{{ selected.run.docker }}</dd>
              </template>
            </template>
            <template v-if="selected.doc">
              <dt>{{ t('Documentation') }}</dt>
              <dd class="cwl-graph__doc">{{ selected.doc }}</dd>
            </template>
          </dl>

          <template v-if="selected.ports">
            <div v-if="selected.ports.in.length" class="cwl-graph__section">{{ t('Inputs') }}</div>
            <div v-for="port in selected.ports.in" :key="'in-' + port.id" class="cwl-graph__port">
              <span class="cwl-graph__mono">{{ port.id }}</span>
              <span v-if="port.type" class="cwl-graph__port-type">{{ port.type }}</span>
              <span v-if="port.source" class="cwl-graph__port-link">← {{ port.source }}</span>
            </div>
            <div v-if="selected.ports.out.length" class="cwl-graph__section">{{ t('Outputs') }}</div>
            <div v-for="port in selected.ports.out" :key="'out-' + port.id" class="cwl-graph__port">
              <span class="cwl-graph__mono">{{ port.id }}</span>
              <span v-if="port.type" class="cwl-graph__port-type">{{ port.type }}</span>
            </div>
          </template>

          <template v-if="selected.connections && selected.connections.length">
            <div class="cwl-graph__section">{{ t('Connected to') }}</div>
            <div v-for="(target, i) in selected.connections" :key="i" class="cwl-graph__port">
              <span class="cwl-graph__mono">{{ target }}</span>
            </div>
          </template>
        </template>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeType, toWorkflowDocument } from '~/composables/utils/cwlGraph'

/**
 * Interactive graph of a CWL application package, drawn by cwl-svg (Rabix) from a
 * cwlts model. Accepts the package as YAML/JSON text or as a parsed object.
 */
const props = withDefaults(defineProps<{ cwl: unknown; height?: string; name?: string }>(), {
  height: '520px',
  name: ''
})
const emit = defineEmits<{ (e: 'error', message: string): void }>()
const { t } = useI18n()

interface Port {
  id: string
  type: string
  source?: string
}
interface NodeDetails {
  kind: 'input' | 'output' | 'step' | 'edge'
  id: string
  label?: string
  type?: string
  doc?: string
  from?: string
  to?: string
  run?: { class: string; id: string; baseCommand: string; docker: string }
  ports?: { in: Port[]; out: Port[] }
  connections?: string[]
}
interface Lib {
  Workflow: any
  SVGArrangePlugin: any
  SVGEdgeHoverPlugin: any
  SVGNodeMovePlugin: any
  SelectionPlugin: any
  ZoomPlugin: any
  SvgDumper: any
  WorkflowFactory: any
}

const rootEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const loading = ref(false)
const ready = ref(false)
const error = ref<string | null>(null)
const isFullscreen = ref(false)
const panelOpen = ref(false)
const counts = ref({ inputs: 0, steps: 0, outputs: 0 })
const selected = ref<NodeDetails | null>(null)

let lib: Lib | null = null
let workflow: any = null
let resizeObserver: ResizeObserver | null = null
let fitTimer: ReturnType<typeof setTimeout> | null = null
let renderToken = 0
let documentId = ''

// cwl-svg and cwlts are CommonJS packages: depending on the bundler their named
// exports sit on the module or on `default`. Both are loaded on the client only.
const pick = (mod: any, name: string) => mod?.[name] ?? mod?.default?.[name]

const loadLib = async (): Promise<Lib> => {
  if (lib) return lib
  const [wf, arrange, hover, move, selection, zoom, dumper, models] = await Promise.all([
    import('cwl-svg/src/graph/workflow'),
    import('cwl-svg/src/plugins/arrange/arrange'),
    import('cwl-svg/src/plugins/edge-hover/edge-hover'),
    import('cwl-svg/src/plugins/node-move/node-move'),
    import('cwl-svg/src/plugins/selection/selection'),
    import('cwl-svg/src/plugins/zoom/zoom'),
    import('cwl-svg/src/utils/svg-dumper'),
    import('cwlts/models')
  ])
  lib = {
    Workflow: pick(wf, 'Workflow'),
    SVGArrangePlugin: pick(arrange, 'SVGArrangePlugin'),
    SVGEdgeHoverPlugin: pick(hover, 'SVGEdgeHoverPlugin'),
    SVGNodeMovePlugin: pick(move, 'SVGNodeMovePlugin'),
    SelectionPlugin: pick(selection, 'SelectionPlugin'),
    ZoomPlugin: pick(zoom, 'ZoomPlugin'),
    SvgDumper: pick(dumper, 'SvgDumper'),
    WorkflowFactory: pick(models, 'WorkflowFactory')
  }
  return lib
}

/** cwl-svg cannot fit a graph into an element without a size: wait for the layout. */
const waitForLayout = async () => {
  for (let i = 0; i < 30; i++) {
    const rect = svgEl.value?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) return true
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  return false
}

const destroy = () => {
  if (workflow) {
    try {
      workflow.destroy()
    } catch {
      /* already gone */
    }
    workflow = null
  }
  if (svgEl.value) svgEl.value.innerHTML = ''
  ready.value = false
  selected.value = null
}

const render = async () => {
  const token = ++renderToken
  error.value = null
  const doc = toWorkflowDocument(props.cwl)
  if (!doc) {
    destroy()
    counts.value = { inputs: 0, steps: 0, outputs: 0 }
    if (props.cwl) {
      error.value = t('The document is not a CWL workflow or tool.')
      emit('error', error.value)
    }
    return
  }
  documentId = doc.id || ''
  loading.value = true
  try {
    const l = await loadLib()
    const model = l.WorkflowFactory.from(doc.workflow, 'document')
    counts.value = { inputs: model.inputs.length, steps: model.steps.length, outputs: model.outputs.length }
    await nextTick()
    await waitForLayout()
    if (token !== renderToken || !svgEl.value) return
    destroy()
    const selection = new l.SelectionPlugin()
    // Editing stays limited to moving nodes: no port dragging, no deletion plugin.
    workflow = new l.Workflow({
      svgRoot: svgEl.value,
      model,
      editingEnabled: true,
      plugins: [
        new l.SVGArrangePlugin(),
        new l.SVGEdgeHoverPlugin(),
        new l.SVGNodeMovePlugin({ movementSpeed: 10 }),
        selection,
        new l.ZoomPlugin()
      ]
    })
    selection.registerOnSelectionChange((el: Element | null) => onSelectionChange(el))
    capLabelScale(workflow)
    fit()
    ready.value = true
  } catch (err: any) {
    destroy()
    error.value = err?.message || String(err)
    emit('error', error.value as string)
    console.warn('CwlGraph: cannot draw the document', err)
  } finally {
    if (token === renderToken) loading.value = false
  }
}

/**
 * cwl-svg enlarges the node labels as the graph is zoomed out (labelScale = 1 + (1 - s) / 2s),
 * so labels of neighbouring nodes collide on small screens: keep that growth within bounds.
 */
const LABEL_SCALE_MAX = 1.3
const capLabelScale = (wf: any) => {
  const original = wf.scaleAtPoint.bind(wf)
  wf.scaleAtPoint = (scale?: number, x?: number, y?: number) => {
    original(scale, x, y)
    if (wf.labelScale > LABEL_SCALE_MAX) {
      wf.labelScale = LABEL_SCALE_MAX
      for (const el of wf.workflow.querySelectorAll('.node .label') as NodeListOf<SVGGraphicsElement>) {
        const matrix = el.transform.baseVal.getItem(0).matrix
        matrix.a = LABEL_SCALE_MAX
        matrix.d = LABEL_SCALE_MAX
      }
    }
  }
}

/** `in/step/port` and `out/step/port` connection ids, as cwlts names them. */
const prettyConnection = (connectionId: string) => {
  const [, node, port] = connectionId.split('/')
  return !port || node === port ? node || connectionId : `${node} / ${port}`
}

const onSelectionChange = (el: Element | null) => {
  if (!el || !workflow) {
    selected.value = null
    return
  }
  const model = workflow.model
  if (el.classList.contains('edge')) {
    const sourceNode = el.getAttribute('data-source-node') || ''
    const sourcePort = el.getAttribute('data-source-port') || ''
    const targetNode = el.getAttribute('data-destination-node') || ''
    const targetPort = el.getAttribute('data-destination-port') || ''
    selected.value = {
      kind: 'edge',
      id: `${sourceNode}/${sourcePort} → ${targetNode}/${targetPort}`,
      from: sourceNode === sourcePort ? sourceNode : `${sourceNode} / ${sourcePort}`,
      to: targetNode === targetPort ? targetNode : `${targetNode} / ${targetPort}`
    }
    panelOpen.value = true
    return
  }
  const connectionId = el.getAttribute('data-connection-id')
  const edges = (model.connections || []).filter((c: any) => c.isVisible)
  const step = (model.steps || []).find((s: any) => s.connectionId === connectionId)
  if (step) {
    const run = step.run || {}
    const baseCommand = Array.isArray(run.baseCommand) ? run.baseCommand.map(String).join(' ') : run.baseCommand ? String(run.baseCommand) : ''
    selected.value = {
      kind: 'step',
      id: step.id,
      label: step.label || run.label || '',
      doc: step.description || run.description || '',
      run: { class: run.class || '', id: run.id || '', baseCommand, docker: run.docker?.dockerPull || '' },
      ports: {
        in: (step.in || []).map((p: any) => ({
          id: p.id,
          type: describeType(p.type),
          source: (Array.isArray(p.source) ? p.source : p.source ? [p.source] : []).join(', ')
        })),
        out: (step.out || []).map((p: any) => ({ id: p.id, type: describeType(p.type) }))
      }
    }
    panelOpen.value = true
    return
  }
  const input = (model.inputs || []).find((i: any) => i.connectionId === connectionId)
  if (input) {
    selected.value = {
      kind: 'input',
      id: input.id,
      label: input.label || '',
      type: describeType(input.type),
      doc: input.description || '',
      connections: edges.filter((c: any) => c.source.id === input.connectionId).map((c: any) => prettyConnection(c.destination.id))
    }
    panelOpen.value = true
    return
  }
  const output = (model.outputs || []).find((o: any) => o.connectionId === connectionId)
  if (output) {
    selected.value = {
      kind: 'output',
      id: output.id,
      label: output.label || '',
      type: describeType(output.type),
      doc: output.description || '',
      connections: edges.filter((c: any) => c.destination.id === output.connectionId).map((c: any) => prettyConnection(c.source.id))
    }
    panelOpen.value = true
    return
  }
  selected.value = null
}

const kindLabel = (kind: NodeDetails['kind']) =>
  kind === 'input' ? t('Input') : kind === 'output' ? t('Output') : kind === 'step' ? t('Step') : t('Link')

const clearSelection = () => {
  if (!workflow || !lib) return
  try {
    workflow.getPlugin(lib.SelectionPlugin)?.clearSelection()
  } catch {
    selected.value = null
  }
}

const fit = () => {
  if (!workflow || !svgEl.value) return
  try {
    workflow.fitToViewport()
    // cwl-svg never scales a graph up: let small workflows use the room they have.
    const drawing = svgEl.value.querySelector('.workflow')?.getBoundingClientRect()
    const box = svgEl.value.getBoundingClientRect()
    if (drawing && drawing.width > 0 && drawing.height > 0) {
      const room = Math.min((box.width - 140) / drawing.width, (box.height - 140) / drawing.height)
      if (room > 1.05) workflow.scale = Math.min(1.5, workflow.scale * room)
    }
  } catch {
    /* hidden viewport (closed tab, collapsed section): nothing to fit yet */
  }
}

const scheduleFit = () => {
  if (fitTimer) clearTimeout(fitTimer)
  fitTimer = setTimeout(() => {
    fitTimer = null
    fit()
  }, 150)
}

const zoomBy = (factor: number) => {
  if (!workflow) return
  const next = Math.min(workflow.maxScale, Math.max(workflow.minScale, workflow.scale * factor))
  workflow.scale = next
}

const rearrange = () => {
  if (!workflow || !lib) return
  try {
    workflow.getPlugin(lib.SVGArrangePlugin)?.arrange()
  } catch (err) {
    console.warn('CwlGraph: cannot arrange', err)
  }
}

const downloadSvg = () => {
  if (!workflow || !svgEl.value) return
  let text = ''
  try {
    text = new lib!.SvgDumper(svgEl.value).dump({ padding: 60 })
  } catch {
    text = new XMLSerializer().serializeToString(svgEl.value)
  }
  const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.name || documentId || 'workflow'}.svg`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const toggleFullscreen = () => {
  const el = rootEl.value
  if (!el) return
  if (document.fullscreenElement) document.exitFullscreen?.()
  else el.requestFullscreen?.()
}

const onFullscreenChange = () => {
  isFullscreen.value = document.fullscreenElement === rootEl.value
  requestAnimationFrame(() => fit())
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  if (typeof ResizeObserver !== 'undefined' && svgEl.value) {
    resizeObserver = new ResizeObserver(() => scheduleFit())
    resizeObserver.observe(svgEl.value)
  }
  render()
})

watch(() => props.cwl, () => render())
watch(panelOpen, () => nextTick(scheduleFit))

onBeforeUnmount(() => {
  renderToken++
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  resizeObserver?.disconnect()
  if (fitTimer) clearTimeout(fitTimer)
  destroy()
})

defineExpose({ fit, rearrange, downloadSvg })
</script>

<style>
/* Theme tokens (light); the dark variants follow Quasar's body--dark. */
.cwl-graph {
  --cwl-bg: #fbfaf4;
  --cwl-dot: rgba(102, 62, 5, 0.13);
  --cwl-border: #e3dccb;
  --cwl-surface: #ffffff;
  --cwl-text: #2f2a22;
  --cwl-muted: #7a6f5c;
  --cwl-label: #2f2a22;
  --cwl-halo: #fbfaf4;
  --cwl-ring: #ffffff;
  --cwl-ring-stroke: #c9b58a;
  --cwl-input: #efe2bd;
  --cwl-output: #cfe0c8;
  --cwl-step: #663e05;
  --cwl-step-ring: #663e05;
  --cwl-icon: #4a3a1f;
  --cwl-step-icon: #fefdeb;
  --cwl-port: #8c7a55;
  --cwl-port-hover: #663e05;
  --cwl-edge: #b8ad97;
  --cwl-edge-hover: #663e05;
  --cwl-accent: #f2c037;
  --cwl-faded: #e9e4d6;
  --cwl-faded-step: #c7b59a;
  --cwl-faded-label: #a89f8c;
  --cwl-chip: #f1ecdf;
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cwl-border);
  border-radius: 10px;
  background: var(--cwl-surface);
  color: var(--cwl-text);
  overflow: hidden;
}
body.body--dark .cwl-graph {
  --cwl-bg: #1c1a16;
  --cwl-dot: rgba(254, 253, 235, 0.09);
  --cwl-border: #3a352c;
  --cwl-surface: #24211c;
  --cwl-text: #f1ecdf;
  --cwl-muted: #b3a994;
  --cwl-label: #f1ecdf;
  --cwl-halo: #1c1a16;
  --cwl-ring: #2c2924;
  --cwl-ring-stroke: #5c5243;
  --cwl-input: #9c8448;
  --cwl-output: #5d7c5a;
  --cwl-step: #d39a3a;
  --cwl-step-ring: #d39a3a;
  --cwl-icon: #1c1a16;
  --cwl-step-icon: #1c1a16;
  --cwl-port: #b3a994;
  --cwl-port-hover: #f2c037;
  --cwl-edge: #6f6655;
  --cwl-edge-hover: #f2c037;
  --cwl-accent: #f2c037;
  --cwl-faded: #35312a;
  --cwl-faded-step: #5a4a2f;
  --cwl-faded-label: #6f6655;
  --cwl-chip: #2f2b25;
}
.cwl-graph--fullscreen {
  height: 100vh;
  border-radius: 0;
}

.cwl-graph__toolbar {
  padding: 4px 8px;
  border-bottom: 1px solid var(--cwl-border);
  background: var(--cwl-surface);
  gap: 8px;
}
.cwl-graph__legend {
  gap: 12px;
  font-size: 12px;
  color: var(--cwl-muted);
  overflow: hidden;
  white-space: nowrap;
}
.cwl-graph__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cwl-graph__swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--cwl-ring-stroke);
  box-sizing: border-box;
}
.cwl-graph__swatch--input { background: var(--cwl-input); }
.cwl-graph__swatch--output { background: var(--cwl-output); }
.cwl-graph__swatch--step { background: var(--cwl-step); border-color: var(--cwl-step-ring); }

.cwl-graph__body {
  display: flex;
  flex-direction: row;
  height: var(--cwl-height, 520px);
  min-height: 0;
}
.cwl-graph--fullscreen .cwl-graph__body {
  flex: 1;
  height: auto;
}
.cwl-graph__canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  background-color: var(--cwl-bg);
  background-image: radial-gradient(var(--cwl-dot) 1px, transparent 1px);
  background-size: 18px 18px;
}
.cwl-graph__canvas svg.cwl-workflow {
  display: block;
  width: 100%;
  height: 100%;
  background: transparent;
  color: var(--cwl-label);
  font-family: inherit;
  cursor: grab;
}
.cwl-graph__canvas svg.cwl-workflow:active {
  cursor: grabbing;
}
.cwl-graph__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  color: var(--cwl-muted);
  background: color-mix(in srgb, var(--cwl-bg) 80%, transparent);
}
.cwl-graph__hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 11px;
  color: var(--cwl-muted);
  pointer-events: none;
  opacity: 0.85;
}

/* Details panel */
.cwl-graph__panel {
  width: 280px;
  flex: none;
  overflow: auto;
  padding: 12px 14px;
  border-left: 1px solid var(--cwl-border);
  background: var(--cwl-surface);
  font-size: 13px;
}
.cwl-graph__panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--cwl-muted);
}
.cwl-graph__kind {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: var(--cwl-chip);
  color: var(--cwl-text);
}
.cwl-graph__kind--input { background: var(--cwl-input); color: #3d2f12; }
.cwl-graph__kind--output { background: var(--cwl-output); color: #1f3a1f; }
.cwl-graph__kind--step { background: var(--cwl-step); color: var(--cwl-step-icon); }
.cwl-graph__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 10px;
  margin: 10px 0 0;
}
.cwl-graph__facts dt {
  color: var(--cwl-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding-top: 2px;
}
.cwl-graph__facts dd {
  margin: 0;
  min-width: 0;
}
.cwl-graph__doc {
  white-space: pre-wrap;
}
.cwl-graph__section {
  margin-top: 12px;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--cwl-muted);
}
.cwl-graph__port {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--cwl-border);
}
.cwl-graph__port:last-child {
  border-bottom: none;
}
.cwl-graph__port-type {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--cwl-chip);
  color: var(--cwl-muted);
}
.cwl-graph__port-link {
  font-size: 11px;
  color: var(--cwl-muted);
}
.cwl-graph__mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.cwl-graph__break {
  word-break: break-all;
}
@media (max-width: 700px) {
  .cwl-graph__toolbar {
    flex-wrap: wrap;
  }
  .cwl-graph__hint {
    display: none;
  }
  .cwl-graph__facts {
    grid-template-columns: 1fr;
    gap: 2px 0;
  }
  .cwl-graph__facts dd {
    margin-bottom: 6px;
  }
  .cwl-graph__body {
    flex-direction: column;
  }
  .cwl-graph__panel {
    width: auto;
    max-height: 45%;
    border-left: none;
    border-top: 1px solid var(--cwl-border);
  }
  .cwl-graph__legend {
    font-size: 11px;
    gap: 8px;
  }
}

/* cwl-svg drawing (class names come from the library) */
.cwl-graph svg.cwl-workflow [tabindex]:active,
.cwl-graph svg.cwl-workflow [tabindex]:focus {
  outline: none;
}
.cwl-graph svg.cwl-workflow .hidden {
  display: none;
}
.cwl-graph svg.cwl-workflow .workflow {
  user-select: none;
}
.cwl-graph svg.cwl-workflow .pan-handle {
  fill: transparent;
}
.cwl-graph svg.cwl-workflow .label {
  fill: var(--cwl-label);
  stroke: var(--cwl-halo);
  stroke-width: 4px;
  text-anchor: middle;
  paint-order: stroke;
  stroke-linecap: butt;
  stroke-linejoin: miter;
  font-size: 13px;
  font-weight: 500;
}
.cwl-graph svg.cwl-workflow .label-edge {
  font-size: 11px;
  font-weight: 400;
}
.cwl-graph svg.cwl-workflow .node-icon {
  fill: var(--cwl-icon);
  stroke: var(--cwl-icon);
  stroke-width: 3px;
  stroke-linecap: round;
}
.cwl-graph svg.cwl-workflow .node .outer {
  fill: var(--cwl-ring);
  stroke: var(--cwl-ring-stroke);
  stroke-width: 2px;
  transition: stroke 0.15s, stroke-width 0.15s;
}
.cwl-graph svg.cwl-workflow .node.step .outer {
  stroke: var(--cwl-step-ring);
}
.cwl-graph svg.cwl-workflow .node .inner {
  stroke: none;
}
.cwl-graph svg.cwl-workflow .node.input .inner {
  fill: var(--cwl-input);
}
.cwl-graph svg.cwl-workflow .node.output .inner {
  fill: var(--cwl-output);
}
.cwl-graph svg.cwl-workflow .node.step .inner {
  fill: var(--cwl-step);
}
.cwl-graph svg.cwl-workflow .node.step .node-icon {
  fill: var(--cwl-step-icon);
  stroke: var(--cwl-step-icon);
}
.cwl-graph svg.cwl-workflow .node .core .inner,
.cwl-graph svg.cwl-workflow .node .core .node-icon {
  pointer-events: none;
}
.cwl-graph svg.cwl-workflow .node:hover .outer {
  stroke: var(--cwl-accent);
  stroke-width: 3px;
}
.cwl-graph svg.cwl-workflow .node:hover .port .label {
  transition: all 0.1s;
  opacity: 1;
}
.cwl-graph svg.cwl-workflow .node .port {
  fill: var(--cwl-port);
}
.cwl-graph svg.cwl-workflow .node .port:hover {
  stroke: var(--cwl-port-hover);
  stroke-width: 2px;
}
.cwl-graph svg.cwl-workflow .node .port.output-port .label {
  text-anchor: start;
  transform: translate(10px, 0);
}
.cwl-graph svg.cwl-workflow .node .port.input-port .label {
  text-anchor: end;
  transform: translate(-10px, 0);
}
.cwl-graph svg.cwl-workflow .node .port .label {
  fill: var(--cwl-label);
  opacity: 0;
  font-size: 11px;
  font-weight: 400;
  user-select: none;
  transition: all 0.1s;
  pointer-events: none;
  alignment-baseline: middle;
}
.cwl-graph svg.cwl-workflow .edge .inner,
.cwl-graph svg.cwl-workflow .edge .outer {
  fill: none;
  stroke-linecap: round;
}
.cwl-graph svg.cwl-workflow .edge .inner {
  stroke-width: 2.5px;
  stroke: var(--cwl-edge);
  transition: stroke 0.15s;
}
.cwl-graph svg.cwl-workflow .edge .outer {
  stroke-width: 7px;
  stroke: var(--cwl-bg);
}
.cwl-graph svg.cwl-workflow .edge:hover .inner {
  stroke: var(--cwl-edge-hover);
}
.cwl-graph svg.cwl-workflow .unselectable {
  user-select: none;
  cursor: pointer;
}

/* Selection plugin: fade everything but the selected element and its neighbours */
.cwl-graph svg.cwl-workflow.__plugin-selection .node,
.cwl-graph svg.cwl-workflow.__plugin-selection .edge {
  cursor: pointer;
}
.cwl-graph svg.cwl-workflow.__plugin-selection.__selection-plugin-fade .node:not(.__selection-plugin-highlight) .outer {
  stroke: var(--cwl-faded);
}
.cwl-graph svg.cwl-workflow.__plugin-selection.__selection-plugin-fade .node:not(.__selection-plugin-highlight) .inner {
  fill: var(--cwl-faded-step);
}
.cwl-graph svg.cwl-workflow.__plugin-selection.__selection-plugin-fade .node.input:not(.__selection-plugin-highlight) .inner,
.cwl-graph svg.cwl-workflow.__plugin-selection.__selection-plugin-fade .node.output:not(.__selection-plugin-highlight) .inner {
  fill: var(--cwl-faded);
}
.cwl-graph svg.cwl-workflow.__plugin-selection.__selection-plugin-fade .node:not(.__selection-plugin-highlight) .label {
  fill: var(--cwl-faded-label);
}
.cwl-graph svg.cwl-workflow.__plugin-selection.__selection-plugin-fade .node:not(.__selection-plugin-highlight) .port {
  fill: var(--cwl-faded);
}
.cwl-graph svg.cwl-workflow.__plugin-selection.__selection-plugin-fade .edge:not(.__selection-plugin-highlight) .inner {
  stroke: var(--cwl-faded);
}
.cwl-graph svg.cwl-workflow.__plugin-selection .port.__selection-plugin-highlight .label {
  opacity: 1;
}
.cwl-graph svg.cwl-workflow.__plugin-selection .__selection-plugin-highlight.edge .inner {
  stroke: var(--cwl-edge-hover);
}
.cwl-graph svg.cwl-workflow.__plugin-selection .__selection-plugin-selected.edge .inner {
  stroke: var(--cwl-accent);
  stroke-width: 3.5px;
}
.cwl-graph svg.cwl-workflow.__plugin-selection .__selection-plugin-selected.node .outer {
  stroke: var(--cwl-accent);
  stroke-width: 4px;
}
</style>
