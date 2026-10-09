import { headingAnchors, slugify, type ParsedDocument } from './document'

export type LintSeverity = 'error' | 'warning' | 'info'

export type LintFinding = {
  /** Stable identifier for the rule, useful for tests and for muting later. */
  rule: string
  severity: LintSeverity
  message: string
  /** Zero-based line in the source, when the problem has a location. */
  line?: number
}

const KNOWN_FRONTMATTER_KEYS = new Set([
  'layout',
  'title',
  'client',
  'prepared-for',
  'preparedFor',
  'prepared-by',
  'preparedBy',
  'date',
  'valid-until',
  'validUntil',
  'document-id',
  'documentId',
  'name',
  'role',
  'subtitle',
  'tagline',
  'email',
  'phone',
  'tel',
  'location',
  'city',
  'website',
  'url',
  'linkedin',
  'github',
  'lang',
  'language',
  'theme',
  'toc',
  'table-of-contents',
  'header',
  'page-header',
  'pageHeader',
  'footer',
  'page-footer',
  'pageFooter',
])

const ALLOWED_INLINE_TAGS = new Set(['br'])
const DIAGRAM_WIDTHS = new Set(['natural', 'half', 'full'])
const MAX_APPROVAL_WINDOW_DAYS = 365

/** Lines that belong to fenced code, which is exempt from prose rules. */
function fencedLines(lines: string[]): Set<number> {
  const fenced = new Set<number>()
  let open = false
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced.add(index)
      open = !open
      return
    }
    if (open) fenced.add(index)
  })
  return fenced
}

function frontmatterBlock(source: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  return { body: match[1], lines: match[1].split(/\r?\n/) }
}

function parseLooseDate(value: string): Date | null {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : new Date(timestamp)
}

/**
 * Static checks over the source. Everything here is a problem you would
 * otherwise only discover by reading the exported PDF.
 */
