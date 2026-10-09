import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Briefcase, Clock, FileCode, FileText, FolderOpen, ReceiptText, Sparkles, UserRound, X } from 'lucide-react'
import { sampleCvDocument, sampleDocument, sampleInvoiceDocument, sampleSimpleDocument } from '../lib/sample'
import type { DocumentLayout, DocumentTheme } from '../lib/document'
import type { SupportedLanguage } from '../lib/i18n'

export type TemplateCategory = 'all' | 'starters' | 'samples'

export interface TemplateDefinition {
  id: string
  title: string
  subtitle: string
  category: 'starters' | 'samples'
  badge: string
  badgeVariant?: 'accent' | 'neutral' | 'muted'
  icon: typeof FileText
  layout?: DocumentLayout
  getContent: (options: { theme: DocumentTheme; lang: SupportedLanguage }) => string
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatFutureDate(daysAhead: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return formatDate(d)
}

function formatDirectory(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  parts.pop() // remove file name
  const dir = parts.join('/')
  return dir || '/'
}

function formatFileName(fullPath: string): string {
  return fullPath.replace(/\\/g, '/').split('/').pop() || 'Untitled.md'
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'simple',
    title: 'Simple Markdown',
    subtitle: 'Plain, minimal Markdown document with no front matter boilerplate.',
    category: 'starters',
    badge: 'Simple',
    badgeVariant: 'accent',
    icon: FileText,
    layout: 'simple',
    getContent: () => '# Untitled\n\nStart writing in plain Markdown...\n',
  },
  {
    id: 'invoice',
    title: 'Invoice',
    subtitle: 'Client invoice with billing details, line items table, and payment instructions.',
    category: 'starters',
    badge: 'Invoice',
    badgeVariant: 'accent',
    icon: ReceiptText,
    layout: 'invoice',
    getContent: ({ theme, lang }) => `---
layout: invoice
title: Invoice INV-001
invoice-number: INV-001
date: ${formatDate(new Date())}
due-date: ${formatFutureDate(30)}
status: Due
from: Your Studio / Company Name
from-address: |
  123 Creative Studio Way
  San Francisco, CA 94103
from-email: billing@yourstudio.com
from-phone: +1 (555) 019-2834
from-tax-id: US-12-3456789
client: Client Organization
client-address: |
  456 Enterprise Blvd, Suite 200
  New York, NY 10001
client-email: accounts@client.com
theme: ${theme}
lang: ${lang}
---

### Services Rendered

| Description | Qty / Hours | Rate | Amount |
|:---|:---:|---:|---:|
| **Design & Architecture Consultation**<br>Initial discovery workshops and system specification | 20 hrs | $150.00 | $3,000.00 |
| **Platform Implementation**<br>Core feature development and automated testing suite | 40 hrs | $150.00 | $6,000.00 |
| **Deployment & Cloud Handover**<br>Production configuration and team knowledge transfer | 1 | $2,000.00 | $2,000.00 |

### Payment Details

Please remit payment within 30 days via ACH or bank transfer:

- **Bank:** First Republic / Chase
- **Account:** 1234567890
- **Routing:** 987654321

*Thank you for your business!*
`,
  },
  {
    id: 'report',
    title: 'Report / Statement of Work',
    subtitle: 'Standard document with cover page, metadata table, and table of contents.',
    category: 'starters',
    badge: 'Report',
    badgeVariant: 'neutral',
    icon: Briefcase,
    layout: 'report',
    getContent: ({ theme, lang }) => `---
title: Project Scope of Work
client: Client Organization
prepared-for: Stakeholder Name
prepared-by: Your Studio / Name
date: ${formatDate(new Date())}
valid-until: ${formatFutureDate(30)}
document-id: DOC-001
layout: report
theme: ${theme}
lang: ${lang}
---

# Executive Summary

Brief overview of the initiative, strategic objectives, and scope boundaries.

## Objectives & Key Outcomes

- Define key deliverable outcome with measurable criteria.
- Establish architectural standards and review milestones.
- Deliver production deployment and handover documentation.

## Deliverables & Milestones

1. **Phase 1 — Discovery & Requirements**
   Initial audit, requirements workshops, and scope finalization.

2. **Phase 2 — Design & Architecture**
   Wireframes, design system tokens, and system specification.

3. **Phase 3 — Implementation & QA**
   Core feature development, integration testing, and validation.

4. **Phase 4 — Launch & Handover**
   Deployment, team enablement, and sign-off.
`,
  },
  {
    id: 'cv',
    title: 'Curriculum Vitae',
    subtitle: 'Two-column resume layout with contact headers, summary, and career history.',
    category: 'starters',
    badge: 'CV',
    badgeVariant: 'neutral',
    icon: UserRound,
    layout: 'cv',
    getContent: ({ theme, lang }) => `---
layout: cv
theme: ${theme}
lang: ${lang}
---

# Your Name
### Professional Title · Product & Engineering
you@example.com · linkedin.com/in/yourprofile · github.com/yourusername

## Summary

Brief professional summary highlighting your key background, leadership, and technical focus.

## Experience

### Company | Role
*2023 – Present*

Description of role and impact across projects.

- Accomplishment or deliverable with measurable result.
- Led cross-functional initiatives across design and engineering.
- Optimized performance and established team quality standards.

### Previous Company | Role
*2021 – 2023*

- Delivered key product features on schedule.
- Mentored junior engineers and contributed to architecture.

## Education

**Degree or Certification** | Institution, 2021
`,
  },
  {
    id: 'sample-simple',
    title: 'Simple Markdown Sample',
    subtitle: 'Clean document sample with customizable headers, footers, and diagrams.',
    category: 'samples',
    badge: 'Sample',
    badgeVariant: 'muted',
    icon: FileText,
    layout: 'simple',
    getContent: () => sampleSimpleDocument,
  },
  {
    id: 'sample-invoice',
    title: 'Invoice Sample',
    subtitle: 'Complete consulting invoice with line items, tax breakdown, and payment instructions.',
    category: 'samples',
    badge: 'Sample',
    badgeVariant: 'muted',
    icon: ReceiptText,
    layout: 'invoice',
    getContent: () => sampleInvoiceDocument,
  },
  {
    id: 'sample-report',
    title: 'Report / SOW Sample Document',
    subtitle: 'Northstar Brand Platform proposal showcasing typography, tables, and diagrams.',
    category: 'samples',
    badge: 'Sample',
    badgeVariant: 'muted',
    icon: Sparkles,
    layout: 'report',
    getContent: () => sampleDocument,
  },
  {
    id: 'sample-cv',
    title: 'CV Sample Document',
    subtitle: 'Pre-filled sample CV demonstrating two-column layout and contact sections.',
    category: 'samples',
    badge: 'Sample',
    badgeVariant: 'muted',
    icon: FileCode,
    layout: 'cv',
    getContent: () => sampleCvDocument,
  },
]

