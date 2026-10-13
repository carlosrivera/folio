import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  quitAndInstall: vi.fn(),
  showMessageBox: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.2.0' },
  BrowserWindow: class {},
  dialog: { showMessageBox: mocks.showMessageBox },
  ipcMain: {
    removeHandler: (name: string) => mocks.handlers.delete(name),
    handle: (name: string, handler: () => void) => mocks.handlers.set(name, handler),
  },
}))
vi.mock('node:fs', () => ({ default: { existsSync: () => true } }))
let updater: EventEmitter & { quitAndInstall: typeof mocks.quitAndInstall }
vi.mock('electron-updater', () => ({ default: { get autoUpdater() { return updater } } }))

beforeEach(() => {
  Object.defineProperty(process, 'resourcesPath', { value: '/tmp/folio-test-resources', configurable: true })
  vi.resetModules()
  vi.useFakeTimers()
  vi.clearAllMocks()
  updater = Object.assign(new EventEmitter(), { quitAndInstall: mocks.quitAndInstall })
  mocks.showMessageBox.mockResolvedValue({ response: 0 })
})
afterEach(() => vi.useRealTimers())

it('requests document confirmation before restarting, and permits the confirmed install', async () => {
  const { initAutoUpdater } = await import('./updater')
  const send = vi.fn()
  const beforeInstall = vi.fn()
  const failed = vi.fn()
  initAutoUpdater({ webContents: { send } } as never, beforeInstall, failed)
  mocks.handlers.get('updater:install')!()
  expect(mocks.quitAndInstall).not.toHaveBeenCalled()

  updater.emit('update-downloaded', { version: '0.3.0' })
  await Promise.resolve()
  expect(send).toHaveBeenCalledWith('updater:install-request')
  expect(mocks.quitAndInstall).not.toHaveBeenCalled()
  mocks.handlers.get('updater:install')!()
  expect(beforeInstall).toHaveBeenCalledOnce()
  expect(mocks.quitAndInstall).toHaveBeenCalledWith(false, true)
  expect(beforeInstall.mock.invocationCallOrder[0]).toBeLessThan(mocks.quitAndInstall.mock.invocationCallOrder[0])
  updater.emit('error', new Error('Installation failed'))
  expect(failed).toHaveBeenCalledOnce()
})

it('does not install when Later is selected, or duplicate listeners when the window is recreated', async () => {
  const { initAutoUpdater } = await import('./updater')
  mocks.showMessageBox.mockResolvedValue({ response: 1 })
  const send = vi.fn()
  const window = { webContents: { send } } as never
  initAutoUpdater(window, vi.fn(), vi.fn())
  initAutoUpdater(window, vi.fn(), vi.fn())
  expect(updater.listenerCount('update-downloaded')).toBe(1)
  updater.emit('update-downloaded', { version: '0.3.0' })
  await Promise.resolve()
  expect(send).not.toHaveBeenCalledWith('updater:install-request')
  expect(mocks.quitAndInstall).not.toHaveBeenCalled()
})
