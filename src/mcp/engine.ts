import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import electronPath from 'electron'
import { stringify as stringifyYaml } from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import {
  parseDocument,
  upsertLayout,
  upsertTheme,
  upsertThemeOverrides,
  type DocumentLayout,
  type DocumentTheme,
} from '../lib/document'
import { lintDocument, type LintFinding } from '../lib/lint'
import { getPresetById } from './presets'
import type { DocumentTypePreset } from './types'

const execFileAsync = promisify(execFile)

export interface GenerateDocOptions {
  type?: string
  title: string
  theme?: DocumentTheme
  lang?: 'en' | 'es'
  metadata?: Record<string, unknown>
  themeOverrides?: Record<string, string>
  content: string
  outputPath?: string
  workspaceRoot?: string
}

export interface CustomizeDocOptions {
  source?: string
  filePath?: string
  setLayout?: DocumentLayout
  setTheme?: DocumentTheme
  setLang?: 'en' | 'es'
  setMetadata?: Record<string, unknown>
  setThemeOverrides?: Record<string, string>
  setHeader?: { left?: string; center?: string; right?: string }
  setFooter?: { left?: string; center?: string; right?: string }
  outputPath?: string
}

export interface LintDocResult {
  valid: boolean
  errorCount: number
  warningCount: number
  infoCount: number
  findings: Array<{
    rule: string
    severity: string
    message: string
    line?: number
  }>
}

export interface ExportPdfResult {
  success: boolean
  path: string
  pageCount: number
  sizeBytes: number
  title: string
}

export async function generateDocumentText(options: GenerateDocOptions): Promise<{
  markdown: string
  outputPath?: string
  presetUsed?: DocumentTypePreset
  lint: LintDocResult
}> {
  const typeId = options.type || 'report'
  const preset = await getPresetById(typeId, options.workspaceRoot)

  const layout: DocumentLayout = preset ? preset.baseLayout : 'report'
  const theme: DocumentTheme = options.theme || preset?.defaultTheme || 'editorial'
  const lang: 'en' | 'es' = options.lang || preset?.defaultLang || 'en'

  // Assemble frontmatter dictionary
  const fm: Record<string, unknown> = {
    title: options.title,
    layout,
    theme,
    lang,
  }

  if (preset?.kicker) {
    fm.kicker = preset.kicker
  }

  if (preset?.header) {
    if (preset.header.left) fm['header-left'] = preset.header.left
    if (preset.header.center) fm['header-center'] = preset.header.center
    if (preset.header.right) fm['header-right'] = preset.header.right
  }

  if (preset?.footer) {
    if (preset.footer.left) fm['footer-left'] = preset.footer.left
    if (preset.footer.center) fm['footer-center'] = preset.footer.center
    if (preset.footer.right) fm['footer-right'] = preset.footer.right
  }

  // User-provided metadata overrides
  if (options.metadata) {
    for (const [key, val] of Object.entries(options.metadata)) {
      if (val !== undefined && val !== null) {
        fm[key] = val
      }
    }
  }

  const mergedOverrides = {
    ...(preset?.themeOverrides || {}),
    ...(options.themeOverrides || {}),
  }
  if (Object.keys(mergedOverrides).length > 0) {
    fm['theme-overrides'] = mergedOverrides
  }

  // Format clean YAML block
  const yamlString = stringifyYaml(fm, { indent: 2 }).trim()
  const bodyContent = (options.content || preset?.starterTemplate || '').trim()

  const fullMarkdown = `---\n${yamlString}\n---\n\n${bodyContent}\n`

  if (options.outputPath) {
    const fullPath = path.resolve(options.outputPath)
    await writeFile(fullPath, fullMarkdown, 'utf8')
  }

  const lint = lintMarkdownSource(fullMarkdown)

  return {
    markdown: fullMarkdown,
    outputPath: options.outputPath ? path.resolve(options.outputPath) : undefined,
    presetUsed: preset ?? undefined,
    lint,
  }
}

