import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, shell } from 'electron'
import { copyDocumentAssets, externalizeDocumentImages, importDocumentImage, promoteDraftImages, readDiskDocument, resolveDocumentImages, saveDocumentFile } from './document-files'
import { existsSync, watchFile, unwatchFile } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFNumber, PDFString, degrees, type PDFDocument as PDFDoc, type PDFRef } from 'pdf-lib'
import { checkForUpdates, initAutoUpdater } from './updater'
import { isFolio, openFolio, readFolioText, folioAssetPath, saveFolio, readFolioRevision, exportFolioMarkdown } from './folio-document'
import type { FolioStyles } from '../src/lib/folio-styles'
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
interface DocumentWindowState {
  window: BrowserWindow
  currentPath: string | null
  documentEdited: boolean
  allowClose: boolean
  watchedPath: string | null
  watchedContent: string | null
  watchedStyles: string | null
  pendingPath?: string | null
  isNew?: boolean
}

const documentWindows = new Map<number, DocumentWindowState>()
let settingsWindow: BrowserWindow | null = null
let recentDocumentPaths: string[] = []
let pendingOpenPath: string | null = process.argv.slice(1).find(argument => path.isAbsolute(argument) && /\.(folio|md|markdown)$/i.test(argument)) ?? null
const savingPaths = new Set<string>()

function getWindowState(target?: Electron.WebContents | BrowserWindow | null): DocumentWindowState | undefined {
  if (!target) {
    const focused = BrowserWindow.getFocusedWindow()
    return focused ? documentWindows.get(focused.id) : documentWindows.values().next().value
  }
  if ('id' in target && typeof (target as BrowserWindow).id === 'number') {
    return documentWindows.get((target as BrowserWindow).id)
  }
  const win = BrowserWindow.fromWebContents(target as Electron.WebContents)
  return win ? documentWindows.get(win.id) : undefined
}

function getFocusedDocumentWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && documentWindows.has(focused.id)) return focused
  return documentWindows.values().next().value?.window ?? null
}

function findWindowForPath(filePath: string): DocumentWindowState | undefined {
  const resolved = path.resolve(filePath)
  for (const state of documentWindows.values()) {
    if (state.currentPath && path.resolve(state.currentPath) === resolved) {
      return state
    }
  }
  return undefined
}

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
  for (const state of documentWindows.values()) {
    if (!state.window.isDestroyed()) {
      state.window.webContents.send('documents:recent-updated', recentDocumentPaths)
    }
  }
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
  return { canceled: false as const, path: filePath, ...(isFolio(filePath) ? await openFolio(filePath) : { content: await readFile(filePath, 'utf8') }) }
}

function openRecentDocument(filePath: string) {
  const existing = findWindowForPath(filePath)
  if (existing) {
    existing.window.show()
    existing.window.focus()
    return
  }

  const focused = BrowserWindow.getFocusedWindow()
  const state = focused ? documentWindows.get(focused.id) : null
  if (state && !state.currentPath && !state.documentEdited) {
    state.currentPath = filePath
    state.window.webContents.send('document:open-recent-request', filePath)
    return
  }

  createWindow({ filePath })
}

function rendererUrl(mode?: 'print' | 'settings', params?: Record<string, string>) {
  const searchParams = new URLSearchParams()
  if (mode) searchParams.set('mode', mode)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      searchParams.set(k, v)
    }
  }
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
  return devServerUrl ? `${devServerUrl}/${suffix}` : `file://${path.join(moduleDir, '../dist/index.html')}${suffix}`
}

function getNewWindowPosition() {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) {
    const [x, y] = focused.getPosition()
    return { x: x + 28, y: y + 28 }
  }
  return {}
}

