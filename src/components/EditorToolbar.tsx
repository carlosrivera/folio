import { useEffect, useRef, type SyntheticEvent } from 'react'
import type { FormatAction } from '../lib/editor-format'
import type { TableAction } from '../lib/markdown-table'
import type { InsertKind } from './InsertDialog'
import { useUi } from './UiLanguage'

type Props = {
  onFormat: (action: FormatAction) => void
  onInsert: (kind: InsertKind) => void
  onTableAction: (action: TableAction) => void
  onProperties: () => void
  editableKind: 'image' | 'link' | null
  active: FormatAction[]
  inTable: boolean
  onFind: () => void
  onToggleFold: () => void
  outlineOpen: boolean
  onToggleOutline: () => void
  foldingEnabled: boolean
}
const formats: { action: FormatAction; label: string; title: string; shortcut?: string }[] = [
  { action: 'bold', label: 'B', title: 'Bold', shortcut: 'B' },
  { action: 'italic', label: 'I', title: 'Italic', shortcut: 'I' },
  { action: 'code', label: 'Code', title: 'Inline code' },
  { action: 'bullet-list', label: '• List', title: 'Bullet list', shortcut: 'Shift+8' },
  { action: 'numbered-list', label: '1. List', title: 'Numbered list', shortcut: 'Shift+7' },
  { action: 'task-list', label: 'Tasks', title: 'Task list' },
  { action: 'quote', label: 'Quote', title: 'Block quote' },
]
function positionMenu(event: SyntheticEvent<HTMLDetailsElement>) {
  const details = event.currentTarget
  const menu = details.querySelector<HTMLElement>('[popover]')!
  if (!details.open) { menu.hidePopover(); return }
  menu.showPopover()
  const box = details.querySelector('summary')!.getBoundingClientRect()
  menu.style.top = `${box.bottom + 4}px`
  menu.style.left = `${Math.max(8, Math.min(box.left, innerWidth - menu.offsetWidth - 8))}px`
}
export function EditorToolbar(props: Props) {
  const { tr } = useUi()
  const ref = useRef<HTMLDivElement>(null)
  const modifier = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'
  const heading = props.active.find(action => action.startsWith('heading-')) ?? 'paragraph'
  useEffect(() => {
    const close = (event: PointerEvent) => ref.current?.querySelectorAll('details[open]').forEach(menu => { if (!menu.contains(event.target as Node)) menu.removeAttribute('open') })
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return <div ref={ref} className="editor-toolbar" role="toolbar" aria-label={tr('Markdown formatting and view controls')}
    onKeyDown={event => {
      const menu = (event.target as Element).closest('details')
      if (event.key === 'Escape') {
        menu?.removeAttribute('open'); menu?.querySelector('summary')?.focus()
      }
      if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        if (!menu.open) {
          menu.open = true
          requestAnimationFrame(() => menu.querySelector('button')?.focus())
        } else {
          const items = Array.from(menu.querySelectorAll('button'))
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items[next]?.focus()
        }
      }
    }} onMouseDown={event => { if (event.target instanceof HTMLButtonElement) event.preventDefault() }}>
    <div className="editor-format-actions">
      <select aria-label={tr('Heading level')} title={tr('Heading level')} value={heading} onChange={event => props.onFormat(event.target.value as FormatAction)}>
        <option value="paragraph">{tr('Paragraph')}</option>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={`heading-${level}`}>H{level}</option>)}
      </select>
      <span className="editor-toolbar-divider" />
      {formats.map(({ action, label, title, shortcut }) => <button key={action} type="button" title={shortcut ? `${tr(title)} · ${modifier}${shortcut}` : tr(title)} aria-label={tr(title)} aria-pressed={props.active.includes(action)} onClick={() => props.onFormat(action)}>{tr(label)}</button>)}
      {props.active.includes('task-list') && <button title={tr('Toggle task completion')} aria-label={tr('Toggle task completion')} onClick={() => props.onFormat('toggle-task')}>☑</button>}
      <span className="editor-toolbar-divider" />
      <details className="editor-insert-menu" onToggle={positionMenu}><summary>{tr('Insert')}</summary><div popover="manual">
        {(['link', 'image', 'table'] as const).map(kind => <button key={kind} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); props.onInsert(kind) }}>{tr(kind[0].toUpperCase() + kind.slice(1))}</button>)}
        {(['code-block', 'math-inline', 'math-block', 'page-break', 'footnote'] as const).map((action, index) => <button key={action} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); props.onFormat(action) }}>{tr(['Code block', 'Inline equation', 'Display equation', 'Page break', 'Footnote'][index])}</button>)}
      </div></details>
      {props.editableKind && <button onClick={() => props.onInsert(props.editableKind!)}>{tr(props.editableKind === 'image' ? 'Edit image' : 'Edit link')}</button>}
      {props.inTable && <details className="editor-insert-menu" onToggle={positionMenu}><summary>{tr('Table')}</summary><div popover="manual">{(['add-row', 'remove-row', 'add-column', 'remove-column', 'align-left', 'align-center', 'align-right'] as const).map(action => <button key={action} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); props.onTableAction(action) }}>{tr(action.replace('-', ' '))}</button>)}</div></details>}
    </div>
    <div className="editor-view-actions">
      <button title={`${tr('Find')} · ${modifier}F`} onClick={props.onFind}>{tr('Find')}</button>
      <button aria-label={tr('Outline')} aria-pressed={props.outlineOpen} onClick={props.onToggleOutline}>{tr('Outline')}</button>
      <button onClick={props.onProperties}>{tr('Document')}</button>
      {props.foldingEnabled && <button title={tr('Fold section')} aria-label={tr('Fold section')} onClick={props.onToggleFold}>▸</button>}
    </div>
  </div>
}
