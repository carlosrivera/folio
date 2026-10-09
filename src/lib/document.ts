import MarkdownIt from 'markdown-it'
import { katex } from '@mdit/plugin-katex'
import { parse as parseYaml } from 'yaml'
import { type SupportedLanguage, getTranslations } from './i18n'
import { sanitizeThemeOverrides } from './theme-tokens'

export type DocumentTheme =
  | 'editorial'
  | 'voltage'
  | 'graphite'
  | 'contrast'
  | 'slate'
  | 'nocturne'
  | 'scientific'

export type DocumentLayout = 'sow' | 'cv'

export const SUPPORTED_LAYOUTS: DocumentLayout[] = ['sow', 'cv']

const LAYOUT_ALIASES: Record<string, DocumentLayout> = {
  sow: 'sow',
  proposal: 'sow',
  'statement-of-work': 'sow',
  statement: 'sow',
  cv: 'cv',
  resume: 'cv',
  'curriculum-vitae': 'cv',
  curriculum: 'cv',
  bio: 'cv',
}

/**
 * Accepted frontmatter spellings for each template. The retired names are kept
 * so documents written before the templates were renamed still open correctly.
 */
const THEME_ALIASES: Record<string, DocumentTheme> = {
  editorial: 'editorial',
  voltage: 'voltage',
  maquina: 'voltage',
  'máquina': 'voltage',
  graphite: 'graphite',
  carlosrivera: 'graphite',
  'carlos-rivera': 'graphite',
  rivera: 'graphite',
  contrast: 'contrast',
  slate: 'slate',
  nocturne: 'nocturne',
  scientific: 'scientific',
}

export type DocumentMetadata = {
  layout: DocumentLayout
  title: string
  client: string
  preparedFor: string
  preparedBy: string
  date: string
  validUntil: string
  documentId: string
  name?: string
  role?: string
  subtitle?: string
  tagline?: string
  email?: string
  phone?: string
  location?: string
  website?: string
  url?: string
  linkedin?: string
  github?: string
  lang?: SupportedLanguage
  theme?: DocumentTheme
  toc?: boolean
  header?: boolean
  footer?: boolean
  /** Token overrides the document carries for its template. */
  themeOverrides: Record<string, string>
}

export type TocItem = {
  id: string
  text: string
  level: number
}

export type ParsedDocument = {
  metadata: DocumentMetadata
  body: string
  html: string
  toc: TocItem[]
}

export function slugify(text: string, fallback = 'section'): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback
  // Headings often start with their section number ("01 — Resumen"). An id
  // beginning with a digit is not a valid CSS selector, and Paged.js resolves
  // every in-document link with querySelector while laying out cross references.
  return /^[0-9]/.test(slug) ? `${fallback}-${slug}` : slug
}

/** Every template the renderer can draw, in presentation order. */
export const SUPPORTED_THEMES: DocumentTheme[] = [
  'editorial',
  'voltage',
  'graphite',
  'contrast',
  'slate',
  'nocturne',
  'scientific',
]


const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

markdown.use(katex, {
  delimiters: 'all',
  mathFence: true,
  throwOnError: false,
  trust: false,
})

function safeBase64Encode(str: string): string {
  if (typeof globalThis !== 'undefined' && 'btoa' in globalThis) {
    const bytes = new TextEncoder().encode(str)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return globalThis.btoa(binary)
  }
  // Node / test environment fallback
  const buf = (globalThis as unknown as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer
  if (buf) {
    return buf.from(str, 'utf8').toString('base64')
  }
  return encodeURIComponent(str)
}

// Custom fence for Mermaid storing raw source in base64 to avoid HTML entity mangling
const defaultFence = markdown.renderer.rules.fence
export type DiagramWidth = 'natural' | 'half' | 'full'

const DIAGRAM_WIDTHS: DiagramWidth[] = ['natural', 'half', 'full']

/** Reads `width=full` style options from a fence info string. */
export function parseFenceOptions(info: string): { width: DiagramWidth } {
  const width = info
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((token) => token.split('=').map((part) => part.trim().toLowerCase()))
    .find(([key]) => key === 'width')?.[1]

  return { width: DIAGRAM_WIDTHS.find((candidate) => candidate === width) ?? 'natural' }
}

markdown.renderer.rules.fence = (tokens, index, options, environment, renderer) => {
  const info = tokens[index].info
  const language = info.trim().split(/\s+/)[0]?.toLowerCase()
  if (language === 'mermaid') {
    const rawSource = tokens[index].content.trim()
    const encodedSource = safeBase64Encode(rawSource)
    const { width } = parseFenceOptions(info)
    return `<figure class="mermaid-figure" data-diagram-width="${width}"><div class="mermaid-diagram" data-mermaid-source="${encodedSource}"></div></figure>`
  }
  return defaultFence?.(tokens, index, options, environment, renderer) ?? renderer.renderToken(tokens, index, options)
}

// `html: false` escapes every tag, which turns the `<br>` separators authors use
// inside table cells into visible text. Re-admit exactly that one tag; fenced
// code (including Mermaid sources) renders through a different rule and is
// unaffected.
const escapeHtml = markdown.utils.escapeHtml
const defaultText = markdown.renderer.rules.text
markdown.renderer.rules.text = (tokens, index, options, environment, renderer) => {
  const rendered = defaultText
    ? defaultText(tokens, index, options, environment, renderer)
    : escapeHtml(tokens[index].content)
  return rendered.replace(/&lt;br\s*\/?&gt;/gi, '<br>')
}

// Custom heading renderer to inject IDs for anchors & TOC
markdown.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]
  const nextToken = tokens[idx + 1]
  let headingText = ''
  if (nextToken && nextToken.children) {
    headingText = nextToken.children
      .filter((t) => t.type === 'text' || t.type === 'code_inline')
      .map((t) => t.content)
      .join('')
  }
  const id = slugify(headingText)
  token.attrSet('id', id)
  return self.renderToken(tokens, idx, options)
}

