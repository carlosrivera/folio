import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { copyDocumentAssets, externalizeDocumentImages, importDocumentImage, promoteDraftImages, readDiskDocument, resolveDocumentImages, saveDocumentFile } from './document-files'
import { pathToFileURL } from 'node:url'
const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))) })
async function directory() { const folder = await mkdtemp(path.join(os.tmpdir(), 'folio-file-test-')); folders.push(folder); return folder }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64')
it('blocks stale saves and only overwrites after explicit resolution', async () => {
  const file = path.join(await directory(), 'document.md')
  await writeFile(file, 'external edit')
  expect(await saveDocumentFile(file, 'my edit', 'old content')).toEqual({ saved: false, conflict: { path: file, content: 'external edit' } })
  expect(await readFile(file, 'utf8')).toBe('external edit')
  expect(await saveDocumentFile(file, 'my edit', 'old content', true)).toEqual({ saved: true })
  expect(await readFile(file, 'utf8')).toBe('my edit')
})
it('detects a deleted file rather than silently recreating it', async () => {
  const file = path.join(await directory(), 'missing.md')
  expect(await readDiskDocument(file)).toBeNull()
  expect((await saveDocumentFile(file, 'edit', 'old')).saved).toBe(false)
})
it('imports portable assets and resolves them to data URLs for preview/export', async () => {
  const file = path.join(await directory(), 'document.md')
  const source = await importDocumentImage(file, 'photo.png', png)
  expect(source).toMatch(/^\.assets\/document\//)
  expect((await resolveDocumentImages(file, [source]))[source]).toBe(`data:image/png;base64,${png.toString('base64')}`)
  await expect(importDocumentImage(null, 'photo.png', png)).rejects.toThrow('Draft image storage')
})
it('keeps unsaved images in draft files and promotes them without losing recovery references', async () => {
  const drafts = await directory()
  const source = await importDocumentImage(null, 'photo.png', png, drafts)
  expect(source).toMatch(/^folio-draft:\/\//)
  expect(source).not.toContain('base64')
  expect((await resolveDocumentImages(null, [source], drafts))[source]).toContain('data:image/png;base64,')
  const file = path.join(await directory(), 'saved.md')
  const promoted = await promoteDraftImages(file, `![Photo](<${source}>)`, drafts)
  expect(promoted).toMatch(/\.assets\/saved\//)
  expect(promoted).not.toContain('folio-draft:')
  expect((await resolveDocumentImages(null, [source], drafts))[source]).toContain('data:image/png;base64,')
  const savedSource = promoted.match(/<([^>]+)>/)![1]
  expect((await resolveDocumentImages(file, [savedSource]))[savedSource]).toContain('data:image/png;base64,')
})
it('rejects unsupported image bytes and ignores remote/missing image files', async () => {
  const folder = await directory()
  const file = path.join(folder, 'document.md')
  await expect(importDocumentImage(file, 'fake.png', Buffer.from('<script>bad</script>'))).rejects.toThrow('Choose a PNG')
  expect(await resolveDocumentImages(file, ['../private.png', 'https://example.com/photo.png'])).toEqual({})
})
it('resolves parent-directory images, absolute paths, and file URLs', async () => {
  const folder = await directory()
  const file = path.join(folder, 'nested', 'document.md')
  const image = path.join(folder, 'photo.png')
  await writeFile(image, png)
  const sources = ['../photo.png', image, pathToFileURL(image).href]
  const resolved = await resolveDocumentImages(file, sources)
  for (const source of sources) expect(resolved[source]).toBe(`data:image/png;base64,${png.toString('base64')}`)
})
it('replaces old embedded image Markdown with portable files', async () => {
  const file = path.join(await directory(), 'document.md')
  const data = `data:image/png;base64,${png.toString('base64')}`
  const result = await externalizeDocumentImages(file, `# Title\n\n![Alt](<${data}>)\n\nText after.\n`)
  expect(result).not.toContain('base64')
  expect(result).toMatch(/!\[Alt\]\(<\.assets\/document\/[^>]+>\)/)
  expect(result).toMatch(/Text after\.\n$/)
  const source = result.match(/<([^>]+)>/)![1]
  expect((await resolveDocumentImages(file, [source]))[source]).toBe(data)
})
it('leaves image syntax in code examples unchanged during save', async () => {
  const file = path.join(await directory(), 'document.md')
  const syntax = `![Alt](data:image/png;base64,${png.toString('base64')})`
  const source = `Example: \`${syntax}\`\n\n~~~markdown\n${syntax}\n~~~\n\n    ${syntax}\n`
  expect(await externalizeDocumentImages(file, source)).toBe(source)
})
it('keeps imported images available after Save As to another directory', async () => {
  const previous = path.join(await directory(), 'old.md')
  const next = path.join(await directory(), 'new.md')
  const source = await importDocumentImage(previous, 'photo.png', png)
  await copyDocumentAssets(previous, next, `![Alt](<${source}> "Caption") {width=50%}`)
  expect((await resolveDocumentImages(next, [source]))[source]).toContain('data:image/png;base64,')
  await copyDocumentAssets(previous, next, `![Alt](<${source}>)`)
})
