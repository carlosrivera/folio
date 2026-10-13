import { describe, expect, it } from 'vitest'
import { editableInlineAt, indentMarkdownList } from './markdown-editing'
import { formatMarkdown } from './editor-format'
import { editMarkdownTable } from './markdown-table'
import { updateDocumentProperties } from './document-properties'
import { parseDocument } from './document'

describe('Markdown writing tools', () => {
  it('edits real inline links and images, retaining captions and widths, but ignores code', () => {
    const text = '![A](<images/a b.png> "Caption") {width=50%}\n\n[Web](https://example.com/a_(b))\n'
    expect(editableInlineAt(text, 5)).toMatchObject({ kind: 'image', label: 'A', source: 'images/a%20b.png', caption: 'Caption', width: 50, to: text.indexOf('\n') })
    expect(editableInlineAt(text, text.indexOf('Web'))).toMatchObject({ kind: 'link', source: 'https://example.com/a_(b)' })
    expect(editableInlineAt('`![A](image.png)`', 5)).toBeNull()
    expect(editableInlineAt('[A][ref]\n\n[ref]: image.png', 2)).toMatchObject({ kind: 'link', label: 'A', source: 'image.png' })
  })
  it('indents and outdents selected list items and leaves code untouched', () => {
    const text = '- Parent\n- Child\n- Sibling'
    const from = text.indexOf('Child'), to = text.length
    const nested = indentMarkdownList(text, from, to, false)!
    expect(nested.text).toBe('- Parent\n    - Child\n    - Sibling')
    expect(indentMarkdownList(nested.text, nested.from, nested.to, true)?.text).toBe(text)
    expect(indentMarkdownList('```\n- code\n```', 10, 10, false)).toBeNull()
  })
  it('inserts unique footnotes and task lists without duplicate list markers', () => {
    const source = 'Text[^1]\n\n[^1]: Existing'
    const note = formatMarkdown(source, 0, 4, 'footnote')
    expect(note.text).toContain('[^2]: Text')
    expect(note.text.slice(note.from, note.to)).toBe('Text')
    expect(formatMarkdown('- Item', 0, 6, 'task-list').text).toBe('- [ ] Item')
    expect(formatMarkdown('- [x] Item', 0, 10, 'task-list').text).toBe('Item')
    expect(formatMarkdown('- [ ] Item', 0, 10, 'toggle-task').text).toBe('- [x] Item')
    expect(formatMarkdown('- [x] Item', 0, 10, 'toggle-task').text).toBe('- [ ] Item')
  })
  it('aligns the active table column while preserving its data', () => {
    const source = '| A | B |\n| --- | --- |\n| One | Two |'
    const result = editMarkdownTable(source, source.indexOf('Two'), 'align-right')!
    expect(result.text).toContain('| --- | ---: |')
    expect(result.text).toContain('| One | Two |')
  })
  it('preserves custom YAML and comments and respects disabled page chrome', () => {
    const source = '---\n# Keep this\ncustom: value\npreparedBy: Old\nheader-left: Branding\n---\n\n# Body'
    const result = updateDocumentProperties(source, { 'prepared-by': 'New', header: false, footer: false, 'footer-right': '{page}', title: 'New title' })
    expect(result).toContain('# Keep this')
    expect(result).toContain('custom: value')
    expect(result).not.toContain('preparedBy:')
    expect(result).toContain('\n\n# Body')
    expect(parseDocument(result).metadata).toMatchObject({ preparedBy: 'New', header: false, footer: false })
    expect(() => updateDocumentProperties('---\na: [broken\n---\n# Body', { title: 'New' })).toThrow(/YAML/)
  })
  it('renders task lists and footnotes and consumes image sizing syntax', () => {
    const html = parseDocument('- [ ] Pending\n- [x] Done\n\nNote[^1]\n\n[^1]: **Evidence**\n\n![A](a.png "Caption") {width=45%}').html
    expect(html.match(/class="task-checkbox"/g)).toHaveLength(2)
    expect(html).toContain('disabled checked')
    expect(html).toContain('footnote-ref')
    expect(html).toContain('<strong>Evidence</strong>')
    expect(html).toContain('data-image-width="45"')
    expect(html).not.toContain('{width=')
    expect(parseDocument('Paragraph [x] should stay text.').html).not.toContain('task-checkbox')
  })
})
