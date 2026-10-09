import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { DocumentTypePreset } from './types'

export const BUILTIN_PRESETS: DocumentTypePreset[] = [
  {
    id: 'report',
    name: 'Report / Statement of Work',
    description: 'Formal document structure featuring a cover page, metadata table, and optional table of contents.',
    baseLayout: 'report',
    defaultTheme: 'editorial',
    defaultLang: 'en',
    kicker: 'Report',
    fields: [
      { name: 'title', description: 'Document title', required: true },
      { name: 'client', description: 'Client or recipient organization name', required: true },
      { name: 'prepared-by', description: 'Author or studio name', required: false },
      { name: 'prepared-for', description: 'Primary stakeholder recipient', required: false },
      { name: 'date', description: 'Issue date', required: false },
      { name: 'valid-until', description: 'Expiration date (optional)', required: false },
      { name: 'document-id', description: 'Identifier (e.g. SOW-001, DOC-2026)', required: false },
      { name: 'kicker', description: 'Cover eyebrow text (defaults to "Report")', required: false },
      { name: 'toc', description: 'Whether to render a Table of Contents (true/false)', required: false, default: 'true' },
    ],
    starterTemplate: `# Executive Summary

Brief overview of objectives and background context.

## 01 — Project Scope & Key Deliverables

- Core deliverable or architectural milestone.
- Measurable completion criteria.

## 02 — Schedule & Milestones

| Milestone | Deliverable | Target Date |
|:---|:---|:---:|
| Phase 1 | Requirements & Discovery | Week 2 |
| Phase 2 | Implementation & Review | Week 6 |
`,
  },
  {
    id: 'invoice',
    name: 'Invoice',
    description: 'Commercial invoice layout with issuer/client cards, line items table, financial totals card, and payment details.',
    baseLayout: 'invoice',
    defaultTheme: 'editorial',
    defaultLang: 'en',
    kicker: 'Invoice',
    fields: [
      { name: 'invoice-number', description: 'Invoice number (e.g. INV-2026-001)', required: true },
      { name: 'date', description: 'Invoice issue date', required: true },
      { name: 'due-date', description: 'Payment due date', required: true },
      { name: 'status', description: 'Payment status (Due, Paid, Pending, Overdue)', required: false, default: 'Due' },
      { name: 'from', description: 'Issuer company or consultant name', required: true },
      { name: 'from-address', description: 'Issuer physical or mailing address (multi-line)', required: false },
      { name: 'from-email', description: 'Issuer billing email', required: false },
      { name: 'from-phone', description: 'Issuer contact phone', required: false },
      { name: 'from-tax-id', description: 'Issuer tax / VAT / EIN identification', required: false },
      { name: 'client', description: 'Client / Bill-To organization name', required: true },
      { name: 'client-address', description: 'Client address (multi-line)', required: false },
      { name: 'client-email', description: 'Client accounts payable email', required: false },
      { name: 'client-tax-id', description: 'Client Tax ID / VAT', required: false },
      { name: 'po-number', description: 'Purchase order number', required: false },
      { name: 'subtotal', description: 'Subtotal string (e.g. "$5,000.00")', required: false },
      { name: 'tax', description: 'Tax amount string (e.g. "$425.00")', required: false },
      { name: 'tax-rate', description: 'Tax rate percentage (e.g. "8.5%")', required: false },
      { name: 'total', description: 'Total amount string (e.g. "$5,425.00")', required: true },
      { name: 'amount-due', description: 'Amount remaining due (defaults to total)', required: false },
      { name: 'payment-terms', description: 'Payment terms (e.g. "Net 30 days")', required: false },
      { name: 'payment-details', description: 'Bank transfer / ACH / wire instructions', required: false },
      { name: 'notes', description: 'Closing notes or thank you message', required: false },
    ],
    starterTemplate: `### Professional Services

| Description | Qty / Hours | Rate | Amount |
|:---|:---:|---:|---:|
| **Consulting & Implementation**<br>System architecture and deployment | 40 hrs | $150.00 | $6,000.00 |

### Payment Instructions

Please remit payment via ACH or bank transfer:
- **Bank:** First Republic / Chase
- **Account:** 1234567890
- **Routing:** 987654321
`,
  },
  {
    id: 'simple',
    name: 'Simple Document',
    description: 'Clean Markdown document with no cover page, styled top heading, and customizable running headers/footers.',
    baseLayout: 'simple',
    defaultTheme: 'graphite',
    defaultLang: 'en',
    header: {
      left: '{title}',
      right: '{date}',
    },
    footer: {
      left: 'Confidential',
      right: 'Page {page} of {pages}',
    },
    fields: [
      { name: 'title', description: 'Document title', required: true },
      { name: 'header-left', description: 'Left header text or template', required: false },
      { name: 'header-right', description: 'Right header text or template', required: false },
      { name: 'footer-left', description: 'Left footer text or template', required: false },
      { name: 'footer-right', description: 'Right footer text or template', required: false },
    ],
    starterTemplate: `# Document Title

Start drafting directly in plain Markdown.

## Section 01

Key details and narrative.
`,
  },
  {
    id: 'cv',
    name: 'Curriculum Vitae',
    description: 'Curriculum Vitae layout featuring a contact hero bar, summary section, and compact two-column timeline flow.',
    baseLayout: 'cv',
    defaultTheme: 'contrast',
    defaultLang: 'en',
    fields: [
      { name: 'name', description: 'Your full name', required: true },
      { name: 'role', description: 'Professional title or headline', required: false },
      { name: 'email', description: 'Primary contact email', required: false },
      { name: 'phone', description: 'Phone number', required: false },
      { name: 'location', description: 'City and state/country', required: false },
      { name: 'website', description: 'Personal portfolio or website', required: false },
      { name: 'linkedin', description: 'LinkedIn URL or handle', required: false },
      { name: 'github', description: 'GitHub username', required: false },
    ],
    starterTemplate: `# Jane Doe
#### Senior Systems Engineer & Architect
jane@example.com · github.com/janedoe · San Francisco, CA

## Summary
Experienced software architect with 10+ years designing mission-critical distributed systems.

## Experience
### Tech Corp | Staff Engineer
*2022 – Present*
- Led migration of primary payment pipelines to distributed outbox pattern.
`,
  },
  {
    id: 'whitepaper',
    name: 'Technical White Paper',
    description: 'In-depth architectural whitepaper with cover page, technical summary, and system diagrams.',
    baseLayout: 'report',
    defaultTheme: 'graphite',
    defaultLang: 'en',
    kicker: 'Technical White Paper',
    header: {
      left: '{title} · White Paper',
      right: '{documentId}',
    },
    footer: {
      left: '{client}',
      right: 'Page {page} of {pages}',
    },
    starterTemplate: `# Executive Abstract

Comprehensive technical overview of the architectural framework and performance trade-offs.

## 01 — Architectural Principles

Key foundations and resilience patterns:

\`\`\`mermaid
flowchart LR
  Edge[Ingress Gateway] --> Auth[Token Verifier]
  Edge --> Engine[Execution Engine]
  Engine --> DB[(Distributed Store)]
\`\`\`

## 02 — Performance & Benchmarks

| Metric | Baseline | Target | Result |
|:---|:---:|:---:|:---:|
| Latency p99 | 120 ms | < 50 ms | 32 ms |
| Throughput | 2k req/s | > 10k req/s | 14.5k req/s |
`,
  },
  {
    id: 'tech-spec',
    name: 'Engineering Design Specification',
    description: 'Engineering RFC / System Design Document for technical teams, utilizing high-energy contrast and monospace detailing.',
    baseLayout: 'report',
    defaultTheme: 'voltage',
    defaultLang: 'en',
    kicker: 'Engineering Specification',
    header: {
      left: '{preparedBy} / {title}',
      right: '{documentId}',
    },
    footer: {
      left: 'Internal Engineering · Confidential',
      right: '{page} / {pages}',
    },
    starterTemplate: `# Problem Statement & Background

Detailed context on the operational limitations motivating this design.

## Technical Architecture & Schemas

Proposed interfaces, failure domain isolation, and state lifecycle.
`,
  },
  {
    id: 'contract',
    name: 'Agreement / Contract',
    description: 'Stark, authoritative legal agreement or master services contract using high-contrast typography.',
    baseLayout: 'report',
    defaultTheme: 'contrast',
    defaultLang: 'en',
    kicker: 'Master Services Agreement',
    header: {
      left: '{client} · {title}',
      right: '{documentId}',
    },
    footer: {
      left: 'Confidential & Proprietary',
      right: '{page} of {pages}',
    },
    starterTemplate: `# Master Agreement

This Master Services Agreement is entered into by and between the parties named below.

## 01 — Terms & Conditions

1. **Services:** The provider shall deliver the scope described in relevant appendices.
2. **Confidentiality:** Both parties agree to maintain mutual non-disclosure standards.
`,
  },
  {
    id: 'meeting-notes',
    name: 'Executive Meeting Notes',
    description: 'Streamlined meeting minutes, agenda summary, and action items tracker without a cover sheet.',
    baseLayout: 'simple',
    defaultTheme: 'editorial',
    defaultLang: 'en',
    header: {
      left: '{title} · Minutes',
      right: '{date}',
    },
    footer: {
      left: 'Internal Use Only',
      right: '{page} / {pages}',
    },
    starterTemplate: `# Executive Steering Committee Minutes

**Date:** {date}  
**Attendees:** Team Leads & Stakeholders  

## Agenda & Discussion Topics

1. **Q4 Roadmap Review:** Final sign-off on major initiatives.
2. **Resource Allocation:** Team staffing updates.

## Action Items

| Owner | Action Item | Due Date | Status |
|:---|:---|:---:|:---:|
| Lead Engineer | Publish spec RFC | Friday | In Progress |
| Product Manager | Review client feedback | Monday | Open |
`,
  },
  {
    id: 'receipt',
    name: 'Payment Receipt',
    description: 'Official payment receipt confirming settled transactions with issuer and recipient details.',
    baseLayout: 'invoice',
    defaultTheme: 'editorial',
    defaultLang: 'en',
    kicker: 'Receipt',
    fields: [
      { name: 'invoice-number', description: 'Receipt / Transaction ID', required: true },
      { name: 'date', description: 'Payment date', required: true },
      { name: 'status', description: 'Transaction status', required: false, default: 'Paid' },
      { name: 'from', description: 'Receiving party / Merchant', required: true },
      { name: 'client', description: 'Payer / Customer name', required: true },
      { name: 'total', description: 'Amount paid', required: true },
    ],
    starterTemplate: `### Transaction Summary

| Item | Reference | Amount |
|:---|:---:|---:|
| **Platform Subscription — Annual** | Annual Enterprise License | $12,000.00 |

*Payment received with thanks.*
`,
  },
]

