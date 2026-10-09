import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, FileText, FolderOpen, PanelLeft, Plus, Save } from 'lucide-react'
import { Editor, openSearchPanel, runEditorFormat, toggleFold } from './components/Editor'
import { EditorToolbar } from './components/EditorToolbar'
import { PaginatedDocument } from './components/PaginatedDocument'
import type { EditorView } from '@codemirror/view'
import { AppThemeToggle } from './components/AppThemeToggle'
import { DocumentInspector, type InspectorTab } from './components/DocumentInspector'
import { PreviewControls } from './components/PreviewControls'
import { ThemePicker, themeLabel } from './components/ThemePicker'
import { LayoutPicker } from './components/LayoutPicker'
import { NewDocumentDialog } from './components/NewDocumentDialog'
import { headingAnchors, parseDocument, suggestedFileName, upsertLanguage, upsertLayout, upsertTheme, upsertThemeOverrides, type DocumentLayout, type DocumentTheme } from './lib/document'
import { diffDocuments } from './lib/diff'
import { lintDocument } from './lib/lint'
import { useAppTheme } from './lib/use-app-theme'
import { usePreviewViewport } from './lib/use-preview-viewport'
import { sampleCvDocument, sampleDocument } from './lib/sample'
import { getTranslations, type SupportedLanguage } from './lib/i18n'
import type { FormatAction } from './lib/editor-format'

type Action = 'opening' | 'saving' | 'exporting' | null
type Toast = {
  message: string
  action?: () => void | Promise<void>
  actionLabel?: string
}
type Draft = { markdown: string; savedMarkdown: string; path: string | null }
const DRAFT_KEY = 'folio:recovery-draft'

function readDraft(): Draft | null {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    return value && typeof value.markdown === 'string' && typeof value.savedMarkdown === 'string' &&
      (value.path === null || typeof value.path === 'string') && value.markdown !== value.savedMarkdown ? value : null
  } catch { return null }
}

function fileName(path: string | null) {
  return path?.split(/[\\/]/).pop() || 'Untitled.md'
}

function editorPreference(name: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(`folio:editor:${name}`)
    return value === null ? fallback : value === 'true'
  } catch { return fallback }
}

