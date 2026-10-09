import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  listAllPresets,
  getPresetById,
  saveCustomPreset,
} from './presets'
import {
  generateDocumentText,
  customizeDocumentText,
  lintMarkdownSource,
  exportPdfHeadless,
} from './engine'
import {
  RegisterPresetSchema,
  CreateDocumentSchema,
  CustomizeDocumentSchema,
  LintDocumentSchema,
  ExportPdfSchema,
} from './types'

export function createFolioMcpServer(): McpServer {
  const server = new McpServer({
    name: 'folio',
    version: '1.0.0',
  })

  // 1. List Document Types (Built-in + Custom Presets)
  server.tool(
    'folio_list_document_types',
    'List all available Folio document formats, layouts, and custom registered presets.',
    {},
    async () => {
      const presets = await listAllPresets()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              presets.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                baseLayout: p.baseLayout,
                defaultTheme: p.defaultTheme || 'editorial',
                defaultLang: p.defaultLang || 'en',
                kicker: p.kicker,
                isCustom: Boolean(p.isCustom),
              })),
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  // 2. Get Document Type Details & Schema
  server.tool(
    'folio_get_document_type',
    'Get full configuration, frontmatter fields, placeholders, and starter markdown for a document type.',
    {
      typeId: z.string().describe('ID of the document type (e.g. "report", "invoice", "simple", "cv", "whitepaper")'),
    },
    async ({ typeId }) => {
      const preset = await getPresetById(typeId)
      if (!preset) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Document type "${typeId}" not found.` }],
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...preset,
                supportedPlaceholders: ['{page}', '{pages}', '{total}', '{title}', '{date}', '{client}', '{author}', '{id}'],
                availableThemes: ['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'],
                themeOverrideTokens: [
                  'cover-bg',
                  'cover-title',
                  'cover-accent',
                  'cover-kicker',
                  'heading',
                  'subheading',
                  'body-fg',
                  'link',
                  'quote-border',
                  'quote-bg',
                ],
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  // 3. Register / Customize New Document Type Preset
  server.tool(
    'folio_register_document_type',
    'Register a new custom document type / preset saved in the workspace (.folio/presets/). Allows agents to customize layouts, themes, kickers, headers/footers, and template structures.',
    RegisterPresetSchema.shape,
    async (params) => {
      const filePath = await saveCustomPreset(params)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Registered document type "${params.id}" (${params.name})`,
                presetFile: filePath,
                preset: params,
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  // 4. Create Document End-to-End
  server.tool(
    'folio_create_document',
    'Generate a complete, syntactically verified Markdown document with YAML frontmatter, sections, and automated linting.',
    CreateDocumentSchema.shape,
    async (params) => {
      try {
        const result = await generateDocumentText({
          type: params.type,
          title: params.title,
          theme: params.theme,
          lang: params.lang,
          metadata: params.metadata,
          themeOverrides: params.themeOverrides,
          content: params.content,
          outputPath: params.outputPath,
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  outputPath: result.outputPath,
                  presetUsed: result.presetUsed?.name || params.type,
                  lint: result.lint,
                  markdown: result.markdown,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to create document: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )

  // 5. Customize Existing Document
  server.tool(
    'folio_customize_document',
    'Modify an existing Markdown document: update metadata, change layout, change theme, set token overrides, or customize running headers/footers.',
    CustomizeDocumentSchema.shape,
    async (params) => {
      try {
        const result = await customizeDocumentText({
          source: params.source,
          filePath: params.filePath,
          setLayout: params.setLayout,
          setTheme: params.setTheme,
          setLang: params.setLang,
          setMetadata: params.setMetadata,
          setThemeOverrides: params.setThemeOverrides,
          setHeader: params.setHeader,
          setFooter: params.setFooter,
          outputPath: params.outputPath,
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  outputPath: result.outputPath,
                  lint: result.lint,
                  markdown: result.markdown,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to customize document: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )

  // 6. Lint Document
  server.tool(
    'folio_lint_document',
    'Run Folio rule engine to validate frontmatter, local heading anchors, code/landscape fences, and tables.',
    LintDocumentSchema.shape,
    async ({ source, filePath }) => {
      let content = source
      if (!content && filePath) {
        content = await readFile(path.resolve(filePath), 'utf8')
      }

      if (!content) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Either "source" or "filePath" must be provided.' }],
        }
      }

      const lint = lintMarkdownSource(content)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(lint, null, 2),
          },
        ],
      }
    },
  )

  // 7. Headless PDF Export
  server.tool(
    'folio_export_pdf',
    'Compile a Markdown document through Folio Paged.js pipeline into a publication-quality PDF.',
    ExportPdfSchema.shape,
    async (params) => {
      try {
        const result = await exportPdfHeadless({
          inputPath: params.inputPath,
          source: params.source,
          outputPath: params.outputPath,
          theme: params.theme,
          lang: params.lang,
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to export PDF: ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )

  return server
}

export async function startFolioMcpServer(): Promise<McpServer> {
  const server = createFolioMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Folio MCP Server running on stdio')
  return server
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')
if (isMain) {
  startFolioMcpServer().catch((err) => {
    console.error('Fatal MCP Server error:', err)
    process.exit(1)
  })
}
