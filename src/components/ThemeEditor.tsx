import { useUi } from './UiLanguage'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { DocumentTheme } from '../lib/document'
import { THEME_TOKENS, isSafeTokenValue } from '../lib/theme-tokens'
import { FontPicker } from './FontPicker'
import { StyleLibrary, type StyleLibraryProps } from './StyleLibrary'

type Props = StyleLibraryProps & {
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

const SIMPLE_TOKENS = new Set(['font-body', 'font-display', 'font-code', 'font-mono', 'body-fg', 'heading', 'link', 'cover-bg', 'cover-accent', 'code-bg'])

export function ThemeEditor({ theme, overrides, onChange, ...libraryProps }: Props) {
  const { tr } = useUi()
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
    () => ['Typography', 'Body', 'Cover', 'Code'].map((group) => ({ group, tokens: THEME_TOKENS.filter((token) => token.group === group && SIMPLE_TOKENS.has(token.name)) })),
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
      <StyleLibrary theme={theme} overrides={overrides} {...libraryProps} />

      <div className="theme-editor-head">
        <span>
          {overrideCount === 0
            ? tr('Using the style defaults.')
            : `${tr('Custom changes')}: ${overrideCount}`}
        </span>
        <button type="button" className="inspector-clear" onClick={() => onChange({})} disabled={overrideCount === 0} title={tr('Reset all')}>
          <RotateCcw size={12} />
        </button>
      </div>

      {grouped.map(({ group, tokens }) => (
        <section key={group} className="theme-editor-group">
          <h4>{tr(group)}</h4>
          {tokens.map((token) => {
            const current = overrides[token.name] ?? defaults[token.name] ?? ''
            const isOverridden = token.name in overrides
            const hex = token.kind === 'color' ? toHexInput(current) : null
            return (
              <div key={token.name} className={`theme-field${isOverridden ? ' is-overridden' : ''}`}>
                <span className="theme-field-label">{tr(token.label)}</span>
                {token.kind === 'color' ? (
                  <span className="theme-field-controls">
                    <input
                      type="color"
                      value={hex ?? '#000000'}
                      onChange={(event) => set(token.name, event.target.value)}
                      aria-label={`${tr(token.label)} ${tr('colour')}`}
                    />
                    <input
                      type="text"
                      className="theme-field-text"
                      aria-label={`${tr(token.label)} ${tr('colour')} value`}
                      value={current}
                      spellCheck={false}
                      onChange={(event) => set(token.name, event.target.value)}
                    />
                  </span>
                ) : <FontPicker label={tr(token.label)} value={current} mono={token.name === 'font-code'} onChange={value => set(token.name, value)} />}
                <button
                  type="button"
                  className="theme-field-reset"
                  onClick={() => reset(token.name)}
                  disabled={!isOverridden}
                  title={tr('Back to the template value')}
                  aria-label={`${tr('Reset')} ${tr(token.label)}`}
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            )
          })}
        </section>
      ))}
      <details className="theme-editor-more">
        <summary>{tr('More options')}</summary>
        {THEME_TOKENS.filter(token => !SIMPLE_TOKENS.has(token.name)).map(token => {
          const current = overrides[token.name] ?? defaults[token.name] ?? ''
          return <div key={token.name} className="theme-field">
            <span className="theme-field-label">{tr(`${token.group}`)} · {tr(token.label)}</span>
            <input type="color" aria-label={tr(token.label)} value={toHexInput(current) ?? '#000000'} onChange={event => set(token.name, event.target.value)} />
            <input className="theme-field-text" aria-label={`${tr(token.label)} ${tr('colour')}`} value={current} onChange={event => set(token.name, event.target.value)} />
            <button type="button" className="theme-field-reset" disabled={!(token.name in overrides)} aria-label={`${tr('Reset')} ${tr(token.label)}`} onClick={() => reset(token.name)}><RotateCcw size={11} /></button>
          </div>
        })}
      </details>
    </div>
  )
}
