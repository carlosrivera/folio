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

async function waitFor(win, selector) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Editor did not render ${selector}`)
}

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
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.editor-toolbar button')).find(x => x.textContent === '123').click()`)
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.cm-lineNumbers') === null`), true)
    console.log('editor smoke passed')
  } finally {
    win.destroy()
    app.quit()
  }
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
