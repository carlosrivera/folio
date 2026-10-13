import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { packageDocument } from './document-package'
const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))) })
async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'folio-package-')); folders.push(folder)
  await mkdir(path.join(folder, 'draft'))
  await writeFile(path.join(folder, 'photo one.png'), 'image bytes')
  await writeFile(path.join(folder, 'attachment.pdf'), 'PDF bytes')
  await writeFile(path.join(folder, 'draft', 'draft.png'), 'draft bytes')
  return folder
}
describe('portable Markdown package', () => {
  it('bundles inline and reference assets and attachments without changing code or remote links', async () => {
    const folder = await fixture()
    const source = '![Photo](<photo one.png> "Caption") {width=50%}\n\n[PDF](attachment.pdf)\n\n![Again][photo]\n\n[photo]: <photo one.png>\n\n[Web](https://example.com)\n\n`![Example](attachment.pdf)`\n\n```md\n![Example](attachment.pdf)\n```'
    const files = unzipSync(await packageDocument(source, path.join(folder, 'source.md'), path.join(folder, 'draft'), 'report.md'))
    expect(Object.keys(files).sort()).toEqual(['assets/1-photo_one.png', 'assets/2-attachment.pdf', 'report.md'])
    const text = strFromU8(files['report.md'])
    expect(text).toContain('![Photo](<assets/1-photo_one.png> "Caption") {width=50%}')
    expect(text).toContain('[photo]: <assets/1-photo_one.png>')
    expect(text).toContain('[PDF](<assets/2-attachment.pdf>)')
    expect(text).toContain('[Web](https://example.com)')
    expect(text).toContain('`![Example](attachment.pdf)`')
    expect(text).toContain('```md\n![Example](attachment.pdf)\n```')
    expect(strFromU8(files['assets/1-photo_one.png'])).toBe('image bytes')
  })
  it('exports unsaved draft images without requiring Save', async () => {
    const folder = await fixture()
    const files = unzipSync(await packageDocument('![Draft](folio-draft://draft.png)', null, path.join(folder, 'draft'), 'Untitled.md'))
    expect(strFromU8(files['Untitled.md'])).toContain('assets/1-draft.png')
    expect(strFromU8(files['assets/1-draft.png'])).toBe('draft bytes')
  })
  it('reports missing assets and rejects invalid draft references', async () => {
    const folder = await fixture()
    await expect(packageDocument('![Missing](absent.png)', path.join(folder, 'doc.md'), folder, 'Doc.md')).rejects.toThrow(/Could not include/)
    await expect(packageDocument('![Bad](folio-draft://..%2Fsecret)', null, folder, 'Doc.md')).rejects.toThrow(/Invalid/)
  })
  it('supports balanced destinations and extracts legacy embedded images only in the package', async () => {
    const folder = await fixture()
    await writeFile(path.join(folder, 'photo(1).png'), 'parenthesized file')
    const source = '![Photo](photo(1).png)\n\n![Old](data:image/png;base64,aW1hZ2U=)'
    const files = unzipSync(await packageDocument(source, path.join(folder, 'doc.md'), folder, 'Doc.md'))
    expect(strFromU8(files['Doc.md'])).not.toContain('base64')
    expect(Object.keys(files).filter(key => key.startsWith('assets/'))).toHaveLength(2)
    expect(strFromU8(files['Doc.md'])).toContain('<assets/1-photo_1_.png>')
  })
})
