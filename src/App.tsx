import appStyles from './styles.css?inline'
import { captureFolioStyles, type FolioStyles, type FolioRevision } from './lib/folio-styles'
import { DocumentHistory } from './components/DocumentHistory'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Columns2, Download, FileText, FolderOpen, History, PanelLeft, Plus, Settings, SquarePen } from 'lucide-react'
import { SaveButton, SplitButton } from './components/SaveButton'
import { OpenButton } from './components/OpenButton'
import { DocumentProperties } from './components/DocumentProperties'
import { updateDocumentProperties } from './lib/document-properties'
import { editableInlineAt } from './lib/markdown-editing'
import { useUi } from './components/UiLanguage'
import { useModalFocus } from './components/use-modal-focus'
import { Editor, applyEditorResult, openSearchPanel, runEditorFormat, toggleFold } from './components/Editor'
import { EditorToolbar } from './components/EditorToolbar'
import { PaginatedDocument } from './components/PaginatedDocument'
import type { EditorView } from '@codemirror/view'
import { DocumentInspector, type InspectorTab } from './components/DocumentInspector'
import { PreviewControls } from './components/PreviewControls'
import { ThemePicker, themeLabel } from './components/ThemePicker'
import { layoutLabel } from './components/LayoutPicker'
import { NewDocumentDialog } from './components/NewDocumentDialog'
import { headingAnchors, parseDocument, suggestedFileName, upsertLayout, upsertTheme, upsertThemeOverrides, type DocumentLayout, type DocumentOrientation, type DocumentTheme } from './lib/document'
import { diffDocuments } from './lib/diff'
import { lintDocument } from './lib/lint'
import { Workspace, type ViewMode } from './components/Workspace'
import { InsertDialog, type InsertKind, type InsertValues } from './components/InsertDialog'
import { PngExportDialog } from './components/PngExportDialog'
import { createMarkdownTable, editMarkdownTable, tableAt, type TableAction } from './lib/markdown-table'
import { activeFormats, insertMarkdownLink } from './lib/editor-format'
import { useEditorPreference, useNumberPreference } from './lib/use-editor-preference'
import { useAppTheme } from './lib/use-app-theme'
import { usePreviewViewport } from './lib/use-preview-viewport'
import { sampleCvDocument, sampleDocument } from './lib/sample'
import { getTranslations } from './lib/i18n'
import type { FormatAction } from './lib/editor-format'
import { parseStyleLibrary, sameStyle, STYLE_LIBRARY_KEY, validateStyleLibrary, type SavedStyle } from './lib/style-library'

type Action = 'opening' | 'saving' | 'exporting' | null
type Toast = {
  message: string
  action?: () => void | Promise<void>
  actionLabel?: string
}
type Draft = { markdown: string; savedMarkdown: string; path: string | null; styles?: FolioStyles | null; savedStyles?: FolioStyles | null }
const DRAFT_KEY = 'folio:recovery-draft'

function readDraft(): Draft | null {
  try {
    const search = new URLSearchParams(window.location.search)
    if (search.get('isNew') === '1' || search.has('target')) return null
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    return value && typeof value.markdown === 'string' && typeof value.savedMarkdown === 'string' &&
      (value.path === null || typeof value.path === 'string') && (value.markdown !== value.savedMarkdown || JSON.stringify(value.styles ?? null) !== JSON.stringify(value.savedStyles ?? null)) ? value : null
  } catch { return null }
}

function fileName(path: string | null) {
  return path?.split(/[\\/]/).pop() || 'Untitled.md'
}

