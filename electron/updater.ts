import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppUpdater } from 'electron-updater'
import electronUpdaterPkg from 'electron-updater'

function hasUpdateConfig(): boolean {
  try {
    const configPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app-update.yml')
      : path.join(app.getAppPath(), 'dev-app-update.yml')
    return fs.existsSync(configPath)
  } catch {
    return false
  }
}

let cachedUpdater: AppUpdater | null = null

function getAutoUpdater(): AppUpdater | null {
  if (cachedUpdater) return cachedUpdater
  try {
    const updaterModule = (electronUpdaterPkg as unknown as { default?: { autoUpdater: AppUpdater }; autoUpdater?: AppUpdater })
    const updater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater
    if (updater) {
      cachedUpdater = updater
      return updater
    }
  } catch (err) {
    console.warn('Unable to load electron-updater:', err)
  }
  return null
}

let updateCheckInProgress = false
let updateIsManual = false
let windowRef: BrowserWindow | null = null

export function initAutoUpdater(mainWindow: BrowserWindow) {
  windowRef = mainWindow

  // Always register IPC handlers safely so the renderer never hangs
  ipcMain.removeHandler('updater:check')
  ipcMain.handle('updater:check', () => {
    checkForUpdates(true)
  })

  ipcMain.removeHandler('updater:install')
  ipcMain.handle('updater:install', () => {
    try {
      getAutoUpdater()?.quitAndInstall()
    } catch (err) {
      console.warn('Failed to quit and install update:', err)
    }
  })

  // If running in development or without app-update.yml, do not touch autoUpdater or native Squirrel
  if (!app.isPackaged || !hasUpdateConfig()) {
    return
  }

  const autoUpdater = getAutoUpdater()
  if (!autoUpdater) return

  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      updateCheckInProgress = true
      windowRef?.webContents.send('updater:status', { state: 'checking' })
    })

    autoUpdater.on('update-available', (info) => {
      updateCheckInProgress = false
      windowRef?.webContents.send('updater:status', {
        state: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
      })

      if (windowRef) {
        dialog.showMessageBox(windowRef, {
          type: 'info',
          title: 'Update Available',
          message: `A new version of Folio (v${info.version}) is available.`,
          detail: 'The update is downloading in the background. You will be notified when it is ready to install.',
          buttons: ['OK'],
        })
      }
    })

    autoUpdater.on('update-not-available', (info) => {
      updateCheckInProgress = false
      windowRef?.webContents.send('updater:status', {
        state: 'not-available',
        version: info.version,
      })

      if (updateIsManual && windowRef) {
        dialog.showMessageBox(windowRef, {
          type: 'info',
          title: 'Folio is Up to Date',
          message: `Folio v${app.getVersion()} is currently the newest version.`,
          buttons: ['OK'],
        })
      }
      updateIsManual = false
    })

    autoUpdater.on('download-progress', (progress) => {
      windowRef?.webContents.send('updater:status', {
        state: 'downloading',
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      updateCheckInProgress = false
      windowRef?.webContents.send('updater:status', {
        state: 'downloaded',
        version: info.version,
      })

      if (windowRef) {
        dialog.showMessageBox(windowRef, {
          type: 'info',
          title: 'Update Ready to Install',
          message: `Folio v${info.version} has been downloaded.`,
          detail: 'Restart Folio now to apply the update, or install automatically the next time you quit.',
          buttons: ['Restart & Install', 'Later'],
          defaultId: 0,
          cancelId: 1,
        }).then(({ response }) => {
          if (response === 0) {
            getAutoUpdater()?.quitAndInstall()
          }
        })
      }
    })

    autoUpdater.on('error', (err) => {
      updateCheckInProgress = false
      windowRef?.webContents.send('updater:status', {
        state: 'error',
        message: err?.message || 'Update check failed',
      })

      if (updateIsManual && windowRef) {
        dialog.showMessageBox(windowRef, {
          type: 'warning',
          title: 'Update Check',
          message: 'Could not check for updates.',
          detail: err?.message || 'Please check your internet connection and try again.',
          buttons: ['OK'],
        })
      }
      updateIsManual = false
    })

    // Check silently on startup if packaged with update config
    setTimeout(() => {
      checkForUpdates(false)
    }, 4000)
  } catch (err) {
    console.warn('Failed to configure autoUpdater:', err)
  }
}

export function checkForUpdates(manual: boolean = false) {
  if (updateCheckInProgress) return
  updateIsManual = manual

  if (!app.isPackaged || !hasUpdateConfig()) {
    if (manual && windowRef) {
      dialog.showMessageBox(windowRef, {
        type: 'info',
        title: 'Folio Updates',
        message: `Folio v${app.getVersion()}`,
        detail: !app.isPackaged
          ? 'Auto-update checks run on packaged GitHub releases. (Running in development mode).'
          : 'Update configuration is only present in distributed GitHub release builds.',
        buttons: ['OK'],
      })
    }
    return
  }

  const autoUpdater = getAutoUpdater()
  if (!autoUpdater) return

  try {
    void autoUpdater.checkForUpdates().catch((err) => {
      console.warn('Auto-update check error:', err?.message || err)
    })
  } catch (err) {
    console.warn('Failed to trigger update check:', err)
  }
}
