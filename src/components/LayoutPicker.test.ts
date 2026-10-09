import { describe, expect, it } from 'vitest'
import { DOCUMENT_LAYOUTS } from './LayoutPicker'
import { SUPPORTED_LAYOUTS, parseDocument } from '../lib/document'

describe('layout registry', () => {
  it('offers exactly the layouts the renderer supports', () => {
    expect(DOCUMENT_LAYOUTS.map((layout) => layout.id)).toEqual(SUPPORTED_LAYOUTS)
  })

  it('gives every layout a distinct label and title', () => {
    const labels = DOCUMENT_LAYOUTS.map((layout) => layout.label)
    const titles = DOCUMENT_LAYOUTS.map((layout) => layout.title)
    expect(new Set(labels).size).toBe(labels.length)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('round-trips every offered layout through the parser', () => {
    for (const layout of DOCUMENT_LAYOUTS) {
      expect(parseDocument(`---\nlayout: ${layout.id}\n---\n\n# T\n`).metadata.layout).toBe(layout.id)
    }
  })
})
