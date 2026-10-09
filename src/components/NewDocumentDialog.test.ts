import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './NewDocumentDialog'
import { parseDocument } from '../lib/document'

describe('template registry', () => {
  it('gives every template a distinct id, title, and badge', () => {
    const ids = TEMPLATES.map((t) => t.id)
    const titles = TEMPLATES.map((t) => t.title)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(titles).size).toBe(titles.length)
    for (const t of TEMPLATES) {
      expect(t.badge).toBeTruthy()
      expect(t.subtitle).toBeTruthy()
      expect(t.icon).toBeDefined()
    }
  })

  it('generates simple markdown with no front matter for "simple" template', () => {
    const simple = TEMPLATES.find((t) => t.id === 'simple')
    expect(simple).toBeDefined()
    const content = simple!.getContent({ theme: 'editorial', lang: 'en' })
    expect(content.startsWith('---')).toBe(false)
    expect(content).toContain('# Untitled')
    const parsed = parseDocument(content)
    expect(parsed.rawFrontMatter).toBeUndefined()
  })

  it('generates valid parseable documents for all templates', () => {
    for (const t of TEMPLATES) {
      const content = t.getContent({ theme: 'editorial', lang: 'en' })
      expect(content.length).toBeGreaterThan(10)
      const parsed = parseDocument(content)
      expect(parsed.body).toBeTruthy()
    }
  })
})
