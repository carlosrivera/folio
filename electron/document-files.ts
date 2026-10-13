import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'

const imageMarkdown = new MarkdownIt()

export async function readDiskDocument(filePath: string): Promise<string | null> {
  try { return await readFile(filePath, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

export async function saveDocumentFile(filePath: string, content: string, expectedContent?: string, overwrite = false) {
  if (expectedContent !== undefined && !overwrite) {
    const current = await readDiskDocument(filePath)
    if (current !== expectedContent) return { saved: false as const, conflict: { path: filePath, content: current } }
  }
  await writeFile(filePath, content, 'utf8')
  return { saved: true as const }
}

function imageMime(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif'
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (bytes.subarray(4, 8).toString() === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString())) return 'image/avif'
  throw new Error('Choose a PNG, JPEG, GIF, WebP, or AVIF image.')
}

export async function importDocumentImage(documentPath: string | null, name: string, bytes: Buffer, draftDirectory?: string) {
  if (!documentPath && !draftDirectory) throw new Error('Draft image storage is unavailable.')
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Images must be smaller than 20 MB.')
  imageMime(bytes)
  const directory = documentPath ? path.join(path.dirname(documentPath), '.assets', path.basename(documentPath, path.extname(documentPath))) : draftDirectory!
  await mkdir(directory, { recursive: true })
  const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '-') || 'image.png'
  const filePath = path.join(directory, `${randomUUID().slice(0, 8)}-${safeName}`)
  await writeFile(filePath, bytes, { flag: 'wx' })
  return documentPath ? path.relative(path.dirname(documentPath), filePath).split(path.sep).map(encodeURIComponent).join('/') : `folio-draft://${encodeURIComponent(path.basename(filePath))}`
}

function draftImagePath(source: string, directory: string) {
  const name = decodeURIComponent(source.slice('folio-draft://'.length))
  if (!name || name !== path.basename(name) || /[\\/]/.test(name)) throw new Error('Invalid draft image reference.')
  return path.join(directory, name)
}

export async function promoteDraftImages(documentPath: string, content: string, draftDirectory: string) {
  const sources = new Set([...content.matchAll(/folio-draft:\/\/[a-z\d._%-]+/gi)].map(match => match[0]))
  for (const source of sources) {
    const file = draftImagePath(source, draftDirectory)
    const savedSource = await importDocumentImage(documentPath, path.basename(file), await readFile(file))
    content = content.replaceAll(source, savedSource)
  }
  // Keep draft files available for recovery and undo.
  return content
}

/** Repair images embedded by earlier versions without leaving large URLs in Markdown. */
export async function externalizeDocumentImages(documentPath: string, content: string) {
  if (!/data:image\//i.test(content)) return content
  const lineStarts = [0, ...[...content.matchAll(/\n/g)].map(match => match.index! + 1)]
  const protectedRanges = imageMarkdown.parse(content, {}).filter(token => (token.type === 'fence' || token.type === 'code_block') && token.map)
    .map(token => ({ from: lineStarts[token.map![0]], to: lineStarts[token.map![1]] ?? content.length }))
  for (const match of content.matchAll(/(`+)[\s\S]*?\1(?!`)/g)) protectedRanges.push({ from: match.index!, to: match.index! + match[0].length })
  const pattern = /(!\[(?:\\.|[^\]\\])*\]\(\s*<?)(data:image\/(png|jpeg|gif|webp|avif);base64,([a-z\d+/=]+))(>?\s*\))/gi
  let result = '', offset = 0
  for (const match of content.matchAll(pattern)) {
    if (protectedRanges.some(range => match.index! >= range.from && match.index! < range.to)) continue
    const source = await importDocumentImage(documentPath, `image.${match[3].toLowerCase() === 'jpeg' ? 'jpg' : match[3].toLowerCase()}`, Buffer.from(match[4], 'base64'))
    result += content.slice(offset, match.index) + match[1] + source + match[5]
    offset = match.index! + match[0].length
  }
  return result + content.slice(offset)
}

/** Keep Folio's imported image paths valid when Save As moves a document. */
export async function copyDocumentAssets(previousPath: string, nextPath: string, content: string) {
  const previousDirectory = path.dirname(previousPath)
  const nextDirectory = path.dirname(nextPath)
  if (previousDirectory === nextDirectory) return
  const sources = new Set(imageMarkdown.parse(content, {}).flatMap(token => token.children ?? [])
    .filter(token => token.type === 'image').map(token => token.attrGet('src') ?? '').filter(source => source.startsWith('.assets/')))
  for (const source of sources) {
    const relative = decodeURIComponent(source)
    const previous = path.resolve(previousDirectory, relative)
    const next = path.resolve(nextDirectory, relative)
    if (!path.relative(previousDirectory, previous).startsWith(`.assets${path.sep}`) || !path.relative(nextDirectory, next).startsWith(`.assets${path.sep}`)) continue
    const bytes = await readFile(previous)
    imageMime(bytes)
    await mkdir(path.dirname(next), { recursive: true })
    try { await writeFile(next, bytes, { flag: 'wx' }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readFile(next)).equals(bytes)) throw error
    }
  }
}

export async function resolveDocumentImages(documentPath: string | null, sources: string[], draftDirectory?: string) {
  const directory = documentPath ? path.dirname(documentPath) : null
  const results: Record<string, string> = {}
  await Promise.all(sources.map(async source => {
    const draft = source.startsWith('folio-draft://')
    if (!source || source.startsWith('#') || source.startsWith('//') || (!draft && /^[a-z]+:/i.test(source) && !/^file:/i.test(source) && !path.isAbsolute(source))) return
    try {
      if (draft && !draftDirectory || !draft && !directory) return
      const filePath = draft ? draftImagePath(source, draftDirectory!) : /^file:/i.test(source) ? fileURLToPath(source) : path.resolve(directory!, decodeURIComponent(source.split(/[?#]/)[0]))
      const bytes = await readFile(filePath)
      if (bytes.length <= 20 * 1024 * 1024) results[source] = `data:${imageMime(bytes)};base64,${bytes.toString('base64')}`
    } catch { /* Leave missing/unsupported images for the preview to report. */ }
  }))
  return results
}