export default function App() {
  const { tr, language: uiLanguage } = useUi()
  const [styles, setStyles] = useState<FolioStyles | null>(null)
  const [legacyStyleLibrary] = useState<SavedStyle[]>(() => {
    try { return parseStyleLibrary(localStorage.getItem(STYLE_LIBRARY_KEY)) } catch { return [] }
  })
  const styleLibrary = styles?.namedStyles ?? legacyStyleLibrary
  const activeStyleId = styles?.activeStyleId ?? null
  const [savedStyles, setSavedStyles] = useState<FolioStyles | null>(null)
  const [history, setHistory] = useState<FolioRevision[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [pngExportOpen, setPngExportOpen] = useState(false)
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
  const [outlineOpen, setOutlineOpen] = useEditorPreference('outline', false)
  const [lineNumbersEnabled] = useEditorPreference('line-numbers', true)
  const [foldingEnabled] = useEditorPreference('folding', true)
  const [activeLineEnabled] = useEditorPreference('active-line', true)
  const [previewSelectionEnabled] = useEditorPreference('preview-selection', true)
  const [editorSelection, setEditorSelection] = useState<{ from: number; to: number } | null>(null)
  const [fontSize] = useNumberPreference('font-size', 16, 12, 24)
  const [lineSpacing] = useNumberPreference('line-spacing', 1.68, 1.2, 2.2)
  const [textWidth] = useNumberPreference('text-width', 90, 40, 140)
  const [paneWidth, setPaneWidth] = useNumberPreference('pane-width', 46, 25, 75)
  const [spellcheck] = useEditorPreference('spellcheck', true)
  const [autosave] = useEditorPreference('autosave', false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => { try { const stored = localStorage.getItem('folio:view-mode'); return stored === 'editor' || stored === 'preview' ? stored : 'split' } catch { return 'split' } })
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode
  useEffect(() => {
    if (viewMode === 'preview') return
    const frame = requestAnimationFrame(() => editorViewRef.current?.requestMeasure())
    return () => cancelAnimationFrame(frame)
  }, [viewMode])
  const [cursor, setCursor] = useState({ from: 0, to: 0, line: 1, column: 1 })
  const [insertion, setInsertion] = useState<{ kind: InsertKind; label: string; file?: File; source?: string; caption?: string; width?: number; editing?: boolean; from: number; to: number; document: string } | null>(null)
  const [diskChange, setDiskChange] = useState<DiskChange | null>(null)
  const saveInFlight = useRef(false)
  const [saveError, setSaveError] = useState(false)
  const [caretLine, setCaretLine] = useState(0)
  const [recentPaths, setRecentPaths] = useState<string[]>([])

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
        const stored = JSON.parse(localStorage.getItem('folio:recent-documents') || '[]')
        if (mounted && Array.isArray(stored)) {
          setRecentPaths(stored.filter((p): p is string => typeof p === 'string'))
        }
      } catch {
        if (mounted) setRecentPaths([])
      }
    }
    void loadRecents()
    return window.folio?.onRecentDocumentsUpdated?.((list) => {
      if (mounted && Array.isArray(list)) setRecentPaths(list)
    })
  }, [])

  const dirty = markdown !== savedMarkdown || JSON.stringify(styles) !== JSON.stringify(savedStyles)
  const previewMarkdown = useDeferredValue(markdown)
  const parsed = useMemo(() => parseDocument(markdown), [markdown])
  const title = parsed.metadata.title

  // Active theme and layout
  const currentTheme: DocumentTheme = parsed.metadata.theme || 'editorial'
  const currentStyles = useMemo(() => captureFolioStyles(appStyles, currentTheme, styles), [currentTheme, styles])
  const currentLayout: DocumentLayout = parsed.metadata.layout || 'report'
  const currentOrientation: DocumentOrientation = parsed.metadata.orientation || 'portrait'
  const t = useMemo(() => getTranslations(uiLanguage), [uiLanguage])

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
    setStyles(document.styles ?? null)
    setSavedStyles(document.styles ?? null)
    setHistory(document.history ?? [])
    setHistoryOpen(false)
    setComparison(null)
    setDiskChange(null)
    setSaveError(false)
    setEditorSelection(null)
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

  const saveDocument = useCallback(async (saveAs = false, overwrite = false, silent = false, format?: 'folio', includeHistory = true) => {
    if (!window.folio || saveInFlight.current) return false
    saveInFlight.current = true
    setSaveError(false)
    setAction('saving')
    try {
      if (currentStyles.namedStyles?.length && !path?.toLowerCase().endsWith('.folio')) {
        if (silent) return false
        saveAs = true
        format = 'folio'
      }
      const result = await window.folio.saveMarkdown(path, markdown, saveAs, { expectedContent: savedMarkdown, overwrite, styles: currentStyles, expectedStyles: savedStyles, format, includeHistory })
      if (!result.canceled) {
        setPath(result.path)
        setStyles(result.styles ?? null)
        setSavedStyles(result.styles ?? null)
        setHistory(result.history ?? [])
        const content = result.content ?? markdown
        setSavedMarkdown(content)
        if (content !== markdown) setMarkdown(current => current === markdown ? content : current)
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ }
        setDiskChange(null)
        if (!silent) showToast(`Saved ${fileName(result.path)}`)
        return true
      }
      if (result.conflict) setDiskChange(result.conflict)
    } catch (error) {
      setSaveError(true)
      showToast(error instanceof Error ? error.message : 'Could not save the document')
    } finally {
      saveInFlight.current = false
      setAction(null)
    }
    return false
  }, [markdown, path, savedMarkdown, showToast, currentStyles, savedStyles])

  useEffect(() => {
    if (window.folio?.watchDocument) void window.folio.watchDocument(path, savedMarkdown).catch(() => {})
    return () => { if (window.folio?.watchDocument) void window.folio.watchDocument(null, '').catch(() => {}) }
  }, [path, savedMarkdown])
  useEffect(() => window.folio?.onDiskChanged?.(change => { if (change.path === path) setDiskChange(change) }), [path])
  useEffect(() => { try { localStorage.setItem('folio:view-mode', viewMode) } catch { /* Session only. */ } }, [viewMode])
  useEffect(() => {
    if (!autosave || !path || !dirty || action || welcome || confirmation || diskChange || insertion || propertiesOpen || historyOpen || saveError) return
    if (styles?.namedStyles?.length && !path.toLowerCase().endsWith('.folio')) return
    const timer = window.setTimeout(() => { void saveDocument(false, false, true) }, 1500)
    return () => window.clearTimeout(timer)
  }, [autosave, path, dirty, markdown, action, welcome, confirmation, diskChange, insertion, propertiesOpen, historyOpen, saveError, saveDocument, styles])

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
    setStyles(null)
    setSavedStyles(null)
    setHistory([])
    setHistoryOpen(false)
    setComparison(null)
    setDiskChange(null)
    setSaveError(false)
    setEditorSelection(null)
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
      const result = await window.folio.exportPdf(markdown, suggestedFileName(title), currentTheme, undefined, path ?? undefined, currentStyles)
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
    // currentTheme belongs here: without it the callback keeps
    // the theme captured when it was last rebuilt, and picking a different one
    // in the toolbar exports the previous template.
  }, [markdown, path, showToast, title, currentTheme, launchFile, currentStyles])

  const exportPngDocument = useCallback(async (scale: number, stitched: boolean) => {
    if (!window.folio) return
    setAction('exporting')
    setExportProgress('Preparing document…')
    try {
      const result = await window.folio.exportPng(markdown, suggestedFileName(title), currentTheme, undefined, path ?? undefined, currentStyles, { scale, stitched })
      if (!result.canceled) {
        const note = result.stitchedSkipped ? ` — ${result.stitchedSkipped}` : ''
        const stitchedPath = result.stitchedPath
        const firstPage = result.paths[0]
        if (stitchedPath) {
          showToast(`Exported the stitched long image${note}`, {
            duration: 5000,
            actionLabel: `Open ${fileName(stitchedPath)}`,
            action: () => launchFile(stitchedPath),
          })
        } else if (firstPage) {
          const count = result.paths.length
          showToast(`Exported ${count} page image${count === 1 ? '' : 's'}${note}`, {
            duration: 5000,
            actionLabel: `Open ${fileName(firstPage)}`,
            action: () => launchFile(firstPage),
          })
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not export the images')
    } finally {
      setAction(null)
      setExportProgress('')
    }
  }, [markdown, path, showToast, title, currentTheme, launchFile, currentStyles])

  useEffect(() => window.folio?.onExportProgress(setExportProgress), [])

  useEffect(() => {
    window.folio?.setDocumentEdited(dirty)
  }, [dirty])

  useEffect(() => {
    if (welcome !== null) return
    try {
      if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ markdown, savedMarkdown, path, styles, savedStyles }))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      // Editing remains available if browser storage is unavailable.
    }
  }, [dirty, markdown, savedMarkdown, path, welcome, styles, savedStyles])

  useEffect(() => window.folio?.onMenuCommand((command) => {
    if (command === 'new') requestNewDocument()
    if (command === 'open') void openDocument()
    if (command === 'save') void saveDocument()
    if (command === 'save-as') void saveDocument(true)
    if (command === 'export') void exportDocument()
    if (command === 'export-png' && action === null) setPngExportOpen(true)
    if (command === 'find') {
      const view = editorViewRef.current
      if (view) openSearchPanel(view)
    }
  }), [exportDocument, requestNewDocument, openDocument, saveDocument, action])

  useEffect(() => window.folio?.onInstallUpdateRequest?.(() => {
    void requestProceed('Restart Folio to install the update?').then((proceed) => {
      if (proceed) void window.folio?.installUpdate?.()
    })
  }), [requestProceed])

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
    (theme: DocumentTheme) => {
      setStyles(current => captureFolioStyles(appStyles, theme, current?.namedStyles ? { ...current, theme: '' } : null))
      setMarkdown((current) => upsertThemeOverrides(upsertTheme(current, theme), {}))
    },
    [],
  )
  const applyStyle = (style: SavedStyle) => {
    setStyles(current => ({ ...captureFolioStyles(appStyles, style.theme), namedStyles: current?.namedStyles ?? styleLibrary, activeStyleId: style.id }))
    setMarkdown(current => upsertThemeOverrides(upsertTheme(current, style.theme), style.overrides))
  }
  const saveStyle = (style: SavedStyle) => {
    const next = [...styleLibrary.filter(item => item.id !== style.id), style]
    try { validateStyleLibrary(next) }
    catch (error) { showToast(error instanceof Error ? error.message : tr('Could not save the style library. Free some storage and try again.')); return false }
    setStyles(current => ({ ...captureFolioStyles(appStyles, currentTheme, current), namedStyles: next }))
    return true
  }
  const activeStyle = styleLibrary.find(style => style.id === activeStyleId && style.theme === currentTheme)
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

  const openInsert = useCallback((kind: InsertKind, file?: File) => {
    const view = editorViewRef.current
    if (!view) return
    const selection = view.state.selection.main
    const existing = !file && editableInlineAt(view.state.doc.toString(), selection.head)
    if (existing && existing.kind === kind) {
      setInsertion({ ...existing, editing: true, document: view.state.doc.toString() })
      return
    }
    setInsertion({ kind, file, label: file ? file.name.replace(/\.[^.]+$/, '') : view.state.sliceDoc(selection.from, selection.to), from: selection.from, to: selection.to, document: view.state.doc.toString() })
  }, [])
  const insertLink = useCallback(() => openInsert('link'), [openInsert])
  const insertImageFile = useCallback((file: File) => openInsert('image', file), [openInsert])
  const submitInsertion = useCallback(async (values: InsertValues) => {
    const view = editorViewRef.current
    if (!view || !insertion) return
    if (view.state.doc.toString() !== insertion.document) throw new Error('The document changed while this dialog was open. Close it and try again.')
    let inserted = ''
    if (insertion.kind === 'link') {
      inserted = insertMarkdownLink(values.label, values.source)
      if (insertion.caption) inserted = inserted.slice(0, -1) + ` "${insertion.caption.replace(/(["\\])/g, '\\$1')}"` + ')'
    }
    if (insertion.kind === 'table') inserted = createMarkdownTable(values.rows, values.columns)
    if (insertion.kind === 'image') {
      let source = values.source.trim()
      const imageDocumentPath = path
      if (values.file) {
        if (!window.folio?.importImage) throw new Error('Restart Folio to enable image import.')
        if (values.file.size > 20 * 1024 * 1024) throw new Error('Images must be smaller than 20 MB.')
        source = await window.folio.importImage(imageDocumentPath, values.file.name, Array.from(new Uint8Array(await values.file.arrayBuffer())))
      }
      if (/^data:image\//i.test(source)) {
        const embedded = source.match(/^data:image\/(png|jpeg|gif|webp|avif);base64,([a-z\d+/=]+)$/i)
        if (!embedded || !window.folio?.importImage) throw new Error('Choose an image file or enter a web image URL.')
        source = await window.folio.importImage(imageDocumentPath, `image.${embedded[1]}`, Array.from(atob(embedded[2]), character => character.charCodeAt(0)))
      }
      if (!source || /[\r\n]/.test(source) || (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^(https?:|folio-draft:\/\/)/i.test(source))) throw new Error('Enter an image URL or choose an image file.')
      const caption = values.caption.trim().replace(/[\r\n]+/g, ' ').replace(/(["\\])/g, '\\$1')
      inserted = `![${values.label.replace(/([\[\]\\])/g, '\\$1')}](<${source.replace(/</g, '%3C').replace(/>/g, '%3E')}>${caption ? ` "${caption}"` : ''})${values.width < 100 ? ` {width=${Math.max(10, Math.min(100, values.width))}%}` : ''}`
    }
    const block = insertion.kind !== 'link' && !insertion.editing
    const before = insertion.document.slice(0, insertion.from)
    const after = insertion.document.slice(insertion.to)
    const prefix = block && before ? '\n'.repeat(Math.max(0, 2 - (before.match(/\n*$/)?.[0].length ?? 0))) : ''
    const suffix = block && after ? '\n'.repeat(Math.max(0, 2 - (inserted.match(/\n*$/)?.[0].length ?? 0) - (after.match(/^\n*/)?.[0].length ?? 0))) : ''
    inserted = prefix + inserted + suffix
    if (view.state.doc.toString() !== insertion.document) throw new Error('The document changed during import. Close this dialog and try again.')
    applyEditorResult(view, { text: insertion.document.slice(0, insertion.from) + inserted + insertion.document.slice(insertion.to), from: insertion.from + inserted.length, to: insertion.from + inserted.length })
    setInsertion(null)
  }, [insertion, path])
  const editTable = useCallback((action: TableAction) => {
    const view = editorViewRef.current
    if (!view) return
    const result = editMarkdownTable(view.state.doc.toString(), view.state.selection.main.head, action)
    if (result) applyEditorResult(view, result)
    else showToast('This table needs at least one body row and one column.')
  }, [showToast])

  const formatSelection = useCallback((format: FormatAction) => {
    const view = editorViewRef.current
    if (view) runEditorFormat(view, format)
  }, [])

  const exportPackage = async () => {
    if (!window.folio?.exportPackage || action) return
    setAction('exporting')
    setExportProgress(tr('Markdown + assets (.zip)'))
    try {
      const result = await window.folio.exportPackage(markdown, path, path ? fileName(path) : `${suggestedFileName(title)}.md`)
      if (!result.canceled) showToast(`${tr('Exported package')}: ${fileName(result.path)}`)
    } catch (error) { showToast(error instanceof Error ? error.message : tr('Could not export package')) }
    finally { setAction(null); setExportProgress('') }
  }

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

  const preview = usePreviewViewport(pageCount, {
    layout: currentLayout,
    orientation: currentOrientation,
  })
  const [syncScroll, setSyncScroll] = useState(true)
  const anchors = useMemo(() => headingAnchors(markdown), [markdown])

  const onCaretLineChange = useCallback((line: number) => setCaretLine(line), [])
  useEffect(() => { if (syncScroll && viewModeRef.current === 'split') preview.revealPosition(cursor.from) }, [cursor.from, syncScroll, preview.revealPosition])
  const onPreviewReady = useCallback(() => {
    if (syncScroll && viewModeRef.current === 'split') {
      preview.revealPosition(editorViewRef.current?.state.selection.main.head ?? 0)
    }
  }, [syncScroll, preview.revealPosition])
  const active = useMemo(() => activeFormats(markdown, cursor.from, cursor.to), [markdown, cursor.from, cursor.to])
  const inTable = useMemo(() => !!tableAt(markdown, cursor.from), [markdown, cursor.from])
  const editableKind = useMemo(() => editableInlineAt(markdown, cursor.from)?.kind ?? null, [markdown, cursor.from])
  const wordCount = useMemo(() => {
    const body = parsed.body
      .replace(/!\[([^\]]*)\]\([^\n]*?\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^\n]*?\)/g, '$1')
      .replace(/<!--[^]*?-->/g, '')
    return (body.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length
  }, [parsed.body])
  const currentHeading = [...anchors].reverse().find((heading) => heading.line <= caretLine)?.line
  useModalFocus(confirmation !== null || welcome === 'recover', () => { if (confirmation) void resolveConfirmation('cancel') })


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
          <ThemePicker
            value={currentTheme}
            onChange={selectTheme}
            savedStyles={styleLibrary}
            activeStyleId={activeStyle && sameStyle(activeStyle, currentTheme, parsed.metadata.themeOverrides) ? activeStyle.id : null}
            onApplyStyle={applyStyle}
            customised={Object.keys(parsed.metadata.themeOverrides).length > 0}
            onCustomise={() => {
              setInspectorTab('template')
              setInspectorOpen(true)
            }}
          />


        </div>

        <div className="toolbar-actions">
          <button onClick={() => void window.folio?.openSettings?.()} title={`${tr('Settings')} (Cmd/Ctrl+,)`} aria-label={tr('Settings')}><Settings size={15} /></button>
          <div className="view-switcher" role="group" aria-label={tr('Document view')}>
            {([{ mode: 'editor', label: 'Editor only', Icon: SquarePen }, { mode: 'split', label: 'Split view', Icon: Columns2 }, { mode: 'preview', label: 'Preview only', Icon: BookOpen }] as const).map(({ mode, label, Icon }) => <button key={mode} type="button" aria-label={tr(label)} title={tr(label)} aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}><Icon size={14} aria-hidden="true" /></button>)}
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <button onClick={requestNewDocument} disabled={action !== null} title="New document">
            <Plus size={15} />{tr('New')}
          </button>
          <OpenButton
            label={t.open}
            disabled={action !== null}
            recentPaths={recentPaths}
            onOpen={() => void openDocument()}
            onOpenRecent={(recentPath) => void openRecentDocument(recentPath)}
          />
          {path?.toLowerCase().endsWith('.folio') && <button aria-label={tr('Document history')} title={tr('Document history')} disabled={action !== null} onClick={async () => { try { setHistory(await window.folio?.getHistory?.(path) ?? []); setHistoryOpen(true) } catch (error) { showToast(String(error)) } }}><History size={15} /></button>}
          <SaveButton label={action === 'saving' ? t.saving : t.save} saveAsLabel={t.saveAs}
            disabled={action !== null} onSave={(saveAs) => void saveDocument(saveAs)} onSaveFolio={() => void saveDocument(true, false, false, 'folio')} />
          <SplitButton label={action === 'exporting' ? t.exporting : t.exportPdf} alternativeLabel={tr('Markdown + assets (.zip)')}
            alternativeNote={tr('Images and local attachments are included. Web URLs remain links.')}
            optionsLabel="Export options" primary disabled={action !== null} icon={<Download size={15} aria-hidden="true" />}
            extraLabel={tr('PNG images…')} onExtra={() => setPngExportOpen(true)}
            onPrimary={() => void exportDocument()} onAlternative={() => void exportPackage()} />
        </div>
      </header>

      {diskChange && <div className="disk-change-banner" role="alert"><span>{tr(diskChange.content === null ? 'This file was deleted or moved outside Folio.' : 'This file changed outside Folio. Autosave is paused.')}</span>
        {diskChange.content !== null && <button onClick={() => loadDocument({ canceled: false, ...diskChange, content: diskChange.content! })}>{tr('Reload from disk')}</button>}
        {diskChange.content !== null && <button onClick={() => void saveDocument(false, true)}>{tr('Save my version')}</button>}
        <button onClick={() => void saveDocument(true)}>{tr('Save as…')}</button>
      </div>}
      <Workspace mode={viewMode} width={paneWidth} onWidthChange={setPaneWidth}>
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
              title={tr(actionableFindings.length ? 'Show issues and jump to the first one' : 'Show document issues')}
            >
              {findings.length ? `${findings.length} ${tr('Issues').toLowerCase()}` : tr('No issues')}
            </button>
          </div>
          <EditorToolbar
            onProperties={() => setPropertiesOpen(true)}
            editableKind={editableKind}
            onFormat={formatSelection}
            onInsert={openInsert}
            onTableAction={editTable}
            active={active}
            inTable={inTable}
            onFind={findInDocument}
            onToggleFold={foldCurrentSection}
            outlineOpen={outlineOpen}
            onToggleOutline={() => setOutlineOpen((open) => !open)}
            foldingEnabled={foldingEnabled}
          />
          <div className="editor-main">
            {outlineOpen && (
              <nav className="editor-outline" aria-label={tr('Document outline')}>
                <strong>{tr('Sections')}</strong>
                {anchors.length === 0 ? <p>{tr('No headings yet.')}</p> : anchors.map((heading, index) => (
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
              onSelectionChange={setEditorSelection}
              onCursorChange={setCursor}
              onInsertLink={insertLink}
              onImageFile={insertImageFile}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              textWidth={textWidth}
              spellcheck={spellcheck}
              activeLineEnabled={activeLineEnabled}
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
            savedStyles={styleLibrary}
            activeStyleId={activeStyleId}
            onApplyStyle={applyStyle}
            onSaveStyle={saveStyle}
            onSelectTheme={selectTheme}
          />
        </div>
        <div className="pane preview-pane" aria-hidden={viewMode === 'editor'} inert={viewMode === 'editor'}>
          <div className="pane-heading preview-heading">
            <span>{tr('Preview')}</span>
            <PreviewControls
              zoom={preview.zoom}
              fitToWidth={preview.fitToWidth}
              currentPage={preview.currentPage}
              pageCount={pageCount}
              syncScroll={syncScroll}
              onZoomIn={preview.zoomIn}
              onZoomOut={preview.zoomOut}
              onFitToWidth={preview.toggleFitToWidth}
              onGoToPage={(target) => {
                preview.goToPage(target)
                if (syncScroll && viewMode === 'split') {
                  const view = editorViewRef.current
                  if (!view) return
                  if (target === 1) {
                    view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true })
                    return
                  }
                  const pages = preview.scrollRef.current?.querySelectorAll<HTMLElement>('.pagination-output .pagedjs_page')
                  const targetPage = pages?.[target - 1]
                  const block = targetPage?.querySelector<HTMLElement>('[data-source-from]')
                  if (block) {
                    const position = Math.min(view.state.doc.length, Number(block.dataset.sourceFrom))
                    view.dispatch({ selection: { anchor: position }, scrollIntoView: true })
                  }
                }
              }}
              onToggleSync={() => setSyncScroll((on) => !on)}
            />
            <span className="pane-caption">{tr(layoutLabel(currentLayout)).toUpperCase()} · {themeLabel(currentTheme)} · {pageCount || '—'} {t.page.toLowerCase()}s</span>
          </div>
          <div
            className="preview-scroll"
            ref={preview.scrollRef}
            onClick={event => {
              if (viewMode !== 'split' || !window.getSelection()?.isCollapsed) return
              if (!(event.target instanceof Element) || event.target.closest('a, button, input')) return
              const block = event.target.closest<HTMLElement>('.pagination-output [data-source-from]')
              const view = editorViewRef.current
              if (!block || !view) return
              const position = Math.min(view.state.doc.length, Number(block.dataset.sourceFrom))
              view.dispatch({ selection: { anchor: position }, scrollIntoView: true })
              requestAnimationFrame(() => view.focus())
            }}
            style={{ ['--preview-zoom' as string]: preview.zoom }}
          >
            <PaginatedDocument 
              markdown={previewMarkdown}
              styles={currentStyles}
              documentPath={path ?? undefined}
              selection={previewSelectionEnabled && previewMarkdown === markdown ? editorSelection : null}
              overrideTheme={currentTheme}
              onPageCount={onPageCount}
              onReady={onPreviewReady}
            />
          </div>
        </div>
      </Workspace>
      <footer className="editor-status"><span role="status">{tr(action === 'saving' ? 'Saving…' : saveError ? 'Save failed · use Save to retry' : diskChange ? 'External changes · save paused' : dirty ? 'Unsaved changes' : path ? 'Saved' : 'Not saved to a file')}{autosave && path && !diskChange ? ` · ${tr('Autosave on')}` : ''}</span><span>{wordCount.toLocaleString()} {tr('words')}</span><span>Ln {cursor.line}, Col {cursor.column}</span></footer>
      {pngExportOpen && <PngExportDialog
        onSubmit={({ scale, stitched }) => { setPngExportOpen(false); void exportPngDocument(scale, stitched) }}
        onClose={() => { setPngExportOpen(false); editorViewRef.current?.focus() }} />}
      {insertion && <InsertDialog kind={insertion.kind} initialLabel={insertion.label} initialFile={insertion.file} initialSource={insertion.source} initialCaption={insertion.caption} initialWidth={insertion.width} editing={insertion.editing} onSubmit={submitInsertion} onClose={() => { setInsertion(null); editorViewRef.current?.focus() }} />}
      {propertiesOpen && <DocumentProperties metadata={parsed.metadata} onApply={values => {
        const view = editorViewRef.current
        if (!view) return
        const text = updateDocumentProperties(view.state.doc.toString(), values)
        const bodyOffset = (source: string) => source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0].length ?? 0
        const anchor = Math.max(bodyOffset(text), view.state.selection.main.head + bodyOffset(text) - bodyOffset(view.state.doc.toString()))
        applyEditorResult(view, { text, from: Math.min(anchor, text.length), to: Math.min(anchor, text.length) })
        setPropertiesOpen(false)
      }} onClose={() => { setPropertiesOpen(false); editorViewRef.current?.focus() }} />}
      {welcome === 'start' && (
        <NewDocumentDialog
          canDismiss={path !== null || dirty || (markdown !== sampleDocument && markdown !== sampleCvDocument)}
          currentTheme={currentTheme}
          onSelectTemplate={createDocumentFromTemplate}
          onOpenDocument={openDocument}
          onOpenRecent={openRecentDocument}
          onClose={() => setWelcome(null)}
        />
      )}
      {historyOpen && <DocumentHistory revisions={history} onClose={() => setHistoryOpen(false)} onShare={() => { setHistoryOpen(false); void saveDocument(true, false, false, 'folio', false) }} onRestore={async id => {
        if (!path || !window.folio?.readRevision) return
        try {
          const revision = await window.folio.readRevision(path, id)
          if (dirty && !window.confirm(tr('Replace your unsaved draft with this version?'))) return
          setMarkdown(revision.content)
          setStyles(revision.styles)
          setHistoryOpen(false)
          showToast(tr('Version restored. Save to keep it as a new version.'))
        } catch (error) { showToast(error instanceof Error ? error.message : 'Could not restore this version') }
      }} />}
      {welcome === 'recover' && (
        <div className="folio-dialog-backdrop">
          <div className="folio-dialog" role="dialog" aria-modal="true" aria-labelledby="recover-title">
            <span className="folio-dialog-kicker">{tr('Recovered work')}</span>
            <h2 id="recover-title">{tr('Restore your unsaved changes?')}</h2>
            <p>{tr('Folio found an unfinished draft.')} {recoveryDraft.current?.path ? `(${fileName(recoveryDraft.current.path)})` : ''}</p>
            <div className="folio-dialog-actions">
              <button className="dialog-primary" onClick={() => {
                const draft = recoveryDraft.current
                if (!draft) return
                setMarkdown(draft.markdown)
                setSavedMarkdown(draft.savedMarkdown)
                setPath(draft.path)
                  setStyles(draft.styles ?? null)
                  setSavedStyles(draft.savedStyles ?? null)
                setWelcome(null)
              }}>{tr('Restore draft')}</button>
              <button onClick={() => {
                try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ }
                recoveryDraft.current = null
                setWelcome('start')
              }}>{tr('Discard draft')}</button>
            </div>
          </div>
        </div>
      )}
      {confirmation && (
        <div className="folio-dialog-backdrop">
          <div className="folio-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <span className="folio-dialog-kicker">{tr('Unsaved changes')}</span>
            <h2 id="confirm-title">{confirmation.reason}</h2>
            <p>{tr('Your changes have not been saved.')} ({fileName(path)})</p>
            <div className="folio-dialog-actions">
              <button className="dialog-primary" onClick={() => void resolveConfirmation('save')}>{tr('Save and continue')}</button>
              <button onClick={() => void resolveConfirmation('discard')}>{tr('Discard changes')}</button>
              <button onClick={() => void resolveConfirmation('cancel')}>{tr('Cancel')}</button>
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
          <span>{tr(toast.message)}</span><strong>{tr('Open PDF')}</strong>
        </button>
      ) : (
        <div className="toast" role="status">{tr(toast.message)}</div>
      ))}
    </main>
  )
}
