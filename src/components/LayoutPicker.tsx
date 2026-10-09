import { useEffect, useRef, useState } from 'react'
import { Briefcase, Check, ChevronDown, FileText, ReceiptText, User } from 'lucide-react'
import type { DocumentLayout } from '../lib/document'

export const DOCUMENT_LAYOUTS: { id: DocumentLayout; label: string; title: string; note: string }[] = [
  {
    id: 'report',
    label: 'Report',
    title: 'Report',
    note: 'Cover page, metadata block & table of contents',
  },
  {
    id: 'simple',
    label: 'Doc',
    title: 'Simple Document',
    note: 'No cover page, clean markdown with customizable headers',
  },
  {
    id: 'invoice',
    label: 'Invoice',
    title: 'Invoice',
    note: 'Invoice header, client billing, line items & payment terms',
  },
  {
    id: 'cv',
    label: 'CV',
    title: 'Curriculum Vitae',
    note: 'Hero header, contact bar & compact resume flow',
  },
]

export function layoutLabel(id: DocumentLayout): string {
  return DOCUMENT_LAYOUTS.find((l) => l.id === id)?.title ?? id.toUpperCase()
}

function LayoutIcon({ id, size = 13 }: { id: DocumentLayout; size?: number }) {
  switch (id) {
    case 'cv':
      return <User size={size} />
    case 'invoice':
      return <ReceiptText size={size} />
    case 'simple':
      return <FileText size={size} />
    case 'report':
    default:
      return <Briefcase size={size} />
  }
}

type Props = {
  value: DocumentLayout
  onChange: (layout: DocumentLayout) => void
}

export function LayoutPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const active = DOCUMENT_LAYOUTS.find((l) => l.id === value) ?? DOCUMENT_LAYOUTS[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="layout-picker" ref={containerRef}>
      <button
        type="button"
        className="layout-picker-trigger"
        onClick={() => setOpen((on) => !on)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Document layout template"
      >
        <span className="layout-picker-icon" aria-hidden="true">
          <LayoutIcon id={active.id} size={13} />
        </span>
        <span className="layout-picker-label">
          {active.label}
        </span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="theme-popover layout-popover" role="menu">
          <p className="theme-popover-heading">Document layout</p>
          {DOCUMENT_LAYOUTS.map((layout) => (
            <button
              type="button"
              key={layout.id}
              role="menuitemradio"
              aria-checked={layout.id === value}
              className={`theme-option layout-option${layout.id === value ? ' is-active' : ''}`}
              onClick={() => {
                onChange(layout.id)
                setOpen(false)
              }}
            >
              <span className="layout-option-icon" aria-hidden="true">
                <LayoutIcon id={layout.id} size={15} />
              </span>
              <span className="theme-option-text">
                <strong>{layout.title} ({layout.label})</strong>
                <span>{layout.note}</span>
              </span>
              {layout.id === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
