import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, shell } from 'electron'
import { copyDocumentAssets, externalizeDocumentImages, importDocumentImage, promoteDraftImages, readDiskDocument, resolveDocumentImages, saveDocumentFile } from './document-files'
import { existsSync, watchFile, unwatchFile } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFNumber, PDFString, degrees, type PDFDocument as PDFDoc, type PDFRef } from 'pdf-lib'
import { checkForUpdates, initAutoUpdater } from './updater'
import { packageDocument } from './document-package'

// Set application name early so macOS registers the application menu correctly
app.name = 'Folio'
if (process.platform === 'darwin') {
  app.setName('Folio')
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const devServerUrl = process.env.VITE_DEV_SERVER_URL
// Our renamed local Electron launcher reports isPackaged=true; the CLI flag
// still distinguishes pnpm dev/start from installed release builds.
const isDevelopment = !app.isPackaged || process.defaultApp === true
const RECENT_DOCUMENT_LIMIT = 10
let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let recentDocumentPaths: string[] = []
let documentEdited = false
let allowClose = false
let watchedPath: string | null = null
let watchedContent: string | null = null
const savingPaths = new Set<string>()

function getIconPath() {
  const candidates = [
    ...(isDevelopment ? [path.join(app.getAppPath(), 'build/icon-dev.png'), path.join(moduleDir, '../build/icon-dev.png')] : []),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(moduleDir, '../build/icon.png'),
    path.join(app.getAppPath(), 'assets/icon.png'),
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

function recentDocumentsFile() {
  return path.join(app.getPath('userData'), 'recent-documents.json')
}

async function persistRecentDocuments() {
  await writeFile(recentDocumentsFile(), JSON.stringify(recentDocumentPaths, null, 2), 'utf8')
}

async function loadRecentDocuments() {
  try {
    const parsed = JSON.parse(await readFile(recentDocumentsFile(), 'utf8'))
    if (Array.isArray(parsed)) {
      recentDocumentPaths = parsed
        .filter((entry): entry is string => typeof entry === 'string' && path.isAbsolute(entry))
        .slice(0, RECENT_DOCUMENT_LIMIT)
    }
  } catch {
    recentDocumentPaths = []
  }
}

function notifyRecentDocuments() {
  mainWindow?.webContents.send('documents:recent-updated', recentDocumentPaths)
}

async function rememberDocument(filePath: string) {
  recentDocumentPaths = [filePath, ...recentDocumentPaths.filter((candidate) => candidate !== filePath)]
    .slice(0, RECENT_DOCUMENT_LIMIT)
  app.addRecentDocument(filePath)
  await persistRecentDocuments()
  installMenu()
  notifyRecentDocuments()
}

async function forgetDocument(filePath: string) {
  recentDocumentPaths = recentDocumentPaths.filter((candidate) => candidate !== filePath)
  await persistRecentDocuments()
  installMenu()
  notifyRecentDocuments()
}

async function clearRecentDocuments() {
  recentDocumentPaths = []
  app.clearRecentDocuments()
  await persistRecentDocuments()
  installMenu()
  notifyRecentDocuments()
}

async function readMarkdownDocument(filePath: string) {
  return { canceled: false as const, path: filePath, content: await readFile(filePath, 'utf8') }
}

function openRecentDocument(filePath: string) {
  mainWindow?.webContents.send('document:open-recent-request', filePath)
}

function rendererUrl(mode?: 'print' | 'settings') {
  const suffix = mode ? `?mode=${mode}` : ''
  return devServerUrl ? `${devServerUrl}/${suffix}` : `file://${path.join(moduleDir, '../dist/index.html')}${suffix}`
}

function createWindow() {
  documentEdited = false
  allowClose = false
  // The shell has its own light/dark palette; let the OS drive the frame.
  nativeTheme.themeSource = 'system'
  const iconPath = getIconPath()
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    title: 'Folio',
    ...(iconPath ? { icon: iconPath } : {}),
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {
          autoHideMenuBar: false,
        }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17171a' : '#e9e8e4',
    show: false,
    webPreferences: {
      preload: path.join(moduleDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[RENDERER ERROR] ${message} (${sourceId}:${line})`)
    }
  })

  // Keep document links from replacing the editor or creating Electron windows.
  const openExternalLink = (url: string) => {
    if (/^https?:|^mailto:/i.test(url)) {
      void shell.openExternal(url).catch((error) => console.warn('Could not open link:', error))
    }
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = new URL(mainWindow!.webContents.getURL())
    const destination = new URL(url)
    // In-document anchors stay inside the preview.
    current.hash = ''
    destination.hash = ''
    if (current.href === destination.href) return
    event.preventDefault()
    openExternalLink(url)
  })

  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable || !mainWindow) return
    const items: Electron.MenuItemConstructorOptions[] = []
    if (params.misspelledWord) {
      items.push(...params.dictionarySuggestions.map(suggestion => ({ label: suggestion, click: () => mainWindow?.webContents.replaceMisspelling(suggestion) })))
      items.push({ label: 'Add to Dictionary', click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' })
    }
    items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' })
    Menu.buildFromTemplate(items).popup({ window: mainWindow })
  })

  mainWindow.loadURL(rendererUrl())
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (mainWindow) {
      try {
        initAutoUpdater(mainWindow, () => { allowClose = true }, () => { allowClose = false })
      } catch (err) {
        console.warn('Auto-updater init bypassed:', err)
      }
    }
  })
  mainWindow.on('close', (event) => {
    if (documentEdited && !allowClose) {
      event.preventDefault()
      mainWindow?.webContents.send('document:close-request')
    }
  })
  mainWindow.on('closed', () => {
    if (watchedPath) unwatchFile(watchedPath)
    watchedPath = null
    mainWindow = null
  })
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    title: 'Folio Settings', width: 560, height: 620, minWidth: 480, minHeight: 560,
    parent: mainWindow ?? undefined, show: false, autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#ebeae6',
    webPreferences: { preload: path.join(moduleDir, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  settingsWindow.loadURL(rendererUrl('settings'))
  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => { settingsWindow = null })
}

ipcMain.handle('settings:open', openSettings)

function sendMenuCommand(command: string) {
  mainWindow?.webContents.send('menu:command', command)
}

function installMenu() {
  const recentItems: Electron.MenuItemConstructorOptions[] = recentDocumentPaths.length > 0
    ? [
        ...recentDocumentPaths.map((filePath) => ({
          label: `${path.basename(filePath)} — ${path.dirname(filePath)}`,
          click: () => openRecentDocument(filePath),
        })),
        { type: 'separator' },
        { label: 'Clear Menu', click: () => { void clearRecentDocuments() } },
      ]
    : [{ label: 'No Recent Documents', enabled: false }]

  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Folio',
            submenu: [
              { role: 'about' as const },
              { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
              { label: 'Check for Updates…', click: () => checkForUpdates(true) },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('open') },
        { label: 'Open Recent', submenu: recentItems },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuCommand('save-as') },
        ...(!isMac ? [{ label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings }] : []),
        { type: 'separator' },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenuCommand('export') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, { label: 'Find and Replace…', accelerator: 'CmdOrCtrl+F', click: () => sendMenuCommand('find') }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
    ...(!isMac
      ? [
          {
            label: 'Help',
            submenu: [
              { role: 'about' as const },
              { label: 'Check for Updates…', click: () => checkForUpdates(true) },
            ],
          },
        ]
      : []),
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('file:open', async () => {
  const selection = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Markdown Document',
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }],
  })
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true }
  const filePath = selection.filePaths[0]
  return readMarkdownDocument(filePath)
})

ipcMain.handle('file:confirm-open', async (_event, filePath: unknown) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Document path is invalid.')
  await rememberDocument(filePath)
})

ipcMain.handle('file:get-startup-document', async () => {
  for (const filePath of [...recentDocumentPaths]) {
    try {
      const document = await readMarkdownDocument(filePath)
      await rememberDocument(filePath)
      return document
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await forgetDocument(filePath)
        continue
      }
      return { canceled: true }
    }
  }
  return { canceled: true }
})

ipcMain.handle('file:open-recent', async (_event, filePath: unknown) => {
  if (typeof filePath !== 'string' || !recentDocumentPaths.includes(filePath)) throw new Error('Recent document is unavailable.')
  try {
    const document = await readMarkdownDocument(filePath)
    await rememberDocument(filePath)
    return document
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') await forgetDocument(filePath)
    throw error
  }
})

ipcMain.handle('file:get-recent-documents', () => {
  return recentDocumentPaths
})

ipcMain.handle('file:close-after-confirmation', () => {
  allowClose = true
  mainWindow?.close()
})

ipcMain.handle('file:read-comparison', async () => {
  const selection = await dialog.showOpenDialog(mainWindow!, {
    title: 'Compare With Revision',
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }],
  })
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true }
  const filePath = selection.filePaths[0]
  return { canceled: false, path: filePath, content: await readFile(filePath, 'utf8') }
})

ipcMain.handle('file:launch', async (_event, filePath: unknown) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    return { opened: false, error: 'The exported PDF path is invalid.' }
  }
  const error = await shell.openPath(filePath)
  return error ? { opened: false, error } : { opened: true }
})

ipcMain.handle('file:save', async (_event, payload: { path: string | null; content: string; saveAs?: boolean; expectedContent?: string; overwrite?: boolean }) => {
  let filePath = payload.path
  if (!filePath || payload.saveAs) {
    const selection = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Markdown Document',
      defaultPath: filePath ?? 'Untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (selection.canceled || !selection.filePath) return { canceled: true }
    filePath = selection.filePath
  }
  savingPaths.add(filePath)
  let content = payload.content
  try {
    if (payload.saveAs && payload.path) await copyDocumentAssets(payload.path, filePath, payload.content)
    content = await promoteDraftImages(filePath, payload.content, path.join(app.getPath('userData'), 'draft-assets'))
    content = await externalizeDocumentImages(filePath, content)
    const result = await saveDocumentFile(filePath, content, !payload.saveAs && payload.path ? payload.expectedContent : undefined, payload.overwrite)
    if (!result.saved) return { canceled: true, conflict: result.conflict }
    if (watchedPath === filePath) watchedContent = content
  } finally { savingPaths.delete(filePath) }
  await rememberDocument(filePath)
  return { canceled: false, path: filePath, content }
})

ipcMain.handle('file:watch', (event, payload: { path: string | null; content: string }) => {
  if (event.sender !== mainWindow?.webContents) return
  if (watchedPath) unwatchFile(watchedPath)
  watchedPath = payload.path
  watchedContent = payload.content
  if (!watchedPath) return
  const filePath = watchedPath
  watchFile(filePath, { interval: 750, persistent: false }, async () => {
    if (savingPaths.has(filePath)) return
    try {
      const content = await readDiskDocument(filePath)
      if (watchedPath !== filePath || content === watchedContent || savingPaths.has(filePath)) return
      watchedContent = content
      mainWindow?.webContents.send('document:disk-changed', { path: filePath, content })
    } catch (error) { console.warn('Could not check document changes:', error) }
  })
})

ipcMain.handle('file:import-image', async (_event, payload: { documentPath: string | null; name: string; bytes: number[] }) => {
  return importDocumentImage(payload.documentPath, payload.name, Buffer.from(payload.bytes), path.join(app.getPath('userData'), 'draft-assets'))
})
ipcMain.handle('file:resolve-images', async (_event, payload: { documentPath: string | null; sources: string[] }) => {
  return resolveDocumentImages(payload.documentPath, payload.sources, path.join(app.getPath('userData'), 'draft-assets'))
})

ipcMain.handle('document:export-package', async (event, payload: { markdown: string; documentPath: string | null; name: string }) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Document export is only available from the editor.')
  const selection = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Markdown Package', defaultPath: `${path.basename(payload.name, path.extname(payload.name))}.zip`,
    filters: [{ name: 'Markdown and assets', extensions: ['zip'] }],
  })
  if (selection.canceled || !selection.filePath) return { canceled: true }
  const bytes = await packageDocument(payload.markdown, payload.documentPath, path.join(app.getPath('userData'), 'draft-assets'), payload.name)
  await writeFile(selection.filePath, bytes)
  return { canceled: false, path: selection.filePath }
})

ipcMain.on('document:set-edited', (event, edited: boolean) => {
  documentEdited = edited
  BrowserWindow.fromWebContents(event.sender)?.setDocumentEdited(edited)
})

type ExportOutlineEntry = { title: string; level: number; page: number }

type ExportReport = {
  pageCount: number
  /** Computed cover background from the rendered sheet, e.g. "rgb(23, 45, 41)". */
  coverColor: string | null
  outline: ExportOutlineEntry[]
  landscapePages: number[]
  metadata: { title: string; author: string; subject: string; keywords: string[] }
}

/** Parse the renderer's computed `rgb(...)` colour into a hex string. */
function parseCssColor(value: string | null | undefined) {
  const match = value?.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (!match) return null
  const channels = match.slice(1, 4).map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))))
  return { hex: `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}` }
}

type OutlineNode = { title: string; page: number; children: OutlineNode[] }

/** Nest a flat heading list by level so the PDF outline mirrors the document. */
function buildOutlineTree(entries: ExportOutlineEntry[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: { level: number; node: OutlineNode }[] = []

  for (const entry of entries) {
    const node: OutlineNode = { title: entry.title, page: entry.page, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) stack.pop()
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1].node.children.push(node)
    stack.push({ level: entry.level, node })
  }

  return roots
}

/**
 * Writes a bookmark tree. pdf-lib has no outline API, so the dictionaries are
 * assembled by hand: every item needs its parent, siblings and destination.
 */
function attachOutline(pdf: PDFDoc, nodes: OutlineNode[]) {
  if (nodes.length === 0) return

  const context = pdf.context
  const pageRefs = pdf.getPages().map((page) => page.ref)
  if (pageRefs.length === 0) return

  const outlinesRef = context.nextRef()
  let descendants = 0

  const writeLevel = (levelNodes: OutlineNode[], parentRef: PDFRef): { first: PDFRef; last: PDFRef } => {
    const refs = levelNodes.map(() => context.nextRef())

    levelNodes.forEach((node, index) => {
      descendants += 1
      const pageRef = pageRefs[Math.min(Math.max(node.page, 1), pageRefs.length) - 1]
      const dict = context.obj({
        Title: PDFString.of(node.title),
        Parent: parentRef,
        Dest: context.obj([pageRef, PDFName.of('Fit')]),
      })
      if (index > 0) dict.set(PDFName.of('Prev'), refs[index - 1])
      if (index < refs.length - 1) dict.set(PDFName.of('Next'), refs[index + 1])

      if (node.children.length > 0) {
        const { first, last } = writeLevel(node.children, refs[index])
        dict.set(PDFName.of('First'), first)
        dict.set(PDFName.of('Last'), last)
        // Negative count keeps nested sections collapsed when the PDF opens.
        dict.set(PDFName.of('Count'), PDFNumber.of(-node.children.length))
      }

      context.assign(refs[index], dict)
    })

    return { first: refs[0], last: refs[refs.length - 1] }
  }

  const { first, last } = writeLevel(nodes, outlinesRef)
  context.assign(
    outlinesRef,
    context.obj({
      Type: PDFName.of('Outlines'),
      First: first,
      Last: last,
      Count: PDFNumber.of(descendants),
    }),
  )
  pdf.catalog.set(PDFName.of('Outlines'), outlinesRef)
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
}

ipcMain.handle('document:export-pdf', async (_event, payload: { markdown: string; suggestedName: string; theme?: string; lang?: string; documentPath?: string }) => {
  const selection = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export PDF',
    defaultPath: `${payload.suggestedName || 'document'}.pdf`,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  })
  if (selection.canceled || !selection.filePath) return { canceled: true }
  const progress = (message: string) => mainWindow?.webContents.send('export:progress', message)
  progress('Laying out pages…')

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(moduleDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })


  try {
    await printWindow.loadURL(rendererUrl('print'))
    let settled = false
    const pending: (() => void)[] = []
    const report = await new Promise<ExportReport | undefined>((resolve, reject) => {
      const finish = () => {
        settled = true
        clearTimeout(timeout)
        ipcMain.removeListener('export:ready', onReady)
        for (const cleanup of pending) cleanup()
      }
      const timeout = setTimeout(() => {
        finish()
        reject(new Error('Timed out while laying out the PDF.'))
      }, 20_000)
      const onReady = (event: Electron.IpcMainEvent, incoming?: ExportReport) => {
        if (event.sender !== printWindow.webContents) return
        finish()
        resolve(incoming)
      }
      ipcMain.on('export:ready', onReady)

      // loadURL resolves on did-finish-load, which can precede React mounting
      // and subscribing to this channel. A single send is silently dropped in
      // that window, so keep offering the payload until the renderer answers.
      const message = { markdown: payload.markdown, theme: payload.theme, lang: payload.lang, documentPath: payload.documentPath }
      const resend = setInterval(() => {
        if (!settled) printWindow.webContents.send('export:payload', message)
      }, 250)
      pending.push(() => clearInterval(resend))
      printWindow.webContents.send('export:payload', message)
    })

    // The laid-out sheet is the only authority on the cover colour: it already
    // accounts for the active template and for any per-document override.
    // Never guess it here — a second copy of the palette silently goes stale
    // whenever a template is added or renamed.
    const coverHex = parseCssColor(report?.coverColor)?.hex
    progress('Creating PDF…')

    await printWindow.webContents.insertCSS(
      // Paged.js consumes the document's own @page rules while laying out, so
      // the printed paper size has to be restated here.
      `@media print {
         @page { size: A4 !important; margin: 0 !important; }
         ${coverHex ? `@page :first { background: ${coverHex} !important; }` : ''}
       }`,
      { cssOrigin: 'user' },
    )
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      // Trust the CSS page size so the sheet and the paper match exactly.
      preferCSSPageSize: true,
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
    })
    const rendered = await PDFDocument.load(pdf)
    const finished = await PDFDocument.create()
    const sourcePages = rendered.getPages()

    const landscapePages = new Set(report?.landscapePages ?? [])

    for (const [index, sourcePage] of sourcePages.entries()) {
      const { width, height } = sourcePage.getSize()
      const page = finished.addPage([width, height])
      const [embeddedPage] = await finished.embedPages([sourcePage])
      page.drawPage(embeddedPage, { x: 0, y: 0, width, height })
      // Chrome prints one paper size for the whole document, so a landscape
      // page is laid out rotated onto portrait paper. Rotating the PDF page
      // back makes it open as a true landscape sheet.
      if (landscapePages.has(index + 1)) page.setRotation(degrees(270))
    }

    if (report?.metadata) {
      finished.setTitle(report.metadata.title)
      finished.setAuthor(report.metadata.author)
      finished.setSubject(report.metadata.subject)
      finished.setKeywords(report.metadata.keywords)
      finished.setCreator('Folio')
      finished.setProducer('Folio')
    }
    attachOutline(finished, buildOutlineTree(report?.outline ?? []))

    progress('Saving PDF…')
    await writeFile(selection.filePath, await finished.save())
    return { canceled: false, path: selection.filePath }
  } finally {
    printWindow.destroy()
  }
})

const isMcpMode = process.argv.includes('--mcp')

if (isMcpMode) {
  if (app.dock) {
    app.dock.hide()
  }
  process.stdin.on('end', () => app.quit())
  process.stdin.on('close', () => app.quit())

  app.whenReady().then(async () => {
    try {
      const { startFolioMcpServer } = await import('../src/mcp/server')
      await startFolioMcpServer()
    } catch (err) {
      console.error('Fatal Folio MCP server error:', err)
      process.exit(1)
    }
  })
} else {
  app.whenReady().then(async () => {
    app.name = 'Folio'
    app.setName('Folio')
    if (process.platform === 'darwin') {
      app.setAboutPanelOptions({
        applicationName: 'Folio',
        applicationVersion: '0.2.0',
        copyright: '© 2026 Folio',
        credits: 'A Markdown document editor with paginated preview, PDF export, and Model Context Protocol agent support.',
      })
      const iconPath = getIconPath()
      if (iconPath && app.dock) {
        try {
          const image = nativeImage.createFromPath(iconPath)
          if (!image.isEmpty()) {
            app.dock.setIcon(image)
          }
        } catch (err) {
          console.error('Failed to set dock icon:', err)
        }
      }
    }
    await loadRecentDocuments()
    installMenu()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
