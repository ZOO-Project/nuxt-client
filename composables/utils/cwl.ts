import yaml from 'js-yaml'

/**
 * Pure CWL helpers (no Nuxt imports).
 */
export interface CwlSummary {
  /** Identifier of the main workflow / tool ("#" prefix removed) */
  id: string | null
  /** CWL class of the main document: Workflow, CommandLineTool, ... */
  cwlClass: string | null
  cwlVersion: string | null
  label: string | null
  doc: string | null
  /** Number of $graph entries (0 for single documents) */
  graphSize: number
  /** softwareVersion (s:softwareVersion) when present */
  version: string | null
}

const stripHash = (id: unknown): string | null => {
  if (typeof id !== 'string' || !id.trim()) return null
  return id.replace(/^#/, '').trim()
}

/** Parse a CWL document (YAML or JSON text) and summarise it. */
export function summarizeCwl(text: string): CwlSummary {
  const empty: CwlSummary = { id: null, cwlClass: null, cwlVersion: null, label: null, doc: null, graphSize: 0, version: null }
  let doc: any
  try {
    doc = yaml.load(text)
  } catch {
    return empty
  }
  if (!doc || typeof doc !== 'object') return empty

  const graph = Array.isArray(doc.$graph) ? doc.$graph : null
  let main: any = doc
  if (graph) {
    main =
      graph.find((n: any) => n?.class === 'Workflow') ??
      graph.find((n: any) => stripHash(n?.id) === 'main') ??
      graph[0] ??
      null
  }

  const version =
    main?.['s:softwareVersion'] ?? doc?.['s:softwareVersion'] ?? main?.softwareVersion ?? doc?.softwareVersion ?? null

  return {
    id: stripHash(main?.id) ?? null,
    cwlClass: typeof main?.class === 'string' ? main.class : null,
    cwlVersion: typeof doc.cwlVersion === 'string' ? doc.cwlVersion : null,
    label: typeof main?.label === 'string' ? main.label : null,
    doc: typeof main?.doc === 'string' ? main.doc : null,
    graphSize: graph ? graph.length : 0,
    version: version ? String(version) : null
  }
}

/** Basic sanity check used before sending a package to the server. */
export function validateCwlText(text: string): { ok: boolean; error?: string; summary?: CwlSummary } {
  if (!text || !text.trim()) return { ok: false, error: 'The application package is empty.' }
  let doc: any
  try {
    doc = yaml.load(text)
  } catch (err: any) {
    return { ok: false, error: `Invalid YAML/JSON: ${err?.message || err}` }
  }
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'The document is not a CWL object.' }
  if (!doc.cwlVersion) return { ok: false, error: 'Missing "cwlVersion".' }
  if (!doc.$graph && !doc.class) return { ok: false, error: 'Missing "class" (or "$graph").' }
  return { ok: true, summary: summarizeCwl(text) }
}