function createWindow(options?: { filePath?: string | null; isNew?: boolean }): BrowserWindow {
  nativeTheme.themeSource = 'system'
  const iconPath = getIconPath()
  const isMac = process.platform === 'darwin'
  const position = documentWindows.size > 0 ? getNewWindowPosition() : {}

  const win = new BrowserWindow({
    title: 'Folio',
    ...(iconPath ? { icon: iconPath } : {}),
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    ...position,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 18 },
          tabbingIdentifier: 'folio-document',
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

  const state: DocumentWindowState = {
    window: win,
    currentPath: options?.filePath ?? null,
    documentEdited: false,
    allowClose: false,
    watchedPath: null,
    watchedContent: null,
    watchedStyles: null,
    pendingPath: options?.filePath ?? null,
    isNew: options?.isNew ?? false,
  }
  documentWindows.set(win.id, state)

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = new URL(win.webContents.getURL())
    const destination = new URL(url)
    // In-document anchors stay inside the preview.
    current.hash = ''
    destination.hash = ''
    if (current.href === destination.href) return
    event.preventDefault()
    openExternalLink(url)
  })

  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable || win.isDestroyed()) return
    const items: Electron.MenuItemConstructorOptions[] = []
    if (params.misspelledWord) {
      items.push(...params.dictionarySuggestions.map(suggestion => ({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })))
      items.push({ label: 'Add to Dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' })
    }
    items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' })
    Menu.buildFromTemplate(items).popup({ window: win })
  })

  const urlParams: Record<string, string> = {}
  if (options?.isNew) urlParams.isNew = '1'
  if (options?.filePath) urlParams.target = options.filePath
  win.loadURL(rendererUrl(undefined, Object.keys(urlParams).length > 0 ? urlParams : undefined))

  win.once('ready-to-show', () => {
    win.show()
    try {
      initAutoUpdater(
        win,
        () => {
          for (const s of documentWindows.values()) s.allowClose = true
        },
        () => {
          for (const s of documentWindows.values()) s.allowClose = false
        }
      )
    } catch (err) {
      console.warn('Auto-updater init bypassed:', err)
    }
  })
  win.on('close', (event) => {
    const winState = documentWindows.get(win.id)
    if (winState?.documentEdited && !winState.allowClose) {
      event.preventDefault()
      win.webContents.send('document:close-request')
    }
  })
  win.on('closed', () => {
    const winState = documentWindows.get(win.id)
    if (winState?.watchedPath) unwatchFile(winState.watchedPath)
    documentWindows.delete(win.id)
  })

  return win
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  const parent = getFocusedDocumentWindow() ?? undefined
  settingsWindow = new BrowserWindow({
    title: 'Folio Settings', width: 560, height: 620, minWidth: 480, minHeight: 560,
    parent, show: false, autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#ebeae6',
    webPreferences: { preload: path.join(moduleDir, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  settingsWindow.loadURL(rendererUrl('settings'))
  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => { settingsWindow = null })
}

ipcMain.handle('settings:open', openSettings)

function sendMenuCommand(command: string) {
  const focused = BrowserWindow.getFocusedWindow()
  const target = (focused && documentWindows.has(focused.id)) ? focused : getFocusedDocumentWindow()
  target?.webContents.send('menu:command', command)
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
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const focused = BrowserWindow.getFocusedWindow()
            const state = focused ? documentWindows.get(focused.id) : null
            if (state && !state.currentPath && !state.documentEdited && state.isNew) {
              focused.webContents.send('menu:command', 'new')
              focused.focus()
              return
            }
            createWindow({ isNew: true })
          },
        },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('open') },
        { label: 'Open Recent', submenu: recentItems },
        { type: 'separator' },
        { role: 'close' as const, label: 'Close Window', accelerator: 'CmdOrCtrl+W' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuCommand('save-as') },
        ...(!isMac ? [{ label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings }] : []),
        { type: 'separator' },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenuCommand('export') },
        ...(!isMac ? [{ type: 'separator' as const }, { role: 'quit' as const, label: 'Exit' }] : []),
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, { label: 'Find and Replace…', accelerator: 'CmdOrCtrl+F', click: () => sendMenuCommand('find') }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    {
      label: 'Window',
      role: 'window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'mergeAllWindows' as const },
              { role: 'moveTabToNewWindow' as const },
              { role: 'selectNextTab' as const },
              { role: 'selectPreviousTab' as const },
            ]
          : []),
      ],
    },
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

