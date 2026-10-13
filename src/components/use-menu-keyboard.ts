import { useEffect, type RefObject } from 'react'

/** Keyboard navigation and focus return for the toolbar's radio menus. */
export function useMenuKeyboard(ref: RefObject<HTMLDivElement | null>, open: boolean, close: (open: boolean) => void) {
  useEffect(() => {
    const container = ref.current
    if (!container) return
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup]')
    const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)'))
    if (open) (items().find(item => item.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); trigger?.click(); return }
      if (!open) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); trigger?.focus(); return }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const buttons = items(), index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[target]?.focus()
      }
    }
    const blur = (event: FocusEvent) => { if (!container.contains(event.relatedTarget as Node)) close(false) }
    const click = (event: MouseEvent) => { if ((event.target as Element).closest('[role="menu"] button')) trigger?.focus() }
    container.addEventListener('keydown', keydown)
    container.addEventListener('focusout', blur)
    container.addEventListener('click', click)
    return () => { container.removeEventListener('keydown', keydown); container.removeEventListener('focusout', blur); container.removeEventListener('click', click) }
  }, [ref, open, close])
}
