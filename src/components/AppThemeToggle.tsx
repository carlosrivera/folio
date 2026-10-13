import { useUi } from './UiLanguage'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { AppThemePreference } from '../lib/use-app-theme'

const OPTIONS: { id: AppThemePreference; label: string; Icon: typeof Sun }[] = [
  { id: 'system', label: 'Follow the system appearance', Icon: Monitor },
  { id: 'light', label: 'Light appearance', Icon: Sun },
  { id: 'dark', label: 'Dark appearance', Icon: Moon },
]

type Props = {
  value: AppThemePreference
  onChange: (preference: AppThemePreference) => void
}

/** Light/dark for the editor shell. The document sheets stay paper either way. */
export function AppThemeToggle({ value, onChange }: Props) {
  const { tr } = useUi()
  return (
    <div className="app-theme-toggle" role="radiogroup" aria-label={tr('Appearance')} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      const index = OPTIONS.findIndex(option => option.id === value)
      const next = (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + OPTIONS.length) % OPTIONS.length
      onChange(OPTIONS[next].id)
      event.currentTarget.querySelectorAll('button')[next]?.focus()
    }}>
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          type="button"
          key={id}
          role="radio"
          aria-checked={id === value}
          tabIndex={id === value ? 0 : -1}
          aria-label={tr(label)}
          title={tr(label)}
          className={id === value ? 'is-active' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  )
}
