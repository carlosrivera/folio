import { describe, expect, it } from 'vitest'
import { SUPPORTED_THEMES, SUPPORTED_LAYOUTS, parseDocument, formatChromeText, upsertLanguage, upsertLayout, upsertTheme, upsertThemeOverrides, suggestedFileName } from './document'

describe('upsertLanguage', () => {
  it('persists a language choice in a document without front matter', () => {
    const result = upsertLanguage('# Hello\n', 'es')
    expect(parseDocument(result).metadata.lang).toBe('es')
    expect(result).toContain('# Hello')
  })

  it('replaces both supported language keys without losing the body', () => {
    const result = upsertLanguage('---\nlanguage: es\nlang: en\ntitle: Test\n---\n\n# Body', 'es')
    expect(parseDocument(result).metadata.lang).toBe('es')
    expect(result.match(/^(lang|language):/gm)).toHaveLength(1)
    expect(result).toContain('# Body')
  })
})

describe('parseDocument', () => {
  it('separates metadata from Markdown content', () => {
    const parsed = parseDocument(`---
title: Product Launch
client: Acme & Co
prepared-for: Jamie Rivera
document-id: SOW-42
---

# Statement of Work

Hello **world**.`)

    expect(parsed.metadata).toMatchObject({
      title: 'Product Launch',
      client: 'Acme & Co',
      preparedFor: 'Jamie Rivera',
      documentId: 'SOW-42',
    })
    expect(parsed.body).not.toContain('document-id')
    expect(parsed.html).toContain('<strong>world</strong>')
  })

  it('infers a title from the first level-one heading', () => {
    expect(parseDocument('# A useful title\n\nBody').metadata.title).toBe('A useful title')
  })

  it('does not enable raw HTML in imported Markdown', () => {
    expect(parseDocument('<script>alert(1)</script>').html).toContain('&lt;script&gt;')
  })

  it('marks Mermaid fences for themed diagram rendering', () => {
    const parsed = parseDocument('```mermaid\nflowchart LR\n  A --> B\n```')
    expect(parsed.html).toContain('class="mermaid-diagram"')
    expect(parsed.html).toContain('data-mermaid-source="')
    expect(parsed.html).toContain('Zmxvd2NoYXJ0IExSCiAgQSAtLT4gQg==')
  })

  it('renders inline and display LaTeX while preserving code', () => {
    const parsed = parseDocument([
      '# Equations',
      '',
      String.raw`Euler wrote $e^{i\pi}+1=0$.`,
      '',
      '$$',
      String.raw`\frac{a}{b}=c`,
      '$$',
      '',
      String.raw`\(x+y\)`,
      '',
      String.raw`\[z^2\]`,
      '',
      '```tex',
      '$not math$',
      '```',
    ].join('\n'))
    expect(parsed.html).toContain('katex-display')
    expect(parsed.html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(4)
    expect(parsed.html).toContain('>$not math$\n</code>')
    expect(parsed.html).toContain('<math')
  })

  it('renders a fenced math block and keeps an unmatched dollar literal', () => {
    const parsed = parseDocument('Cost: $48,000\n\n```math\nx^2 + y^2 = z^2\n```')
    expect(parsed.html).toContain('Cost: $48,000')
    expect(parsed.html).toContain('katex-display')
  })

  it('keeps malformed LaTeX editable without breaking the document', () => {
    const parsed = parseDocument(String.raw`The result is $\notacommand{x}$.`)
    expect(parsed.html).toContain('class="katex"')
    expect(parsed.html).toContain('\\notacommand')
    expect(parsed.html).toContain('The result is')
  })

  it('keeps rendering if front matter is malformed', () => {
    const parsed = parseDocument('---\ntitle: [broken\n---\n# Safe fallback')
    expect(parsed.metadata.title).toBe('Safe fallback')
    expect(parsed.html).toContain('Safe fallback')
  })

  it('detects language and theme from frontmatter', () => {
    const parsed = parseDocument(`---
title: Propuesta
lang: es
theme: voltage
---
# Introducción`)
    expect(parsed.metadata.lang).toBe('es')
    expect(parsed.metadata.theme).toBe('voltage')
  })

  it('converts pagebreak comments and macros into folio-page-break elements', () => {
    const parsed = parseDocument(`
# Seccion 1
Texto 1

<!-- pagebreak -->

# Seccion 2
Texto 2

\\pagebreak

# Seccion 3
`)
    expect(parsed.html).toContain('<div class="folio-page-break"></div>')
  })

  it('extracts table of contents items with slugified IDs', () => {
    const parsed = parseDocument(`
## 01 — Resumen Ejecutivo
Contenido 1
## 02 — Entendimiento del Estado Actual
Contenido 2
### 2.1 Detalle Técnico
Contenido 3
`)
    expect(parsed.toc.length).toBe(3)
    expect(parsed.toc[0]).toMatchObject({
      level: 2,
      text: '01 — Resumen Ejecutivo',
      id: 'section-01-resumen-ejecutivo',
    })
    expect(parsed.html).toContain('id="section-01-resumen-ejecutivo"')
  })

  it('never starts an id with a digit, so it stays a valid CSS selector', () => {
    const parsed = parseDocument('## 2.1 Detalle Técnico\n')
    expect(parsed.toc[0].id).toBe('section-2-1-detalle-tecnico')
    expect(() => globalThis.document?.querySelector(`#${parsed.toc[0].id}`)).not.toThrow()
  })
})

describe('suggestedFileName', () => {
  it('creates a portable PDF basename', () => {
    expect(suggestedFileName('Crème & Co. — 2026 SOW')).toBe('creme-co-2026-sow')
  })

  it('falls back for titles without portable characters', () => {
    expect(suggestedFileName('文書')).toBe('document')
  })
})

describe('upsertThemeOverrides', () => {
  const base = '---\ntitle: T\nclient: C\ntheme: voltage\n---\n\n# Body\n\nTexto.\n'

  it('adds a block and keeps the other keys', () => {
    const next = upsertThemeOverrides(base, { 'cover-bg': '#101010' })
    expect(next).toContain('theme: voltage')
    expect(next).toContain('cover-bg: "#101010"')
    expect(next).toContain('# Body')
    expect(parseDocument(next).metadata.themeOverrides).toEqual({ 'cover-bg': '#101010' })
  })

  it('replaces an existing block rather than appending', () => {
    const once = upsertThemeOverrides(base, { 'cover-bg': '#101010' })
    const twice = upsertThemeOverrides(once, { heading: '#222222' })
    expect(twice.match(/theme-overrides:/g)).toHaveLength(1)
    expect(parseDocument(twice).metadata.themeOverrides).toEqual({ heading: '#222222' })
  })

  it('removes the block when nothing is overridden any more', () => {
    const cleared = upsertThemeOverrides(upsertThemeOverrides(base, { 'cover-bg': '#101010' }), {})
    expect(cleared).not.toContain('theme-overrides')
    expect(parseDocument(cleared).metadata.client).toBe('C')
    expect(cleared).toContain('# Body')
  })

  it('creates frontmatter when a document has none', () => {
    const next = upsertThemeOverrides('# Body\n', { heading: '#333333' })
    expect(next.startsWith('---\n')).toBe(true)
    expect(parseDocument(next).metadata.themeOverrides).toEqual({ heading: '#333333' })
  })

  it('drops unknown or unsafe token values', () => {
    const parsed = parseDocument('---\ntheme-overrides:\n  heading: "#123456"\n  bogus-token: "red"\n  link: "red; } body { display: none"\n---\n\n# B\n')
    expect(parsed.metadata.themeOverrides).toEqual({ heading: '#123456' })
  })
})

describe('upsertTheme', () => {
  it('updates an existing theme without changing other frontmatter', () => {
    const source = '---\ntitle: T\ntheme: editorial\nclient: C\n---\n\n# Body\n'
    const next = upsertTheme(source, 'graphite')

    expect(next).toBe('---\ntitle: T\ntheme: graphite\nclient: C\n---\n\n# Body\n')
    expect(parseDocument(next).metadata.theme).toBe('graphite')
  })

  it('adds the theme to existing frontmatter', () => {
    const next = upsertTheme('---\ntitle: T\n---\n\n# Body\n', 'voltage')

    expect(next).toContain('title: T\ntheme: voltage')
    expect(parseDocument(next).metadata.theme).toBe('voltage')
  })

  it('creates frontmatter when the document has none', () => {
    const next = upsertTheme('# Body\n', 'slate')

    expect(next).toBe('---\ntheme: slate\n---\n\n# Body\n')
    expect(parseDocument(next).metadata.theme).toBe('slate')
  })

  it('preserves CRLF line endings', () => {
    const next = upsertTheme('---\r\ntitle: T\r\n---\r\n\r\n# Body\r\n', 'nocturne')

    expect(next).toBe('---\r\ntitle: T\r\ntheme: nocturne\r\n---\r\n\r\n# Body\r\n')
  })
})

describe('template selection', () => {
  const withTheme = (theme: string) => parseDocument(`---\ntheme: ${theme}\n---\n\n# T\n`).metadata.theme

  it('accepts every template and its aliases', () => {
    expect(withTheme('editorial')).toBe('editorial')
    expect(withTheme('voltage')).toBe('voltage')
    expect(withTheme('graphite')).toBe('graphite')
    expect(withTheme('contrast')).toBe('contrast')
    expect(withTheme('slate')).toBe('slate')
    expect(withTheme('nocturne')).toBe('nocturne')
  })

  it('falls back to editorial for an unknown template', () => {
    expect(withTheme('something-else')).toBe('editorial')
  })

  it('still opens documents written with the retired template names', () => {
    expect(withTheme('maquina')).toBe('voltage')
    expect(withTheme('máquina')).toBe('voltage')
    expect(withTheme('carlosrivera')).toBe('graphite')
    expect(withTheme('carlos-rivera')).toBe('graphite')
    expect(withTheme('rivera')).toBe('graphite')
  })
})

describe('page break normalisation', () => {
  it('drops a break at the very start of the body', () => {
    const parsed = parseDocument('---\ntitle: T\n---\n\n\\pagebreak\n\n# Uno\n\nTexto.\n')
    expect(parsed.html).not.toMatch(/^\s*<div class="folio-page-break">/)
    expect(parsed.html).toContain('<h1')
  })

  it('collapses adjacent breaks into one', () => {
    const parsed = parseDocument('# Uno\n\nA\n\n\\pagebreak\n\n<!-- pagebreak -->\n\n## Dos\n\nB\n')
    expect(parsed.html.match(/folio-page-break/g)).toHaveLength(1)
  })

  it('keeps a break that separates real content', () => {
    const parsed = parseDocument('# Uno\n\nA\n\n\\pagebreak\n\nB\n')
    expect(parsed.html.match(/folio-page-break/g)).toHaveLength(1)
  })
})

describe('template registry', () => {
  it('resolves every supported template through the parser', () => {
    for (const theme of SUPPORTED_THEMES) {
      expect(parseDocument(`---\ntheme: ${theme}\n---\n\n# T\n`).metadata.theme).toBe(theme)
    }
  })

  it('every alias points at a supported template', () => {
    const retired = ['maquina', 'máquina', 'carlosrivera', 'carlos-rivera', 'rivera']
    for (const alias of retired) {
      const resolved = parseDocument(`---\ntheme: ${alias}\n---\n\n# T\n`).metadata.theme
      expect(SUPPORTED_THEMES).toContain(resolved)
    }
  })
})

describe('upsertLayout', () => {
  it('updates an existing layout without losing other keys', () => {
    const source = '---\nlayout: sow\ntitle: My Document\ntheme: graphite\n---\n\n# Content\n'
    const updated = upsertLayout(source, 'cv')
    expect(updated).toBe('---\nlayout: cv\ntitle: My Document\ntheme: graphite\n---\n\n# Content\n')
    expect(parseDocument(updated).metadata.layout).toBe('cv')
  })

  it('adds layout when frontmatter exists without it', () => {
    const source = '---\ntitle: My Document\n---\n\n# Content\n'
    const updated = upsertLayout(source, 'cv')
    expect(updated).toContain('layout: cv')
    expect(parseDocument(updated).metadata.layout).toBe('cv')
  })

  it('creates frontmatter when document has none', () => {
    const source = '# Content\n'
    const updated = upsertLayout(source, 'cv')
    expect(updated).toBe('---\nlayout: cv\n---\n\n# Content\n')
    expect(parseDocument(updated).metadata.layout).toBe('cv')
  })
})

describe('layout selection and CV metadata', () => {
  it('defaults to report layout when layout is unspecified', () => {
    const doc = parseDocument('---\ntitle: Proposal\n---\n\n# Body')
    expect(doc.metadata.layout).toBe('report')
    expect(doc.metadata.toc).toBe(true)
  })

  it('accepts cv layout and aliases', () => {
    expect(parseDocument('---\nlayout: cv\n---\n# T').metadata.layout).toBe('cv')
    expect(parseDocument('---\nlayout: resume\n---\n# T').metadata.layout).toBe('cv')
    expect(parseDocument('---\nlayout: curriculum-vitae\n---\n# T').metadata.layout).toBe('cv')
    expect(parseDocument('---\nlayout: report\n---\n# T').metadata.layout).toBe('report')
    expect(parseDocument('---\nlayout: sow\n---\n# T').metadata.layout).toBe('report')
    expect(parseDocument('---\nlayout: proposal\n---\n# T').metadata.layout).toBe('report')
    expect(parseDocument('---\nlayout: statement-of-work\n---\n# T').metadata.layout).toBe('report')
  })

  it('parses CV specific metadata and disables TOC by default', () => {
    const doc = parseDocument(`---
layout: cv
title: John Doe
role: Technology & Engineering Leader
email: john@johndoe.dev
linkedin: linkedin.com/in/johndoe
github: github.com/johndoe
theme: graphite
---

## Summary
Expert in distributed systems.
`)
    expect(doc.metadata.layout).toBe('cv')
    expect(doc.metadata.title).toBe('John Doe')
    expect(doc.metadata.role).toBe('Technology & Engineering Leader')
    expect(doc.metadata.email).toBe('john@johndoe.dev')
    expect(doc.metadata.linkedin).toBe('linkedin.com/in/johndoe')
    expect(doc.metadata.github).toBe('github.com/johndoe')
    expect(doc.metadata.theme).toBe('graphite')
    expect(doc.metadata.toc).toBe(false)
    expect(doc.metadata.header).toBe(false)
    expect(doc.metadata.footer).toBe(true)
  })

  it('defaults header to true on report/SOW layout and false on CV layout', () => {
    const report = parseDocument('---\nlayout: report\n---\n# Report')
    expect(report.metadata.header).toBe(true)
    expect(report.metadata.footer).toBe(true)

    const sow = parseDocument('---\nlayout: sow\n---\n# SOW')
    expect(sow.metadata.header).toBe(true)
    expect(sow.metadata.footer).toBe(true)

    const cv = parseDocument('---\nlayout: cv\n---\n# CV')
    expect(cv.metadata.header).toBe(false)
    expect(cv.metadata.footer).toBe(true)
  })

  it('parses kicker from frontmatter', () => {
    const doc = parseDocument('---\nlayout: report\nkicker: Technical Specification\n---\n# Spec')
    expect(doc.metadata.kicker).toBe('Technical Specification')
  })

  it('allows enabling/disabling header and footer via frontmatter flags and aliases', () => {
    // Explicit header on CV
    const cvWithHeader = parseDocument('---\nlayout: cv\nheader: true\n---\n# CV')
    expect(cvWithHeader.metadata.header).toBe(true)

    const cvWithPageHeader = parseDocument('---\nlayout: cv\npage-header: true\n---\n# CV')
    expect(cvWithPageHeader.metadata.header).toBe(true)

    // Explicitly disable header on SOW
    const sowNoHeader = parseDocument('---\nlayout: sow\nheader: false\n---\n# SOW')
    expect(sowNoHeader.metadata.header).toBe(false)

    const sowNoPageHeader = parseDocument('---\nlayout: sow\npageHeader: false\n---\n# SOW')
    expect(sowNoPageHeader.metadata.header).toBe(false)

    // Disable footer
    const noFooter = parseDocument('---\nlayout: cv\nfooter: false\n---\n# CV')
    expect(noFooter.metadata.footer).toBe(false)

    const noPageFooter = parseDocument('---\nlayout: sow\npage-footer: false\n---\n# SOW')
    expect(noPageFooter.metadata.footer).toBe(false)
  })

  it('accepts simple layout and aliases, defaulting toc and header to false', () => {
    for (const alias of ['simple', 'plain', 'markdown', 'document', 'doc', 'note']) {
      const doc = parseDocument(`---\nlayout: ${alias}\n---\n# Note`)
      expect(doc.metadata.layout).toBe('simple')
      expect(doc.metadata.toc).toBe(false)
      expect(doc.metadata.header).toBe(false)
      expect(doc.metadata.footer).toBe(true)
    }
  })

  it('accepts invoice layout and aliases, parsing invoice metadata fields', () => {
    for (const alias of ['invoice', 'factura', 'bill', 'receipt']) {
      const doc = parseDocument(`---\nlayout: ${alias}\n---\n# Bill`)
      expect(doc.metadata.layout).toBe('invoice')
      expect(doc.metadata.toc).toBe(false)
    }

    const invoice = parseDocument(`---
layout: invoice
invoice-number: INV-2026-99
date: October 9, 2026
due-date: November 8, 2026
status: Due
po-number: PO-1024
from: Fieldwork Studio
from-address: |
  100 Montgomery St
  San Francisco, CA
from-email: billing@fieldwork.studio
from-phone: +1 (415) 555-0142
from-tax-id: US-12-3456789
client: Northstar Labs
client-address: 450 Mission St
client-email: ap@northstar.com
client-tax-id: US-98-7654321
subtotal: "$10,000.00"
tax: "$850.00"
tax-rate: "8.5%"
total: "$10,850.00"
amount-due: "$10,850.00"
payment-terms: Net 30 days
payment-details: Bank of America Acct 12345
notes: Thank you for your business!
---
# Invoice
`)

    expect(invoice.metadata.layout).toBe('invoice')
    expect(invoice.metadata.invoiceNumber).toBe('INV-2026-99')
    expect(invoice.metadata.documentId).toBe('INV-2026-99')
    expect(invoice.metadata.title).toBe('Invoice INV-2026-99')
    expect(invoice.metadata.date).toBe('October 9, 2026')
    expect(invoice.metadata.dueDate).toBe('November 8, 2026')
    expect(invoice.metadata.status).toBe('Due')
    expect(invoice.metadata.poNumber).toBe('PO-1024')
    expect(invoice.metadata.from).toBe('Fieldwork Studio')
    expect(invoice.metadata.fromAddress).toContain('100 Montgomery St')
    expect(invoice.metadata.fromEmail).toBe('billing@fieldwork.studio')
    expect(invoice.metadata.fromPhone).toBe('+1 (415) 555-0142')
    expect(invoice.metadata.fromTaxId).toBe('US-12-3456789')
    expect(invoice.metadata.client).toBe('Northstar Labs')
    expect(invoice.metadata.clientAddress).toBe('450 Mission St')
    expect(invoice.metadata.clientEmail).toBe('ap@northstar.com')
    expect(invoice.metadata.clientTaxId).toBe('US-98-7654321')
    expect(invoice.metadata.subtotal).toBe('$10,000.00')
    expect(invoice.metadata.tax).toBe('$850.00')
    expect(invoice.metadata.taxRate).toBe('8.5%')
    expect(invoice.metadata.total).toBe('$10,850.00')
    expect(invoice.metadata.amountDue).toBe('$10,850.00')
    expect(invoice.metadata.paymentTerms).toBe('Net 30 days')
    expect(invoice.metadata.paymentDetails).toBe('Bank of America Acct 12345')
    expect(invoice.metadata.notes).toBe('Thank you for your business!')
  })

  it('supports modifying headers and footers via string, object, and flat frontmatter keys', () => {
    // String header & footer
    const docString = parseDocument(`---
layout: simple
header: Company Report
footer: Confidential Draft
---
# Report
`)
    expect(docString.metadata.header).toBe(true)
    expect(docString.metadata.headerLeft).toBe('Company Report')
    expect(docString.metadata.footer).toBe(true)
    expect(docString.metadata.footerLeft).toBe('Confidential Draft')

    // Object header & footer
    const docObj = parseDocument(`---
layout: simple
header:
  left: Left Header
  right: Right Header
  center: Center Header
footer:
  left: Left Footer
  right: Page {page} of {pages}
---
# Report
`)
    expect(docObj.metadata.header).toBe(true)
    expect(docObj.metadata.headerLeft).toBe('Left Header')
    expect(docObj.metadata.headerRight).toBe('Right Header')
    expect(docObj.metadata.headerCenter).toBe('Center Header')
    expect(docObj.metadata.footer).toBe(true)
    expect(docObj.metadata.footerLeft).toBe('Left Footer')
    expect(docObj.metadata.footerRight).toBe('Page {page} of {pages}')

    // Flat frontmatter keys
    const docFlat = parseDocument(`---
layout: simple
header-left: Northstar Engineering
header-right: v1.0
header-center: Internal
footer-left: Proprietary
footer-right: "{page} / {pages}"
footer-center: Confidential
---
# Report
`)
    expect(docFlat.metadata.header).toBe(true)
    expect(docFlat.metadata.headerLeft).toBe('Northstar Engineering')
    expect(docFlat.metadata.headerRight).toBe('v1.0')
    expect(docFlat.metadata.headerCenter).toBe('Internal')
    expect(docFlat.metadata.footer).toBe(true)
    expect(docFlat.metadata.footerLeft).toBe('Proprietary')
    expect(docFlat.metadata.footerRight).toBe('{page} / {pages}')
    expect(docFlat.metadata.footerCenter).toBe('Confidential')
  })

  it('interpolates formatChromeText variables properly', () => {
    const doc = parseDocument(`---
layout: simple
title: Architecture Guide
client: Acme Corp
prepared-by: Carlos Rivera
document-id: DOC-42
date: October 9, 2026
---
# Content
`)
    const template = '{title} · {client} · {author} · {id} · {date} · Page {page} of {pages}'
    const formatted = formatChromeText(template, doc, 0, 5)
    expect(formatted).toBe('Architecture Guide · Acme Corp · Carlos Rivera · DOC-42 · October 9, 2026 · Page 1 of 5')

    const pageNumOnly = formatChromeText('{page} / {total}', doc, 2, 10)
    expect(pageNumOnly).toBe('3 / 10')
  })
})



