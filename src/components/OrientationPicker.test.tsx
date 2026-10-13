import { describe, expect, it } from 'vitest'
import { parseDocument } from '../lib/document'
import { updateDocumentProperties } from '../lib/document-properties'
import { TEMPLATES } from './NewDocumentDialog'

describe('page orientation', () => {
  it('defaults existing documents to portrait and normalizes explicit landscape', () => {
    expect(parseDocument('# Existing').metadata.orientation).toBe('portrait')
    expect(parseDocument('---\norientation: Landscape\n---\n# Wide').metadata.orientation).toBe('landscape')
    expect(parseDocument('---\norientation: invalid\n---\n# Existing').metadata.orientation).toBe('portrait')
  })
  it('round-trips the orientation without changing body or custom metadata', () => {
    const original = '---\ncustom: preserved # comment\n---\n\n# Document\n'
    const wide = updateDocumentProperties(original, { orientation: 'landscape' })
    expect(parseDocument(wide).metadata.orientation).toBe('landscape')
    expect(parseDocument(wide).body).toBe(parseDocument(original).body)
    expect(wide).toContain('custom: preserved # comment')
    expect(parseDocument(updateDocumentProperties(wide, { orientation: 'portrait' })).metadata.orientation).toBe('portrait')
  })
  it('provides a landscape presentation starter with slide breaks', () => {
    const starter = TEMPLATES.find(template => template.id === 'landscape')!.getContent({ theme: 'voltage' })
    expect(parseDocument(starter).metadata).toMatchObject({ layout: 'simple', orientation: 'landscape', theme: 'voltage' })
    expect(parseDocument(starter).html.match(/folio-page-break/g)).toHaveLength(3)
  })
})
