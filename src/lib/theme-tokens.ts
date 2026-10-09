export type ThemeTokenKind = 'color' | 'font'

export type ThemeTokenDef = {
  /** Custom property name without the leading dashes. */
  name: string
  label: string
  group: 'Cover' | 'Body' | 'Typography'
  kind: ThemeTokenKind
}

/**
 * The tokens a document may override. Deliberately a useful subset of the theme
 * variables rather than all of them: these are the ones that change a template
 * into a different brand.
 */
export const THEME_TOKENS: ThemeTokenDef[] = [
  { name: 'cover-bg', label: 'Cover background', group: 'Cover', kind: 'color' },
  { name: 'cover-title', label: 'Cover title', group: 'Cover', kind: 'color' },
  { name: 'cover-accent', label: 'Accent', group: 'Cover', kind: 'color' },
  { name: 'cover-kicker', label: 'Cover kicker', group: 'Cover', kind: 'color' },
  { name: 'cover-client', label: 'Cover client line', group: 'Cover', kind: 'color' },
  { name: 'cover-dt', label: 'Cover labels', group: 'Cover', kind: 'color' },
  { name: 'cover-dd', label: 'Cover values', group: 'Cover', kind: 'color' },

  { name: 'body-fg', label: 'Body text', group: 'Body', kind: 'color' },
  { name: 'kicker', label: 'Section kicker', group: 'Body', kind: 'color' },
  { name: 'heading', label: 'Headings', group: 'Body', kind: 'color' },
  { name: 'subheading', label: 'Subheadings', group: 'Body', kind: 'color' },
  { name: 'link', label: 'Links', group: 'Body', kind: 'color' },
  { name: 'marker', label: 'List markers', group: 'Body', kind: 'color' },
  { name: 'quote-border', label: 'Quote rule', group: 'Body', kind: 'color' },
  { name: 'quote-bg', label: 'Quote background', group: 'Body', kind: 'color' },
  { name: 'quote-fg', label: 'Quote text', group: 'Body', kind: 'color' },
  { name: 'th-fg', label: 'Table heads', group: 'Body', kind: 'color' },
  { name: 'figure-bg', label: 'Figure background', group: 'Body', kind: 'color' },

  { name: 'font-body', label: 'Body face', group: 'Typography', kind: 'font' },
  { name: 'font-display', label: 'Display face', group: 'Typography', kind: 'font' },
  { name: 'font-mono', label: 'Mono face', group: 'Typography', kind: 'font' },
]

export const THEME_TOKEN_GROUPS = ['Cover', 'Body', 'Typography'] as const

const TOKEN_NAMES = new Set(THEME_TOKENS.map((token) => token.name))

const MAX_VALUE_LENGTH = 120
/** Anything that could end the declaration or pull in a resource. */
const UNSAFE_VALUE = /[;{}<>\\]|url\s*\(|@import|expression\s*\(/i

/** True when a value is safe to interpolate into a generated style rule. */
export function isSafeTokenValue(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_VALUE_LENGTH && !UNSAFE_VALUE.test(trimmed)
}

/**
 * Keep only recognised tokens with values safe to emit as CSS. Frontmatter is
 * author-supplied text that ends up inside a stylesheet, so it is filtered
 * rather than trusted.
 */
export function sanitizeThemeOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const overrides: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.replace(/^--/, '').trim()
    if (!TOKEN_NAMES.has(name)) continue
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const text = String(value).trim()
    if (!isSafeTokenValue(text)) continue
    overrides[name] = text
  }
  return overrides
}

/**
 * A rule that outranks the base theme block. The class is repeated so the
 * selector's specificity beats `.theme-x` wherever it appears — on the preview
 * stage, on the cover sheet, and on the document article.
 */
export function themeOverrideCss(theme: string, overrides: Record<string, string>): string {
  const entries = Object.entries(overrides)
  if (entries.length === 0) return ''
  const declarations = entries.map(([name, value]) => `  --${name}: ${value};`).join('\n')
  return `.theme-${theme}.theme-${theme} {\n${declarations}\n}`
}
