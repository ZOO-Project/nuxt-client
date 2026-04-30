import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

import { parseMetadata } from '../composables/utils/metadataParser'

const fixturesDir = path.join(__dirname, "fixtures")
const outputDir = path.join(fixturesDir, "parsed-metadata")

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

const files = fs.readdirSync(fixturesDir) .filter(file => file.endsWith(".cwl"))

describe("CWL Metadata Patterns", () => {

  files.forEach((file) => {

    it(`should parse ${file} without crashing`, () => {

      const filePath = path.join(fixturesDir, file)
      const raw = fs.readFileSync(filePath, "utf8")
      const cwl = yaml.load(raw)
    
      // Should not crash
      expect(() => parseMetadata(cwl)).not.toThrow()
    
      const result = parseMetadata(cwl || {})
    
      // Should return array
      expect(Array.isArray(result)).toBe(true)

      const outputFileName = file.replace(".cwl", ".output.json")
    
      // debug visibility of metadata
      if (result.length > 0) {
        fs.writeFileSync(
          path.join(outputDir, outputFileName),
          JSON.stringify(result, null, 2)
        )
      } else {
        console.warn(`⚠️ No metadata found in ${file}`)
      }
    
      // validate stucture
      result.forEach((item: any) => {
    
        expect(item).toHaveProperty('role')
        expect(item).toHaveProperty('value')
    
        if (item.role !== null) {
          expect(typeof item.role).toBe('string')
        }
    
        const valueType = typeof item.value
    
        expect(
          valueType === 'string' ||
          valueType === 'number' ||
          valueType === 'object' ||
          item.value === null
        ).toBe(true)
    
      })
    
    })
  })

})