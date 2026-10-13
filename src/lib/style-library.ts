import type { DocumentTheme } from './document'
import { sanitizeThemeOverrides } from './theme-tokens'

export type SavedStyle = { id: string; name: string; theme: DocumentTheme; overrides: Record<string, string> }
export const STYLE_LIBRARY_KEY = 'folio:styles:v1'
const themes = new Set(['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'])

/** Archive storage is strict: never silently discard a portable style. */
export function validateStyleLibrary(raw: unknown): SavedStyle[] {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('Invalid document style library (maximum 100 styles).')
  const ids = new Set<string>()
  return raw.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(item.id) || ids.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || !themes.has(item.theme) ||
        !item.overrides || typeof item.overrides !== 'object' || Array.isArray(item.overrides)) throw new Error('Invalid saved document style.')
    const overrides = sanitizeThemeOverrides(item.overrides)
    if (Object.keys(overrides).length !== Object.keys(item.overrides).length || Object.entries(item.overrides).some(([key, value]) => typeof value !== 'string' || overrides[key] !== value)) throw new Error('Invalid saved style values.')
    ids.add(item.id)
    return { id: item.id, name: item.name.trim(), theme: item.theme, overrides }
  })
}

export function parseStyleLibrary(source: string | null): SavedStyle[] {
  try {
    const raw: unknown = JSON.parse(source ?? '[]')
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    return raw.flatMap((item): SavedStyle[] => {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) ||
          typeof item.name !== 'string' || !item.name.trim() || !themes.has(item.theme)) return []
      seen.add(item.id)
      return [{ id: item.id, name: item.name.trim().slice(0, 80), theme: item.theme, overrides: sanitizeThemeOverrides(item.overrides) }]
    })
  } catch { return [] }
}

export function sameStyle(style: SavedStyle, theme: DocumentTheme, overrides: Record<string, string>): boolean {
  return style.theme === theme && Object.keys(style.overrides).length === Object.keys(overrides).length &&
    Object.entries(style.overrides).every(([key, value]) => overrides[key] === value)
}

export function uniqueStyleName(name: string, styles: SavedStyle[]): string {
  const base = name.trim().slice(0, 70) || 'Untitled style'
  const names = new Set(styles.map(style => style.name.toLocaleLowerCase()))
  let candidate = base
  for (let n = 2; names.has(candidate.toLocaleLowerCase()); n++) candidate = `${base} ${n}`
  return candidate
}
