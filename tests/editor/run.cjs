const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.join(__dirname, '..', '..')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'folio-editor-test-')))
ipcMain.handle('file:get-startup-document', () => ({
  canceled: false,
  path: '/tmp/folio-editor-test.md',
  content: '---\ntitle: Test\nmystery: value\n---\n\n# First\n\nA paragraph.\n\n# Second\n\nAnother paragraph.\n',
}))
ipcMain.on('document:set-edited', () => {})
ipcMain.handle('file:watch', () => {})
ipcMain.handle('file:resolve-images', () => ({}))
let installRequests = 0
ipcMain.handle('updater:install', () => { installRequests += 1 })
const saveRequests = []
ipcMain.handle('file:save', (_event, payload) => {
  saveRequests.push(payload)
  return payload.saveAs ? { canceled: false, path: '/tmp/renamed.md' } : { canceled: true }
})

async function waitFor(win, selector) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Editor did not render ${selector}`)
}

let settingsWindow
ipcMain.handle('settings:open', async () => {
  settingsWindow = new BrowserWindow({ show: false, width: 560, height: 620, webPreferences: { preload: path.join(root, 'dist-electron', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  await settingsWindow.loadFile(path.join(root, 'dist', 'index.html'), { query: { mode: 'settings' } })
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(root, 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  try {
    await win.loadFile(path.join(root, 'dist', 'index.html'))
    await waitFor(win, '.cm-lint-marker')
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.cm-activeLine').length > 0`), true)
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.cm-foldGutter [title="Fold line"]').length > 0`), true)

    const gutter = await win.webContents.executeJavaScript(`({ size: getComputedStyle(document.querySelector('.cm-lineNumbers')).fontSize, width: document.querySelector('.cm-gutters').getBoundingClientRect().width })`)
    assert.equal(gutter.size, '10px')
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.cm-lineNumbers .cm-gutterElement')).lineHeight === getComputedStyle(document.querySelector('.cm-line')).lineHeight`), true)
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.cm-lineNumbers').nextElementSibling.classList.contains('cm-foldGutter')`), true)
    assert.ok(gutter.width < 65, `Editor gutter is too wide: ${gutter.width}`)
    const foldBefore = await win.webContents.executeJavaScript(`(() => {
      const marker = document.querySelector('.folio-fold-marker[title="Fold line"]')
      const rect = marker.querySelector('svg').getBoundingClientRect()
      const row = marker.parentElement.getBoundingClientRect()
      return { x: rect.x, width: rect.width, center: rect.y + rect.height / 2, rowCenter: row.y + 26.88 / 2 }
    })()`)
    assert.ok(Math.abs(foldBefore.center - foldBefore.rowCenter) < 0.5, 'Open fold icon is not vertically centered')
    await win.webContents.executeJavaScript(`document.querySelector('.folio-fold-marker[title="Fold line"]').click()`)
    await waitFor(win, '.folio-fold-marker[title="Unfold line"]')
    const foldAfter = await win.webContents.executeJavaScript(`(() => {
      const marker = document.querySelector('.folio-fold-marker[title="Unfold line"]')
      const rect = marker.querySelector('svg').getBoundingClientRect()
      const row = marker.parentElement.getBoundingClientRect()
      return { x: rect.x, width: rect.width, center: rect.y + rect.height / 2 - row.y }
    })()`)
    assert.equal(foldAfter.x, foldBefore.x, 'Folding moved the icon horizontally')
    assert.equal(foldAfter.width, foldBefore.width)
    assert.ok(Math.abs(foldAfter.center - 26.88 / 2) < 0.5, 'Closed fold icon is not vertically centered')
    if (process.env.FOLIO_FOLD_SCREENSHOT) fs.writeFileSync(process.env.FOLIO_FOLD_SCREENSHOT, (await win.webContents.capturePage()).toPNG())
    await win.webContents.executeJavaScript(`document.querySelector('.folio-fold-marker[title="Unfold line"]').click()`)
    if (process.env.FOLIO_EDITOR_SCREENSHOT) fs.writeFileSync(process.env.FOLIO_EDITOR_SCREENSHOT, (await win.webContents.capturePage()).toPNG())
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.editor-toolbar button')).find(x => x.textContent === 'Outline').click()`)
    await waitFor(win, '.editor-outline .outline-heading')
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.editor-outline .outline-heading').length`), 2)
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.editor-outline .outline-heading')).find(x => x.textContent === 'Second').click()`)
    assert.match(await win.webContents.executeJavaScript(`document.querySelector('.cm-activeLine').textContent`), /Second/)

    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.editor-toolbar button')).find(x => x.textContent === 'Find').click()`)
    await waitFor(win, '.cm-search')
    assert.match(await win.webContents.executeJavaScript(`document.querySelector('.cm-search').textContent`), /replace/i)
    const inputWidths = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.cm-search input.cm-textfield')).map(input => input.getBoundingClientRect().width)`)
    assert.ok(inputWidths.length === 2 && inputWidths.every((width) => width >= 300), `Search fields are too narrow: ${inputWidths}`)
    const inputHeights = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.cm-search input.cm-textfield')).map(input => input.getBoundingClientRect().height)`)
    assert.ok(inputHeights.every((height) => height === 20), `Search fields should match Theme Editor input height: ${inputHeights}`)

    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.editor-toolbar button')).find(x => x.textContent === 'B').click()`)
    assert.match(await win.webContents.executeJavaScript(`document.querySelector('.cm-content').textContent`), /\*\*bold text\*\*/)
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await win.webContents.executeJavaScript(`Array.from(CSS.highlights.get('folio-selection') ?? []).map(range => range.toString()).join('').includes('bold text')`)) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.match(await win.webContents.executeJavaScript(`Array.from(CSS.highlights.get('folio-selection') ?? []).map(range => range.toString()).join('')`), /bold text/)
    await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Settings"]').click()`)
    for (let attempt = 0; !settingsWindow && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 100))
    await waitFor(settingsWindow, '.settings-window')
    if (process.env.FOLIO_SETTINGS_SCREENSHOT) {
      await new Promise(resolve => setTimeout(resolve, 300))
      fs.writeFileSync(process.env.FOLIO_SETTINGS_SCREENSHOT, (await settingsWindow.webContents.capturePage()).toPNG())
    }
    await settingsWindow.webContents.executeJavaScript(`document.querySelector('[aria-label="Light appearance"]').click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await win.webContents.executeJavaScript(`document.documentElement.dataset.uiTheme`), 'light')
    await settingsWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('label')).find(x => x.textContent.includes('Show line numbers')).querySelector('input').click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.cm-lineNumbers') === null`), true)
    await settingsWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('label')).find(x => x.textContent.includes('Show line numbers')).querySelector('input').click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.cm-lineNumbers') !== null`), true)
    await settingsWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('label')).find(x => x.textContent.includes('Show selected text')).querySelector('input').click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await win.webContents.executeJavaScript(`CSS.highlights.has('folio-selection')`), false)
    await settingsWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('label')).find(x => x.textContent.includes('Show selected text')).querySelector('input').click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.match(await win.webContents.executeJavaScript(`Array.from(CSS.highlights.get('folio-selection') ?? []).map(range => range.toString()).join('')`), /bold text/)
    await settingsWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('label')).find(x => x.textContent.includes('Highlight the current line')).querySelector('input').click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.cm-activeLine') === null`), true)
    assert.equal(await settingsWindow.webContents.executeJavaScript(`localStorage.getItem('folio:editor:active-line')`), 'false')
    settingsWindow.destroy()
    win.webContents.send('updater:install-request')
    await waitFor(win, '#confirm-title')
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.folio-dialog button')).find(x => x.textContent === 'Cancel').click()`)
    assert.equal(installRequests, 0)
    win.webContents.send('updater:install-request')
    await waitFor(win, '#confirm-title')
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.folio-dialog button')).find(x => x.textContent.includes('Discard')).click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(installRequests, 1)
    assert.equal(await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.editor-toolbar button')).some(x => x.textContent === '123')`), false)
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.save-menu') === null`), true)
    await win.webContents.executeJavaScript(`document.querySelector('.save-dropdown').click()`)
    await waitFor(win, '.save-menu')
    await win.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.save-menu') === null && document.activeElement === document.querySelector('.save-dropdown')`), true)
    await win.webContents.executeJavaScript(`document.querySelector('.save-dropdown').click()`)
    await waitFor(win, '.save-menu')
    await win.webContents.executeJavaScript(`document.querySelector('.save-menu button').click()`)
    await waitFor(win, '.document-title')
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await win.webContents.executeJavaScript(`document.querySelector('.document-title').textContent.includes('renamed.md')`)) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(saveRequests[0].saveAs, true)
    assert.equal(saveRequests[0].path, '/tmp/folio-editor-test.md')
    assert.match(await win.webContents.executeJavaScript(`document.querySelector('.document-title').textContent`), /renamed.md/)
    await win.webContents.executeJavaScript(`document.querySelector('.save-main').click()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(saveRequests[1].path, '/tmp/renamed.md')
    assert.equal(saveRequests[1].saveAs, false)
    await win.webContents.executeJavaScript(`(() => {
      const view = document.querySelector('.cm-content').cmTile.view
      const text = '# Selection\\n\\nFirst **bold** and *italic* paragraph.\\n\\nRepeated text.\\n\\nRepeated text.\\n'
      const from = text.indexOf('bold')
      const to = text.indexOf('italic') + 'italic'.length
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: from, head: to } })
    })()`)
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await win.webContents.executeJavaScript(`Array.from(CSS.highlights.get('folio-selection') ?? []).map(range => range.toString()).join('') === 'bold and italic'`)) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(await win.webContents.executeJavaScript(`Array.from(CSS.highlights.get('folio-selection') ?? []).map(range => range.toString()).join('')`), 'bold and italic')
    await win.webContents.executeJavaScript(`(() => {
      const view = document.querySelector('.cm-content').cmTile.view
      const from = view.state.doc.toString().lastIndexOf('Repeated text.')
      view.dispatch({ selection: { anchor: from, head: from + 'Repeated text.'.length } })
    })()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await win.webContents.executeJavaScript(`(() => {
      const range = Array.from(CSS.highlights.get('folio-selection') ?? [])[0]
      const block = range?.startContainer.parentElement.closest('[data-source-from]')
      const text = document.querySelector('.cm-content').cmTile.view.state.doc.toString()
      return range?.toString() === 'Repeated text.' && Number(block?.dataset.sourceFrom) === text.lastIndexOf('Repeated text.')
    })()`), true)
    await win.webContents.executeJavaScript(`document.querySelector('.cm-content').cmTile.view.dispatch({ selection: { anchor: 0 } })`)
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await win.webContents.executeJavaScript(`CSS.highlights.get('folio-selection')?.size ?? 0`), 0)
    console.log('editor smoke passed')
  } finally {
    win.destroy()
    app.quit()
  }
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
