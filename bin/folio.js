#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const isMcp = process.argv.includes('--mcp')

async function runMcp() {
  // If we can import the MCP server module directly, run it
  try {
    const serverModule = await import('../dist-electron/server-CnUVfWgw.js').catch(async () => {
      // In tsx / dev environment
      return await import('../src/mcp/server.ts')
    })
    if (serverModule && typeof serverModule.startFolioMcpServer === 'function') {
      await serverModule.startFolioMcpServer()
      return
    }
  } catch {
    // If direct import fails, spawn electron with --mcp
  }

  const electronCandidate = path.join(root, 'node_modules/.bin/electron')
  const electronBin = existsSync(electronCandidate) ? electronCandidate : 'electron'
  const child = spawn(electronBin, [root, '--mcp'], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

function runGui() {
  const electronCandidate = path.join(root, 'node_modules/.bin/electron')
  const electronBin = existsSync(electronCandidate) ? electronCandidate : 'electron'
  const args = [root, ...process.argv.slice(2)]
  const child = spawn(electronBin, args, { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

if (isMcp) {
  runMcp().catch((err) => {
    console.error('Failed to start Folio MCP server:', err)
    process.exit(1)
  })
} else {
  runGui()
}
