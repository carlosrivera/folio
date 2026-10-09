export type FormatAction = 'heading' | 'bold' | 'italic' | 'link' | 'code' | 'code-block' | 'bullet-list' | 'numbered-list' | 'quote' | 'table' | 'math-inline' | 'math-block'

export type FormatResult = { text: string; from: number; to: number }

function replace(text: string, from: number, to: number, inserted: string, selectFrom: number, selectTo: number): FormatResult {
  return { text: text.slice(0, from) + inserted + text.slice(to), from: from + selectFrom, to: from + selectTo }
}

/** Pure Markdown edits used by both toolbar buttons and keyboard shortcuts. */
export function formatMarkdown(text: string, from: number, to: number, action: FormatAction): FormatResult {
  const selected = text.slice(from, to)
  const wrap = (left: string, right: string, placeholder: string) => {
    const content = selected || placeholder
    const inserted = left + content + right
    return replace(text, from, to, inserted, left.length, left.length + content.length)
  }

  if (action === 'bold') return wrap('**', '**', 'bold text')
  if (action === 'italic') return wrap('*', '*', 'italic text')
  if (action === 'code') return wrap('`', '`', 'code')
  if (action === 'math-inline') return wrap('$', '$', 'x')
  if (action === 'link') {
    const label = selected || 'link text'
    const inserted = `[${label}](https://)`
    return replace(text, from, to, inserted, label.length + 3, label.length + 11)
  }
  if (action === 'code-block') {
    const content = selected || 'code'
    const prefix = from > 0 && text[from - 1] !== '\n' ? '\n' : ''
    const inserted = `${prefix}\`\`\`\n${content}\n\`\`\`\n`
    return replace(text, from, to, inserted, prefix.length + 4, prefix.length + 4 + content.length)
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
  const prefix = action === 'heading' ? '## ' : action === 'bullet-list' ? '- ' : action === 'numbered-list' ? '1. ' : '> '
  const marker = action === 'heading' ? /^#{1,6}\s+/ : action === 'bullet-list' ? /^[-*+]\s+/ : action === 'numbered-list' ? /^\d+\.\s+/ : /^>\s?/ 
  const updated = lines.map((line) => {
    if (action === 'heading') return /^##\s+/.test(line) ? line.replace(marker, '') : `## ${line.replace(marker, '')}`
    return marker.test(line) ? line.replace(marker, '') : prefix + line
  }).join('\n')
  const cursor = lineStart + updated.length
  return { text: text.slice(0, lineStart) + updated + text.slice(lineEnd), from: cursor, to: cursor }
}
