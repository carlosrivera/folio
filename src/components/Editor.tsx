import { useCallback, useEffect, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { languages } from '@codemirror/language-data'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting, toggleFold } from '@codemirror/language'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, type ViewUpdate } from '@codemirror/view'
import { lintGutter, lintKeymap, linter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { Prec } from '@codemirror/state'
import { nextTableCell } from '../lib/markdown-table'
import { indentMarkdownList } from '../lib/markdown-editing'
import { syntaxTree } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { formatMarkdown, insertMarkdownLink, type FormatResult, type FormatAction } from '../lib/editor-format'
import type { LintFinding } from '../lib/lint'

/** Use the same chevron geometry in both states, rather than font glyphs. */
function foldMarker(open: boolean) {
  const marker = document.createElement('span')
  marker.className = 'folio-fold-marker'
  marker.title = open ? 'Fold line' : 'Unfold line'
  marker.dataset.expanded = String(open)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 10 10')
  svg.setAttribute('aria-hidden', 'true')
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  chevron.setAttribute('d', 'M3.5 2 L6.5 5 L3.5 8')
  if (open) chevron.setAttribute('transform', 'rotate(90 5 5)')
  svg.append(chevron)
  marker.append(svg)
  return marker
}

/** Surfaces come from the shell palette so the editor follows light and dark. */
const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--ui-editor-bg)', color: 'var(--ui-editor-text)' },
  '.cm-scroller': { fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace', fontSize: '16px', lineHeight: '1.68' },
  '.cm-content': { padding: '16px 12px 80px', caretColor: 'var(--ui-accent)' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { backgroundColor: 'var(--ui-editor-bg)', color: 'var(--ui-text-faint)', borderRight: '1px solid var(--ui-pane-border)' },
  '.cm-lineNumbers': { fontSize: '10px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '24px', padding: '0 2px 0 4px', lineHeight: '26.88px' },
  '.cm-foldGutter': { width: '12px' },
  '.cm-foldGutter .cm-gutterElement': { width: '12px', padding: '0', lineHeight: '26.88px' },
  '.cm-foldGutter .folio-fold-marker': { display: 'flex', width: '12px', height: '26.88px', padding: '0', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  '.folio-fold-marker svg': { display: 'block', width: '10px', height: '10px', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
  '.cm-gutter-lint': { width: '12px', fontSize: '10px' },
  // The marker is a 1em block that would otherwise sit at the top of the
  // gutter element; center it like the fold chevron and line numbers.
  '.cm-gutter-lint .cm-gutterElement': { padding: '0', lineHeight: '26.88px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
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
          { tag: tags.keyword, color: '#c6a0ef' },
          { tag: [tags.string, tags.regexp], color: '#a6da95' },
          { tag: [tags.number, tags.bool, tags.null], color: '#f5a97f' },
          { tag: tags.comment, color: '#939ab7', fontStyle: 'italic' },
          { tag: [tags.function(tags.variableName), tags.typeName], color: '#8aadf4' },
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
          { tag: tags.keyword, color: '#7939a4' },
          { tag: [tags.string, tags.regexp], color: '#28703f' },
          { tag: [tags.number, tags.bool, tags.null], color: '#a14c10' },
          { tag: tags.comment, color: '#697386', fontStyle: 'italic' },
          { tag: [tags.function(tags.variableName), tags.typeName], color: '#245aa5' },
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
  onSelectionChange?: (selection: { from: number; to: number } | null) => void
  activeLineEnabled?: boolean
  onInsertLink?: () => void
  onImageFile?: (file: File) => void
  onCursorChange?: (cursor: { from: number; to: number; line: number; column: number }) => void
  fontSize?: number
  lineSpacing?: number
  textWidth?: number
  spellcheck?: boolean
  onCreateEditor?: (view: EditorView) => void
  dark?: boolean
  findings: LintFinding[]
  lineNumbersEnabled: boolean
  foldingEnabled: boolean
}

export function runEditorFormat(view: EditorView, action: FormatAction) {
  const selection = view.state.selection.main
  return applyEditorResult(view, formatMarkdown(view.state.doc.toString(), selection.from, selection.to, action))
}

export function applyEditorResult(view: EditorView, next: FormatResult) {
  const original = view.state.doc.toString()
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
  ...[1, 2, 3, 4, 5, 6].map(level => ({ key: `Mod-Alt-${level}`, run: (view: EditorView) => runEditorFormat(view, `heading-${level}` as FormatAction) })),
  { key: 'Mod-Shift-8', run: (view) => runEditorFormat(view, 'bullet-list') },
  { key: 'Mod-Shift-7', run: (view) => runEditorFormat(view, 'numbered-list') },
  ...searchKeymap,
  ...lintKeymap,
  ...foldKeymap,
])

export function Editor({ value, onChange, onCaretLineChange, onSelectionChange, onCursorChange, onInsertLink, onImageFile, fontSize = 16, lineSpacing = 1.68, textWidth = 90, spellcheck = true, activeLineEnabled = true, onCreateEditor, dark = false, findings, lineNumbersEnabled, foldingEnabled }: EditorProps) {
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
      if (!viewUpdate.selectionSet && !viewUpdate.docChanged) return
      const selection = viewUpdate.state.selection.main
      const cursorLine = viewUpdate.state.doc.lineAt(selection.head)
      onCursorChange?.({ from: selection.from, to: selection.to, line: cursorLine.number, column: selection.head - cursorLine.from + 1 })
      onSelectionChange?.(selection.empty ? null : { from: selection.from, to: selection.to })
      if (!onCaretLineChange) return
      const head = viewUpdate.state.selection.main.head
      const line = viewUpdate.state.doc.lineAt(head).number - 1
      if (line === lastLine.current) return
      lastLine.current = line
      onCaretLineChange(line)
    },
    [onCaretLineChange, onSelectionChange, onCursorChange],
  )

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      syntaxHighlighting(markdownHighlight(dark)),
      search(),
      linter(null),
      ...(lineNumbersEnabled ? [lineNumbers(), ...(activeLineEnabled ? [highlightActiveLineGutter()] : [])] : []),
      ...(foldingEnabled ? [foldGutter({ markerDOM: foldMarker })] : []),
      lintGutter(),
      Prec.highest(keymap.of([
        { key: 'Mod-k', run: () => { onInsertLink?.(); return !!onInsertLink } },
        { key: 'Enter', run: view => {
          const selection = view.state.selection.main
          if (!selection.empty || view.state.selection.ranges.length !== 1) return false
          let node = syntaxTree(view.state).resolveInner(selection.head, -1)
          while (node.parent && !['ListItem', 'FencedCode', 'CodeBlock'].includes(node.name)) node = node.parent
          if (node.name !== 'ListItem') return false
          const line = view.state.doc.lineAt(selection.head)
          const task = line.text.match(/^(\s*(?:[-+*]|\d+[.)])\s+)\[[ xX]\]\s*(.*)$/)
          if (!task) return false
          if (!task[2].trim()) {
            view.dispatch({ changes: { from: line.from, to: line.to, insert: '' }, selection: { anchor: line.from } })
          } else {
            const marker = task[1].replace(/\d+(?=[.)])/, number => String(Number(number) + 1))
            const inserted = '\n' + marker + '[ ] '
            view.dispatch({ changes: { from: selection.head, insert: inserted }, selection: { anchor: selection.head + inserted.length } })
          }
          return true
        } },
        ...[false, true].map(backwards => ({ key: backwards ? 'Shift-Tab' : 'Tab', run: (view: EditorView) => {
          if (view.state.selection.ranges.length !== 1) return false
          const selection = view.state.selection.main
          const text = view.state.doc.toString()
          const result = nextTableCell(text, selection.head, backwards) ?? indentMarkdownList(text, selection.from, selection.to, backwards)
          return result ? applyEditorResult(view, result) : false
        } })),
      ])),
      EditorView.contentAttributes.of({ spellcheck: String(spellcheck), autocorrect: spellcheck ? 'on' : 'off' }),
      EditorView.domEventHandlers({
        paste(event, view) {
          const image = Array.from(event.clipboardData?.files ?? []).find(file => file.type.startsWith('image/'))
          if (image && onImageFile) { event.preventDefault(); onImageFile(image); return true }
          const url = event.clipboardData?.getData('text/plain').trim()
          const selection = view.state.selection.main
          if (url && /^https?:\/\/\S+$/.test(url) && !selection.empty) {
            event.preventDefault()
            const inserted = insertMarkdownLink(view.state.sliceDoc(selection.from, selection.to), url)
            view.dispatch({ changes: { from: selection.from, to: selection.to, insert: inserted }, selection: { anchor: selection.from + inserted.length } })
            return true
          }
          return false
        },
        drop(event, view) {
          const image = Array.from(event.dataTransfer?.files ?? []).find(file => file.type.startsWith('image/'))
          if (!image || !onImageFile) return false
          event.preventDefault()
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (position !== null) view.dispatch({ selection: { anchor: position } })
          onImageFile(image)
          return true
        },
      }),
      formattingKeymap,
      EditorView.theme({
        '.cm-scroller': { fontSize: `${fontSize}px`, lineHeight: String(lineSpacing) },
        '.cm-content': { maxWidth: `${textWidth}ch` },
        '.cm-lineNumbers .cm-gutterElement, .cm-foldGutter .cm-gutterElement, .cm-gutter-lint .cm-gutterElement': { lineHeight: `${fontSize * lineSpacing}px` },
        '.cm-foldGutter .folio-fold-marker': { height: `${fontSize * lineSpacing}px` },
      }),
      editorTheme,
      EditorView.theme({}, { dark }),
    ],
    [dark, foldingEnabled, lineNumbersEnabled, activeLineEnabled, onInsertLink, onImageFile, fontSize, lineSpacing, textWidth, spellcheck],
  )

  const basicSetup = useMemo(() => ({
    lineNumbers: false,
    foldGutter: false,
    highlightActiveLine: activeLineEnabled,
    highlightActiveLineGutter: false,
    bracketMatching: true,
    autocompletion: false,
  }), [activeLineEnabled])

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
