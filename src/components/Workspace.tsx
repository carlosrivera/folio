import { useUi } from './UiLanguage'
import { useRef, type ReactNode } from 'react'
export type ViewMode = 'split' | 'editor' | 'preview'
export function Workspace({ mode, width, onWidthChange, children }: { mode: ViewMode; width: number; onWidthChange: (width: number) => void; children: [ReactNode, ReactNode] }) {
  const { tr } = useUi()
  const root = useRef<HTMLElement>(null)
  const clamp = (value: number) => Math.max(25, Math.min(75, value))
  return <section className="workspace" data-mode={mode} ref={root} style={{ gridTemplateColumns: mode === 'split' ? `minmax(0, ${width}fr) 6px minmax(0, ${100 - width}fr)` : 'minmax(0, 1fr)' }}>
    {children[0]}
    <div className="pane-divider" role="separator" aria-label={tr('Editor pane width')} aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(width)} tabIndex={mode === 'split' ? 0 : -1}
      onDoubleClick={() => onWidthChange(46)}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onWidthChange(clamp(width + (event.key === 'ArrowLeft' ? -2 : 2))) } }}
      onPointerDown={event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) } }}
      onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId) || !root.current) return; const box = root.current.getBoundingClientRect(); if (box.width > 6) onWidthChange(clamp((event.clientX - box.left - 3) / (box.width - 6) * 100)) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} />
    {children[1]}
  </section>
}
