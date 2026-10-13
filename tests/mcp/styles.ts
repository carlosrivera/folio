import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import electronPath from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { saveFolio, openFolio } from '../../electron/folio-document'
import { captureFolioStyles } from '../../src/lib/folio-styles'
import { parseDocument } from '../../src/lib/document'

const directory = await mkdtemp(path.join(os.tmpdir(), 'folio-native-mcp-'))
const filePath = path.join(directory, 'native.folio')
await mkdir(path.join(directory, 'draft'))
await saveFolio(filePath, '---\ntheme: editorial\n---\n\n# Native MCP', captureFolioStyles(await readFile('src/styles.css', 'utf8'), 'editorial'), null, path.join(directory, 'draft'), null)
const client = new Client({ name: 'folio-native-test', version: '1.0.0' })
const transport = new StdioClientTransport({ command: electronPath as unknown as string, args: [path.resolve('dist-electron/main.js'), '--mcp', `--user-data-dir=${path.join(directory, 'user-data')}`], stderr: 'pipe' })
try {
  await client.connect(transport)
  const tools = await client.listTools()
  assert.equal(tools.tools.length, 12)
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: { filePath, ...args } })
    assert.ok(!result.isError, JSON.stringify(result))
    const content = result.content as Array<{ type: string; text: string }>
    return JSON.parse(content.find(item => item.type === 'text')!.text)
  }
  const listed = await call('folio_list_styles')
  assert.ok(listed.availableFonts.some((font: { label: string }) => font.label === 'Space Grotesk'))
  const created = await call('folio_create_style', { name: 'Native paper', theme: 'scientific', overrides: { 'font-body': 'Georgia, serif', heading: '#123456' } })
  await call('folio_apply_style', { styleId: created.id })
  const opened = await openFolio(filePath)
  assert.equal(opened.styles.activeStyleId, created.id)
  assert.deepEqual(opened.styles.tokens, captureFolioStyles(await readFile('src/styles.css', 'utf8'), 'scientific').tokens)
  assert.equal(parseDocument(opened.content).metadata.themeOverrides['font-body'], 'Georgia, serif')
  console.log('Built desktop MCP passed: 12 tools, font discovery, portable style creation/application, embedded theme defaults.')
} finally { await client.close(); await transport.close(); await rm(directory, { recursive: true, force: true }) }