export default function App() {
  const [markdown, setMarkdown] = useState(sampleDocument)
  const [savedMarkdown, setSavedMarkdown] = useState(sampleDocument)
  const [path, setPath] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [action, setAction] = useState<Action>(null)
  const [exportProgress, setExportProgress] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [comparison, setComparison] = useState<{ path: string; content: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const recoveryDraft = useRef<Draft | null>(readDraft())
  const startupInterrupted = useRef(false)
  const [welcome, setWelcome] = useState<'loading' | 'start' | 'recover' | null>('loading')
  const [confirmation, setConfirmation] = useState<{ reason: string; resolve: (proceed: boolean) => void } | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(() => editorPreference('outline', false))
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(() => editorPreference('line-numbers', true))
  const [foldingEnabled, setFoldingEnabled] = useState(() => editorPreference('folding', true))
  const [caretLine, setCaretLine] = useState(0)

  const dirty = markdown !== savedMarkdown
  const previewMarkdown = useDeferredValue(markdown)
  const parsed = useMemo(() => parseDocument(markdown), [markdown])
  const title = parsed.metadata.title

  // Active language, theme & layout
  const currentLang: SupportedLanguage = parsed.metadata.lang || 'en'
  const currentTheme: DocumentTheme = parsed.metadata.theme || 'editorial'
  const currentLayout: DocumentLayout = parsed.metadata.layout || 'report'
  const t = useMemo(() => getTranslations(currentLang), [currentLang])

  const selectLayout = useCallback((layout: DocumentLayout) => {
    setMarkdown((current) => upsertLayout(current, layout))
  }, [])

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    setToast(null)
  }, [])

  const showToast = useCallback((message: string, options: Omit<Toast, 'message'> & { duration?: number } = {}) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    const { duration = 2600, ...toastOptions } = options
    setToast({ message, ...toastOptions })
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null
      setToast(null)
    }, duration)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

  const loadDocument = useCallback((document: Extract<OpenFileResult, { canceled: false }>, notify = true) => {
    startupInterrupted.current = true
    setMarkdown(document.content)
    setSavedMarkdown(document.content)
    setPath(document.path)
    setComparison(null)
    setWelcome(null)
    if (notify) showToast(`Opened ${fileName(document.path)}`)
  }, [showToast])

  const launchFile = useCallback(async (filePath: string) => {
    if (!window.folio?.launchFile) {
      showToast('Restart Folio to enable opening exported PDFs from this notification.', { duration: 5000 })
      return
    }
    try {
      const result = await window.folio.launchFile(filePath)
      if (!result.opened) showToast(result.error || 'Could not open the exported PDF')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open the exported PDF')
    }
  }, [showToast])

  const saveDocument = useCallback(async () => {
    if (!window.folio) return false
    setAction('saving')
    try {
      const result = await window.folio.saveMarkdown(path, markdown)
      if (!result.canceled) {
        setPath(result.path)
        setSavedMarkdown(markdown)
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ }
        showToast(`Saved ${fileName(result.path)}`)
        return true
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save the document')
    } finally {
      setAction(null)
    }
    return false
  }, [markdown, path, showToast])

  const requestProceed = useCallback((reason: string) => {
    if (!dirty) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => setConfirmation({ reason, resolve }))
  }, [dirty])

  const resolveConfirmation = useCallback(async (choice: 'save' | 'discard' | 'cancel') => {
    if (!confirmation) return
    setConfirmation(null)
    if (choice === 'cancel') return confirmation.resolve(false)
    if (choice === 'discard') {
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ }
      return confirmation.resolve(true)
    }
    confirmation.resolve(await saveDocument())
  }, [confirmation, saveDocument])

  useEffect(() => {
    if (welcome === null && !confirmation) return
    const frame = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.folio-dialog .dialog-primary')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [welcome, confirmation])

  useEffect(() => {
    if (!confirmation) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void resolveConfirmation('cancel')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmation, resolveConfirmation])

  const openDocument = useCallback(async () => {
    if (!window.folio) return
    setAction('opening')
    try {
      const result = await window.folio.openMarkdown()
      if (!result.canceled && await requestProceed(`Open ${fileName(result.path)}?`)) {
        await window.folio.confirmOpen(result.path)
        loadDocument(result)
        setWelcome(null)
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open that file')
    } finally {
      setAction(null)
    }
  }, [loadDocument, requestProceed, showToast])

  const openRecentDocument = useCallback(async (recentPath: string) => {
    if (!await requestProceed(`Open ${fileName(recentPath)}?`)) return
    try {
      const document = await window.folio?.openRecent(recentPath)
      if (document && !document.canceled) {
        loadDocument(document)
        setWelcome(null)
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open that recent document')
    }
  }, [loadDocument, requestProceed, showToast])

  const createDocumentFromTemplate = useCallback(async (templateContent: string, layout?: DocumentLayout) => {
    if (!await requestProceed('Create a new document?')) return
    startupInterrupted.current = true
    let nextMarkdown = templateContent
    if (layout) {
      nextMarkdown = upsertLayout(nextMarkdown, layout)
    }
    setMarkdown(nextMarkdown)
    setSavedMarkdown(nextMarkdown)
    setPath(null)
    setComparison(null)
    setWelcome(null)
  }, [requestProceed])

  const requestNewDocument = useCallback(() => {
    setWelcome('start')
  }, [])

  const exportDocument = useCallback(async () => {
    if (!window.folio) return
    setAction('exporting')
    setExportProgress('Preparing document…')
    try {
      const result = await window.folio.exportPdf(markdown, suggestedFileName(title), currentTheme, currentLang)
      if (!result.canceled) {
        showToast(`Exported ${fileName(result.path)}`, {
          duration: 5000,
          actionLabel: `Open ${fileName(result.path)}`,
          action: () => launchFile(result.path),
        })
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not export the PDF')
    } finally {
      setAction(null)
      setExportProgress('')
    }
    // currentTheme and currentLang belong here: without them the callback keeps
    // the theme captured when it was last rebuilt, and picking a different one
    // in the toolbar exports the previous template.
  }, [markdown, showToast, title, currentTheme, currentLang, launchFile])

  useEffect(() => window.folio?.onExportProgress(setExportProgress), [])

  useEffect(() => {
    window.folio?.setDocumentEdited(dirty)
  }, [dirty])

  useEffect(() => {
    if (welcome !== null) return
    try {
      if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ markdown, savedMarkdown, path }))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      // Editing remains available if browser storage is unavailable.
    }
  }, [dirty, markdown, savedMarkdown, path, welcome])

  useEffect(() => {
    try {
      localStorage.setItem('folio:editor:outline', String(outlineOpen))
      localStorage.setItem('folio:editor:line-numbers', String(lineNumbersEnabled))
      localStorage.setItem('folio:editor:folding', String(foldingEnabled))
    } catch { /* Preferences remain active for this session. */ }
  }, [outlineOpen, lineNumbersEnabled, foldingEnabled])

  useEffect(() => window.folio?.onMenuCommand((command) => {
    if (command === 'new') requestNewDocument()
    if (command === 'open') void openDocument()
    if (command === 'save') void saveDocument()
    if (command === 'export') void exportDocument()
    if (command === 'find') {
      const view = editorViewRef.current
      if (view) openSearchPanel(view)
    }
  }), [exportDocument, requestNewDocument, openDocument, saveDocument])

  useEffect(() => window.folio?.onCloseRequest(() => {
    void requestProceed('Close this document?').then((proceed) => {
      if (proceed) void window.folio?.closeAfterConfirmation()
    })
  }), [requestProceed])

  useEffect(() => window.folio?.onRecentDocumentRequest((recentPath) => {
    void requestProceed(`Open ${fileName(recentPath)}?`).then(async (proceed) => {
      if (!proceed) return
      try {
        const document = await window.folio?.openRecent(recentPath)
        if (document && !document.canceled) loadDocument(document)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not open that recent document')
      }
    })
  }), [loadDocument, requestProceed, showToast])

  useEffect(() => {
    const folio = window.folio
    if (!folio?.getStartupDocument || !folio.onDocumentOpenError) return

    if (recoveryDraft.current) {
      setWelcome('recover')
      return
    }

    let active = true
    void folio.getStartupDocument()
      .then((document) => {
        if (!active || startupInterrupted.current) return
        if (!document.canceled) loadDocument(document, false)
        else setWelcome('start')
      })
      .catch((error) => {
        if (active) {
          showToast(error instanceof Error ? error.message : 'Could not reopen the last document')
          setWelcome('start')
        }
      })

    const stopOpenErrors = folio.onDocumentOpenError((message) => showToast(message))
    return () => {
      active = false
      stopOpenErrors()
    }
  }, [loadDocument, showToast])

  const onPageCount = useCallback((count: number) => setPageCount(count), [])

  const editorViewRef = useRef<EditorView | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('issues')

  const appTheme = useAppTheme()
  const findings = useMemo(() => lintDocument(markdown, parsed), [markdown, parsed])
  const actionableFindings = useMemo(() => findings.filter((finding) => finding.line !== undefined), [findings])

  const setThemeOverrides = useCallback(
    (next: Record<string, string>) => setMarkdown((current) => upsertThemeOverrides(current, next)),
    [],
  )
  const selectTheme = useCallback(
    (theme: DocumentTheme) => setMarkdown((current) => upsertTheme(current, theme)),
    [],
  )
  const diff = useMemo(
    () => (comparison ? diffDocuments(comparison.content, markdown) : null),
    [comparison, markdown],
  )

  const goToLine = useCallback((line: number) => {
    const view = editorViewRef.current
    if (!view) return
    const target = view.state.doc.line(Math.min(line + 1, view.state.doc.lines))
    view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true })
    view.focus()
  }, [])

  const formatSelection = useCallback((format: FormatAction) => {
    const view = editorViewRef.current
    if (view) runEditorFormat(view, format)
  }, [])

  const findInDocument = useCallback(() => {
    const view = editorViewRef.current
    if (view) openSearchPanel(view)
  }, [])

  const foldCurrentSection = useCallback(() => {
    const view = editorViewRef.current
    if (view) toggleFold(view)
  }, [])

  const pickComparison = useCallback(async () => {
    if (!window.folio) return
    try {
      const result = await window.folio.readComparison()
      if (!result.canceled) setComparison({ path: result.path, content: result.content })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not read that revision')
    }
  }, [showToast])

  const preview = usePreviewViewport(pageCount)
  const [syncScroll, setSyncScroll] = useState(true)
  const anchors = useMemo(() => headingAnchors(markdown), [markdown])

  // Follow the caret: scroll the preview to the heading the caret sits under.
  const onCaretLineChange = useCallback(
    (line: number) => {
      setCaretLine(line)
      if (!syncScroll) return
      let target: string | null = null
      for (const anchor of anchors) {
        if (anchor.line > line) break
        target = anchor.id
      }
      if (target) preview.revealAnchor(target)
    },
    [anchors, preview, syncScroll],
  )
  const currentHeading = [...anchors].reverse().find((heading) => heading.line <= caretLine)?.line


  return (
    <main className="app-shell">
      <header className="toolbar">
        <div className="traffic-light-space" />
        <div className="brand">
          {/* The app's own mark. Documents carry no logo of their own. */}
          <span className="brand-mark">F/</span>
          <span>Folio</span>
        </div>
        <div className="document-title">
          <FileText size={14} strokeWidth={1.7} />
          <span>{path ? fileName(path) : welcome === null && markdown === sampleDocument ? 'Sample SOW · unsaved' : welcome === null && markdown === sampleCvDocument ? 'Sample CV · unsaved' : 'Untitled.md'}</span>
          {dirty && <i aria-label="Unsaved changes" />}
        </div>

        <div className="toolbar-selectors">
          <LayoutPicker
            value={currentLayout}
            onChange={selectLayout}
          />

          <ThemePicker
            value={currentTheme}
            onChange={selectTheme}
            customised={Object.keys(parsed.metadata.themeOverrides).length > 0}
            onCustomise={() => {
              setInspectorTab('template')
              setInspectorOpen(true)
            }}
          />

          <span className="select-field">
            <select
              className="toolbar-select"
              value={currentLang}
              onChange={(e) => setMarkdown((current) => upsertLanguage(current, e.target.value as SupportedLanguage))}
              title="Document language (saved in Markdown)"
            >
              <option value="es">ES</option>
              <option value="en">EN</option>
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </div>

        <div className="toolbar-actions">
          {/* Appearance is an app setting, not a document one, so it sits with
              the app-level actions rather than the template and language. */}
          <AppThemeToggle value={appTheme.preference} onChange={appTheme.setPreference} />
          <span className="toolbar-divider" aria-hidden="true" />
          <button onClick={requestNewDocument} disabled={action !== null} title="New document">
            <Plus size={15} />New
          </button>
          <button onClick={openDocument} disabled={action !== null}>
            <FolderOpen size={15} />{t.open}
          </button>
          <button onClick={saveDocument} disabled={action !== null}>
            <Save size={15} />{action === 'saving' ? t.saving : t.save}
          </button>
          <button className="primary-action" onClick={exportDocument} disabled={action !== null}>
            <Download size={15} />{action === 'exporting' ? t.exporting : t.exportPdf}
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="pane editor-pane">
          <div className="pane-heading">
            <span><PanelLeft size={14} /> Markdown</span>
            <button
              type="button"
              className="editor-issues-shortcut"
              onClick={() => {
                setInspectorTab('issues')
                setInspectorOpen(true)
                if (actionableFindings[0]?.line !== undefined) goToLine(actionableFindings[0].line)
              }}
              title={actionableFindings.length ? 'Show issues and jump to the first one' : 'Show document issues'}
            >
              {findings.length ? `${findings.length} issue${findings.length === 1 ? '' : 's'}` : 'No issues'}
            </button>
          </div>
          <EditorToolbar
            onFormat={formatSelection}
            onFind={findInDocument}
            onToggleFold={foldCurrentSection}
            outlineOpen={outlineOpen}
            onToggleOutline={() => setOutlineOpen((open) => !open)}
            lineNumbersEnabled={lineNumbersEnabled}
            onToggleLineNumbers={() => setLineNumbersEnabled((enabled) => !enabled)}
            foldingEnabled={foldingEnabled}
            onToggleFolding={() => setFoldingEnabled((enabled) => !enabled)}
          />
          <div className="editor-main">
            {outlineOpen && (
              <nav className="editor-outline" aria-label="Document outline">
                <strong>Sections</strong>
                {anchors.length === 0 ? <p>No headings yet.</p> : anchors.map((heading, index) => (
                  <button
                    key={`${heading.line}-${index}`}
                    type="button"
                    className={`outline-heading is-level-${heading.level}${currentHeading === heading.line ? ' is-current' : ''}`}
                    title={`${heading.text} · line ${heading.line + 1}`}
                    onClick={() => goToLine(heading.line)}
                  >{heading.text}</button>
                ))}
              </nav>
            )}
            <Editor
              value={markdown}
              onChange={setMarkdown}
              onCaretLineChange={onCaretLineChange}
              dark={appTheme.resolved === 'dark'}
              findings={findings}
              lineNumbersEnabled={lineNumbersEnabled}
              foldingEnabled={foldingEnabled}
              onCreateEditor={(view) => {
                editorViewRef.current = view
              }}
            />
          </div>
          <DocumentInspector
            findings={findings}
            diff={diff}
            comparedWith={comparison ? fileName(comparison.path) : null}
            open={inspectorOpen}
            tab={inspectorTab}
            onToggleOpen={() => setInspectorOpen((on) => !on)}
            onSelectTab={setInspectorTab}
            onGoToLine={goToLine}
            onPickComparison={pickComparison}
            onClearComparison={() => setComparison(null)}
            theme={currentTheme}
            themeOverrides={parsed.metadata.themeOverrides}
            onThemeOverridesChange={setThemeOverrides}
          />
        </div>
        <div className="pane preview-pane">
          <div className="pane-heading preview-heading">
            <span>Preview</span>
            <PreviewControls
              zoom={preview.zoom}
              fitToWidth={preview.fitToWidth}
              currentPage={preview.currentPage}
              pageCount={pageCount}
              syncScroll={syncScroll}
              onZoomIn={preview.zoomIn}
              onZoomOut={preview.zoomOut}
              onFitToWidth={preview.toggleFitToWidth}
              onGoToPage={preview.goToPage}
              onToggleSync={() => setSyncScroll((on) => !on)}
            />
            <span className="pane-caption">{currentLayout.toUpperCase()} · {themeLabel(currentTheme)} · {pageCount || '—'} {t.page.toLowerCase()}s</span>
          </div>
          <div
            className="preview-scroll"
            ref={preview.scrollRef}
            style={{ ['--preview-zoom' as string]: preview.zoom }}
          >
            <PaginatedDocument 
              markdown={previewMarkdown} 
              overrideTheme={currentTheme}
              overrideLang={currentLang}
              onPageCount={onPageCount} 
            />
          </div>
        </div>
      </section>
      {welcome === 'start' && (
        <NewDocumentDialog
          canDismiss={path !== null || dirty || (markdown !== sampleDocument && markdown !== sampleCvDocument)}
          currentTheme={currentTheme}
          currentLang={currentLang}
          onSelectTemplate={createDocumentFromTemplate}
          onOpenDocument={openDocument}
          onOpenRecent={openRecentDocument}
          onClose={() => setWelcome(null)}
        />
      )}
      {welcome === 'recover' && (
        <div className="folio-dialog-backdrop">
          <div className="folio-dialog" role="dialog" aria-modal="true" aria-labelledby="recover-title">
            <span className="folio-dialog-kicker">Recovered work</span>
            <h2 id="recover-title">Restore your unsaved changes?</h2>
            <p>Folio found an unfinished draft{recoveryDraft.current?.path ? ` for ${fileName(recoveryDraft.current.path)}` : ''}.</p>
            <div className="folio-dialog-actions">
              <button className="dialog-primary" onClick={() => {
                const draft = recoveryDraft.current
                if (!draft) return
                setMarkdown(draft.markdown)
                setSavedMarkdown(draft.savedMarkdown)
                setPath(draft.path)
                setWelcome(null)
              }}>Restore draft</button>
              <button onClick={() => {
                try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ }
                recoveryDraft.current = null
                setWelcome('start')
              }}>Discard draft</button>
            </div>
          </div>
        </div>
      )}
      {confirmation && (
        <div className="folio-dialog-backdrop">
          <div className="folio-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <span className="folio-dialog-kicker">Unsaved changes</span>
            <h2 id="confirm-title">{confirmation.reason}</h2>
            <p>Your changes to {fileName(path)} have not been saved.</p>
            <div className="folio-dialog-actions">
              <button className="dialog-primary" onClick={() => void resolveConfirmation('save')}>Save and continue</button>
              <button onClick={() => void resolveConfirmation('discard')}>Discard changes</button>
              <button onClick={() => void resolveConfirmation('cancel')}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {action === 'exporting' && <div className="export-progress" role="status" aria-live="polite"><span className="export-spinner" />{exportProgress}</div>}
      {toast && (toast.action ? (
        <button
          type="button"
          className="toast toast-action"
          aria-label={toast.actionLabel}
          aria-live="polite"
          title={toast.actionLabel}
          onClick={() => {
            dismissToast()
            void toast.action?.()
          }}
        >
          <span>{toast.message}</span><strong>Open PDF</strong>
        </button>
      ) : (
        <div className="toast" role="status">{toast.message}</div>
      ))}
    </main>
  )
}
