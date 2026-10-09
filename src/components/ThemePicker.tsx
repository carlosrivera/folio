import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import type { DocumentTheme } from '../lib/document'

export const DOCUMENT_THEMES: { id: DocumentTheme; label: string; note: string }[] = [
  { id: 'editorial', label: 'Editorial', note: 'Serif display, deep green cover' },
  { id: 'voltage', label: 'Voltage', note: 'Pure black with an acid lime accent, monospace detail' },
  { id: 'graphite', label: 'Graphite', note: 'Graphite and lime, Barlow display' },
  { id: 'contrast', label: 'Contrast', note: 'Pure black and white, tight geometric sans' },
  { id: 'slate', label: 'Slate', note: 'Blue-grey with a sky accent, softly rounded' },
  { id: 'nocturne', label: 'Nocturne', note: 'Deep plum cover, violet and pink accents' },
  { id: 'scientific', label: 'Scientific', note: 'Paper white, serif type, spacious equations' },
]

/** Display name for a template id, for use outside the picker. */
export function themeLabel(id: DocumentTheme): string {
  return DOCUMENT_THEMES.find((theme) => theme.id === id)?.label ?? id
}

/**
 * A swatch rendered with the theme's own class, so it shows the real tokens —
 * including any customisation the document carries.
 */
function ThemeSwatch({ id }: { id: DocumentTheme }) {
  return (
    <span className={`theme-swatch theme-${id}`} aria-hidden="true">
      <span className="theme-swatch-mark" />
      <span className="theme-swatch-title">Aa</span>
      <span className="theme-swatch-rule" />
      <span className="theme-swatch-meta">
        <span />
        <span />
      </span>
    </span>
  )
}

type Props = {
  value: DocumentTheme
  onChange: (theme: DocumentTheme) => void
  onCustomise: () => void
  customised: boolean
}

export function ThemePicker({ value, onChange, onCustomise, customised }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const active = DOCUMENT_THEMES.find((theme) => theme.id === value) ?? DOCUMENT_THEMES[0]

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
    <div className="theme-picker" ref={containerRef}>
      <button
        type="button"
        className="theme-picker-trigger"
        onClick={() => setOpen((on) => !on)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Document template"
      >
        <ThemeSwatch id={value} />
        <span className="theme-picker-label">
          {active.label}
          {customised && <em title="This document overrides template values">edited</em>}
        </span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="theme-popover" role="menu">
          <p className="theme-popover-heading">Document template</p>
          {DOCUMENT_THEMES.map((theme) => (
            <button
              type="button"
              key={theme.id}
              role="menuitemradio"
              aria-checked={theme.id === value}
              className={`theme-option${theme.id === value ? ' is-active' : ''}`}
              onClick={() => {
                onChange(theme.id)
                setOpen(false)
              }}
            >
              <ThemeSwatch id={theme.id} />
              <span className="theme-option-text">
                <strong>{theme.label}</strong>
                <span>{theme.note}</span>
              </span>
              {theme.id === value && <Check size={13} />}
            </button>
          ))}
          <button
            type="button"
            className="theme-popover-action"
            onClick={() => {
              onCustomise()
              setOpen(false)
            }}
          >
            <SlidersHorizontal size={13} /> Customise this template…
          </button>
        </div>
      )}
    </div>
  )
}