const defaults: DocumentMetadata = {
  layout: 'sow',
  title: 'Untitled document',
  client: 'Client',
  preparedFor: '',
  preparedBy: 'Your studio',
  date: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
  validUntil: '',
  documentId: 'SOW-001',
  lang: 'en',
  theme: 'editorial',
  toc: true,
  header: true,
  footer: true,
  themeOverrides: {},
}

function asText(value: unknown) {
  if (value instanceof Date) return value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true' || v === 'yes' || v === '1') return true
    if (v === 'false' || v === 'no' || v === '0') return false
  }
  return fallback
}

function inferredTitle(markdownBody: string) {
  const heading = markdownBody.match(/^#\s+(.+)$/m)?.[1]
  return heading?.trim() || defaults.title
}

export function extractToc(markdownBody: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm
  const items: TocItem[] = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(markdownBody)) !== null) {
    const level = match[1].length
    const rawText = match[2]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links
      .replace(/[*_`]/g, '') // remove formatting
      .trim()
    const id = slugify(rawText)
    items.push({ id, text: rawText, level })
  }
  return items
}

export type HeadingAnchor = {
  /** Zero-based line in the full source, frontmatter included. */
  line: number
  id: string
  text: string
  level: number
}

/**
 * Headings with their position in the *source*, so the editor caret can be
 * mapped onto the rendered page. Fenced code is skipped so a `# comment` inside
 * a code sample is not mistaken for a heading.
 */
export function headingAnchors(source: string): HeadingAnchor[] {
  const anchors: HeadingAnchor[] = []
  let insideFence = false

  source.split(/\r?\n/).forEach((rawLine, line) => {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      insideFence = !insideFence
      return
    }
    if (insideFence) return

    const match = rawLine.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/)
    if (!match) return

    const text = match[2]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim()
    anchors.push({ line, id: slugify(text), text, level: match[1].length })
  })

  return anchors
}

const PAGE_BREAK_MARKER = ':::FOLIO_PAGE_BREAK:::'
const LANDSCAPE_OPEN_MARKER = ':::FOLIO_LANDSCAPE_OPEN:::'
const LANDSCAPE_CLOSE_MARKER = ':::FOLIO_LANDSCAPE_CLOSE:::'

/**
 * Preprocesses markdown source to replace explicit page break markers with a clean marker token.
 * Supported syntaxes on their own line or between paragraphs:
 *   <!-- pagebreak -->
 *   <!-- page-break -->
 *   \pagebreak
 *   {.pagebreak}
 */
export function preprocessMarkdown(content: string): string {
  return content
    .replace(/(?:^|\n)[ \t]*(?:<!--\s*page-?break\s*-->|\\\\pagebreak|\\pagebreak|\{\.pagebreak\})[ \t]*(?:\n|$)/gi, `\n\n${PAGE_BREAK_MARKER}\n\n`)
    .replace(/(?:^|\n)[ \t]*<!--\s*\/\s*landscape\s*-->[ \t]*(?:\n|$)/gi, `\n\n${LANDSCAPE_CLOSE_MARKER}\n\n`)
    .replace(/(?:^|\n)[ \t]*<!--\s*landscape\s*-->[ \t]*(?:\n|$)/gi, `\n\n${LANDSCAPE_OPEN_MARKER}\n\n`)
}

export function parseDocument(source: string): ParsedDocument {
  let body = source
  let raw: Record<string, unknown> = {}
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)

  if (frontmatter) {
    body = source.slice(frontmatter[0].length)
    try {
      const parsed = parseYaml(frontmatter[1])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>
    } catch {
      // Invalid frontmatter remains editable; the document body still renders.
    }
  }

  const value = (camel: string, kebab = camel) => asText(raw[camel] ?? raw[kebab])
  
  // Detect layout from frontmatter or fall back
  const rawLayout = (value('layout') || '').toLowerCase().trim()
  const layout: DocumentLayout = LAYOUT_ALIASES[rawLayout] ?? 'sow'

  // Detect language from frontmatter or fall back
  const rawLang = (value('lang') || value('language') || 'en').toLowerCase().trim()
  const lang: SupportedLanguage = rawLang.startsWith('es') ? 'es' : 'en'

  // Detect theme from frontmatter or fall back
  const rawTheme = (value('theme') || 'editorial').toLowerCase().trim()
  const theme: DocumentTheme = THEME_ALIASES[rawTheme] ?? 'editorial'

  // Detect toc (CV layout defaults to false; SOW defaults to true)
  const tocDefault = layout !== 'cv'
  const tocEnabled = asBoolean(raw.toc ?? raw['table-of-contents'], tocDefault)

  // Detect running header (CV layout defaults to false; SOW defaults to true)
  const headerDefault = layout !== 'cv'
  const headerEnabled = asBoolean(raw.header ?? raw['page-header'] ?? raw.pageHeader, headerDefault)

  // Detect running footer (defaults to true)
  const footerDefault = true
  const footerEnabled = asBoolean(raw.footer ?? raw['page-footer'] ?? raw.pageFooter, footerDefault)

  const themeOverrides = sanitizeThemeOverrides(raw['theme-overrides'] ?? raw.themeOverrides)

  const name = value('name')
  const role = value('role') || value('subtitle') || value('tagline')
  const email = value('email')
  const phone = value('phone', 'tel')
  const location = value('location', 'city')
  const website = value('website', 'url')
  const linkedin = value('linkedin')
  const github = value('github')

  const metadata: DocumentMetadata = {
    layout,
    title: value('title') || name || inferredTitle(body),
    client: value('client') || (lang === 'es' ? 'Cliente' : defaults.client),
    preparedFor: value('preparedFor', 'prepared-for'),
    preparedBy: value('preparedBy', 'prepared-by') || defaults.preparedBy,
    date: value('date') || defaults.date,
    validUntil: value('validUntil', 'valid-until'),
    documentId: value('documentId', 'document-id') || defaults.documentId,
    name: name || undefined,
    role: role || undefined,
    subtitle: value('subtitle') || undefined,
    tagline: value('tagline') || undefined,
    email: email || undefined,
    phone: phone || undefined,
    location: location || undefined,
    website: website || undefined,
    url: value('url') || undefined,
    linkedin: linkedin || undefined,
    github: github || undefined,
    lang,
    theme,
    toc: tocEnabled,
    header: headerEnabled,
    footer: footerEnabled,
    themeOverrides,
  }

  // Preprocess body so markers are safely rendered
  const processedBody = preprocessMarkdown(body)
  const toc = extractToc(body)

  let html = markdown.render(processedBody)
  // Replace the paragraph containing the marker with our clean folio-page-break element
  html = html.replace(
    new RegExp(`<p>\\s*${PAGE_BREAK_MARKER}\\s*<\\/p>|${PAGE_BREAK_MARKER}`, 'g'),
    '<div class="folio-page-break"></div>'
  )
  html = html.replace(
    new RegExp(`<p>\\s*${LANDSCAPE_OPEN_MARKER}\\s*<\\/p>|${LANDSCAPE_OPEN_MARKER}`, 'g'),
    '<div class="folio-landscape">',
  )
  html = html.replace(
    new RegExp(`<p>\\s*${LANDSCAPE_CLOSE_MARKER}\\s*<\\/p>|${LANDSCAPE_CLOSE_MARKER}`, 'g'),
    '</div>',
  )
  // A break that would land where a page already starts just makes a blank
  // page: the cover and the index both break after themselves, so a marker at
  // the very top of the body is redundant, as is a run of adjacent markers.
  const BREAK_ELEMENT = '<div class="folio-page-break"></div>'
  html = html.replace(/^(?:\s*<div class="folio-page-break"><\/div>)+\s*/, '')
  html = html.replace(/(?:<div class="folio-page-break"><\/div>\s*){2,}/g, `${BREAK_ELEMENT}\n`)
  // An unclosed marker would leave the document body malformed.
  const openCount = (html.match(/<div class="folio-landscape">/g) || []).length
  const closeCount = (processedBody.match(new RegExp(LANDSCAPE_CLOSE_MARKER, 'g')) || []).length
  if (openCount > closeCount) html += '</div>'.repeat(openCount - closeCount)

  return { metadata, body, html, toc }
}

