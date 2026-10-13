import { useEffect, useRef } from 'react'

/** Trap focus in save/recovery prompts that use the shell's custom backdrop. */
export function useModalFocus(active: boolean, onEscape: () => void) {
  const escape = useRef(onEscape)
  escape.current = onEscape
  useEffect(() => {
    if (!active) return
    const modal = document.querySelector<HTMLElement>('.folio-dialog[role="alertdialog"], .folio-dialog[aria-labelledby="recover-title"]')
    if (!modal) return
    const previous = document.activeElement as HTMLElement | null
    const buttons = () => Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
    buttons()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); escape.current(); return }
      if (event.key !== 'Tab') return
      const targets = buttons(), index = targets.indexOf(document.activeElement as HTMLElement)
      if (index < 0 || (!event.shiftKey && index === targets.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault(); targets[event.shiftKey ? targets.length - 1 : 0]?.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [active])
}
