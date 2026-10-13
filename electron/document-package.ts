import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { zip, strToU8 } from 'fflate/node'

const markdown = new MarkdownIt()

/** Package the current draft, including local images and linked attachments. */
export async function packageDocument(content: string, documentPath: string | null, draftDirectory: string, name: string, options: { stableAssets?: boolean; assetDirectory?: string } = {}) {
  const tokens = markdown.parse(content, {})
  const sources = new Set<string>()
  for (const token of tokens) for (const child of token.children ?? []) {
    const source = child.attrGet(child.type === 'image' ? 'src' : child.type === 'link_open' ? 'href' : '')
    if (source && !source.startsWith('#') && !source.startsWith('//') && (!/^[a-z][a-z\d+.-]*:/i.test(source) || /^(folio-draft:|file:|data:image\/)/i.test(source))) sources.add(source)
  }
  const files: Record<string, Uint8Array> = {}
  const replacements = new Map<string, string>()
  const resolved = new Map<string, string>()
  let index = 0
  const assetName = (bytes: Uint8Array, name: string) => `${options.assetDirectory ?? 'assets'}/${options.stableAssets ? createHash('sha256').update(bytes).digest('hex') + path.extname(name).toLowerCase() : `${++index}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`}`
  for (const source of sources) {
    if (source.startsWith('data:image/')) {
      const embedded = source.match(/^data:image\/(png|jpeg|gif|webp|avif);base64,([a-z\d+/=]+)$/i)
      if (!embedded) throw new Error('Could not include embedded image.')
      const bytes = Buffer.from(embedded[2], 'base64')
      const bundled = assetName(bytes, `image.${embedded[1]}`)
      files[bundled] = bytes
      replacements.set(source, bundled)
      continue
    }
    const fragment = source.match(/[?#].*$/)?.[0] ?? ''
    const destination = source.replace(/[?#].*$/, '')
    let file: string
    if (destination.startsWith('folio-draft://')) {
      const basename = decodeURIComponent(destination.slice('folio-draft://'.length))
      if (!basename || basename !== path.basename(basename) || /[\\/]/.test(basename)) throw new Error('Invalid draft image reference.')
      file = path.join(draftDirectory, basename)
    } else if (destination.startsWith('file:')) file = fileURLToPath(destination)
    else {
      if (!documentPath && !path.isAbsolute(destination)) throw new Error(`Cannot locate relative attachment in an unsaved document: ${source}`)
      file = path.resolve(documentPath ? path.dirname(documentPath) : '.', decodeURIComponent(destination))
    }
    let bundled = resolved.get(file)
    if (!bundled) {
      try { const bytes = await readFile(file); bundled = assetName(bytes, path.basename(file)); files[bundled] = bytes }
      catch { throw new Error(`Could not include local attachment: ${source}`) }
      resolved.set(file, bundled)
    }
    replacements.set(source, bundled + fragment)
  }
  // Never rewrite examples inside code, even if they mention a bundled path.
  const starts = [0, ...[...content.matchAll(/\n/g)].map(match => match.index! + 1)]
  const protectedRanges = tokens.filter(token => ['fence', 'code_block'].includes(token.type) && token.map)
    .map(token => ({ from: starts[token.map![0]], to: starts[token.map![1]] ?? content.length }))
  for (const match of content.matchAll(/(`+)[\s\S]*?\1(?!`)/g)) protectedRanges.push({ from: match.index!, to: match.index! + match[0].length })
  const protectedAt = (position: number) => protectedRanges.some(range => position >= range.from && position < range.to)
  const rewrite = (raw: string, offset: number) => {
    if (protectedAt(offset)) return raw
    // Replace only the destination, retaining label, optional title and sizing.
    for (const [source, bundled] of replacements) {
      for (const variant of new Set([source, decodeURI(source)])) {
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`(^|\\]\\(\\s*|:\\s*)<?${escaped}>?(?=\\s|\\)|$)`)
        if (pattern.test(raw)) return raw.replace(pattern, (_, prefix: string) => prefix + `<${bundled}>`)
      }
    }
    return raw
  }
  // Balanced destinations also support filenames with parentheses and nested labels.
  let bundledContent = content
  const edits: { from: number; to: number; text: string }[] = []
  for (const match of content.matchAll(/\]\(/g)) {
    const from = match.index!
    if (protectedAt(from) || edits.some(edit => from >= edit.from && from < edit.to)) continue
    let depth = 1, angle = false, quote = ''
    for (let end = from + 2; end < content.length; end++) {
      const character = content[end]
      if (character === '\\') { end++; continue }
      if (quote) { if (character === quote) quote = ''; continue }
      if (character === '<') angle = true
      else if (character === '>') angle = false
      else if (!angle && /["']/.test(character) && /\s/.test(content[end - 1])) quote = character
      else if (!angle && character === '(') depth++
      else if (!angle && character === ')' && --depth === 0) {
        const raw = content.slice(from, end + 1)
        edits.push({ from, to: end + 1, text: rewrite(raw, from) })
        break
      }
    }
  }
  for (const match of content.matchAll(/^ {0,3}\[[^\]\n]+\]:[^\n]+/gm)) {
    if (!protectedAt(match.index!)) edits.push({ from: match.index!, to: match.index! + match[0].length, text: rewrite(match[0], match.index!) })
  }
  for (const edit of edits.sort((a, b) => b.from - a.from)) bundledContent = bundledContent.slice(0, edit.from) + edit.text + bundledContent.slice(edit.to)
  // Every local reference must be portable; fail instead of producing a silently broken package.
  const bundledTokens = markdown.parse(bundledContent, {})
  for (const token of bundledTokens) for (const child of token.children ?? []) {
    const source = child.attrGet(child.type === 'image' ? 'src' : child.type === 'link_open' ? 'href' : '')
    if (source && replacements.has(source) && replacements.get(source) !== source) throw new Error(`Could not package this Markdown destination: ${source}`)
  }
  const basename = path.basename(name, path.extname(name)).replace(/[\\/:]/g, '-') || 'document'
  files[`${basename}.md`] = strToU8(bundledContent)
  return await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, bytes) => error ? reject(error) : resolve(bytes)))
}
