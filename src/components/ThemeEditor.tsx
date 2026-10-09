import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { DocumentTheme } from '../lib/document'
import { THEME_TOKENS, THEME_TOKEN_GROUPS, isSafeTokenValue } from '../lib/theme-tokens'

type Props = {
  theme: DocumentTheme
  overrides: Record<string, string>
  onChange: (next: Record<string, string>) => void
}

/** Normalise a computed colour to the `#rrggbb` a colour input requires. */
function toHexInput(value: string): string | null {
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgb) {
    const hex = rgb
      .slice(1, 4)
      .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0'))
      .join('')
    return `#${hex}`
  }
  if (/^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value.trim())) {
    const [, r, g, b] = value.trim().toLowerCase().match(/^#(.)(.)(.)$/)!
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

export function ThemeEditor({ theme, overrides, onChange }: Props) {
  const probeRef = useRef<HTMLSpanElement>(null)
  const [defaults, setDefaults] = useState<Record<string, string>>({})

  // The stylesheet is the source of truth for a template's values, so they are
  // read back off a probe carrying the theme class rather than duplicated here.
  useEffect(() => {
    const probe = probeRef.current
    if (!probe) return
    const computed = getComputedStyle(probe)
    const next: Record<string, string> = {}
    for (const token of THEME_TOKENS) {
      next[token.name] = computed.getPropertyValue(`--${token.name}`).trim()
    }
    setDefaults(next)
  }, [theme])

  const grouped = useMemo(
    () => THEME_TOKEN_GROUPS.map((group) => ({ group, tokens: THEME_TOKENS.filter((token) => token.group === group) })),
    [],
  )

  const set = (name: string, value: string) => {
    if (value.trim().length === 0) {
      const { [name]: _dropped, ...rest } = overrides
      onChange(rest)
      return
    }
    if (!isSafeTokenValue(value)) return
    onChange({ ...overrides, [name]: value.trim() })
  }

  const reset = (name: string) => {
    const { [name]: _dropped, ...rest } = overrides
    onChange(rest)
  }

  const overrideCount = Object.keys(overrides).length

  return (
    <div className="theme-editor">
      {/* Off-screen carrier for the active theme's default token values. */}
      <span ref={probeRef} className={`theme-probe theme-${theme}`} aria-hidden="true" />

      <div className="theme-editor-head">
        <span>
          {overrideCount === 0
            ? 'Using the template defaults. Any change is written into this document’s frontmatter.'
            : `${overrideCount} value${overrideCount === 1 ? '' : 's'} overridden in this document.`}
        </span>
        <button type="button" className="inspector-clear" onClick={() => onChange({})} disabled={overrideCount === 0} title="Reset all">
          <RotateCcw size={12} />
        </button>
      </div>

      {grouped.map(({ group, tokens }) => (
        <section key={group} className="theme-editor-group">
          <h4>{group}</h4>
          {tokens.map((token) => {
            const current = overrides[token.name] ?? defaults[token.name] ?? ''
            const isOverridden = token.name in overrides
            const hex = token.kind === 'color' ? toHexInput(current) : null
            return (
              <label key={token.name} className={`theme-field${isOverridden ? ' is-overridden' : ''}`}>
                <span className="theme-field-label">{token.label}</span>
                {token.kind === 'color' ? (
                  <span className="theme-field-controls">
                    <input
                      type="color"
                      value={hex ?? '#000000'}
                      onChange={(event) => set(token.name, event.target.value)}
                      aria-label={`${token.label} colour`}
                    />
                    <input
                      type="text"
                      className="theme-field-text"
                      value={current}
                      spellCheck={false}
                      onChange={(event) => set(token.name, event.target.value)}
                    />
                  </span>
                ) : (
                  <input
                    type="text"
                    className="theme-field-text is-wide"
                    value={current}
                    spellCheck={false}
                    onChange={(event) => set(token.name, event.target.value)}
                  />
                )}
                <button
                  type="button"
                  className="theme-field-reset"
                  onClick={() => reset(token.name)}
                  disabled={!isOverridden}
                  title="Back to the template value"
                >
                  <RotateCcw size={11} />
                </button>
              </label>
            )
          })}
        </section>
      ))}
    </div>
  )
}