export async function customizeDocumentText(options: CustomizeDocOptions): Promise<{
  markdown: string
  outputPath?: string
  lint: LintDocResult
}> {
  let source = options.source
  if (!source && options.filePath) {
    const fullPath = path.resolve(options.filePath)
    source = await readFile(fullPath, 'utf8')
  }

  if (!source) {
    throw new Error('Either "source" or "filePath" must be provided')
  }

  let updated = source

  if (options.setLayout) {
    updated = upsertLayout(updated, options.setLayout)
  }

  if (options.setTheme) {
    updated = upsertTheme(updated, options.setTheme)
  }

  if (options.setThemeOverrides) {
    updated = upsertThemeOverrides(updated, options.setThemeOverrides)
  }

  // Update frontmatter key-value pairs if provided
  if (options.setMetadata || options.setLang || options.setHeader || options.setFooter) {
    const parsed = parseDocument(updated)
    const rawFm: Record<string, unknown> = {}

    // Extract existing frontmatter
    const match = updated.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    if (match) {
      try {
        const { parse: parseYaml } = await import('yaml')
        const existing = parseYaml(match[1])
        if (existing && typeof existing === 'object') Object.assign(rawFm, existing)
      } catch {
        // Fall back to clean state
      }
    }

    if (options.setLang) rawFm.lang = options.setLang
    if (options.setLayout) rawFm.layout = options.setLayout
    if (options.setTheme) rawFm.theme = options.setTheme

    if (options.setHeader) {
      if (options.setHeader.left !== undefined) rawFm['header-left'] = options.setHeader.left
      if (options.setHeader.center !== undefined) rawFm['header-center'] = options.setHeader.center
      if (options.setHeader.right !== undefined) rawFm['header-right'] = options.setHeader.right
    }

    if (options.setFooter) {
      if (options.setFooter.left !== undefined) rawFm['footer-left'] = options.setFooter.left
      if (options.setFooter.center !== undefined) rawFm['footer-center'] = options.setFooter.center
      if (options.setFooter.right !== undefined) rawFm['footer-right'] = options.setFooter.right
    }

    if (options.setMetadata) {
      for (const [k, v] of Object.entries(options.setMetadata)) {
        if (v === null || v === undefined) {
          delete rawFm[k]
        } else {
          rawFm[k] = v
        }
      }
    }

    const yamlStr = stringifyYaml(rawFm, { indent: 2 }).trim()
    updated = `---\n${yamlStr}\n---\n\n${parsed.body.trim()}\n`
  }

  if (options.outputPath) {
    const fullPath = path.resolve(options.outputPath)
    await writeFile(fullPath, updated, 'utf8')
  }

  const lint = lintMarkdownSource(updated)

  return {
    markdown: updated,
    outputPath: options.outputPath ? path.resolve(options.outputPath) : options.filePath,
    lint,
  }
}

export function lintMarkdownSource(source: string): LintDocResult {
  const parsed = parseDocument(source)
  const findings: LintFinding[] = lintDocument(source, parsed)

  let errorCount = 0
  let warningCount = 0
  let infoCount = 0

  for (const f of findings) {
    if (f.severity === 'error') errorCount++
    else if (f.severity === 'warning') warningCount++
    else infoCount++
  }

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    findings: findings.map((f) => ({
      rule: f.rule,
      severity: f.severity,
      message: f.message,
      line: f.line !== undefined ? f.line + 1 : undefined,
    })),
  }
}

export async function exportPdfHeadless(options: {
  inputPath?: string
  source?: string
  outputPath: string
  theme?: string
  lang?: string
}): Promise<ExportPdfResult> {
  const root = path.resolve(__dirname, '../..')
  const candidates = [
    path.join(root, 'scripts', 'export-pdf-cli.cjs'),
    path.join(process.cwd(), 'scripts', 'export-pdf-cli.cjs'),
    typeof process !== 'undefined' && (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'scripts', 'export-pdf-cli.cjs') : '',
    typeof process !== 'undefined' && (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'app.asar', 'scripts', 'export-pdf-cli.cjs') : '',
  ].filter(Boolean)
  const scriptPath = candidates.find(existsSync) || candidates[0]

  let tempInput: string | null = null
  let actualInput = options.inputPath

  if (!actualInput && options.source) {
    const tempFile = path.join(tmpdir(), `folio-mcp-doc-${Date.now()}.md`)
    await writeFile(tempFile, options.source, 'utf8')
    tempInput = tempFile
    actualInput = tempFile
  }

  if (!actualInput) {
    throw new Error('Either "inputPath" or "source" must be provided')
  }

  const args = [scriptPath, '--input', path.resolve(actualInput), '--output', path.resolve(options.outputPath)]
  if (options.theme) args.push('--theme', options.theme)
  if (options.lang) args.push('--lang', options.lang)

  try {
    const binaryPath = String(electronPath as unknown as string)
    const { stdout, stderr } = await execFileAsync(binaryPath, args, { cwd: root })
    if (tempInput && existsSync(tempInput)) {
      try {
        await import('node:fs/promises').then((fs) => fs.unlink(tempInput!))
      } catch {
        // ignore cleanup error
      }
    }

    const lines = stdout.trim().split('\n').filter(Boolean)
    const lastLine = lines[lines.length - 1]
    const parsed = JSON.parse(lastLine) as ExportPdfResult
    return parsed
  } catch (error) {
    if (tempInput && existsSync(tempInput)) {
      try {
        await import('node:fs/promises').then((fs) => fs.unlink(tempInput!))
      } catch {
        // ignore
      }
    }
    throw new Error(`PDF export failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
