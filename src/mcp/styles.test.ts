import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate/node'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createFolioMcpServer } from './server'
import { saveFolio, openFolio, readFolioRevision } from '../../electron/folio-document'
import { captureFolioStyles } from '../lib/folio-styles'
import { parseDocument } from '../lib/document'

const folders: string[] = []
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))) })
async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'folio-mcp-styles-')); folders.push(folder)
  const draft = path.join(folder, 'draft'); await mkdir(draft)
  await writeFile(path.join(draft, 'photo.png'), 'attachment bytes')
  const file = path.join(folder, 'paper.folio')
  const styles = captureFolioStyles(await readFile('src/styles.css', 'utf8'), 'editorial')
  await saveFolio(file, '---\ntheme: editorial\n---\n\n# Paper\n\n![Photo](folio-draft://photo.png)', styles, null, draft, null)
  return { file, folder }
}

describe('MCP document style storage', () => {
  it('exposes portable style CRUD/application through MCP while preserving attachments and restorable history', async () => {
    const { file, folder } = await fixture()
    const initial = await openFolio(file)
    const originalFiles = unzipSync(await readFile(file))
    const server = createFolioMcpServer()
    const client = new Client({ name: 'style-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport); await client.connect(clientTransport)
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: { filePath: file, ...args } })
      expect(result.isError, JSON.stringify(result)).not.toBe(true)
      const text = (result.content as Array<{ type: string; text?: string }>).find(item => item.type === 'text')
      if (!text || typeof text.text !== 'string') throw Error('Missing tool result')
      return JSON.parse(text.text)
    }
    try {
      const tools = await client.listTools()
      for (const name of ['folio_list_styles', 'folio_create_style', 'folio_duplicate_style', 'folio_update_style', 'folio_apply_style']) expect(tools.tools.map(tool => tool.name)).toContain(name)
      expect((await call('folio_list_styles')).styles).toEqual([])
      const created = await call('folio_create_style', { name: 'Research', theme: 'scientific', overrides: { 'font-body': '"Times New Roman", serif', heading: '#123456' } })
      expect((await openFolio(file)).content).toBe(initial.content)
      const copy = await call('folio_duplicate_style', { styleId: created.id })
      expect(copy.id).not.toBe(created.id)
      expect(copy.overrides).toEqual(created.overrides)
      await call('folio_update_style', { styleId: copy.id, name: 'Blue paper', overrides: { heading: '#abcdef' } })
      await call('folio_apply_style', { styleId: created.id })
      const applied = await openFolio(file)
      expect(applied.styles.activeStyleId).toBe(created.id)
      expect(parseDocument(applied.content).metadata.themeOverrides).toEqual(created.overrides)
      expect(applied.styles.namedStyles).toHaveLength(2)
      expect(applied.history).toHaveLength(5)
      const libraryRevision = await readFolioRevision(file, applied.history[1].id)
      expect(libraryRevision.styles.namedStyles).toHaveLength(2)
      expect(libraryRevision.content).toBe(initial.content)
      const restored = await readFolioRevision(file, initial.history[0].id)
      expect(restored.content).toBe(initial.content)
      expect(restored.styles.namedStyles).toBeUndefined()
      const files = unzipSync(await readFile(file))
      for (const name of Object.keys(originalFiles).filter(name => name.startsWith('assets/'))) expect(files[name]).toEqual(originalFiles[name])
      const portable = path.join(folder, 'copy.folio'); await copyFile(file, portable)
      expect((await call('folio_list_styles', { filePath: portable })).styles).toEqual(applied.styles.namedStyles)
      const currentCopy = await call('folio_duplicate_style', { name: 'Current appearance' })
      expect(currentCopy.theme).toBe('scientific')
      expect(currentCopy.overrides['font-body']).toBe(created.overrides['font-body'])
      const beforeBadEdit = await readFile(file)
      const rejected = await client.callTool({ name: 'folio_update_style', arguments: { filePath: file, styleId: created.id, overrides: { heading: 'red; color:blue' } } })
      expect(rejected.isError).toBe(true)
      expect(await readFile(file)).toEqual(beforeBadEdit)
      const missing = await client.callTool({ name: 'folio_apply_style', arguments: { filePath: file, styleId: 'missing' } })
      expect(missing.isError).toBe(true)
      expect(await readFile(file)).toEqual(beforeBadEdit)
      const updated = await call('folio_update_style', { styleId: copy.id, overrides: {} })
      expect(updated.overrides).toEqual({})
      expect(updated.name).toBe('Blue paper')
      expect(updated.theme).toBe('scientific')
    } finally { await client.close(); await server.close() }
  })
})
