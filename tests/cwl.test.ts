import { describe, expect, it } from 'vitest'
import { summarizeCwl, validateCwlText } from '../composables/utils/cwl'

const single = `
cwlVersion: v1.2
class: CommandLineTool
id: echo-tool
label: Echo
baseCommand: echo
inputs: {}
outputs: {}
`

const graph = `
cwlVersion: v1.0
$namespaces:
  s: https://schema.org/
s:softwareVersion: 1.2.3
$graph:
  - class: CommandLineTool
    id: step
    baseCommand: ls
    inputs: {}
    outputs: {}
  - class: Workflow
    id: water-bodies
    label: Water bodies
    doc: Detects water bodies
    inputs: {}
    outputs: {}
    steps: {}
`

describe('summarizeCwl', () => {
  it('summarises a single document', () => {
    const s = summarizeCwl(single)
    expect(s.id).toBe('echo-tool')
    expect(s.cwlClass).toBe('CommandLineTool')
    expect(s.cwlVersion).toBe('v1.2')
    expect(s.graphSize).toBe(0)
  })
  it('picks the Workflow of a $graph and reads schema.org version', () => {
    const s = summarizeCwl(graph)
    expect(s.id).toBe('water-bodies')
    expect(s.cwlClass).toBe('Workflow')
    expect(s.graphSize).toBe(2)
    expect(s.version).toBe('1.2.3')
  })
  it('tolerates garbage', () => {
    expect(summarizeCwl('not: [valid').id).toBeNull()
  })
})

describe('validateCwlText', () => {
  it('accepts valid packages and rejects broken ones', () => {
    expect(validateCwlText(graph).ok).toBe(true)
    expect(validateCwlText('').ok).toBe(false)
    expect(validateCwlText('class: Workflow').error).toMatch(/cwlVersion/)
    expect(validateCwlText('not: [valid').error).toMatch(/Invalid YAML/)
  })
})