async function assetDocumentPath(file: string | null) {
  return file && isFolio(file) ? folioAssetPath(file, path.join(app.getPath('userData'), 'folio-cache')) : file
}
function validateBundleRequest(event: Electron.IpcMainInvokeEvent, file: string) {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !documentWindows.has(win.id) || typeof file !== 'string' || !path.isAbsolute(file) || !isFolio(file)) throw new Error('Folio document is unavailable.')
}
ipcMain.handle('file:history', async (event, file: string) => { validateBundleRequest(event, file); return (await openFolio(file)).history })
ipcMain.handle('file:revision', async (event, file: string, id: string) => { validateBundleRequest(event, file); return readFolioRevision(file, id) })
app.on('open-file', (event, file) => {
  event.preventDefault()
  const existing = findWindowForPath(file)
  if (existing) {
    existing.window.show()
    existing.window.focus()
    return
  }

  if (documentWindows.size === 0) {
    pendingOpenPath = file
    createWindow({ filePath: file })
    return
  }

  const focused = BrowserWindow.getFocusedWindow()
  const state = focused ? documentWindows.get(focused.id) : null
  if (state && !state.currentPath && !state.documentEdited && !state.window.webContents.isLoading()) {
    void rememberDocument(file).then(() => {
      state.currentPath = file
      state.window.webContents.send('document:open-recent-request', file)
    }).catch(error => state.window.webContents.send('document:open-error', String(error)))
    return
  }

  createWindow({ filePath: file })
})

ipcMain.handle('file:open', async (event) => {
  const callerWin = BrowserWindow.fromWebContents(event.sender) ?? getFocusedDocumentWindow()
  const state = callerWin ? documentWindows.get(callerWin.id) : null
  const selection = await dialog.showOpenDialog(callerWin ?? undefined, {
    title: 'Open Document',
    properties: ['openFile'],
    filters: [{ name: 'Folio and Markdown', extensions: ['folio', 'md', 'markdown', 'mdown', 'txt'] }],
  })
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true }
  const filePath = selection.filePaths[0]

  const existing = findWindowForPath(filePath)
  if (existing) {
    existing.window.show()
    existing.window.focus()
    return { canceled: true }
  }

  if (state) {
    state.currentPath = filePath
    state.window.setTitle(`${path.basename(filePath)} — Folio`)
    if (process.platform === 'darwin') state.window.setRepresentedFilename(filePath)
  }
  return readMarkdownDocument(filePath)
})

ipcMain.handle('file:confirm-open', async (event, filePath: unknown) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Document path is invalid.')
  const state = getWindowState(event.sender)
  if (state) {
    state.currentPath = filePath
    state.window.setTitle(`${path.basename(filePath)} — Folio`)
    if (process.platform === 'darwin') state.window.setRepresentedFilename(filePath)
  }
  await rememberDocument(filePath)
})

