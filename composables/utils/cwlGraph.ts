import yaml from 'js-yaml'

/**
 * Helpers that turn a CWL document into what cwl-svg can draw (pure, no Nuxt imports).
 *
 * cwl-svg renders a cwlts `WorkflowModel`; cwlts reads a single Workflow object whose
 * steps embed the processes they run. ZOO-Project application packages are packed
 * documents (`$graph` with the tools and the workflow referencing them by `#id`), and
 * a package may also be a single CommandLineTool: both are normalised here.
 */
export interface CwlGraphDocument {
  /** Workflow document with every step `run` inlined (what cwlts' WorkflowFactory expects) */
  workflow: any
  /** CWL class of the main process of the source document (Workflow, CommandLineTool...) */
  kind: string
  id: string | null
  label: string | null
  doc: string | null
}

const stripHash = (id: unknown): string => (typeof id === 'string' ? id.replace(/^#/, '').trim() : '')
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)))

/** Parse YAML/JSON text, or pass an already parsed document through. */
export function parseCwl(input: unknown): any | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'string') {
    if (!input.trim()) return null
    try {
      const doc = yaml.load(input)
      return doc && typeof doc === 'object' ? doc : null
    } catch {
      return null
    }
  }
  return typeof input === 'object' ? input : null
}

/** CWL allows maps keyed by id as well as arrays of objects: always return the array form. */
export function toArray(collection: unknown, valueKey = 'type'): any[] {
  if (Array.isArray(collection)) return collection.filter((item) => item && typeof item === 'object')
  if (!collection || typeof collection !== 'object') return []
  return Object.entries(collection as Record<string, any>).map(([id, value]) =>
    value && typeof value === 'object' && !Array.isArray(value) ? { id, ...value } : { id, [valueKey]: value }
  )
}

/** Workflow outputs cannot be `stdout`/`stderr`: those tool outputs are files. */
const portType = (type: unknown) => (type === 'stdout' || type === 'stderr' ? 'File' : type ?? 'Any')

/**
 * A single tool has no graph of its own: draw it as a one-step workflow between its
 * inputs and its outputs.
 */
function wrapTool(tool: any, cwlVersion: string) {
  const id = stripHash(tool.id) || 'tool'
  const inputs = toArray(tool.inputs)
    .map((input) => ({ id: stripHash(input.id), type: input.type ?? 'Any', label: input.label, doc: input.doc }))
    .filter((input) => input.id)
  const outputs = toArray(tool.outputs)
    .map((output) => ({ id: stripHash(output.id), type: portType(output.type), label: output.label, doc: output.doc }))
    .filter((output) => output.id)
  const taken = new Set([...inputs, ...outputs].map((port) => port.id))
  let stepId = id
  while (taken.has(stepId)) stepId = `${stepId}_step`
  return {
    cwlVersion,
    class: 'Workflow',
    id,
    label: tool.label,
    doc: tool.doc,
    inputs,
    outputs: outputs.map((output) => ({ ...output, outputSource: `${stepId}/${output.id}` })),
    steps: [
      {
        id: stepId,
        label: tool.label || id,
        run: { ...tool, cwlVersion: tool.cwlVersion || cwlVersion },
        in: inputs.map((input) => ({ id: input.id, source: input.id })),
        out: outputs.map((output) => output.id)
      }
    ]
  }
}

/**
 * Pick the main process of a (possibly packed) document and inline the `run`
 * references of its steps, so that cwlts can read the tools' ports and types.
 * Returns null when the input is not a CWL process.
 */
export function toWorkflowDocument(input: unknown): CwlGraphDocument | null {
  const doc = parseCwl(input)
  if (!doc) return null
  const graph = Array.isArray(doc.$graph) ? doc.$graph.filter((node: any) => node && typeof node === 'object') : null
  const byId = new Map<string, any>()
  if (graph) for (const node of graph) byId.set(stripHash(node.id), node)
  const main = graph
    ? (graph.find((node: any) => stripHash(node.id) === 'main') ??
      graph.find((node: any) => node.class === 'Workflow') ??
      graph[0])
    : doc
  if (!main || typeof main.class !== 'string') return null
  const cwlVersion =
    typeof main.cwlVersion === 'string' ? main.cwlVersion : typeof doc.cwlVersion === 'string' ? doc.cwlVersion : 'v1.0'

  const resolveRun = (run: any, depth: number): any => {
    if (typeof run === 'string') {
      const target = byId.get(stripHash(run))
      return target ? resolveRun(clone(target), depth) : run
    }
    if (!run || typeof run !== 'object') return run
    const copy = { ...run, cwlVersion: run.cwlVersion || cwlVersion }
    // Sub-workflows: inline their own steps too (bounded, in case of a reference cycle).
    if (copy.class === 'Workflow' && depth < 8) copy.steps = resolveSteps(copy.steps, depth + 1)
    return copy
  }
  const resolveSteps = (steps: unknown, depth: number) =>
    toArray(steps).map((step) => ({ ...step, run: resolveRun(step.run, depth) }))

  const workflow =
    main.class === 'Workflow'
      ? { ...clone(main), cwlVersion, steps: resolveSteps(main.steps, 0) }
      : wrapTool(clone(main), cwlVersion)

  return {
    workflow,
    kind: main.class,
    id: stripHash(main.id) || null,
    label: typeof main.label === 'string' ? main.label : null,
    doc: typeof main.doc === 'string' ? main.doc : null
  }
}

/** Short, CWL-like rendering of a cwlts `ParameterTypeModel` (or a raw CWL type). */
export function describeType(type: any): string {
  if (!type) return ''
  if (typeof type === 'string') return type
  if (Array.isArray(type)) return type.map(describeType).filter(Boolean).join(' | ')
  let base: string
  if (type.type === 'array') base = `${describeType(type.items) || 'Any'}[]`
  else if (type.type === 'enum' && Array.isArray(type.symbols) && type.symbols.length) base = `enum(${type.symbols.join(' | ')})`
  else if (type.type === 'record') base = type.name ? `record ${type.name}` : 'record'
  else base = typeof type.type === 'string' ? type.type : 'Any'
  return `${base}${type.isNullable ? '?' : ''}`
}
