import MarkdownIt from 'markdown-it'
import { markdownLanguage } from '@codemirror/lang-markdown'
import type { FormatResult } from './editor-format'

const parser = new MarkdownIt()
let cachedText: string | null = null
let cachedTree = markdownLanguage.parser.parse('')
let cachedEnvironment = {}

/** Locate syntax nodes rather than matching Markdown-looking text in code. */
export function editableInlineAt(text: string, position: number) {
  if (cachedText !== text) {
    cachedText = text
    cachedEnvironment = {}
    parser.parse(text, cachedEnvironment)
    cachedTree = markdownLanguage.parser.parse(text)
  }
  let found: { from: number; to: number; kind: 'link' | 'image'; label: string; source: string; caption: string; width: number } | null = null
  cachedTree.iterate({ enter(node) {
    if (position < node.from || position > node.to) return false
    if (!['Link', 'Image'].includes(node.name) || position < node.from || position > node.to) return
    const raw = text.slice(node.from, node.to)
    const tokens = parser.parseInline(raw, cachedEnvironment)[0]?.children ?? []
    const image = tokens.find(token => token.type === 'image')
    const link = tokens.find(token => token.type === 'link_open')
    const token = image ?? link
    if (!token) return
    const size = text.slice(node.to).match(/^\s*\{width=(\d{1,3})%\}/)
    found = { from: node.from, to: node.to + (image && size ? size[0].length : 0), kind: image ? 'image' : 'link',
      label: image ? image.content : (raw.match(/^\[((?:\\.|[^\]\\])*)\]/)?.[1] ?? token.content).replace(/\\([\[\]\\])/g, '$1'),
      source: token.attrGet(image ? 'src' : 'href') ?? '', caption: token.attrGet('title') ?? '', width: size ? Number(size[1]) : 100 }
    // A linked image has a more specific image node inside the outer link.
    if (node.name === 'Image') return false
  } })
  return found as { from: number; to: number; kind: 'link' | 'image'; label: string; source: string; caption: string; width: number } | null
}

export function indentMarkdownList(text: string, from: number, to: number, backwards: boolean): FormatResult | null {
  const start = text.lastIndexOf('\n', from - 1) + 1
  const endBreak = text.indexOf('\n', to > from && text[to - 1] === '\n' ? to - 1 : to)
  const end = endBreak < 0 ? text.length : endBreak
  const original = text.slice(start, end)
  if (!/^\s*(?:[-+*]|\d+[.)])\s/.test(original)) return null
  let node = markdownLanguage.parser.parse(text).resolveInner(Math.min(text.length, from === start ? from + 1 : from), -1)
  while (node.parent && !['ListItem', 'FencedCode', 'CodeBlock'].includes(node.name)) node = node.parent
  if (node.name !== 'ListItem') return null
  const lines = original.split('\n')
  const updated = lines.map(line => backwards ? line.replace(/^(?: {1,4}|\t)/, '') : '    ' + line).join('\n')
  const firstDelta = updated.split('\n')[0].length - lines[0].length
  return { text: text.slice(0, start) + updated + text.slice(end), from: Math.max(start, from + firstDelta), to: Math.max(start, to + updated.length - original.length) }
}
