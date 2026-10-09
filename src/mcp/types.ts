import { z } from 'zod'
import type { DocumentLayout, DocumentTheme } from '../lib/document'

export interface DocumentTypePreset {
  /** Unique identifier, e.g. 'whitepaper', 'tech-spec', 'invoice' */
  id: string
  /** Human-readable display name, e.g. 'Technical White Paper' */
  name: string
  /** Description of what this document format is intended for */
  description: string
  /** Underlying Folio layout engine */
  baseLayout: DocumentLayout
  /** Default typography and color theme */
  defaultTheme?: DocumentTheme
  /** Default document language ('en' | 'es') */
  defaultLang?: 'en' | 'es'
  /** Cover kicker label or header badge (e.g. 'Technical Specification', 'Confidential') */
  kicker?: string
  /** Header chrome default configuration */
  header?: {
    left?: string
    center?: string
    right?: string
  }
  /** Footer chrome default configuration */
  footer?: {
    left?: string
    center?: string
    right?: string
  }
  /** Default theme color / token overrides */
  themeOverrides?: Record<string, string>
  /** Recommended or required metadata fields for this document type */
  fields?: Array<{
    name: string
    description: string
    required?: boolean
    default?: string
  }>
  /** Recommended starter markdown skeleton */
  starterTemplate?: string
  /** Whether this is a user-created custom preset stored in the workspace */
  isCustom?: boolean
}

export const RegisterPresetSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, 'ID must be alphanumeric with dashes or underscores'),
  name: z.string().min(2).max(100),
  description: z.string().min(5).max(500),
  baseLayout: z.enum(['report', 'simple', 'invoice', 'cv']),
  defaultTheme: z
    .enum(['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'])
    .optional(),
  defaultLang: z.enum(['en', 'es']).optional(),
  kicker: z.string().optional(),
  header: z
    .object({
      left: z.string().optional(),
      center: z.string().optional(),
      right: z.string().optional(),
    })
    .optional(),
  footer: z
    .object({
      left: z.string().optional(),
      center: z.string().optional(),
      right: z.string().optional(),
    })
    .optional(),
  themeOverrides: z.record(z.string(), z.string()).optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean().optional(),
        default: z.string().optional(),
      }),
    )
    .optional(),
  starterTemplate: z.string().optional(),
})

export const CreateDocumentSchema = z.object({
  type: z
    .string()
    .default('report')
    .describe('Document type or preset ID (e.g. "report", "invoice", "simple", "cv", "whitepaper", or custom)'),
  title: z.string().describe('Title of the document'),
  theme: z
    .enum(['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'])
    .optional()
    .describe('Visual aesthetic theme'),
  lang: z.enum(['en', 'es']).optional().describe('Document language code'),
  metadata: z
    .record(z.string(), z.any())
    .optional()
    .describe('Frontmatter key-value pairs (e.g. client, prepared-by, date, invoice-number, header-left, etc.)'),
  themeOverrides: z
    .record(z.string(), z.string())
    .optional()
    .describe('Theme token overrides (e.g. { "cover-bg": "#0f172a", "heading": "#0284c7" })'),
  content: z.string().describe('Markdown body text or sections'),
  outputPath: z.string().optional().describe('Optional file path to write the markdown document to on disk'),
})

export const CustomizeDocumentSchema = z.object({
  source: z.string().optional().describe('Markdown source string to customize'),
  filePath: z.string().optional().describe('File path of existing markdown document to customize'),
  setLayout: z.enum(['report', 'simple', 'invoice', 'cv']).optional(),
  setTheme: z
    .enum(['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'])
    .optional(),
  setLang: z.enum(['en', 'es']).optional(),
  setMetadata: z
    .record(z.string(), z.any())
    .optional()
    .describe('Frontmatter keys to update or set'),
  setThemeOverrides: z.record(z.string(), z.string()).optional(),
  setHeader: z
    .object({
      left: z.string().optional(),
      center: z.string().optional(),
      right: z.string().optional(),
    })
    .optional(),
  setFooter: z
    .object({
      left: z.string().optional(),
      center: z.string().optional(),
      right: z.string().optional(),
    })
    .optional(),
  outputPath: z.string().optional().describe('Optional path to write the customized document to'),
})

export const LintDocumentSchema = z.object({
  source: z.string().optional().describe('Markdown document content to lint'),
  filePath: z.string().optional().describe('Path to markdown file on disk to lint'),
})

export const ExportPdfSchema = z.object({
  inputPath: z.string().optional().describe('Path to markdown file to render'),
  source: z.string().optional().describe('Direct markdown string to render'),
  outputPath: z.string().describe('Target output .pdf file path'),
  theme: z
    .enum(['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'])
    .optional(),
  lang: z.enum(['en', 'es']).optional(),
})
