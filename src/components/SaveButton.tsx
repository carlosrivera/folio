import { useUi } from './UiLanguage'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Save } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = { label: string; saveAsLabel: string; disabled: boolean; onSave: (saveAs: boolean) => void }

export function SaveButton({ label, saveAsLabel, disabled, onSave }: Props) {
  return <SplitButton label={label} alternativeLabel={saveAsLabel} disabled={disabled} icon={<Save size={15} aria-hidden="true" />}
    optionsLabel="Save options" onPrimary={() => onSave(false)} onAlternative={() => onSave(true)} />
}

export function SplitButton({ label, alternativeLabel, alternativeNote, disabled, icon, optionsLabel, primary = false, onPrimary, onAlternative }: {
  label: string; alternativeLabel: string; alternativeNote?: string; disabled: boolean; icon: ReactNode; optionsLabel: string; primary?: boolean; onPrimary: () => void; onAlternative: () => void
}) {
  const { tr } = useUi()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const item = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    if (disabled) { setOpen(false); return }
    item.current?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open, disabled])

  return (
    <div className={`save-control${primary ? ' export-control' : ''}`} ref={container} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button type="button" className="save-main" disabled={disabled} onClick={() => { setOpen(false); onPrimary() }}>
        {icon}{label}
      </button>
      <button type="button" className="save-dropdown" ref={trigger} disabled={disabled}
        aria-label={tr(optionsLabel)} title={tr(optionsLabel)} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && <div className="save-menu" role="menu" aria-label={tr(optionsLabel)}>
        <button type="button" role="menuitem" ref={item} onClick={() => {
          setOpen(false)
          trigger.current?.focus()
          onAlternative()
        }}>{alternativeLabel}</button>
        {alternativeNote && <small>{alternativeNote}</small>}
      </div>}
    </div>
  )
}
