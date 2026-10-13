export interface ChangelogEntry {
  version: string
  date?: string
  summary: string
  changes: string[]
  releaseUrl?: string
}

const releasesUrl = 'https://github.com/carlosrivera/folio/releases/tag'

export const changelog: ChangelogEntry[] = [
  {
    version: 'Next release',
    summary: 'Reusable document styles are becoming easier to create, carry, and automate.',
    changes: [
      'Simplified the style editor with visual font choices, style duplication, and a clearer path for creating a new style.',
      'Stored named custom styles inside portable .folio documents so a document keeps its complete visual identity when shared.',
      'Added MCP tools for listing, creating, duplicating, updating, and applying document styles.',
    ],
  },
  {
    version: '0.3.1',
    date: 'October 13, 2026',
    summary: 'A safer macOS release with reliable download selection.',
    changes: [
      'Signed and notarized macOS apps and disk images for Apple Silicon and Intel, with stapled Apple notarization tickets.',
      'Fixed the website choosing an Intel download on Apple Silicon Macs when the browser reports a compatibility platform string.',
      'Added release checks that stop unsigned Mac installers from being published.',
    ],
    releaseUrl: `${releasesUrl}/v0.3.1`,
  },
  {
    version: '0.3.0',
    date: 'October 13, 2026',
    summary: 'Portable documents, scientific articles, landscape pages, and a stronger Markdown editor.',
    changes: [
      'Added .folio documents with embedded assets, document styles, and up to 100 saved revisions.',
      'Added scientific article and landscape presentation layouts, with layout and orientation stored in document properties.',
      'Added theme-aware code highlighting, editable tables, task lists, footnotes, image captions, and image sizing.',
      'Moved pasted images into temporary draft storage and kept portable file references instead of base64 data in Markdown.',
      'Kept Mermaid diagrams within page margins during editing and PDF export.',
      'Added the Petstore API documentation starter, a single Save menu, and language and appearance controls in Settings.',
    ],
    releaseUrl: `${releasesUrl}/v0.3.0`,
  },
  {
    version: '0.2.0',
    date: 'October 9, 2026',
    summary: 'New document layouts, cross-platform builds, and the first MCP integration.',
    changes: [
      'Added invoice and simple document layouts alongside the original report layout.',
      'Added the Folio MCP server and the --mcp launch option for AI-assisted document workflows.',
      'Added Windows and Linux packages alongside macOS downloads.',
      'Published the first complete documentation site.',
    ],
    releaseUrl: `${releasesUrl}/v0.2.0`,
  },
  {
    version: '0.1.0',
    date: 'October 9, 2026',
    summary: 'The first public release of Folio.',
    changes: [
      'Added live A4 pagination with print headers, footers, and page breaks.',
      'Added KaTeX math, Mermaid diagrams, tables, and seven curated themes.',
      'Added frontmatter-driven report and statement-of-work documents.',
      'Kept document processing local and offline with no account required.',
    ],
    releaseUrl: `${releasesUrl}/v0.1.0`,
  },
]
