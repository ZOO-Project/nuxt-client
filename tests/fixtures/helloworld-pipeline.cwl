cwlVersion: v1.2
$namespaces:
  s: https://schema.org/
  edam: http://edamontology.org/
$graph:
- class: Workflow
  id: helloworld_pipeline
  inputs:
    seconds:
      type: int?
      doc: number of seconds
    name:
      type: string
      doc: Some keyword
  steps:
    step_sleep:
      when: $(inputs.seconds != null)
      run: '#sleep'
      in:
        seconds: seconds
      out:
      - res
    step_helloworld:
      run: '#helloworld'
      in:
        name: name
      out:
      - result
    step_2stac:
      run: '#2stac2_simulation'
      in:
        result: step_helloworld/result
      out:
      - stac_result
  outputs:
  - id: wf_outputs
    outputSource:
    - step_2stac/stac_result
    type: Directory
  requirements:
    InlineJavascriptRequirement: {}
  s:name: helloworld_pipeline
  s:description: 'This pipeline runs the helloworld tool and returns the result.

    '
  s:keywords:
  - helloworld
  s:softwareVersion: 0.4.0
  s:producer:
    class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:sourceOrganization:
  - class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:author:
  - class: s:Person
    s:name: Miguel Correia
    s:email: miguel.r.correia@inesctec.pt
  s:dateCreated: '2025-11-24T23:07:35Z'
  s:identifier: urn:apkg:workflow:inesctec:pt:helloworld_pipeline:0.4.0
  s:sdDatePublished: '2025-11-24T23:11:32.936364Z'
  s:sdPublisher:
    class: Organization
    name: Application Package Registry
    url: https://iliad-registry.inesctec.pt
- class: CommandLineTool
  id: sleep
  baseCommand: app-sleep
  arguments:
  - --seconds
  - valueFrom: $( inputs.seconds )
  inputs:
    seconds:
      type: int
      doc: seconds to sleep
  outputs:
    res:
      format: edam:format_3464
      type: File
      outputBinding:
        glob: result/res.json
      doc: tree list
  requirements:
    EnvVarRequirement:
      envDef:
        PATH: /opt/conda/envs/application/bin:/opt/conda/condabin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    ResourceRequirement: {}
    InlineJavascriptRequirement: {}
    DockerRequirement:
      dockerPull: iliad-repository.inesctec.pt/sleep:0.1.0
  s:name: sleep
  s:description: sleep time in seconds
  s:keywords:
  - sleep
  - simulation
  s:programmingLanguage: python
  s:softwareVersion: 0.1.0
  s:producer:
    class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:sourceOrganization:
  - class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:author:
  - class: s:Person
    s:name: Miguel Correia
    s:email: miguel.r.correia@inesctec.pt
  s:dateCreated: '2025-11-13T21:43:12Z'
- class: CommandLineTool
  id: helloworld
  baseCommand: python
  arguments:
  - /opt/helloworld.py
  - valueFrom: $( inputs.name )
  inputs:
    name:
      type: string
      doc: Some keyword
  outputs:
    result:
      type: File
      outputBinding:
        glob: result.txt
      doc: result file
  requirements:
    ResourceRequirement: {}
    InlineJavascriptRequirement: {}
    DockerRequirement:
      dockerPull: iliad-repository.inesctec.pt/hello-world:0.1.0
  s:name: helloworld
  s:description: Hello World example
  s:keywords:
  - helloworld
  - example
  - simple
  s:programmingLanguage: python
  s:softwareVersion: 0.1.0
  s:producer:
    class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:sourceOrganization:
  - class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:author:
  - class: s:Person
    s:name: Miguel Correia
    s:email: miguel.r.correia@inesctec.pt
  s:dateCreated: '2025-11-13T17:24:46Z'
- class: CommandLineTool
  id: 2stac2_simulation
  baseCommand: python
  arguments:
  - /opt/2stac2.py
  - --file
  - valueFrom: $(inputs.result)
  - --metadata
  - valueFrom: $(runtime.outdir + '/metadata.json')
  inputs:
    result:
      type: File
      doc: The resulting file of the previous model to insert in STAC
  outputs:
    stac_result:
      outputBinding:
        glob: stac_result
      type: Directory
      doc: STAC output
  requirements:
    ResourceRequirement: {}
    EnvVarRequirement:
      envDef:
        PATH: /opt/conda/envs/application/bin:/opt/conda/condabin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    InlineJavascriptRequirement: {}
    DockerRequirement:
      dockerPull: iliad-repository.inesctec.pt/2stac2:0.3.1
    InitialWorkDirRequirement:
      listing: "${\n\n  return [{\n    \"class\": \"File\",\n    \"basename\": \"\
        metadata.json\",\n    \"contents\": JSON.stringify([{\n      \"filename\"\
        : inputs.result.basename,\n      \"description\": \"This is an example metadata\
        \ file for 2stac2.\",\n      \"keywords\": [\"example\", \"metadata\", \"\
        helloworld\"],\n      \"bbox\": [-180, -90, 180, 90],\n      \"datetime\"\
        : new Date().toISOString(),\n      \"media_type\": \"text/plain\",\n     \
        \ \"geometry\": {\n        \"type\": \"Polygon\",\n        \"coordinates\"\
        : [\n          [\n            [-180, -90],\n            [-180, 90],\n    \
        \        [180, 90],\n            [180, -90],\n            [-180, -90]\n  \
        \        ]\n        ]\n      },\n    }])}];\n}\n"
  s:name: 2stac2_simulation
  s:softwareVersion: 0.3.1
  s:description: Simulates a STAC result
  s:keywords:
  - stac
  - metadata
  s:programmingLanguage: python
  s:producer:
    class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:sourceOrganization:
  - class: s:Organization
    s:name: INESCTEC
    s:url: https://inesctec.pt
    s:address:
      class: s:PostalAddress
      s:addressCountry: PT
  s:author:
  - class: s:Person
    s:name: Miguel Correia
    s:email: miguel.r.correia@inesctec.pt
  s:dateCreated: '2025-11-17T16:08:31Z'
