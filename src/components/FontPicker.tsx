import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useMenuKeyboard } from './use-menu-keyboard'
import { useUi } from './UiLanguage'
import { DOCUMENT_FONTS } from '../lib/document-fonts'


const firstFont = (value: string) => value.split(',')[0].replace(/["']/g, '').trim()

export function FontPicker({ label, value, mono, onChange }: { label: string; value: string; mono: boolean; onChange: (value: string) => void }) {
  const { tr } = useUi()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280 })
  const ref = useRef<HTMLDivElement>(null)
  useMenuKeyboard(ref, open, setOpen)
  const options = DOCUMENT_FONTS.filter(font => !mono || font.mono)
  const active = options.find(font => firstFont(font.value) === firstFont(value))
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const height = Math.min(260, (options.length + (active ? 0 : 1)) * 60 + 10)
    const width = Math.min(Math.max(260, rect.width), window.innerWidth - 16)
    setPosition({ top: rect.bottom + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width })
  }, [open, active, options.length])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    const close = () => setOpen(false)
    const scroll = (event: Event) => { if (!(event.target as Element)?.closest?.('.font-picker-menu')) close() }
    window.addEventListener('resize', close)
    document.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); document.removeEventListener('scroll', scroll, true) }
  }, [open])
  return <div className="font-picker" ref={ref}>
    <button type="button" className="font-picker-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span style={{ fontFamily: value }}>{active?.label ?? firstFont(value)}</span><ChevronDown size={13} />
    </button>
    {open && <div className="font-picker-menu" style={position} role="menu" aria-label={label}>
      {!active && value && <button type="button" role="menuitemradio" aria-checked="true" onClick={() => setOpen(false)} style={{ fontFamily: value }}>
        <span>{firstFont(value)}<small>{tr('Current font')}</small></span><Check size={13} />
      </button>}
      {options.map(font => <button key={font.label} type="button" role="menuitemradio" aria-checked={active === font} style={{ fontFamily: font.value }} onClick={() => { onChange(font.value); setOpen(false) }}>
        <span>{font.label}<small>{tr('The quick brown fox')} · Aa 123</small></span>{active === font && <Check size={13} />}
      </button>)}
    </div>}
  </div>
}
