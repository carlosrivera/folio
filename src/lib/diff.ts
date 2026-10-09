import { headingAnchors } from './document'

export type WordDiffPart = { text: string; kind: 'same' | 'added' | 'removed' }
export type SectionStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export type SectionDiff = {
  id: string
  title: string
  level: number
  status: SectionStatus
  /** Word-level detail, present for changed sections. */
  parts: WordDiffPart[]
}

export type DocumentDiff = {
  sections: SectionDiff[]
  summary: { added: number; removed: number; changed: number; unchanged: number }
}

/** Beyond this a word-level LCS costs more than it is worth; replace the block instead. */
const MAX_LCS_WORDS = 2_000

type Section = { id: string; title: string; level: number; body: string }

const PREAMBLE_ID = ' preamble'

/** Split a document into sections at every heading, keeping any preamble. */
export function splitSections(source: string): Section[] {
  const lines = source.split(/\r?\n/)
  const anchors = headingAnchors(source)
  const sections: Section[] = []

  const bodyBetween = (from: number, to: number) => lines.slice(from, to).join('\n').trim()

  const firstHeading = anchors[0]?.line ?? lines.length
  const preamble = bodyBetween(0, firstHeading)
  if (preamble.length > 0) {
    sections.push({ id: PREAMBLE_ID, title: 'Front matter and preamble', level: 0, body: preamble })
  }

  anchors.forEach((anchor, index) => {
    const end = anchors[index + 1]?.line ?? lines.length
    sections.push({
      id: anchor.id,
      title: anchor.text,
      level: anchor.level,
      body: bodyBetween(anchor.line + 1, end),
    })
  })

  return sections
}

const tokenize = (text: string) => text.split(/(\s+)/).filter((token) => token.length > 0)
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Word-level diff via longest common subsequence, with adjacent runs merged. */
export function diffWords(before: string, after: string): WordDiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)

  if (a.length === 0 && b.length === 0) return []
  if (a.length + b.length > MAX_LCS_WORDS) {
    const parts: WordDiffPart[] = []
    if (before.length > 0) parts.push({ text: before, kind: 'removed' })
    if (after.length > 0) parts.push({ text: after, kind: 'added' })
    return parts
  }

  // lengths[i][j] is the LCS length of a[i..] and b[j..]
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  const raw: WordDiffPart[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      raw.push({ text: a[i], kind: 'same' })
      i += 1
      j += 1
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      raw.push({ text: a[i], kind: 'removed' })
      i += 1
    } else {
      raw.push({ text: b[j], kind: 'added' })
      j += 1
    }
  }
  while (i < a.length) raw.push({ text: a[i++], kind: 'removed' })
  while (j < b.length) raw.push({ text: b[j++], kind: 'added' })

  return raw.reduce<WordDiffPart[]>((merged, part) => {
    const last = merged[merged.length - 1]
    if (last && last.kind === part.kind) last.text += part.text
    else merged.push({ ...part })
    return merged
  }, [])
}

/**
 * Section-level comparison of two revisions. Sections are matched by heading
 * anchor, so a renamed heading reads as one removal plus one addition — which
 * is what actually happened to the document's structure.
 */
export function diffDocuments(before: string, after: string): DocumentDiff {
  const beforeSections = new Map(splitSections(before).map((section) => [section.id, section]))
  const afterSections = splitSections(after)
  const sections: SectionDiff[] = []

  for (const section of afterSections) {
    const previous = beforeSections.get(section.id)
    if (!previous) {
      sections.push({ ...section, status: 'added', parts: [{ text: section.body, kind: 'added' }] })
      continue
    }
    beforeSections.delete(section.id)
    if (normalize(previous.body) === normalize(section.body)) {
      sections.push({ ...section, status: 'unchanged', parts: [] })
    } else {
      sections.push({ ...section, status: 'changed', parts: diffWords(previous.body, section.body) })
    }
  }

  // Whatever is left existed only in the earlier revision.
  for (const removed of beforeSections.values()) {
    sections.push({ ...removed, status: 'removed', parts: [{ text: removed.body, kind: 'removed' }] })
  }

  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 }
  for (const section of sections) summary[section.status] += 1

  return { sections, summary }
}
