import { useCallback, useEffect, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting, toggleFold } from '@codemirror/language'
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view'
import { lintGutter, lintKeymap, linter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import { formatMarkdown, type FormatAction } from '../lib/editor-format'
import type { LintFinding } from '../lib/lint'

/** Surfaces come from the shell palette so the editor follows light and dark. */
const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--ui-editor-bg)', color: 'var(--ui-editor-text)' },
  '.cm-scroller': { fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace', lineHeight: '1.68' },
  '.cm-content': { padding: '28px 32px 80px', caretColor: 'var(--ui-accent)' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { backgroundColor: 'var(--ui-editor-bg)', color: 'var(--ui-text-faint)', borderRight: '1px solid var(--ui-pane-border)' },
  '.cm-activeLine': { backgroundColor: 'var(--ui-editor-active-line)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--ui-editor-selection) !important',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ui-accent)' },
  '&.cm-focused': { outline: 'none' },
})

/** CodeMirror's default highlight style is tuned for light backgrounds only. */
const markdownHighlight = (dark: boolean) =>
  HighlightStyle.define(
    dark
      ? [
          { tag: tags.heading, color: '#9fd3c0', fontWeight: '700' },
          { tag: tags.strong, color: '#f0eee7', fontWeight: '700' },
          { tag: tags.emphasis, color: '#e3c99a', fontStyle: 'italic' },
          { tag: tags.link, color: '#8fb8e8' },
          { tag: tags.url, color: '#6f93bf' },
          { tag: tags.monospace, color: '#e3a882' },
          { tag: tags.quote, color: '#9a998f' },
          { tag: tags.list, color: '#c9a3d8' },
          { tag: tags.meta, color: '#7f7e76' },
          { tag: tags.processingInstruction, color: '#7f7e76' },
        ]
      : [
          { tag: tags.heading, color: '#18342e', fontWeight: '700' },
          { tag: tags.strong, color: '#23231f', fontWeight: '700' },
          { tag: tags.emphasis, color: '#7a5a1f', fontStyle: 'italic' },
          { tag: tags.link, color: '#1d5a8f' },
          { tag: tags.url, color: '#3f7aa8' },
          { tag: tags.monospace, color: '#a8471f' },
          { tag: tags.quote, color: '#6a695f' },
          { tag: tags.list, color: '#7a3f8f' },
          { tag: tags.meta, color: '#8b897f' },
          { tag: tags.processingInstruction, color: '#8b897f' },
        ],
    { themeType: dark ? 'dark' : 'light' },
  )

type EditorProps = {
  value: string
  onChange: (value: string) => void
  /** Zero-based caret line, reported only when it actually moves. */
  onCaretLineChange?: (line: number) => void
  onCreateEditor?: (view: EditorView) => void
  dark?: boolean
  findings: LintFinding[]
  lineNumbersEnabled: boolean
  foldingEnabled: boolean
}

export function runEditorFormat(view: EditorView, action: FormatAction) {
  const original = view.state.doc.toString()
  const selection = view.state.selection.main
  const next = formatMarkdown(original, selection.from, selection.to, action)
  let start = 0
  while (start < original.length && start < next.text.length && original[start] === next.text[start]) start += 1
  let suffix = 0
  while (suffix < original.length - start && suffix < next.text.length - start &&
    original[original.length - 1 - suffix] === next.text[next.text.length - 1 - suffix]) suffix += 1
  view.dispatch({
    changes: { from: start, to: original.length - suffix, insert: next.text.slice(start, next.text.length - suffix) },
    selection: { anchor: next.from, head: next.to },
    scrollIntoView: true,
  })
  view.focus()
  return true
}

export { openSearchPanel, toggleFold }

const formattingKeymap = keymap.of([
  { key: 'Mod-b', run: (view) => runEditorFormat(view, 'bold') },
  { key: 'Mod-i', run: (view) => runEditorFormat(view, 'italic') },
  { key: 'Mod-k', run: (view) => runEditorFormat(view, 'link') },
  { key: 'Mod-Alt-2', run: (view) => runEditorFormat(view, 'heading') },
  { key: 'Mod-Shift-8', run: (view) => runEditorFormat(view, 'bullet-list') },
  { key: 'Mod-Shift-7', run: (view) => runEditorFormat(view, 'numbered-list') },
  ...searchKeymap,
  ...lintKeymap,
  ...foldKeymap,
])

export function Editor({ value, onChange, onCaretLineChange, onCreateEditor, dark = false, findings, lineNumbersEnabled, foldingEnabled }: EditorProps) {
  const lastLine = useRef(-1)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const view = viewRef.current
      if (!view) return
      const diagnostics: Diagnostic[] = findings.flatMap((finding) => {
        if (finding.line === undefined || finding.line >= view.state.doc.lines) return []
        const line = view.state.doc.line(finding.line + 1)
        return [{ from: line.from, to: line.to, severity: finding.severity, message: finding.message, source: 'Folio' }]
      })
      view.dispatch(setDiagnostics(view.state, diagnostics))
    })
    return () => cancelAnimationFrame(frame)
  }, [findings, value])

  const handleUpdate = useCallback(
    (viewUpdate: ViewUpdate) => {
      if (!onCaretLineChange) return
      if (!viewUpdate.selectionSet && !viewUpdate.docChanged) return
      const head = viewUpdate.state.selection.main.head
      const line = viewUpdate.state.doc.lineAt(head).number - 1
      if (line === lastLine.current) return
      lastLine.current = line
      onCaretLineChange(line)
    },
    [onCaretLineChange],
  )

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      syntaxHighlighting(markdownHighlight(dark)),
      search(),
      linter(null),
      lintGutter(),
      ...(foldingEnabled ? [foldGutter()] : []),
      formattingKeymap,
      editorTheme,
      EditorView.theme({}, { dark }),
    ],
    [dark, foldingEnabled],
  )

  const basicSetup = useMemo(() => ({
    lineNumbers: lineNumbersEnabled,
    foldGutter: false,
    highlightActiveLine: true,
    highlightActiveLineGutter: lineNumbersEnabled,
    bracketMatching: true,
    autocompletion: false,
  }), [lineNumbersEnabled])

  return (
    <CodeMirror
      value={value}
      height="100%"
      // Skip the bundled light/dark theme: this component supplies its own,
      // driven by the shell palette.
      theme="none"
      extensions={extensions}
      onChange={onChange}
      onUpdate={handleUpdate}
      onCreateEditor={(view) => { viewRef.current = view; onCreateEditor?.(view) }}
      basicSetup={basicSetup}
      aria-label="Markdown editor"
    />
  )
}