const THEME_OVERRIDES_KEY = 'theme-overrides'

/**
 * Write the template overrides into the document's frontmatter, touching only
 * that block. Frontmatter is hand-written, so the rest of it is left exactly as
 * the author typed it rather than being reserialised.
 */
export function upsertThemeOverrides(source: string, overrides: Record<string, string>): string {
  const entries = Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b))
  const block = entries.length > 0
    ? `${THEME_OVERRIDES_KEY}:\n${entries.map(([name, value]) => `  ${name}: "${value}"`).join('\n')}`
    : ''

  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) {
    // No frontmatter yet: only worth creating one if there is something to say.
    return block ? `---\n${block}\n---\n\n${source.replace(/^\n+/, '')}` : source
  }

  const lines = frontmatter[1].split(/\r?\n/)
  const start = lines.findIndex((line) => new RegExp(`^${THEME_OVERRIDES_KEY}\\s*:`).test(line))

  let kept = lines
  if (start !== -1) {
    // The key plus its indented children.
    let end = start + 1
    while (end < lines.length && (/^\s+\S/.test(lines[end]) || lines[end].trim() === '')) {
      if (lines[end].trim() === '' && !/^\s+\S/.test(lines[end + 1] ?? '')) break
      end += 1
    }
    kept = [...lines.slice(0, start), ...lines.slice(end)]
  }

  const body = [...kept.filter((line, index) => line.trim() !== '' || index < kept.length - 1)]
  if (block) body.push(...block.split('\n'))

  const rebuilt = `---\n${body.join('\n').replace(/\n+$/, '')}\n---`
  return rebuilt + source.slice(frontmatter[0].length - (frontmatter[0].endsWith('\n') ? 1 : 0))
}

