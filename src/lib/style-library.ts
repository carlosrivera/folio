import type { DocumentTheme } from './document'
import { sanitizeThemeOverrides } from './theme-tokens'

export type SavedStyle = { id: string; name: string; theme: DocumentTheme; overrides: Record<string, string> }
export const STYLE_LIBRARY_KEY = 'folio:styles:v1'
const themes = new Set(['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'])

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
