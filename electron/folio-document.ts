import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import MarkdownIt from 'markdown-it'
import { unzipSync, zip, strToU8, strFromU8 } from 'fflate/node'
import { packageDocument } from './document-package'
import { parseDocument as parseYaml } from 'yaml'
import { sanitizeThemeOverrides } from '../src/lib/theme-tokens'
import { validateFolioStyles, type FolioStyles, type FolioRevision } from '../src/lib/folio-styles'

type Manifest = { format: 'folio'; version: 1; id: string; createdAt: string; history: FolioRevision[] }
const markdownParser = new MarkdownIt()
type Bundle = { files: Record<string, Uint8Array>; manifest: Manifest; content: string; styles: FolioStyles }
export const isFolio = (file: string | null) => !!file && path.extname(file).toLowerCase() === '.folio'

function decode(bytes: Uint8Array): Bundle {
  if (bytes.byteLength > 100 * 1024 * 1024) throw new Error('Folio documents must be smaller than 100 MB.')
  // Check sizes before inflating to bound memory use, including malformed ZIPs.
  let total = 0
  const files = unzipSync(bytes, { filter: entry => {
    total += entry.originalSize
    if (total > 250 * 1024 * 1024 || entry.originalSize > 100 * 1024 * 1024) throw new Error('Folio document is too large to open.')
    if (!/^(manifest\.json|document\.md|styles\.json|assets\/[a-zA-Z0-9._-]+|history\/[a-zA-Z0-9-]+\/(document\.md|styles\.json))$/.test(entry.name)) throw new Error('Invalid file in Folio document.')
    return true
  } })
  try {
    const manifest: Manifest = JSON.parse(strFromU8(files['manifest.json']))
    if (manifest.format !== 'folio' || manifest.version !== 1) throw new Error('Unsupported Folio document version.')
    if (typeof manifest.id !== 'string' || typeof manifest.createdAt !== 'string' || !Array.isArray(manifest.history) || manifest.history.length > 100) throw new Error('Invalid Folio document manifest.')
    for (const revision of manifest.history) {
      if (!/^[a-zA-Z0-9-]+$/.test(revision.id) || typeof revision.savedAt !== 'string' || typeof revision.title !== 'string' || !files[`history/${revision.id}/document.md`] || !files[`history/${revision.id}/styles.json`]) throw new Error('Invalid Folio document history.')
      validateFolioStyles(JSON.parse(strFromU8(files[`history/${revision.id}/styles.json`])))
    }
    if (!files['document.md']) throw new Error('Missing document text.')
    for (const name of ['document.md', ...manifest.history.map(revision => `history/${revision.id}/document.md`)]) {
      for (const token of markdownParser.parse(strFromU8(files[name]), {})) for (const child of token.children ?? []) {
        const source = child.attrGet(child.type === 'image' ? 'src' : child.type === 'link_open' ? 'href' : '')
        if (!source || source.startsWith('#') || source.startsWith('//') || (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^(file:|data:|folio-draft:)/i.test(source))) continue
        const local = decodeURIComponent(source.split(/[?#]/)[0])
        if (!/^assets\/[a-zA-Z0-9._-]+$/.test(local) || !files[local]) throw new Error('Missing or invalid bundled attachment.')
      }
    }
    return { files, manifest, content: strFromU8(files['document.md']), styles: validateFolioStyles(JSON.parse(strFromU8(files['styles.json']))) }
  } catch (error) { throw new Error(`Could not open Folio document: ${error instanceof Error ? error.message : 'Invalid archive'}`) }
}

async function load(file: string) { return decode(await readFile(file)) }
async function encode(files: Record<string, Uint8Array>) {
  return new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, bytes) => error ? reject(error) : resolve(bytes)))
}
async function atomicWrite(file: string, bytes: Uint8Array) {
  const temporary = `${file}.${randomUUID()}.tmp`
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, file) }
  finally { await rm(temporary, { force: true }) }
}

