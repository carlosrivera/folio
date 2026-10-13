import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { openFolio, editFolioStyles, isFolio } from '../../electron/folio-document'
import { captureFolioStyles } from '../lib/folio-styles'
import { validateStyleLibrary, uniqueStyleName, type SavedStyle } from '../lib/style-library'
import { parseDocument, upsertTheme, upsertThemeOverrides, type DocumentTheme } from '../lib/document'
import { THEME_TOKENS } from '../lib/theme-tokens'
import { DOCUMENT_FONTS } from '../lib/document-fonts'
import { fileURLToPath } from 'node:url'

async function baseStyles(theme: DocumentTheme) {
  const location = new URL('../styles.css', import.meta.url)
  // Vite embeds this asset in the desktop MCP bundle; the source runner uses a file URL.
  const css = location.protocol === 'data:'
    ? Buffer.from(location.href.slice(location.href.indexOf(',') + 1), 'base64').toString('utf8')
    : await readFile(fileURLToPath(location), 'utf8')
  return captureFolioStyles(css, theme)
}
export async function listDocumentStyles(filePath: string) {
  if (!isFolio(filePath)) throw new Error('Choose a .folio document for named styles.')
  const bundle = await openFolio(path.resolve(filePath))
  return { theme: bundle.styles.theme, activeStyleId: bundle.styles.activeStyleId ?? null, styles: bundle.styles.namedStyles ?? [], availableTokens: THEME_TOKENS, availableFonts: DOCUMENT_FONTS }
}
export async function createDocumentStyle(filePath: string, name: string, theme: DocumentTheme, overrides: Record<string, string> = {}) {
  const candidate: SavedStyle = { id: `style-${randomUUID()}`, name, theme, overrides }
  await editFolioStyles(path.resolve(filePath), document => {
    const library = document.styles.namedStyles ?? []
    candidate.name = uniqueStyleName(name, library)
    return { ...document, styles: { ...document.styles, namedStyles: validateStyleLibrary([...library, candidate]) } }
  })
  return candidate
}
export async function duplicateDocumentStyle(filePath: string, styleId?: string, name?: string) {
  let created!: SavedStyle
  await editFolioStyles(path.resolve(filePath), document => {
    const library = document.styles.namedStyles ?? []
    const original = styleId ? library.find(style => style.id === styleId) : undefined
    if (styleId && !original) throw new Error(`Style "${styleId}" not found.`)
    const parsed = parseDocument(document.content)
    created = { id: `style-${randomUUID()}`, name: uniqueStyleName(name ?? `${original?.name ?? document.styles.theme} copy`, library), theme: original?.theme ?? document.styles.theme as DocumentTheme, overrides: original ? { ...original.overrides } : { ...Object.fromEntries(THEME_TOKENS.flatMap(token => document.styles.tokens[token.name] ? [[token.name, document.styles.tokens[token.name]]] : [])), ...parsed.metadata.themeOverrides } }
    return { ...document, styles: { ...document.styles, namedStyles: validateStyleLibrary([...library, created]) } }
  })
  return created
}
export async function updateDocumentStyle(filePath: string, styleId: string, changes: { name?: string; theme?: DocumentTheme; overrides?: Record<string, string> }) {
  let updated!: SavedStyle
  await editFolioStyles(path.resolve(filePath), document => {
    const library = document.styles.namedStyles ?? []
    const original = library.find(style => style.id === styleId)
    if (!original) throw new Error(`Style "${styleId}" not found.`)
    updated = { ...original, ...(changes.theme ? { theme: changes.theme } : {}), ...(changes.overrides !== undefined ? { overrides: changes.overrides } : {}), name: changes.name ? uniqueStyleName(changes.name, library.filter(style => style.id !== styleId)) : original.name }
    // Updating the library does not silently restyle the document.
    return { ...document, styles: { ...document.styles, namedStyles: validateStyleLibrary(library.map(style => style.id === styleId ? updated : style)) } }
  })
  return updated
}
export async function applyDocumentStyle(filePath: string, styleId: string) {
  // Resolve base tokens before the edit; the style is re-read inside the transaction.
  const library = await listDocumentStyles(filePath)
  const selected = library.styles.find(style => style.id === styleId)
  if (!selected) throw new Error(`Style "${styleId}" not found.`)
  const base = await baseStyles(selected.theme)
  return editFolioStyles(path.resolve(filePath), document => {
    const style = document.styles.namedStyles?.find(style => style.id === styleId)
    if (!style || style.theme !== selected.theme) throw new Error('The style changed during application. Try again.')
    return { content: upsertThemeOverrides(upsertTheme(document.content, style.theme), style.overrides), styles: { ...base, namedStyles: document.styles.namedStyles, activeStyleId: styleId } }
  })
}
