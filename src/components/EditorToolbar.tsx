import type { FormatAction } from '../lib/editor-format'

type Props = {
  onFormat: (action: FormatAction) => void
  onFind: () => void
  onToggleFold: () => void
  outlineOpen: boolean
  onToggleOutline: () => void
  lineNumbersEnabled: boolean
  onToggleLineNumbers: () => void
  foldingEnabled: boolean
  onToggleFolding: () => void
}

const formats: { action: FormatAction; label: string; title: string }[] = [
  { action: 'heading', label: 'H2', title: 'Heading 2 · ⌘⌥2' },
  { action: 'bold', label: 'B', title: 'Bold · ⌘B' },
  { action: 'italic', label: 'I', title: 'Italic · ⌘I' },
  { action: 'link', label: 'Link', title: 'Insert link · ⌘K' },
  { action: 'bullet-list', label: '• List', title: 'Bullet list · ⌘⇧8' },
  { action: 'numbered-list', label: '1. List', title: 'Numbered list · ⌘⇧7' },
  { action: 'quote', label: 'Quote', title: 'Block quote' },
  { action: 'code', label: 'Code', title: 'Inline code' },
  { action: 'code-block', label: 'Block', title: 'Code block' },
  { action: 'table', label: 'Table', title: 'Insert table' },
]

export function EditorToolbar({ onFormat, onFind, onToggleFold, outlineOpen, onToggleOutline, lineNumbersEnabled, onToggleLineNumbers, foldingEnabled, onToggleFolding }: Props) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Markdown formatting and view controls" onMouseDown={(event) => {
      if (event.target instanceof HTMLButtonElement) event.preventDefault()
    }}>
      <div className="editor-format-actions">
        {formats.map(({ action, label, title }) => (
          <button key={action} type="button" title={title} aria-label={title} onClick={() => onFormat(action)}>{label}</button>
        ))}
      </div>
      <div className="editor-view-actions">
        <button type="button" title="Find and replace · ⌘F" onClick={onFind}>Find</button>
        <button type="button" title="Insert inline LaTeX equation" onClick={() => onFormat('math-inline')}>Math</button>
        <button type="button" title="Insert display LaTeX equation" onClick={() => onFormat('math-block')}>Equation</button>
        <button type="button" title="Toggle heading outline" aria-pressed={outlineOpen} onClick={onToggleOutline}>Outline</button>
        <button type="button" title="Toggle line numbers" aria-pressed={lineNumbersEnabled} onClick={onToggleLineNumbers}>123</button>
        <button type="button" title="Toggle folding markers" aria-pressed={foldingEnabled} onClick={onToggleFolding}>Fold</button>
        {foldingEnabled && <button type="button" title="Fold or unfold current section" aria-label="Fold or unfold current section" onClick={onToggleFold}>▸</button>}
      </div>
    </div>
  )
}