/** An immutable cache keeps open revisions and recovery drafts' image references valid. */
export async function folioAssetPath(file: string, cache: string) {
  const bytes = await readFile(file)
  const directory = path.join(cache, createHash('sha256').update(bytes).digest('hex'))
  const bundle = decode(bytes)
  await mkdir(path.join(directory, 'assets'), { recursive: true })
  for (const [name, value] of Object.entries(bundle.files)) if (name.startsWith('assets/')) await writeFile(path.join(directory, name), value)
  return path.join(directory, 'document.md')
}
export async function openFolio(file: string) {
  const bundle = await load(file)
  return { content: bundle.content, styles: bundle.styles, history: [...bundle.manifest.history].reverse() }
}
export async function readFolioText(file: string) {
  try { return (await load(file)).content }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
export async function readFolioRevision(file: string, id: string) {
  const bundle = await load(file)
  if (!bundle.manifest.history.some(revision => revision.id === id)) throw new Error('This revision is unavailable.')
  return { content: strFromU8(bundle.files[`history/${id}/document.md`]), styles: validateFolioStyles(JSON.parse(strFromU8(bundle.files[`history/${id}/styles.json`]))) }
}

export async function saveFolio(file: string, content: string, styles: FolioStyles, sourcePath: string | null, draftDirectory: string, previousFile: string | null, expectedContent?: string, overwrite = false, includeHistory = true, expectedStyles?: FolioStyles | null) {
  let previous: Bundle | null = null
  if (previousFile) previous = await load(previousFile)
  if (expectedContent !== undefined && !overwrite) {
    const current = await readFolioText(file)
    if (current !== expectedContent || expectedStyles && JSON.stringify((await load(file)).styles) !== JSON.stringify(expectedStyles)) return { saved: false as const, conflict: { path: file, content: current } }
  }
  const files: Record<string, Uint8Array> = unzipSync(await packageDocument(content, sourcePath, draftDirectory, 'document.md', { stableAssets: true }))
  const bundledContent = strFromU8(files['document.md'])
  const validatedStyles = validateFolioStyles(styles)
  const manifest: Manifest = previous ? { ...previous.manifest, id: previousFile === file ? previous.manifest.id : randomUUID(), history: includeHistory ? [...previous.manifest.history] : [] } : { format: 'folio', version: 1, id: randomUUID(), createdAt: new Date().toISOString(), history: [] }
  if (includeHistory && previous) {
    for (const [name, value] of Object.entries(previous.files)) if (name.startsWith('assets/') || name.startsWith('history/')) files[name] = value
  }
  const unchanged = previous && bundledContent === previous.content && JSON.stringify(validatedStyles) === JSON.stringify(previous.styles)
  if (!unchanged || !manifest.history.length) {
    const id = randomUUID(), savedAt = new Date().toISOString()
    manifest.history.push({ id, savedAt, title: bundledContent.match(/^#\s+(.+)$/m)?.[1] ?? 'Untitled' })
    files[`history/${id}/document.md`] = strToU8(bundledContent)
    files[`history/${id}/styles.json`] = strToU8(JSON.stringify(validatedStyles))
  }
  // Bound history to the latest 100 saved versions and collect unused historical assets.
  manifest.history = manifest.history.slice(-100)
  const retained = new Set(manifest.history.map(revision => revision.id))
  for (const name of Object.keys(files)) if (name.startsWith('history/') && !retained.has(name.split('/')[1])) delete files[name]
  const texts = [bundledContent, ...manifest.history.map(revision => strFromU8(files[`history/${revision.id}/document.md`]))].join('\n')
  for (const name of Object.keys(files)) if (name.startsWith('assets/') && !texts.includes(name)) delete files[name]
  files['styles.json'] = strToU8(JSON.stringify(validatedStyles, null, 2))
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  const bytes = await encode(files)
  decode(bytes)
  if (expectedContent !== undefined && !overwrite && (await readFolioText(file) !== expectedContent || expectedStyles && JSON.stringify((await load(file)).styles) !== JSON.stringify(expectedStyles))) return { saved: false as const, conflict: { path: file, content: await readFolioText(file) } }
  await atomicWrite(file, bytes)
  return { saved: true as const, content: bundledContent, styles: validatedStyles, history: [...manifest.history].reverse() }
}

export async function exportFolioMarkdown(content: string, sourcePath: string, destination: string, draftDirectory: string, styles?: FolioStyles) {
  const directory = `.assets/${path.basename(destination, path.extname(destination))}`
  const files = unzipSync(await packageDocument(content, sourcePath, draftDirectory, 'document.md', { stableAssets: true, assetDirectory: directory }))
  let markdown = strFromU8(files['document.md'])
  for (const [name, bytes] of Object.entries(files)) if (name.startsWith(directory + '/')) {
    const target = path.join(path.dirname(destination), name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  if (styles) {
    const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    const yaml = parseYaml(frontmatter?.[1] ?? '')
    if (yaml.errors.length) throw new Error('Fix invalid frontmatter before exporting Markdown.')
    const custom = yaml.get('theme-overrides') ?? yaml.get('themeOverrides')
    const values = custom && typeof custom === 'object' && 'toJSON' in custom ? (custom as { toJSON(): unknown }).toJSON() : custom
    yaml.set('theme-overrides', { ...sanitizeThemeOverrides(styles.tokens), ...sanitizeThemeOverrides(values) })
    yaml.delete('themeOverrides')
    markdown = `---\n${yaml.toString()}---\n${frontmatter ? markdown.slice(frontmatter[0].length) : '\n' + markdown}`
  }
  return markdown
}
