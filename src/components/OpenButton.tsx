import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileText, FolderOpen } from 'lucide-react'
import { useUi } from './UiLanguage'

export interface OpenButtonProps {
  label: string
  disabled?: boolean
  recentPaths: string[]
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
}

export function formatFileName(fullPath: string): string {
  return fullPath.replace(/\\/g, '/').split('/').pop() || 'Untitled.md'
}

export function formatDirectory(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  parts.pop()
  const dir = parts.join('/')
  return dir || '/'
}

export function OpenButton({
  label,
  disabled = false,
  recentPaths,
  onOpen,
  onOpenRecent,
}: OpenButtonProps) {
  const { tr } = useUi()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const topRecent = recentPaths.slice(0, 5)

  useEffect(() => {
    if (!open) return
    if (disabled) {
      setOpen(false)
      return
    }

    const firstItem = container.current?.querySelector<HTMLButtonElement>('[role=menuitem]')
    firstItem?.focus()

    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }

    const escape = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const items = Array.from(
          container.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [],
        )
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        if (items.length === 0) return
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[nextIndex]?.focus()
        return
      }
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
    <div
      className="open-control"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="button"
        className="open-main"
        disabled={disabled}
        onClick={() => {
          setOpen(false)
          onOpen()
        }}
        title={label}
      >
        <FolderOpen size={15} />
        {label}
      </button>
      <button
        type="button"
        className="open-dropdown"
        ref={trigger}
        disabled={disabled}
        aria-label={tr('Recent Documents')}
        title={tr('Recent Documents')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((val) => !val)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <div className="open-menu" role="menu" aria-label={tr('Recent Documents')}>
          {topRecent.length > 0 ? (
            topRecent.map((filePath) => (
              <button
                key={filePath}
                type="button"
                role="menuitem"
                className="open-menu-item"
                title={filePath}
                onClick={() => {
                  setOpen(false)
                  trigger.current?.focus()
                  onOpenRecent(filePath)
                }}
              >
                <FileText size={13} className="open-menu-icon" aria-hidden="true" />
                <div className="open-menu-item-info">
                  <span className="open-menu-item-name">{formatFileName(filePath)}</span>
                  <span className="open-menu-item-path">{formatDirectory(filePath)}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="open-menu-empty" role="menuitem" aria-disabled="true">
              {tr('No recent documents yet.')}
            </div>
          )}
          <div className="open-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="open-menu-item open-menu-action"
            onClick={() => {
              setOpen(false)
              trigger.current?.focus()
              onOpen()
            }}
          >
            <FolderOpen size={13} className="open-menu-icon" aria-hidden="true" />
            <div className="open-menu-item-info">
              <span className="open-menu-item-name">{tr('Open Existing File…')}</span>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
