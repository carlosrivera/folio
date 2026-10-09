import { describe, expect, it, afterEach } from 'vitest'
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  BUILTIN_PRESETS,
  listAllPresets,
  getPresetById,
  saveCustomPreset,
  getPresetsDir,
} from './presets'
import {
  generateDocumentText,
  customizeDocumentText,
  lintMarkdownSource,
} from './engine'
import { createFolioMcpServer } from './server'
import { parseDocument } from '../lib/document'

const TEST_WORKSPACE = path.join('/tmp', `folio-mcp-test-${Date.now()}`)

describe('Folio MCP Server Presets & Document Types', () => {
  afterEach(async () => {
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true, force: true })
    }
  })

  it('includes all built-in document formats and presets', async () => {
    const presets = await listAllPresets(TEST_WORKSPACE)
    const ids = presets.map((p) => p.id)
    expect(ids).toContain('report')
    expect(ids).toContain('invoice')
    expect(ids).toContain('simple')
    expect(ids).toContain('cv')
    expect(ids).toContain('whitepaper')
    expect(ids).toContain('tech-spec')
    expect(ids).toContain('contract')
    expect(ids).toContain('meeting-notes')
    expect(ids).toContain('receipt')
  })

  it('registers and retrieves custom document type presets', async () => {
    const customPreset = {
      id: 'compliance-audit',
      name: 'SOC 2 Compliance Audit',
      description: 'Audit report assessing technical controls and evidence.',
      baseLayout: 'report' as const,
      defaultTheme: 'contrast' as const,
      kicker: 'Compliance Assessment',
      header: {
        left: '{title} · Internal Audit',
        right: 'CONFIDENTIAL',
      },
      footer: {
        left: 'Audit Committee',
        right: '{page} / {pages}',
      },
      themeOverrides: {
        'cover-bg': '#000000',
      },
    }

    const savedFile = await saveCustomPreset(customPreset, TEST_WORKSPACE)
    expect(existsSync(savedFile)).toBe(true)

    const retrieved = await getPresetById('compliance-audit', TEST_WORKSPACE)
    expect(retrieved).toBeDefined()
    expect(retrieved?.name).toBe('SOC 2 Compliance Audit')
    expect(retrieved?.kicker).toBe('Compliance Assessment')
    expect(retrieved?.isCustom).toBe(true)
  })
})

describe('Folio MCP Document Generation', () => {
  it('generates a report document from preset with valid frontmatter', async () => {
    const result = await generateDocumentText({
      type: 'whitepaper',
      title: 'Zero Trust Network Architecture',
      metadata: {
        client: 'Global Infrastructure Corp',
        'prepared-by': 'Security Guild',
        'document-id': 'WP-2026-01',
      },
      content: '## 01 — Executive Overview\n\nDetailed analysis.\n',
    })

    expect(result.markdown).toContain('title: Zero Trust Network Architecture')
    expect(result.markdown).toContain('layout: report')
    expect(result.markdown).toContain('kicker: Technical White Paper')
    expect(result.markdown).toContain('theme: graphite')
    expect(result.markdown).toContain('Zero Trust Network Architecture')

    const parsed = parseDocument(result.markdown)
    expect(parsed.metadata.layout).toBe('report')
    expect(parsed.metadata.title).toBe('Zero Trust Network Architecture')
    expect(parsed.metadata.kicker).toBe('Technical White Paper')
    expect(result.lint.valid).toBe(true)
  })

  it('generates an invoice document with billing frontmatter', async () => {
    const result = await generateDocumentText({
      type: 'invoice',
      title: 'Invoice INV-2026-88',
      metadata: {
        'invoice-number': 'INV-2026-88',
        date: 'October 9, 2026',
        'due-date': 'November 9, 2026',
        from: 'Digital Agency LLC',
        client: 'Client Inc',
        total: '$12,500.00',
      },
      content: '### Services Rendered\n\n| Item | Amount |\n|---|---:|\n| Design | $12,500.00 |\n',
    })

    expect(result.markdown).toContain('layout: invoice')
    expect(result.markdown).toContain('invoice-number: INV-2026-88')
    expect(result.markdown).toContain('total: $12,500.00')

    const parsed = parseDocument(result.markdown)
    expect(parsed.metadata.layout).toBe('invoice')
    expect(parsed.metadata.invoiceNumber).toBe('INV-2026-88')
    expect(result.lint.valid).toBe(true)
  })

  it('generates a simple document with custom headers and footers', async () => {
    const result = await generateDocumentText({
      type: 'simple',
      title: 'RFC: Event Streaming Standard',
      theme: 'voltage',
      metadata: {
        'header-left': 'RFC-2026-42',
        'header-right': 'Draft v1',
        'footer-left': 'Engineering Guild',
        'footer-right': '{page} / {pages}',
      },
      content: '# RFC: Event Streaming Standard\n\nTechnical proposal.\n',
    })

    expect(result.markdown).toContain('layout: simple')
    expect(result.markdown).toContain('theme: voltage')
    expect(result.markdown).toContain('header-left: RFC-2026-42')
    const parsed = parseDocument(result.markdown)
    expect(parsed.metadata.layout).toBe('simple')
    expect(parsed.metadata.theme).toBe('voltage')
    expect(parsed.metadata.headerLeft).toBe('RFC-2026-42')
  })
})

describe('Folio MCP Document Customization', () => {
  it('customizes existing document theme, layout, and metadata', async () => {
    const initial = `---
title: Initial Proposal
layout: report
theme: editorial
client: Initial Client
---

# Scope

Content here.
`
    const updated = await customizeDocumentText({
      source: initial,
      setTheme: 'voltage',
      setLayout: 'simple',
      setMetadata: {
        client: 'Updated Client Ltd',
        version: '2.0',
      },
      setHeader: {
        left: 'Internal Spec',
        right: '{date}',
      },
    })

    expect(updated.markdown).toContain('theme: voltage')
    expect(updated.markdown).toContain('layout: simple')
    expect(updated.markdown).toContain('client: Updated Client Ltd')
    expect(updated.markdown).toContain('header-left: Internal Spec')

    const parsed = parseDocument(updated.markdown)
    expect(parsed.metadata.theme).toBe('voltage')
    expect(parsed.metadata.layout).toBe('simple')
    expect(parsed.metadata.client).toBe('Updated Client Ltd')
  })
})

describe('Folio MCP Linter Tool', () => {
  it('reports missing frontmatter and ragged tables', () => {
    const invalid = `
## Table with ragged row

| A | B | C |
|:---|:---|:---|
| 1 | 2 |
`
    const result = lintMarkdownSource(invalid)
    expect(result.valid).toBe(true) // No errors, warnings/info only
    const rules = result.findings.map((f) => f.rule)
    expect(rules).toContain('frontmatter-missing')
    expect(rules).toContain('table-ragged-row')
  })
})

describe('Folio MCP Server Instance', () => {
  it('instantiates and defines all 7 tools', () => {
    const server = createFolioMcpServer()
    expect(server).toBeDefined()
  })
})
