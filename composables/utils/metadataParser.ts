export function parseMetadata(cwl: any) {
  try {
    if (!cwl) return []

    const metadata: any[] = []

    // Explicit metadata field
    if (Array.isArray(cwl.metadata)) {
      return cwl.metadata.map((m: any) => ({
        role: m?.role ?? null,
        title: m?.title ?? null,
        value: m?.value ?? null
      }))
    }

    // Scan top-level keys for schema.org properties 
    Object.entries(cwl).forEach(([key, value]) => {
      if (key.startsWith('s:')) {
        metadata.push({
          role: `https://schema.org/${key.replace('s:', '')}`,
          title: null,
          value
        })
      }
    })

    // $graph nodes
    if (Array.isArray(cwl.$graph)) {
      cwl.$graph.forEach((node: any) => {
        Object.entries(node).forEach(([key, value]) => {
          if (key.startsWith('s:')) {
            metadata.push({
              role: `https://schema.org/${key.replace('s:', '')}`,
              title: null,
              value
            })
          }
        })
      })
    }

    return metadata

  } catch (err) {
    console.error("Metadata parsing failed:", err)
    return []
  }
}