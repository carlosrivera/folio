import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FileText, User } from 'lucide-react'
import type { DocumentLayout } from '../lib/document'

export const DOCUMENT_LAYOUTS: { id: DocumentLayout; label: string; title: string; note: string }[] = [
  {
    id: 'sow',
    label: 'SOW',
    title: 'Statement of Work',
    note: 'Cover page, details table & proposal structure',
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
          {active.id === 'cv' ? <User size={13} /> : <FileText size={13} />}
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
                {layout.id === 'cv' ? <User size={15} /> : <FileText size={15} />}
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
