import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScientificTemplate, scientificBodyHtml } from './ScientificTemplate'
import { formatChromeText, parseDocument } from '../lib/document'
import { scientificStarterDocument } from '../lib/sample'
import { generateDocumentText } from '../mcp/engine'

describe('scientific articles', () => {
  it('accepts paper aliases and list metadata without inventing a publication date', () => {
    const document = parseDocument('---\nlayout: paper\nauthors: [Ada Lovelace, Alan Turing]\naffiliations: [Institution A, Institution B]\nkeywords: [models, methods]\n---\n# A study')
    expect(formatChromeText('{author}', document, 0, 1)).toBe('Ada Lovelace, Alan Turing')
    expect(document.metadata).toMatchObject({ layout: 'scientific', theme: 'scientific', authors: 'Ada Lovelace, Alan Turing', affiliations: 'Institution A\nInstitution B', keywords: 'models; methods', date: '', toc: false, header: false, footer: true })
  })
  it('renders the starter title once and preserves section source positions', () => {
    const document = parseDocument(scientificStarterDocument, true)
    const html = renderToStaticMarkup(<ScientificTemplate document={document} />)
    expect(html.match(/Title of Your Article/g)).toHaveLength(1)
    expect(html).toContain('scientific-abstract')
    expect(html).toContain('First Author, Second Author')
    expect(scientificBodyHtml(document)).toContain('data-source-from=')
    expect(html).toContain('5. Conclusion')
    expect(html).not.toContain('folio-cover')
  })
  it('keeps a leading heading when it is a different section from the title', () => {
    const document = parseDocument('---\nlayout: scientific\ntitle: Research title\nabstract: "<script>alert(1)</script>"\n---\n# Introduction\n\nBody')
    expect(scientificBodyHtml(document)).toContain('Introduction</h1>')
    expect(renderToStaticMarkup(<ScientificTemplate document={document} />)).not.toContain('<script>')
  })
  it('generates scientific papers through the document preset with valid metadata', async () => {
    const result = await generateDocumentText({ type: 'scientific-paper', title: 'A study', content: '', metadata: { authors: 'A. Author', abstract: 'Research summary.', keywords: 'models; methods' } })
    expect(parseDocument(result.markdown).metadata).toMatchObject({ layout: 'scientific', theme: 'scientific', authors: 'A. Author', abstract: 'Research summary.' })
    expect(result.lint.valid).toBe(true)
  })
})