export interface NewDocumentDialogProps {
  canDismiss?: boolean
  currentTheme: DocumentTheme
  currentLang: SupportedLanguage
  onSelectTemplate: (content: string, layout?: DocumentLayout) => void
  onOpenDocument: () => void
  onOpenRecent: (filePath: string) => void
  onClose: () => void
}

export function NewDocumentDialog({
  canDismiss = true,
  currentTheme,
  currentLang,
  onSelectTemplate,
  onOpenDocument,
  onOpenRecent,
  onClose,
}: NewDocumentDialogProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('all')
  const [recentPaths, setRecentPaths] = useState<string[]>([])

  // Load recent documents from Electron IPC or fallback to localStorage
  useEffect(() => {
    let mounted = true
    const loadRecents = async () => {
      try {
        if (window.folio?.getRecentDocuments) {
          const list = await window.folio.getRecentDocuments()
          if (mounted && Array.isArray(list)) {
            setRecentPaths(list)
            return
          }
        }
      } catch {
        // Fallback to localStorage
      }
      try {
        const stored = JSON.parse(localStorage.getItem('folio:recent-documents') || '[]')
        if (mounted && Array.isArray(stored)) {
          setRecentPaths(stored.filter((p): p is string => typeof p === 'string'))
        }
      } catch {
        if (mounted) setRecentPaths([])
      }
    }
    void loadRecents()

    const unsubscribe = window.folio?.onRecentDocumentsUpdated?.((list) => {
      if (mounted && Array.isArray(list)) setRecentPaths(list)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  // Keyboard shortcut listener (Escape to close if dismissible)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canDismiss) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canDismiss, onClose])

  const filteredTemplates = useMemo(() => {
    if (activeCategory === 'all') return TEMPLATES
    return TEMPLATES.filter((t) => t.category === activeCategory)
  }, [activeCategory])

  const handleTemplateClick = useCallback((tpl: TemplateDefinition) => {
    const content = tpl.getContent({ theme: currentTheme, lang: currentLang })
    onSelectTemplate(content, tpl.layout)
  }, [currentTheme, currentLang, onSelectTemplate])

  return (
    <div className="folio-dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget && canDismiss) onClose() }}>
      <div
        className="folio-dialog folio-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-document-title"
      >
        <header className="folio-new-header">
          <div>
            <span className="folio-dialog-kicker">Welcome to Folio</span>
            <h2 id="new-document-title">Start a document</h2>
            <p className="folio-new-subtitle">
              Choose a template, start with plain Markdown, or pick a recent file.
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              className="folio-dialog-close"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </header>

        <div className="folio-new-body">
          {/* Main Templates Column */}
          <section className="folio-new-templates-section">
            <div className="folio-new-filter-bar">
              <span className="folio-new-section-label">Templates & Starters</span>
              <div className="folio-new-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === 'all'}
                  className={`folio-new-tab${activeCategory === 'all' ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory('all')}
                >
                  All ({TEMPLATES.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === 'starters'}
                  className={`folio-new-tab${activeCategory === 'starters' ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory('starters')}
                >
                  Starters
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === 'samples'}
                  className={`folio-new-tab${activeCategory === 'samples' ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory('samples')}
                >
                  Samples
                </button>
              </div>
            </div>

            <div className="folio-template-grid">
              {filteredTemplates.map((template) => {
                const IconComponent = template.icon
                return (
                  <div
                    key={template.id}
                    className="folio-template-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleTemplateClick(template)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleTemplateClick(template)
                      }
                    }}
                  >
                    <div className="folio-template-card-top">
                      <div className={`folio-template-icon-box is-${template.id}`}>
                        <IconComponent size={18} strokeWidth={1.8} />
                      </div>
                      <span className={`folio-template-badge is-${template.badgeVariant || 'neutral'}`}>
                        {template.badge}
                      </span>
                    </div>
                    <div className="folio-template-card-text">
                      <h3 className="folio-template-card-title">{template.title}</h3>
                      <p className="folio-template-card-desc">{template.subtitle}</p>
                    </div>
                    <div className="folio-template-card-action">
                      <span>Create</span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Right Sidebar: Recent Files & Open */}
          <aside className="folio-new-sidebar">
            <div className="folio-new-sidebar-header">
              <span className="folio-new-sidebar-title">
                <Clock size={13} aria-hidden="true" />
                Recent Documents
              </span>
            </div>

            <div className="folio-recent-list">
              {recentPaths.length > 0 ? (
                recentPaths.slice(0, 7).map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    className="folio-recent-item"
                    onClick={() => onOpenRecent(filePath)}
                    title={filePath}
                  >
                    <div className="folio-recent-item-icon">
                      <FileText size={15} strokeWidth={1.6} />
                    </div>
                    <div className="folio-recent-item-info">
                      <strong className="folio-recent-item-name">{formatFileName(filePath)}</strong>
                      <span className="folio-recent-item-path">{formatDirectory(filePath)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="folio-recent-empty">
                  <div className="folio-recent-empty-icon">
                    <Clock size={20} strokeWidth={1.5} />
                  </div>
                  <p>No recent documents yet.</p>
                  <span>Opened documents will appear here.</span>
                </div>
              )}
            </div>

            <div className="folio-new-sidebar-actions">
              <button
                type="button"
                className="folio-sidebar-open-btn"
                onClick={onOpenDocument}
              >
                <FolderOpen size={15} />
                Open Existing File…
              </button>
              {canDismiss && (
                <button
                  type="button"
                  className="folio-sidebar-cancel-btn"
                  onClick={onClose}
                >
                  Cancel
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
