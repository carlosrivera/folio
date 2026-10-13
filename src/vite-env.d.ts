/// <reference types="vite/client" />

type DiskChange = { path: string; content: string | null; styles?: import('./lib/folio-styles').FolioStyles; history?: import('./lib/folio-styles').FolioRevision[] }

type OpenFileResult = { canceled: true } | { canceled: false; path: string; content: string; styles?: import('./lib/folio-styles').FolioStyles; history?: import('./lib/folio-styles').FolioRevision[] }
type SaveFileResult = { canceled: true; conflict?: DiskChange } | { canceled: false; path: string; content?: string; styles?: import('./lib/folio-styles').FolioStyles; history?: import('./lib/folio-styles').FolioRevision[] }
type ExportResult = { canceled: true } | { canceled: false; path: string }
type LaunchFileResult = { opened: true } | { opened: false; error: string }

type ExportPayload = string | { markdown: string; theme?: string; lang?: string; documentPath?: string; styles?: import('./lib/folio-styles').FolioStyles }

type ExportOutlineEntry = { title: string; level: number; page: number }

/** What the render window hands back so the main process can finish the PDF. */
type ExportReport = {
  pageCount: number
  /** Computed cover background, e.g. "rgb(23, 45, 41)". */
  coverColor: string | null
  outline: ExportOutlineEntry[]
  landscapePages: number[]
  metadata: { title: string; author: string; subject: string; keywords: string[] }
}

interface Window {
  folio?: {
    openSettings?(): Promise<void>
    openMarkdown(): Promise<OpenFileResult>
    confirmOpen(path: string): Promise<void>
    getStartupDocument(): Promise<OpenFileResult>
    openRecent(path: string): Promise<OpenFileResult>
    getRecentDocuments?(): Promise<string[]>
    onRecentDocumentsUpdated?(callback: (list: string[]) => void): () => void
    closeAfterConfirmation(): Promise<void>
    readComparison(): Promise<OpenFileResult>
    saveMarkdown(path: string | null, content: string, saveAs?: boolean, options?: { expectedContent?: string; overwrite?: boolean; format?: 'folio'; styles?: import('./lib/folio-styles').FolioStyles; includeHistory?: boolean; expectedStyles?: import('./lib/folio-styles').FolioStyles | null }): Promise<SaveFileResult>
    getHistory?(path: string): Promise<import('./lib/folio-styles').FolioRevision[]>
    readRevision?(path: string, id: string): Promise<{ content: string; styles: import('./lib/folio-styles').FolioStyles }>
    exportPackage?(markdown: string, documentPath: string | null, name: string): Promise<ExportResult>
    watchDocument?(path: string | null, content: string): Promise<void>
    onDiskChanged?(callback: (change: DiskChange) => void): () => void
    importImage?(documentPath: string | null, name: string, bytes: number[]): Promise<string>
    resolveImages?(documentPath: string | null, sources: string[]): Promise<Record<string, string>>
    launchFile(path: string): Promise<LaunchFileResult>
    exportPdf(markdown: string, suggestedName: string, theme?: string, lang?: string, documentPath?: string, styles?: import('./lib/folio-styles').FolioStyles): Promise<ExportResult>
    setDocumentEdited(edited: boolean): void
    onMenuCommand(callback: (command: string) => void): () => void
    onRecentDocument(callback: (document: Extract<OpenFileResult, { canceled: false }>) => void): () => void
    onRecentDocumentRequest(callback: (path: string) => void): () => void
    onCloseRequest(callback: () => void): () => void
    onDocumentOpenError(callback: (message: string) => void): () => void
    onExportPayload(callback: (payload: ExportPayload) => void): () => void
    notifyExportReady(report?: ExportReport): void
    onExportProgress(callback: (message: string) => void): () => void
    checkForUpdates?(): Promise<void>
    installUpdate?(): Promise<void>
    onInstallUpdateRequest?(callback: () => void): () => void
    onUpdaterStatus?(callback: (status: { state: string; version?: string; percent?: number; message?: string }) => void): () => void
  }
}
