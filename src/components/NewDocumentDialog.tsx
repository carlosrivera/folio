import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Briefcase, Clock, FileCode, FileText, FolderOpen, Sparkles, UserRound, X } from 'lucide-react'
import { sampleCvDocument, sampleDocument } from '../lib/sample'
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
    layout: 'sow',
    getContent: () => '# Untitled\n\nStart writing in plain Markdown...\n',
  },
  {
    id: 'sow',
    title: 'Statement of Work',
    subtitle: 'Client proposal layout with SOW front matter, deliverables, and milestones.',
    category: 'starters',
    badge: 'Proposal',
    badgeVariant: 'neutral',
    icon: Briefcase,
    layout: 'sow',
    getContent: ({ theme, lang }) => `---
title: Project Scope of Work
client: Client Organization
prepared-for: Stakeholder Name
prepared-by: Your Studio / Name
date: ${formatDate(new Date())}
valid-until: ${formatFutureDate(30)}
document-id: SOW-001
layout: sow
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
    id: 'sample-sow',
    title: 'SOW Sample Document',
    subtitle: 'Northstar Brand Platform proposal showcasing typography, tables, and diagrams.',
    category: 'samples',
    badge: 'Sample',
    badgeVariant: 'muted',
    icon: Sparkles,
    layout: 'sow',
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