export function lintDocument(source: string, parsed: ParsedDocument, now = new Date()): LintFinding[] {
  const findings: LintFinding[] = []
  const lines = source.split(/\r?\n/)
  const fenced = fencedLines(lines)
  const add = (finding: LintFinding) => findings.push(finding)

  // --- Frontmatter ---------------------------------------------------------
  const frontmatter = frontmatterBlock(source)
  if (!frontmatter) {
    add({
      rule: 'frontmatter-missing',
      severity: 'warning',
      message: parsed.metadata.layout === 'cv'
        ? 'No frontmatter block; the document will fall back to defaults.'
        : 'No frontmatter block; the cover will fall back to defaults.',
    })
  } else {
    frontmatter.lines.forEach((line, offset) => {
      const key = line.match(/^([A-Za-z][\w-]*)\s*:/)?.[1]
      if (key && !KNOWN_FRONTMATTER_KEYS.has(key)) {
        add({
          rule: 'frontmatter-unknown-key',
          severity: 'info',
          message: `Frontmatter key "${key}" is not used by any template.`,
          line: offset + 1,
        })
      }
    })
  }

  if (parsed.metadata.layout === 'sow') {
    for (const [field, label] of [
      ['client', 'client'],
      ['preparedBy', 'prepared-by'],
      ['documentId', 'document-id'],
    ] as const) {
      if (!parsed.metadata[field]) {
        add({ rule: 'metadata-empty', severity: 'info', message: `No ${label} set; the cover will show a placeholder.` })
      }
    }
  }

  const validUntil = parsed.metadata.validUntil ? parseLooseDate(parsed.metadata.validUntil) : null
  if (parsed.metadata.validUntil && !validUntil) {
    add({ rule: 'valid-until-unparsed', severity: 'info', message: `valid-until "${parsed.metadata.validUntil}" is not a recognisable date.` })
  } else if (validUntil && validUntil.getTime() < now.getTime()) {
    add({ rule: 'valid-until-past', severity: 'warning', message: `This proposal expired on ${parsed.metadata.validUntil}.` })
  } else if (validUntil) {
    const days = (validUntil.getTime() - now.getTime()) / 86_400_000
    if (days > MAX_APPROVAL_WINDOW_DAYS) {
      add({ rule: 'valid-until-far', severity: 'info', message: `valid-until is more than a year out (${parsed.metadata.validUntil}).` })
    }
  }

  // --- Structure ----------------------------------------------------------
  const fenceLines = lines.flatMap((line, index) => /^\s*(```|~~~)/.test(line) ? [index] : [])
  if (fenceLines.length % 2 !== 0) {
    add({ rule: 'fence-unclosed', severity: 'error', message: 'A fenced code block is never closed; everything after it renders as code.', line: fenceLines[fenceLines.length - 1] })
  }

  const landscapeOpens = (source.match(/<!--\s*landscape\s*-->/gi) || []).length
  const landscapeCloses = (source.match(/<!--\s*\/\s*landscape\s*-->/gi) || []).length
  if (landscapeOpens !== landscapeCloses) {
    const markerLine = lines.findIndex((line) => /<!--\s*\/?\s*landscape\s*-->/.test(line))
    add({
      rule: 'landscape-unbalanced',
      severity: 'error',
      message: `${landscapeOpens} landscape opener(s) but ${landscapeCloses} closer(s); the rest of the document stays landscape.`,
      line: markerLine >= 0 ? markerLine : undefined,
    })
  }

  const anchors = headingAnchors(source)
  const seen = new Map<string, number>()
  let previousLevel = 0
  for (const anchor of anchors) {
    const firstLine = seen.get(anchor.id)
    if (firstLine !== undefined) {
      add({
        rule: 'heading-duplicate-anchor',
        severity: 'warning',
        message: `"${anchor.text}" repeats the anchor of the heading on line ${firstLine + 1}; index links will point at the first one.`,
        line: anchor.line,
      })
    } else {
      seen.set(anchor.id, anchor.line)
    }

    if (previousLevel > 0 && anchor.level > previousLevel + 1) {
      add({
        rule: 'heading-level-jump',
        severity: 'info',
        message: `"${anchor.text}" jumps from level ${previousLevel} to ${anchor.level}.`,
        line: anchor.line,
      })
    }
    previousLevel = anchor.level
  }

  // --- Fence options ------------------------------------------------------
  // Checked separately: the opening marker counts as a fenced line, so the
  // prose pass below skips it.
  lines.forEach((line, index) => {
    const fenceInfo = line.match(/^\s*(?:```|~~~)\s*mermaid\s+(.*)$/i)
    if (!fenceInfo) return
    for (const token of fenceInfo[1].trim().split(/\s+/)) {
      const [key, value] = token.split('=')
      if (key === 'width' && !DIAGRAM_WIDTHS.has((value ?? '').toLowerCase())) {
        add({
          rule: 'diagram-option-unknown',
          severity: 'info',
          message: `Diagram width "${value ?? ''}" is not one of natural, half or full; the default is used.`,
          line: index,
        })
      }
    }
  })

  // --- Prose --------------------------------------------------------------
  lines.forEach((line, index) => {
    if (fenced.has(index)) return

    // One finding per tag name per line: an element contributes an opening and
    // a closing tag, and reporting both says nothing extra.
    const reportedTags = new Set<string>()
    for (const match of line.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)\b[^>]*>/g)) {
      const tag = match[1].toLowerCase()
      if (ALLOWED_INLINE_TAGS.has(tag) || reportedTags.has(tag)) continue
      if (/^<!--/.test(match[0])) continue
      reportedTags.add(tag)
      add({
        rule: 'raw-html',
        severity: 'warning',
        message: `<${tag}> is not rendered; it will appear as literal text.`,
        line: index,
      })
    }

    for (const match of line.matchAll(/\]\(#([^)]+)\)/g)) {
      const target = match[1]
      if (!seen.has(target) && !seen.has(slugify(target))) {
        add({
          rule: 'anchor-missing',
          severity: 'warning',
          message: `Link to "#${target}" has no matching heading.`,
          line: index,
        })
      }
    }

  })

  // --- Tables -------------------------------------------------------------
  const cellCount = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').length
  lines.forEach((line, index) => {
    if (fenced.has(index)) return
    const isSeparator = /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('|')
    if (!isSeparator || index === 0) return

    const headerCells = cellCount(lines[index - 1])
    for (let row = index + 1; row < lines.length; row++) {
      const candidate = lines[row]
      if (!candidate.includes('|') || candidate.trim().length === 0) break
      if (cellCount(candidate) !== headerCells) {
        add({
          rule: 'table-ragged-row',
          severity: 'warning',
          message: `This row has ${cellCount(candidate)} cells but the table header has ${headerCells}.`,
          line: row,
        })
      }
    }
  })

  return findings.sort((a, b) => (a.line ?? -1) - (b.line ?? -1))
}

export function countBySeverity(findings: LintFinding[]) {
  return findings.reduce(
    (totals, finding) => ({ ...totals, [finding.severity]: totals[finding.severity] + 1 }),
    { error: 0, warning: 0, info: 0 },
  )
}
