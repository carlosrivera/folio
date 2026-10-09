import { describe, expect, it } from 'vitest'
import { parseDocument } from './document'
import { countBySeverity, lintDocument } from './lint'

const NOW = new Date('2026-09-18T12:00:00Z')

function lint(source: string) {
  return lintDocument(source, parseDocument(source), NOW)
}

const rules = (source: string) => lint(source).map((finding) => finding.rule)

describe('lintDocument', () => {
  it('passes a clean document', () => {
    const findings = lint(`---
title: Clean
client: Acme
prepared-by: Studio
document-id: SOW-1
valid-until: December 31, 2026
---

## 01 — Alcance

Texto con un [enlace](#section-01-alcance) válido.
`)
    expect(findings).toEqual([])
  })

  it('flags an expired proposal', () => {
    expect(rules(`---
title: Old
client: Acme
prepared-by: Studio
document-id: SOW-1
valid-until: January 5, 2026
---

## Alcance
`)).toContain('valid-until-past')
  })

  it('flags raw HTML in prose but not in code', () => {
    const findings = lint(`## Alcance

Un <span>tramo</span> de texto.

\`\`\`html
<span>esto es una muestra</span>
\`\`\`
`)
    const raw = findings.filter((finding) => finding.rule === 'raw-html')
    expect(raw).toHaveLength(1)
    expect(raw[0].line).toBe(2)
  })

  it('allows <br> because it is rendered', () => {
    expect(rules('| A | B |\n| :--- | :--- |\n| uno<br>dos | tres |\n')).not.toContain('raw-html')
  })

  it('flags duplicate heading anchors', () => {
    expect(rules('## Alcance\n\nUno\n\n## Alcance\n\nDos\n')).toContain('heading-duplicate-anchor')
  })

  it('flags a link with no matching heading', () => {
    expect(rules('## Alcance\n\nVer [esto](#no-existe).\n')).toContain('anchor-missing')
  })

  it('flags an unclosed fence and an unbalanced landscape block', () => {
    expect(lint('## Alcance\n\n```ts\nconst a = 1\n').find((finding) => finding.rule === 'fence-unclosed')?.line).toBe(2)
    expect(lint('<!-- landscape -->\n\n## Alcance\n').find((finding) => finding.rule === 'landscape-unbalanced')?.line).toBe(0)
  })

  it('flags a ragged table row', () => {
    const findings = lint('## Tabla\n\n| A | B | C |\n| :--- | :--- | :--- |\n| uno | dos |\n')
    const ragged = findings.filter((finding) => finding.rule === 'table-ragged-row')
    expect(ragged).toHaveLength(1)
    expect(ragged[0].line).toBe(4)
  })

  it('flags an unknown diagram width and an unknown frontmatter key', () => {
    expect(rules('## D\n\n```mermaid width=enormous\nflowchart LR\n  A --> B\n```\n')).toContain('diagram-option-unknown')
    expect(rules('---\ntitle: T\nclient: C\nprepared-by: S\ndocument-id: D\nbudget: 100\n---\n\n## A\n')).toContain('frontmatter-unknown-key')
  })

  it('counts findings by severity', () => {
    const findings = lint(`---
title: T
client: C
prepared-by: S
document-id: D
---

## Alcance

Ver [esto](#no-existe) y <span>esto</span>.
`)
    expect(countBySeverity(findings)).toEqual({ error: 0, warning: 2, info: 0 })
  })

  it('does not flag missing client or document-id on cv layout', () => {
    const findings = lint(`---
layout: cv
title: John Doe
role: Technology Leader
email: me@example.com
header: false
footer: true
---

## Summary
Experienced engineer.
`)
    expect(findings).toEqual([])
  })

  it('recognizes header and footer frontmatter keys', () => {
    expect(rules('---\ntitle: T\nclient: C\nprepared-by: S\ndocument-id: D\nheader: false\nfooter: false\npage-header: true\npage-footer: true\nheader-left: H\nfooter-right: F\n---\n\n## A\n')).toEqual([])
  })

  it('recognizes invoice frontmatter keys without unknown key warnings', () => {
    const invoiceDoc = `---
layout: invoice
invoice-number: INV-100
date: October 9, 2026
due-date: November 9, 2026
status: Due
from: Studio
from-address: Address
from-email: email@example.com
from-phone: 555-1234
from-tax-id: VAT-123
client: Client
client-address: Address
client-email: c@example.com
subtotal: "$1,000"
tax: "$100"
total: "$1,100"
payment-terms: Net 30
---

## Services
`
    expect(rules(invoiceDoc)).toEqual([])
  })
})

