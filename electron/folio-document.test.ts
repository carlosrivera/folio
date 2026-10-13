import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate/node'
import { openFolio, saveFolio, folioAssetPath, readFolioRevision, exportFolioMarkdown } from './folio-document'
import { captureFolioStyles, folioStylesCss } from '../src/lib/folio-styles'
const styles = { theme: 'voltage', themeVersion: 1, tokens: { 'code-bg': '#112233', 'font-body': 'Georgia, serif' } }
const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { force: true, recursive: true }))) })
async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'folio-bundle-')); folders.push(folder)
  await mkdir(path.join(folder, 'draft'))
  await writeFile(path.join(folder, 'draft', 'image.png'), 'first image')
  return { folder, file: path.join(folder, 'doc.folio'), draft: path.join(folder, 'draft'), cache: path.join(folder, 'cache') }
}
describe('Folio document bundles', () => {
  it('round-trips Markdown, theme values, images and document identity without base64', async () => {
    const f = await fixture()
    const result = await saveFolio(f.file, '# First\n\n![Photo](folio-draft://image.png "Caption") {width=50%}', styles, null, f.draft, null)
    expect(result.saved).toBe(true)
    const opened = await openFolio(f.file)
    expect(opened.styles).toEqual(styles)
    expect(opened.content).toMatch(/assets\/[a-f0-9]{64}\.png/)
    expect(opened.content).not.toContain('base64')
    expect(opened.history).toHaveLength(1)
    const files = unzipSync(await readFile(f.file))
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest).toMatchObject({ format: 'folio', version: 1 })
    expect(typeof manifest.id).toBe('string')
    const sourcePath = await folioAssetPath(f.file, f.cache)
    expect(strFromU8(await readFile(path.join(path.dirname(sourcePath), opened.content.match(/assets\/[^ )"\n>]+/)![0])))).toBe('first image')
  })
  it('keeps each revision’s text, styles and images, and does not duplicate unchanged saves', async () => {
    const f = await fixture()
    await saveFolio(f.file, '# First\n\n![Photo](folio-draft://image.png)', styles, null, f.draft, null)
    let opened = await openFolio(f.file)
    const originalId = opened.history[0].id
    await saveFolio(f.file, opened.content, opened.styles, await folioAssetPath(f.file, f.cache), f.draft, f.file, opened.content)
    expect((await openFolio(f.file)).history).toHaveLength(1)
    await writeFile(path.join(f.draft, 'second.png'), 'second image')
    await saveFolio(f.file, '# Second\n\n![New](folio-draft://second.png)', { ...styles, tokens: { 'code-bg': '#ffffff' } }, await folioAssetPath(f.file, f.cache), f.draft, f.file, opened.content)
    opened = await openFolio(f.file)
    expect(opened.history).toHaveLength(2)
    const old = await readFolioRevision(f.file, originalId)
    expect(old.content).toContain('# First')
    expect(old.styles).toEqual(styles)
    const sourcePath = await folioAssetPath(f.file, f.cache)
    const oldAsset = old.content.match(/assets\/[^ )"\n>]+/)![0]
    expect((await readFile(path.join(path.dirname(sourcePath), oldAsset))).toString()).toBe('first image')
    await saveFolio(f.file, old.content, old.styles, sourcePath, f.draft, f.file, opened.content)
    expect((await openFolio(f.file)).history).toHaveLength(3)
    expect(Object.keys(unzipSync(await readFile(f.file))).filter(key => key.startsWith('assets/'))).toHaveLength(2)
  })
  it('creates a shareable copy without earlier revisions or their assets', async () => {
    const f = await fixture()
    await saveFolio(f.file, '# Private\n\n![Photo](folio-draft://image.png)', styles, null, f.draft, null)
    const old = await openFolio(f.file)
    await saveFolio(f.file, '# Public', styles, await folioAssetPath(f.file, f.cache), f.draft, f.file, old.content)
    const current = await openFolio(f.file)
    const copy = path.join(f.folder, 'shared.folio')
    await saveFolio(copy, current.content, styles, await folioAssetPath(f.file, f.cache), f.draft, f.file, undefined, false, false)
    const files = unzipSync(await readFile(copy))
    expect((await openFolio(copy)).history).toHaveLength(1)
    expect(Object.keys(files).some(key => key.startsWith('assets/'))).toBe(false)
    expect(Object.values(files).map(bytes => strFromU8(bytes)).join('\n')).not.toContain('Private')
    expect((await openFolio(f.file)).history).toHaveLength(2)
  })
  it('preserves a conflicting file and reports its current text', async () => {
    const f = await fixture()
    await saveFolio(f.file, '# External', styles, null, f.draft, null)
    const before = await readFile(f.file)
    expect(await saveFolio(f.file, '# Mine', styles, null, f.draft, f.file, '# Stale')).toMatchObject({ saved: false, conflict: { content: '# External' } })
    expect(await readFile(f.file)).toEqual(before)
  })
  it('detects style changes even when the Markdown text is unchanged', async () => {
    const f = await fixture()
    await saveFolio(f.file, '# Same', styles, null, f.draft, null)
    const original = await openFolio(f.file)
    await saveFolio(f.file, '# Same', { ...styles, tokens: { 'code-bg': '#ffffff' } }, null, f.draft, f.file)
    expect(await saveFolio(f.file, '# My edit', styles, null, f.draft, f.file, original.content, false, true, original.styles)).toMatchObject({ saved: false })
    expect((await openFolio(f.file)).styles.tokens['code-bg']).toBe('#ffffff')
  })
  it('bounds revisions and removes expired assets while keeping current text', async () => {
    const f = await fixture()
    await saveFolio(f.file, '# Initial', styles, null, f.draft, null)
    const files = unzipSync(await readFile(f.file))
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    manifest.history = Array.from({ length: 100 }, (_, index) => ({ id: `revision-${index}`, savedAt: new Date().toISOString(), title: `Version ${index}` }))
    for (const revision of manifest.history) {
      files[`history/${revision.id}/document.md`] = strToU8(`# ${revision.title}`)
      files[`history/${revision.id}/styles.json`] = strToU8(JSON.stringify(styles))
    }
    files['manifest.json'] = strToU8(JSON.stringify(manifest))
    await writeFile(f.file, zipSync(files))
    await saveFolio(f.file, '# Latest', styles, null, f.draft, f.file, '# Initial')
    const opened = await openFolio(f.file)
    expect(opened.history).toHaveLength(100)
    expect(opened.history[0].title).toBe('Latest')
    expect(opened.history.some(revision => revision.id === 'revision-0')).toBe(false)
    expect(unzipSync(await readFile(f.file))['history/revision-0/document.md']).toBeUndefined()
  })
  it('converts a bundle back to Markdown with adjacent assets', async () => {
    const f = await fixture()
    await saveFolio(f.file, '# First\n\n![Photo](folio-draft://image.png)', styles, null, f.draft, null)
    const opened = await openFolio(f.file), destination = path.join(f.folder, 'exported.md')
    const markdown = await exportFolioMarkdown(opened.content + '\n\n`<assets/example.png>`', await folioAssetPath(f.file, f.cache), destination, f.draft)
    expect(markdown).toContain('.assets/exported/')
    expect(markdown).toContain('`<assets/example.png>`')
    expect((await readFile(path.join(f.folder, markdown.match(/\.assets\/[^)>\n]+/)![0]))).toString()).toBe('first image')
  })
  it('rejects unsupported versions, archive traversal and executable style values', async () => {
    const f = await fixture()
    const invalidBundles: Record<string, Uint8Array>[] = [
      { 'manifest.json': strToU8(JSON.stringify({ format: 'folio', version: 99 })) },
      { '../escape': strToU8('bad') },
      { 'manifest.json': strToU8(JSON.stringify({ format: 'folio', version: 1, id: 'test', createdAt: '', history: [] })), 'document.md': strToU8('# Test'), 'styles.json': strToU8(JSON.stringify({ ...styles, tokens: { 'body-fg': 'red;display:none' } })) },
    ]
    for (const files of invalidBundles) {
      await writeFile(f.file, zipSync(files))
      await expect(openFolio(f.file)).rejects.toThrow()
    }
  })
  it('captures and reuses theme defaults, while theme changes capture the new palette', () => {
    const first = captureFolioStyles('.theme-voltage { --code-bg: #ffffff; --code-radius: 2mm; }', 'voltage')
    expect(captureFolioStyles('.theme-voltage { --code-bg: #000000; }', 'voltage', first)).toEqual(first)
    expect(folioStylesCss(first, 'voltage')).toContain('--code-radius: 2mm;')
    expect(folioStylesCss(first, 'editorial')).toBe('')
    expect(captureFolioStyles('.theme-editorial { --code-bg: #123456; }', 'editorial', first).tokens['code-bg']).toBe('#123456')
  })
})
