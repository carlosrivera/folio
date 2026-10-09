import { describe, expect, it } from 'vitest'
import { diffDocuments, diffWords, splitSections } from './diff'

describe('splitSections', () => {
  it('keeps the preamble and splits at every heading', () => {
    const sections = splitSections('Intro\n\n## Uno\n\nA\n\n### Uno A\n\nB\n')
    expect(sections.map((section) => section.title)).toEqual(['Front matter and preamble', 'Uno', 'Uno A'])
    expect(sections[1].body).toBe('A')
    expect(sections[2].level).toBe(3)
  })
})

describe('diffWords', () => {
  it('marks only what changed', () => {
    const parts = diffWords('el precio es 100 pesos', 'el precio es 150 pesos')
    expect(parts.filter((part) => part.kind === 'removed').map((part) => part.text.trim())).toEqual(['100'])
    expect(parts.filter((part) => part.kind === 'added').map((part) => part.text.trim())).toEqual(['150'])
  })

  it('returns nothing but context for identical text', () => {
    expect(diffWords('igual', 'igual').every((part) => part.kind === 'same')).toBe(true)
  })

  it('handles one side being empty', () => {
    expect(diffWords('', 'nuevo').map((part) => part.kind)).toEqual(['added'])
    expect(diffWords('viejo', '').map((part) => part.kind)).toEqual(['removed'])
  })
})

describe('diffDocuments', () => {
  const before = '## 01 — Alcance\n\nTexto original.\n\n## 02 — Precio\n\nMXN $100.\n'
  const after = '## 01 — Alcance\n\nTexto original.\n\n## 02 — Precio\n\nMXN $150.\n\n## 03 — Riesgos\n\nNuevo.\n'

  it('classifies every section', () => {
    const diff = diffDocuments(before, after)
    expect(diff.summary).toEqual({ added: 1, removed: 0, changed: 1, unchanged: 1 })
    expect(diff.sections.find((section) => section.title === '03 — Riesgos')?.status).toBe('added')
    expect(diff.sections.find((section) => section.title === '02 — Precio')?.status).toBe('changed')
  })

  it('reports a dropped section as removed', () => {
    const diff = diffDocuments(after, before)
    expect(diff.summary).toMatchObject({ removed: 1 })
    expect(diff.sections.find((section) => section.status === 'removed')?.title).toBe('03 — Riesgos')
  })

  it('treats a renamed heading as a removal plus an addition', () => {
    const diff = diffDocuments('## Viejo\n\nTexto.\n', '## Nuevo\n\nTexto.\n')
    expect(diff.summary).toMatchObject({ added: 1, removed: 1, changed: 0 })
  })
})
