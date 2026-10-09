import { AlertTriangle, ChevronDown, ChevronUp, CircleAlert, FileDiff, Info, X } from 'lucide-react'
import type { DocumentDiff } from '../lib/diff'
import type { DocumentTheme } from '../lib/document'
import type { LintFinding } from '../lib/lint'
import { ThemeEditor } from './ThemeEditor'

export type InspectorTab = 'issues' | 'changes' | 'template'
type Tab = InspectorTab

type Props = {
  findings: LintFinding[]
  diff: DocumentDiff | null
  comparedWith: string | null
  open: boolean
  tab: Tab
  onToggleOpen: () => void
  onSelectTab: (tab: Tab) => void
  onGoToLine: (line: number) => void
  onPickComparison: () => void
  onClearComparison: () => void
  theme: DocumentTheme
  themeOverrides: Record<string, string>
  onThemeOverridesChange: (next: Record<string, string>) => void
}

const SEVERITY_ICON = {
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
} as const

const STATUS_LABEL = {
  added: 'new',
  removed: 'dropped',
  changed: 'edited',
  unchanged: 'unchanged',
} as const

export function DocumentInspector({
  findings,
  diff,
  comparedWith,
  open,
  tab,
  onToggleOpen,
  onSelectTab,
  onGoToLine,
  onPickComparison,
  onClearComparison,
  theme,
  themeOverrides,
  onThemeOverridesChange,
}: Props) {
  const errors = findings.filter((finding) => finding.severity === 'error').length
  const warnings = findings.filter((finding) => finding.severity === 'warning').length
  const changed = diff ? diff.summary.added + diff.summary.removed + diff.summary.changed : 0

  return (
    <section className={`inspector${open ? ' is-open' : ''}`} aria-label="Document inspector">
      <header className="inspector-bar">
        <button
          type="button"
          className={`inspector-tab${tab === 'issues' ? ' is-active' : ''}`}
          onClick={() => {
            onSelectTab('issues')
            if (!open) onToggleOpen()
          }}
        >
          Issues
          {findings.length > 0 && (
            <span className={`inspector-badge${errors > 0 ? ' is-error' : warnings > 0 ? ' is-warning' : ''}`}>
              {findings.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`inspector-tab${tab === 'changes' ? ' is-active' : ''}`}
          onClick={() => {
            onSelectTab('changes')
            if (!open) onToggleOpen()
          }}
        >
          Changes
          {changed > 0 && <span className="inspector-badge">{changed}</span>}
        </button>
        <button
          type="button"
          className={`inspector-tab${tab === 'template' ? ' is-active' : ''}`}
          onClick={() => {
            onSelectTab('template')
            if (!open) onToggleOpen()
          }}
        >
          Template
          {Object.keys(themeOverrides).length > 0 && (
            <span className="inspector-badge">{Object.keys(themeOverrides).length}</span>
          )}
        </button>
        <span className="inspector-spacer" />
        <button type="button" className="inspector-collapse" onClick={onToggleOpen} aria-expanded={open}>
          {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </header>

      {open && (
        <div className="inspector-body">
          {tab === 'issues' &&
            (findings.length === 0 ? (
              <p className="inspector-empty">Nothing to flag in this document.</p>
            ) : (
              <ul className="inspector-list">
                {findings.map((finding, index) => {
                  const Icon = SEVERITY_ICON[finding.severity]
                  return (
                    <li key={`${finding.rule}-${finding.line ?? 'doc'}-${index}`}>
                      <button
                        type="button"
                        className={`inspector-finding is-${finding.severity}`}
                        onClick={() => finding.line !== undefined && onGoToLine(finding.line)}
                        disabled={finding.line === undefined}
                      >
                        <Icon size={12} />
                        <span className="inspector-finding-line">
                          {finding.line === undefined ? '—' : finding.line + 1}
                        </span>
                        <span className="inspector-finding-message">{finding.message}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ))}

          {tab === 'template' && (
            <ThemeEditor theme={theme} overrides={themeOverrides} onChange={onThemeOverridesChange} />
          )}

          {tab === 'changes' &&
            (!diff ? (
              <div className="inspector-empty">
                <p>Compare this document against an earlier revision to see what moved.</p>
                <button type="button" className="inspector-action" onClick={onPickComparison}>
                  <FileDiff size={13} /> Choose a revision…
                </button>
              </div>
            ) : (
              <>
                <div className="inspector-compare-head">
                  <span>
                    Compared with <strong>{comparedWith}</strong> · {diff.summary.added} new ·{' '}
                    {diff.summary.changed} edited · {diff.summary.removed} dropped
                  </span>
                  <button type="button" className="inspector-clear" onClick={onClearComparison} title="Stop comparing">
                    <X size={12} />
                  </button>
                </div>
                <ul className="inspector-list">
                  {diff.sections
                    .filter((section) => section.status !== 'unchanged')
                    .map((section) => (
                      <li key={`${section.status}-${section.id}`}>
                        <div className={`inspector-section is-${section.status}`}>
                          <span className="inspector-section-status">{STATUS_LABEL[section.status]}</span>
                          <span className="inspector-section-title">{section.title}</span>
                        </div>
                        {section.status === 'changed' && (
                          <p className="inspector-diff">
                            {section.parts.map((part, index) => (
                              <span key={index} className={`diff-${part.kind}`}>
                                {part.text}
                              </span>
                            ))}
                          </p>
                        )}
                      </li>
                    ))}
                </ul>
              </>
            ))}
        </div>
      )}
    </section>
  )
}