/** Write the selected layout into frontmatter without reformatting its other keys. */
export function upsertLayout(source: string, layout: DocumentLayout): string {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) {
    return `---\nlayout: ${layout}\n---\n\n${source.replace(/^\n+/, '')}`
  }

  const lineEnding = frontmatter[0].includes('\r\n') ? '\r\n' : '\n'
  const lines = frontmatter[1].split(/\r?\n/)
  const layoutLine = lines.findIndex((line) => /^layout\s*:/.test(line))

  if (layoutLine === -1) lines.unshift(`layout: ${layout}`)
  else lines[layoutLine] = `layout: ${layout}`

  const contentStart = 3 + lineEnding.length
  const contentEnd = contentStart + frontmatter[1].length
  return source.slice(0, contentStart) + lines.join(lineEnding) + source.slice(contentEnd)
}

/** Write the selected template into frontmatter without reformatting its other keys. */
export function upsertTheme(source: string, theme: DocumentTheme): string {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) {
    return `---\ntheme: ${theme}\n---\n\n${source.replace(/^\n+/, '')}`
  }

  const lineEnding = frontmatter[0].includes('\r\n') ? '\r\n' : '\n'
  const lines = frontmatter[1].split(/\r?\n/)
  const themeLine = lines.findIndex((line) => /^theme\s*:/.test(line))

  if (themeLine === -1) lines.push(`theme: ${theme}`)
  else lines[themeLine] = `theme: ${theme}`

  const contentStart = 3 + lineEnding.length
  const contentEnd = contentStart + frontmatter[1].length
  return source.slice(0, contentStart) + lines.join(lineEnding) + source.slice(contentEnd)
}

/** Keep the language choice with the Markdown document. */
export function upsertLanguage(source: string, lang: SupportedLanguage): string {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) return `---\nlang: ${lang}\n---\n\n${source.replace(/^\n+/, '')}`

  const lineEnding = frontmatter[0].includes('\r\n') ? '\r\n' : '\n'
  const lines = frontmatter[1].split(/\r?\n/)
  const index = lines.findIndex((line) => /^(lang|language)\s*:/.test(line))
  if (index === -1) lines.push(`lang: ${lang}`)
  else {
    lines[index] = `lang: ${lang}`
    for (let i = lines.length - 1; i > index; i -= 1) {
      if (/^(lang|language)\s*:/.test(lines[i])) lines.splice(i, 1)
    }
  }
  const contentStart = 3 + lineEnding.length
  const contentEnd = contentStart + frontmatter[1].length
  return source.slice(0, contentStart) + lines.join(lineEnding) + source.slice(contentEnd)
}

export function suggestedFileName(title: string) {
  const slug = slugify(title, 'document')
  return slug || 'document'
}
