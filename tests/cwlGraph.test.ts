import { describe, expect, it } from 'vitest'
import * as models from 'cwlts/models'
import { describeType, toArray, toWorkflowDocument } from '../composables/utils/cwlGraph'

// cwlts is a CommonJS package: its named exports may sit on `default` depending on the loader.
const WorkflowFactory = (models as any).WorkflowFactory ?? (models as any).default?.WorkflowFactory

const packed = `
cwlVersion: v1.0
$namespaces:
  s: https://schema.org/
$graph:
  - class: CommandLineTool
    id: hello
    baseCommand: echo
    requirements:
      DockerRequirement:
        dockerPull: alpine:3
    inputs:
      name: string
    outputs:
      results:
        type: Directory
        outputBinding: { glob: . }
  - class: Workflow
    id: main
    label: Hello
    doc: Says hello
    inputs:
      name:
        type: string
        label: Name
    outputs:
      results:
        type: Directory
        outputSource: step_hello/results
    steps:
      step_hello:
        run: '#hello'
        in:
          name: name
        out: [results]
`

const tool = `
cwlVersion: v1.2
class: CommandLineTool
id: echo
label: Echo
baseCommand: echo
inputs:
  - id: msg
    type: string
  - id: times
    type: int?
outputs:
  - id: res
    type: stdout
`

describe('toWorkflowDocument', () => {
  it('resolves the $graph references of a packed document', () => {
    const doc = toWorkflowDocument(packed)!
    expect(doc.kind).toBe('Workflow')
    expect(doc.id).toBe('main')
    expect(doc.label).toBe('Hello')
    expect(doc.workflow.cwlVersion).toBe('v1.0')
    expect(doc.workflow.steps).toHaveLength(1)
    expect(doc.workflow.steps[0].id).toBe('step_hello')
    expect(doc.workflow.steps[0].run.class).toBe('CommandLineTool')
    expect(doc.workflow.steps[0].run.id).toBe('hello')
  })

  it('builds a cwlts model cwl-svg can draw from a packed document', () => {
    const doc = toWorkflowDocument(packed)!
    const model = WorkflowFactory.from(doc.workflow, 'document')
    expect(model.inputs.map((i: any) => i.id)).toEqual(['name'])
    expect(model.outputs.map((o: any) => o.id)).toEqual(['results'])
    expect(model.steps).toHaveLength(1)
    const step = model.steps[0]
    expect(step.run.class).toBe('CommandLineTool')
    expect(step.run.docker.dockerPull).toBe('alpine:3')
    expect(step.in.map((p: any) => `${p.id}:${p.type.type}`)).toEqual(['name:string'])
    expect(step.out.map((p: any) => `${p.id}:${p.type.type}`)).toEqual(['results:Directory'])
    const edges = model.connections.filter((c: any) => c.isVisible).map((c: any) => `${c.source.id} -> ${c.destination.id}`)
    expect(edges).toEqual(['out/name/name -> in/step_hello/name', 'out/step_hello/results -> in/results/results'])
  })

  it('draws a single tool as a one-step workflow', () => {
    const doc = toWorkflowDocument(tool)!
    expect(doc.kind).toBe('CommandLineTool')
    expect(doc.id).toBe('echo')
    expect(doc.workflow.class).toBe('Workflow')
    expect(doc.workflow.inputs.map((i: any) => i.id)).toEqual(['msg', 'times'])
    expect(doc.workflow.outputs[0]).toMatchObject({ id: 'res', type: 'File', outputSource: 'echo/res' })
    const model = WorkflowFactory.from(doc.workflow, 'document')
    expect(model.steps[0].label).toBe('Echo')
    expect(model.connections.filter((c: any) => c.isVisible)).toHaveLength(3)
  })

  it('accepts parsed objects and rejects anything else', () => {
    expect(toWorkflowDocument({ cwlVersion: 'v1.0', class: 'Workflow', inputs: {}, outputs: {}, steps: {} })?.kind).toBe('Workflow')
    expect(toWorkflowDocument('')).toBeNull()
    expect(toWorkflowDocument('just: yaml')).toBeNull()
    expect(toWorkflowDocument('{{ not yaml')).toBeNull()
    expect(toWorkflowDocument(42)).toBeNull()
  })
})

describe('toArray', () => {
  it('turns id-keyed maps into arrays and keeps arrays', () => {
    expect(toArray({ a: 'string', b: { type: 'File', doc: 'x' } })).toEqual([
      { id: 'a', type: 'string' },
      { id: 'b', type: 'File', doc: 'x' }
    ])
    expect(toArray([{ id: 'a' }, null])).toEqual([{ id: 'a' }])
    expect(toArray(undefined)).toEqual([])
  })
})

describe('describeType', () => {
  it('renders cwlts parameter types the CWL way', () => {
    expect(describeType({ type: 'string' })).toBe('string')
    expect(describeType({ type: 'array', items: 'File', isNullable: true })).toBe('File[]?')
    expect(describeType({ type: 'enum', symbols: ['a', 'b'] })).toBe('enum(a | b)')
    expect(describeType({ type: 'record', name: 'Point' })).toBe('record Point')
    expect(describeType('int?')).toBe('int?')
    expect(describeType(null)).toBe('')
  })
})