export function getPresetsDir(workspaceRoot = process.cwd()): string {
  return path.join(workspaceRoot, '.folio', 'presets')
}

export async function listCustomPresets(workspaceRoot = process.cwd()): Promise<DocumentTypePreset[]> {
  const dir = getPresetsDir(workspaceRoot)
  if (!existsSync(dir)) return []

  try {
    const files = await readdir(dir)
    const presets: DocumentTypePreset[] = []
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await readFile(path.join(dir, file), 'utf8')
          const parsed = JSON.parse(content) as DocumentTypePreset
          if (parsed && parsed.id) {
            presets.push({ ...parsed, isCustom: true })
          }
        } catch {
          // Ignore invalid preset files
        }
      }
    }
    return presets
  } catch {
    return []
  }
}

export async function listAllPresets(workspaceRoot = process.cwd()): Promise<DocumentTypePreset[]> {
  const custom = await listCustomPresets(workspaceRoot)
  const map = new Map<string, DocumentTypePreset>()
  for (const preset of BUILTIN_PRESETS) map.set(preset.id, preset)
  for (const preset of custom) map.set(preset.id, preset)
  return Array.from(map.values())
}

export async function getPresetById(
  id: string,
  workspaceRoot = process.cwd(),
): Promise<DocumentTypePreset | null> {
  const all = await listAllPresets(workspaceRoot)
  const normalized = id.toLowerCase().trim()
  return all.find((p) => p.id.toLowerCase() === normalized) ?? null
}

export async function saveCustomPreset(
  preset: DocumentTypePreset,
  workspaceRoot = process.cwd(),
): Promise<string> {
  const dir = getPresetsDir(workspaceRoot)
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${preset.id}.json`)
  await writeFile(filePath, `${JSON.stringify(preset, null, 2)}\n`, 'utf8')
  return filePath
}
