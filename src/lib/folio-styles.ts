import { isSafeTokenValue, themeOverrideCss } from './theme-tokens'
import { validateStyleLibrary, type SavedStyle } from './style-library'

export type FolioStyles = { theme: string; themeVersion: number; tokens: Record<string, string>; namedStyles?: SavedStyle[]; activeStyleId?: string }
export type FolioRevision = { id: string; savedAt: string; title: string }
const themes = new Set(['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'])

/** Bundles store values rather than executable CSS. */
export function validateFolioStyles(raw: unknown): FolioStyles {
  const value = raw as FolioStyles
  if (!value || !themes.has(value.theme) || value.themeVersion !== 1 || !value.tokens || typeof value.tokens !== 'object' || Array.isArray(value.tokens)) throw new Error('Unsupported Folio document styles.')
  const tokens: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value.tokens)) {
    if (!/^[a-z][a-z0-9-]{0,60}$/.test(key) || typeof entry !== 'string' || !isSafeTokenValue(entry)) throw new Error('Invalid Folio theme value.')
    tokens[key] = entry
  }
  const namedStyles = value.namedStyles === undefined ? undefined : validateStyleLibrary(value.namedStyles)
  if (value.activeStyleId !== undefined && (typeof value.activeStyleId !== 'string' || !namedStyles?.some(style => style.id === value.activeStyleId))) throw new Error('Invalid active document style.')
  return { theme: value.theme, themeVersion: 1, tokens, ...(namedStyles ? { namedStyles } : {}), ...(value.activeStyleId ? { activeStyleId: value.activeStyleId } : {}) }
}

export function captureFolioStyles(css: string, theme: string, preserved?: FolioStyles | null): FolioStyles {
  if (preserved?.theme === theme) return validateFolioStyles(preserved)
  const block = css.match(new RegExp(`\\.theme-${theme}\\s*\\{([^}]+)\\}`))?.[1] ?? ''
  const tokens = Object.fromEntries([...block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
  return validateFolioStyles({ theme, themeVersion: 1, tokens, ...(preserved?.namedStyles ? { namedStyles: preserved.namedStyles } : {}) })
}

export function folioStylesCss(styles: FolioStyles | null | undefined, theme: string): string {
  return styles?.theme === theme ? themeOverrideCss(theme, validateFolioStyles(styles).tokens) : ''
}
