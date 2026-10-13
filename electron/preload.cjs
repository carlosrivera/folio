const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('folio', {
  openSettings: () => ipcRenderer.invoke('settings:open'),
  openMarkdown: () => ipcRenderer.invoke('file:open'),
  confirmOpen: (path) => ipcRenderer.invoke('file:confirm-open', path),
  getStartupDocument: () => ipcRenderer.invoke('file:get-startup-document'),
  openRecent: (path) => ipcRenderer.invoke('file:open-recent', path),
  getRecentDocuments: () => ipcRenderer.invoke('file:get-recent-documents'),
  closeAfterConfirmation: () => ipcRenderer.invoke('file:close-after-confirmation'),
  readComparison: () => ipcRenderer.invoke('file:read-comparison'),
  saveMarkdown: (path, content, saveAs = false, options = {}) => ipcRenderer.invoke('file:save', { path, content, saveAs, ...options }),
  exportPackage: (markdown, documentPath, name) => ipcRenderer.invoke('document:export-package', { markdown, documentPath, name }),
  watchDocument: (path, content) => ipcRenderer.invoke('file:watch', { path, content }),
  importImage: (documentPath, name, bytes) => ipcRenderer.invoke('file:import-image', { documentPath, name, bytes }),
  resolveImages: (documentPath, sources) => ipcRenderer.invoke('file:resolve-images', { documentPath, sources }),
  onDiskChanged: (callback) => {
    const listener = (_event, change) => callback(change)
    ipcRenderer.on('document:disk-changed', listener)
    return () => ipcRenderer.removeListener('document:disk-changed', listener)
  },
  launchFile: (path) => ipcRenderer.invoke('file:launch', path),
  exportPdf: (markdown, suggestedName, theme, lang, documentPath) => ipcRenderer.invoke('document:export-pdf', { markdown, suggestedName, theme, lang, documentPath }),
  setDocumentEdited: (edited) => ipcRenderer.send('document:set-edited', edited),
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  onRecentDocument: (callback) => {
    const listener = (_event, document) => callback(document)
    ipcRenderer.on('document:opened', listener)
    return () => ipcRenderer.removeListener('document:opened', listener)
  },
  onRecentDocumentsUpdated: (callback) => {
    const listener = (_event, list) => callback(list)
    ipcRenderer.on('documents:recent-updated', listener)
    return () => ipcRenderer.removeListener('documents:recent-updated', listener)
  },
  onRecentDocumentRequest: (callback) => {
    const listener = (_event, path) => callback(path)
    ipcRenderer.on('document:open-recent-request', listener)
    return () => ipcRenderer.removeListener('document:open-recent-request', listener)
  },
  onCloseRequest: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('document:close-request', listener)
    return () => ipcRenderer.removeListener('document:close-request', listener)
  },
  onDocumentOpenError: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('document:open-error', listener)
    return () => ipcRenderer.removeListener('document:open-error', listener)
  },
  onExportPayload: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('export:payload', listener)
    return () => ipcRenderer.removeListener('export:payload', listener)
  },
  notifyExportReady: (report) => ipcRenderer.send('export:ready', report),
  onExportProgress: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  onInstallUpdateRequest: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('updater:install-request', listener)
    return () => ipcRenderer.removeListener('updater:install-request', listener)
  },
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },
})