ipcMain.handle('file:get-startup-document', async (event) => {
  const state = getWindowState(event.sender)
  if (!state) return { canceled: true }

  if (state.pendingPath) {
    const file = state.pendingPath
    state.pendingPath = null
    state.currentPath = file
    state.window.setTitle(`${path.basename(file)} — Folio`)
    if (process.platform === 'darwin') state.window.setRepresentedFilename(file)
    const document = await readMarkdownDocument(file)
    await rememberDocument(file)
    return document
  }

  if (state.isNew) {
    state.isNew = false
    return { canceled: true }
  }

  if (pendingOpenPath) {
    const file = pendingOpenPath
    pendingOpenPath = null
    state.currentPath = file
    state.window.setTitle(`${path.basename(file)} — Folio`)
    if (process.platform === 'darwin') state.window.setRepresentedFilename(file)
    const document = await readMarkdownDocument(file)
    await rememberDocument(file)
    return document
  }

  for (const filePath of [...recentDocumentPaths]) {
    if (findWindowForPath(filePath)) continue
    try {
      const document = await readMarkdownDocument(filePath)
      state.currentPath = filePath
      state.window.setTitle(`${path.basename(filePath)} — Folio`)
      if (process.platform === 'darwin') state.window.setRepresentedFilename(filePath)
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

ipcMain.handle('file:open-recent', async (event, filePath: unknown) => {
  if (typeof filePath !== 'string' || !recentDocumentPaths.includes(filePath)) throw new Error('Recent document is unavailable.')
  const existing = findWindowForPath(filePath)
  if (existing) {
    existing.window.show()
    existing.window.focus()
    return { canceled: true }
  }
  try {
    const document = await readMarkdownDocument(filePath)
    const state = getWindowState(event.sender)
    if (state) {
      state.currentPath = filePath
      state.window.setTitle(`${path.basename(filePath)} — Folio`)
      if (process.platform === 'darwin') state.window.setRepresentedFilename(filePath)
    }
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

ipcMain.handle('file:close-after-confirmation', (event) => {
  const state = getWindowState(event.sender)
  if (state) {
    state.allowClose = true
    state.window.close()
  }
})

ipcMain.handle('file:read-comparison', async (event) => {
  const callerWin = BrowserWindow.fromWebContents(event.sender) ?? getFocusedDocumentWindow()
  const selection = await dialog.showOpenDialog(callerWin ?? undefined, {
    title: 'Compare With Revision',
    properties: ['openFile'],
    filters: [{ name: 'Folio and Markdown', extensions: ['folio', 'md', 'markdown', 'mdown', 'txt'] }],
  })
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true }
  const filePath = selection.filePaths[0]
  return readMarkdownDocument(filePath)
})

ipcMain.handle('file:launch', async (_event, filePath: unknown) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    return { opened: false, error: 'The exported PDF path is invalid.' }
  }
  const error = await shell.openPath(filePath)
  return error ? { opened: false, error } : { opened: true }
})

ipcMain.handle('file:save', async (event, payload: { path: string | null; content: string; saveAs?: boolean; expectedContent?: string; overwrite?: boolean; styles?: FolioStyles; expectedStyles?: FolioStyles | null; includeHistory?: boolean; format?: 'folio' }) => {
  const state = getWindowState(event.sender)
  const targetWin = state?.window ?? getFocusedDocumentWindow()
  let filePath = payload.path
  if (!filePath || payload.saveAs) {
    const selection = await dialog.showSaveDialog(targetWin!, {
      title: 'Save Document',
      defaultPath: payload.format === 'folio' ? `${filePath ? filePath.slice(0, -path.extname(filePath).length) : 'Untitled'}.folio` : filePath ?? 'Untitled.folio',
      filters: payload.format === 'folio' ? [{ name: 'Folio document', extensions: ['folio'] }] : [{ name: 'Folio document', extensions: ['folio'] }, { name: 'Markdown', extensions: ['md'] }],
    })
    if (selection.canceled || !selection.filePath) return { canceled: true }
    filePath = selection.filePath
  }
  savingPaths.add(filePath)
  let content = payload.content
  try {
    if (isFolio(filePath) && !payload.saveAs && payload.expectedContent !== undefined && !payload.overwrite && await readFolioText(filePath) === null) return { canceled: true, conflict: { path: filePath, content: null } }
    const draftDirectory = path.join(app.getPath('userData'), 'draft-assets')
    if (payload.includeHistory === false && filePath === payload.path) throw new Error('Choose a different name for the copy without history.')
    const sourcePath = await assetDocumentPath(payload.path)
    if (isFolio(filePath)) {
      if (!payload.styles) throw new Error('Document styles are missing. Restart Folio and try again.')
      const result = await saveFolio(filePath, content, payload.styles, sourcePath, draftDirectory, isFolio(payload.path) ? payload.path : null,
        !payload.saveAs && payload.path ? payload.expectedContent : undefined, payload.overwrite, payload.includeHistory !== false, payload.expectedStyles)
      if (!result.saved) return { canceled: true, conflict: { ...result.conflict, ...(await openFolio(filePath).catch(() => ({}))) } }
      if (state && state.watchedPath === filePath) { state.watchedContent = result.content; state.watchedStyles = JSON.stringify(result.styles) }
      if (state) {
        state.currentPath = filePath
        state.window.setTitle(`${path.basename(filePath)} — Folio`)
        if (process.platform === 'darwin') state.window.setRepresentedFilename(filePath)
      }
      await rememberDocument(filePath)
      return { canceled: false, path: filePath, content: result.content, styles: result.styles, history: result.history }
    }
    if (isFolio(payload.path) && sourcePath) content = await exportFolioMarkdown(content, sourcePath, filePath, draftDirectory, payload.styles)
    else if (payload.saveAs && payload.path) await copyDocumentAssets(payload.path, filePath, payload.content)
    content = await promoteDraftImages(filePath, content, draftDirectory)
    content = await externalizeDocumentImages(filePath, content)
    const result = await saveDocumentFile(filePath, content, !payload.saveAs && payload.path ? payload.expectedContent : undefined, payload.overwrite)
    if (!result.saved) return { canceled: true, conflict: result.conflict }
    if (state && state.watchedPath === filePath) state.watchedContent = content
    if (state) {
      state.currentPath = filePath
      state.window.setTitle(`${path.basename(filePath)} — Folio`)
      if (process.platform === 'darwin') state.window.setRepresentedFilename(filePath)
    }
  } finally { savingPaths.delete(filePath) }
  await rememberDocument(filePath)
  return { canceled: false, path: filePath, content }
})

ipcMain.handle('file:watch', async (event, payload: { path: string | null; content: string }) => {
  const state = getWindowState(event.sender)
  if (!state) return
  if (state.watchedPath) unwatchFile(state.watchedPath)
  state.watchedPath = payload.path
  state.watchedContent = payload.content
  state.currentPath = payload.path
  if (payload.path) {
    state.window.setTitle(`${path.basename(payload.path)} — Folio`)
    if (process.platform === 'darwin') state.window.setRepresentedFilename(payload.path)
  } else {
    state.window.setTitle('Folio')
    if (process.platform === 'darwin') state.window.setRepresentedFilename('')
  }
  if (!state.watchedPath) return
  const filePath = state.watchedPath
  const win = state.window
  state.watchedStyles = isFolio(filePath) ? JSON.stringify((await openFolio(filePath).catch(() => ({ styles: null }))).styles) : null
  if (state.watchedPath !== filePath) return
  watchFile(filePath, { interval: 750, persistent: false }, async () => {
    if (savingPaths.has(filePath)) return
    try {
      const content = await (isFolio(filePath) ? readFolioText(filePath) : readDiskDocument(filePath))
      const bundle = isFolio(filePath) && content !== null ? await openFolio(filePath) : null
      const nextStyles = bundle ? JSON.stringify(bundle.styles) : null
      if (win.isDestroyed() || state.watchedPath !== filePath || (content === state.watchedContent && nextStyles === state.watchedStyles) || savingPaths.has(filePath)) return
      state.watchedContent = content
      state.watchedStyles = nextStyles
      win.webContents.send('document:disk-changed', { path: filePath, ...bundle, content })
    } catch (error) { console.warn('Could not check document changes:', error) }
  })
})

ipcMain.handle('file:import-image', async (_event, payload: { documentPath: string | null; name: string; bytes: number[] }) => {
  return importDocumentImage(isFolio(payload.documentPath) ? null : payload.documentPath, payload.name, Buffer.from(payload.bytes), path.join(app.getPath('userData'), 'draft-assets'))
})
ipcMain.handle('file:resolve-images', async (_event, payload: { documentPath: string | null; sources: string[] }) => {
  return resolveDocumentImages(await assetDocumentPath(payload.documentPath), payload.sources, path.join(app.getPath('userData'), 'draft-assets'))
})

ipcMain.handle('document:export-package', async (event, payload: { markdown: string; documentPath: string | null; name: string }) => {
  const callerWin = BrowserWindow.fromWebContents(event.sender) ?? getFocusedDocumentWindow()
  if (!callerWin || !documentWindows.has(callerWin.id)) throw new Error('Document export is only available from the editor.')
  const selection = await dialog.showSaveDialog(callerWin, {
    title: 'Export Markdown Package', defaultPath: `${path.basename(payload.name, path.extname(payload.name))}.zip`,
    filters: [{ name: 'Markdown and assets', extensions: ['zip'] }],
  })
  if (selection.canceled || !selection.filePath) return { canceled: true }
  const bytes = await packageDocument(payload.markdown, await assetDocumentPath(payload.documentPath), path.join(app.getPath('userData'), 'draft-assets'), payload.name)
  await writeFile(selection.filePath, bytes)
  return { canceled: false, path: selection.filePath }
})

ipcMain.on('document:set-edited', (event, edited: boolean) => {
  const state = getWindowState(event.sender)
  if (state) state.documentEdited = edited
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

ipcMain.handle('document:export-pdf', async (event, payload: { markdown: string; suggestedName: string; theme?: string; lang?: string; documentPath?: string; styles?: FolioStyles }) => {
  const callerWin = BrowserWindow.fromWebContents(event.sender) ?? getFocusedDocumentWindow()
  const selection = await dialog.showSaveDialog(callerWin!, {
    title: 'Export PDF',
    defaultPath: `${payload.suggestedName || 'document'}.pdf`,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  })
  if (selection.canceled || !selection.filePath) return { canceled: true }
  const progress = (message: string) => callerWin?.webContents.send('export:progress', message)
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
      const message = { markdown: payload.markdown, theme: payload.theme, lang: payload.lang, documentPath: payload.documentPath, styles: payload.styles }
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
        applicationVersion: app.getVersion(),
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
    ipcMain.handle('window:new', () => {
      createWindow({ isNew: true })
    })
    app.on('activate', () => {
      if (documentWindows.size === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
