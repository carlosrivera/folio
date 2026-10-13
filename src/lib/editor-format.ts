export type FormatAction = 'paragraph' | 'heading' | 'heading-1' | 'heading-2' | 'heading-3' | 'heading-4' | 'heading-5' | 'heading-6' | 'bold' | 'italic' | 'link' | 'code' | 'code-block' | 'bullet-list' | 'numbered-list' | 'task-list' | 'quote' | 'table' | 'math-inline' | 'math-block' | 'page-break' | 'footnote' | 'toggle-task'

export type FormatResult = { text: string; from: number; to: number }

function replace(text: string, from: number, to: number, inserted: string, selectFrom: number, selectTo: number): FormatResult {
  return { text: text.slice(0, from) + inserted + text.slice(to), from: from + selectFrom, to: from + selectTo }
}

/** Pure Markdown edits used by both toolbar buttons and keyboard shortcuts. */
export function formatMarkdown(text: string, from: number, to: number, action: FormatAction): FormatResult {
  const selected = text.slice(from, to)
  const wrap = (left: string, right: string, placeholder: string) => {
    const surroundingRun = text.slice(0, from).match(/\*+$/)?.[0].length ?? 0
    const italicCanUnwrap = left !== '*' || surroundingRun % 2 === 1
    if (italicCanUnwrap && text.slice(from - left.length, from) === left && text.slice(to, to + right.length) === right && from >= left.length) {
      return replace(text, from - left.length, to + right.length, selected, 0, selected.length)
    }
    const selectedRun = selected.match(/^\*+/)?.[0].length ?? 0
    if ((left !== '*' || selectedRun % 2 === 1) && selected.startsWith(left) && selected.endsWith(right) && selected.length >= left.length + right.length) {
      const unwrapped = selected.slice(left.length, -right.length)
      return replace(text, from, to, unwrapped, 0, unwrapped.length)
    }
    const content = selected || placeholder
    const inserted = left + content + right
    return replace(text, from, to, inserted, left.length, left.length + content.length)
  }

  if (action === 'bold') return wrap('**', '**', 'bold text')
  if (action === 'italic') return wrap('*', '*', 'italic text')
  if (action === 'code') return wrap('`', '`', 'code')
  if (action === 'math-inline') return wrap('$', '$', 'x')
  if (action === 'page-break') {
    const inserted = '\n\n<!-- pagebreak -->\n\n'
    return replace(text, from, to, inserted, inserted.length, inserted.length)
  }
  if (action === 'footnote') {
    let number = 1
    while (text.includes(`[^${number}]`)) number++
    const reference = `[^${number}]`
    const body = selected || 'Footnote text'
    const updated = text.slice(0, from) + reference + text.slice(to) + `\n\n${reference}: ${body}\n`
    return { text: updated, from: updated.length - body.length - 1, to: updated.length - 1 }
  }
  if (action === 'link') {
    const label = selected || 'link text'
    const inserted = `[${label}](https://)`
    return replace(text, from, to, inserted, label.length + 3, label.length + 11)
  }
  if (action === 'code-block') {
    const content = selected || 'code'
    const fence = '`'.repeat(Math.max(3, ...[...content.matchAll(/`+/g)].map(match => match[0].length + 1)))
    const prefix = from > 0 ? '\n'.repeat(Math.max(0, 2 - (text.slice(0, from).match(/\n*$/)?.[0].length ?? 0))) : ''
    const suffix = to < text.length ? '\n'.repeat(Math.max(0, 2 - (text.slice(to).match(/^\n*/)?.[0].length ?? 0))) : '\n'
    const inserted = `${prefix}${fence}\n${content}\n${fence}${suffix}`
    return replace(text, from, to, inserted, prefix.length + fence.length + 1, prefix.length + fence.length + 1 + content.length)
  }
  if (action === 'math-block') {
    const content = selected || 'x^2 + y^2 = z^2'
    const prefix = from > 0 && text[from - 1] !== '\n' ? '\n' : ''
    const inserted = `${prefix}$$\n${content}\n$$\n`
    return replace(text, from, to, inserted, prefix.length + 3, prefix.length + 3 + content.length)
  }
  if (action === 'table') {
    const prefix = from > 0 && text[from - 1] !== '\n' ? '\n' : ''
    const inserted = `${prefix}| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |\n`
    return replace(text, from, to, inserted, prefix.length + 2, prefix.length + 10)
  }

  const lineStart = text.lastIndexOf('\n', from - 1) + 1
  const endAnchor = to > from && text[to - 1] === '\n' ? to - 1 : to
  const nextBreak = text.indexOf('\n', endAnchor)
  const lineEnd = nextBreak === -1 ? text.length : nextBreak
  const original = text.slice(lineStart, lineEnd)
  const lines = original.split('\n')
  if (action === 'toggle-task') {
    const checked = lines.filter(line => /^\s*[-*+]\s+\[[ xX]\]/.test(line)).every(line => /^\s*[-*+]\s+\[[xX]\]/.test(line))
    const updated = lines.map(line => line.replace(/^(\s*[-*+]\s+)\[[ xX]\]/, (_, prefix: string) => prefix + (checked ? '[ ]' : '[x]'))).join('\n')
    return { text: text.slice(0, lineStart) + updated + text.slice(lineEnd), from, to }
  }
  if (action === 'paragraph') {
    const updated = lines.map(line => line.replace(/^#{1,6}\s+/, '')).join('\n')
    const cursor = lineStart + updated.length
    return { text: text.slice(0, lineStart) + updated + text.slice(lineEnd), from: cursor, to: cursor }
  }
  const headingLevel = action === 'heading' ? 2 : action.startsWith('heading-') ? Number(action.slice(-1)) : 0
  const prefix = headingLevel ? '#'.repeat(headingLevel) + ' ' : action === 'task-list' ? '- [ ] ' : action === 'bullet-list' ? '- ' : action === 'numbered-list' ? '1. ' : '> '
  const marker = headingLevel ? /^#{1,6}\s+/ : action === 'task-list' ? /^[-*+]\s+\[[ xX]\]\s+/ : action === 'bullet-list' ? /^[-*+]\s+/ : action === 'numbered-list' ? /^\d+[.)]\s+/ : /^>\s?/
  const remove = lines.filter(line => line.trim()).every(line => headingLevel ? line.startsWith(prefix) : marker.test(line))
  let number = 0
  const updated = lines.map((line) => {
    if (!line.trim()) return line
    const plain = line.replace(['task-list', 'bullet-list', 'numbered-list'].includes(action) ? /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/ : marker, '')
    if (remove) return plain
    return action === 'numbered-list' ? `${++number}. ${plain}` : prefix + plain
  }).join('\n')
  const cursor = lineStart + updated.length
  return { text: text.slice(0, lineStart) + updated + text.slice(lineEnd), from: cursor, to: cursor }
}


export function insertMarkdownLink(label: string, url: string) {
  const destination = url.trim()
  if (!destination || (/^[a-z][a-z\d+.-]*:/i.test(destination) && !/^(https?:\/\/|mailto:)/i.test(destination))) throw new Error('Enter a web URL, email link, anchor, or relative path.')
  if (/[\r\n]/.test(destination)) throw new Error('Links cannot contain line breaks.')
  const escaped = label.replace(/([\[\]\\])/g, '\\$1')
  return `[${escaped || destination}](<${destination.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`
}

export function activeFormats(text: string, from: number, to: number): FormatAction[] {
  const active = new Set<FormatAction>()
  const start = text.lastIndexOf('\n', from - 1) + 1
  const line = text.slice(start).split('\n')[0]
  for (const [action, pattern, width] of [
    ['bold', /\*\*([^\n]+?)\*\*|__([^\n]+?)__/g, 2],
    ['italic', /(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)|(?<!_)_(?!_)([^_\n]+)_(?!_)/g, 1],
    ['code', /`([^`\n]+)`/g, 1],
  ] as const) {
    for (const match of line.matchAll(pattern)) {
      if (from >= start + match.index! + width && to <= start + match.index! + match[0].length - width) active.add(action)
    }
  }
  for (const match of line.matchAll(/\*\*\*([^\n]+?)\*\*\*/g)) {
    if (from >= start + match.index! + 3 && to <= start + match.index! + match[0].length - 3) { active.add('bold'); active.add('italic') }
  }
  const heading = line.match(/^(#{1,6})\s/)
  if (heading) active.add(`heading-${heading[1].length}` as FormatAction)
  if (/^\s*[-*+]\s/.test(line)) active.add('bullet-list')
  if (/^\s*[-*+]\s+\[[ xX]\]/.test(line)) active.add('task-list')
  if (/^\s*\d+\.\s/.test(line)) active.add('numbered-list')
  if (/^\s*>\s?/.test(line)) active.add('quote')
  return [...active]
}
