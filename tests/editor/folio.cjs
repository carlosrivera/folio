const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate/node')
const { PDFDocument } = require('pdf-lib')
const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-native-'))
const mdPath = path.join(folder, 'original.md'), folioPath = path.join(folder, 'document.folio')
const movedPath = path.join(folder, 'moved', 'portable.folio'), copyPath = path.join(folder, 'shared.folio')
const exportPath = path.join(folder, 'converted.md'), pdfPath = path.join(folder, 'document.pdf')
const original = '---\nlayout: simple\ntheme: voltage\n---\n\n# First\n\n![Image](image.png)\n\n```js\nconst value = 42;\n```\n\nText after image.\n'
fs.writeFileSync(mdPath, original)
fs.copyFileSync(path.join(root, 'build/icon.png'), path.join(folder, 'image.png'))
fs.writeFileSync(path.join(folder, 'recent-documents.json'), JSON.stringify([mdPath]))
app.setPath('userData', folder)
BrowserWindow.prototype.show = function () {}
let savePath = folioPath, openPath = movedPath
let requestedFilters
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = (win, code) => win.webContents.executeJavaScript(code)
dialog.showSaveDialog = async (_win, options) => { requestedFilters = options.filters; return { canceled: false, filePath: options.title.includes('PDF') ? pdfPath : savePath } }
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPath] })
async function until(win, expression, message) { for (let i = 0; i < 250; i++) { if (await js(win, expression)) return; await delay(100) } throw new Error(message) }
const text = win => js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`)
async function menu(win, label) {
  await js(win, `document.querySelector('[aria-label="Save options"]').click()`)
  await js(win, `Array.from(document.querySelectorAll('.save-menu button')).find(x => x.textContent === ${JSON.stringify(label)}).click()`)
}
async function save(win) {
  await js(win, `document.querySelector('.save-main').click()`)
  await until(win, `!document.querySelector('.document-title i') && !document.querySelector('.save-main').disabled`, 'Save did not finish')
}
async function ready(win) { await until(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false'`, 'Preview did not render') }
app.whenReady().then(async () => {
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href)
  for (let i = 0; !BrowserWindow.getAllWindows().length && i < 60; i++) await delay(100)
  const win = BrowserWindow.getAllWindows()[0]
  try {
    await until(win, `!!document.querySelector('.cm-content') && !document.querySelector('.folio-new-dialog')`, 'Editor did not open')
    await menu(win, 'Save as Folio document…')
    await until(win, `document.querySelector('.document-title').textContent.includes('document.folio') && !document.querySelector('.save-main').disabled`, 'Save as Folio failed')
    assert.equal(fs.readFileSync(mdPath, 'utf8'), original)
    assert.deepEqual(requestedFilters[0].extensions, ['folio'])
    let files = unzipSync(fs.readFileSync(folioPath))
    let manifest = JSON.parse(strFromU8(files['manifest.json']))
    assert.equal(manifest.history.length, 1)
    assert.ok(Object.keys(files).some(key => key.startsWith('assets/')))
    assert.ok(JSON.parse(strFromU8(files['styles.json'])).tokens['code-bg'])
    await save(win)
    assert.equal(JSON.parse(strFromU8(unzipSync(fs.readFileSync(folioPath))['manifest.json'])).history.length, 1)

    // Moving the single file and deleting its original image must keep it portable.
    fs.mkdirSync(path.dirname(movedPath)); fs.copyFileSync(folioPath, movedPath)
    fs.unlinkSync(path.join(folder, 'image.png'))
    files = unzipSync(fs.readFileSync(movedPath))
    const snapshot = JSON.parse(strFromU8(files['styles.json']))
    snapshot.tokens['code-bg'] = '#112233'
    files['styles.json'] = strToU8(JSON.stringify(snapshot))
    fs.writeFileSync(movedPath, zipSync(files))
    await js(win, `Array.from(document.querySelectorAll('.toolbar-actions button')).find(x => x.textContent === 'Open').click()`)
    await until(win, `document.querySelector('.document-title').textContent.includes('portable.folio') && !document.querySelector('.save-main').disabled`, 'Moved bundle did not open')
    await ready(win)
    await until(win, `!!document.querySelector('.pagination-output img')`, 'Bundled image missing')
    assert.ok(await js(win, `document.querySelector('.pagination-output img').naturalWidth > 0`))
    assert.equal(await js(win, `getComputedStyle(document.querySelector('.pagination-output pre')).backgroundColor`), 'rgb(17, 34, 51)')
    const firstText = await text(win)
    await js(win, `(() => { const view = document.querySelector('.cm-content').cmTile.view; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ${JSON.stringify('---\nlayout: simple\ntheme: voltage\n---\n\n# Second\n\nNo image in this version.')} } }); })()`)
    await save(win)
    files = unzipSync(fs.readFileSync(movedPath)); manifest = JSON.parse(strFromU8(files['manifest.json']))
    assert.equal(manifest.history.length, 2)
    assert.equal(JSON.parse(strFromU8(files['styles.json'])).tokens['code-bg'], '#112233')
    await js(win, `document.querySelector('[aria-label="Document history"]').click()`)
    await until(win, `document.querySelector('.document-history')?.open`, 'History did not open')
    assert.equal(await js(win, `document.querySelectorAll('.document-history li').length`), 2)
    await js(win, `document.querySelectorAll('.document-history li button')[1].click()`)
    await until(win, `!document.querySelector('.document-history') && !!document.querySelector('.document-title i')`, 'Restore did not create a draft')
    await until(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString().includes('# First')`, 'Editor did not reflect restored revision')
    assert.equal(await text(win), firstText)
    await save(win)
    assert.equal(JSON.parse(strFromU8(unzipSync(fs.readFileSync(movedPath))['manifest.json'])).history.length, 3)
    await ready(win)
    assert.equal(await js(win, `getComputedStyle(document.querySelector('.pagination-output pre')).backgroundColor`), 'rgb(17, 19, 17)')

    // History-free sharing removes earlier text and keeps current image.
    savePath = copyPath
    await js(win, `document.querySelector('[aria-label="Document history"]').click()`)
    await until(win, `document.querySelector('.document-history')?.open`, 'History did not reopen')
    await js(win, `Array.from(document.querySelectorAll('.document-history button')).find(x => x.textContent.includes('without history')).click()`)
    await until(win, `document.querySelector('.document-title').textContent.includes('shared.folio') && !document.querySelector('.save-main').disabled`, 'Sharing copy failed')
    files = unzipSync(fs.readFileSync(copyPath)); manifest = JSON.parse(strFromU8(files['manifest.json']))
    assert.equal(manifest.history.length, 1)
    assert.ok(!Object.values(files).map(bytes => strFromU8(bytes)).join('\n').includes('No image in this version.'))
    assert.ok(Object.keys(files).some(key => key.startsWith('assets/')))

    await js(win, `document.querySelector('.export-control .save-main').click()`)
    await until(win, `!document.querySelector('.export-control .save-main').disabled`, 'PDF export did not finish')
    assert.ok((await PDFDocument.load(fs.readFileSync(pdfPath))).getPageCount() >= 1)
    savePath = exportPath
    await menu(win, 'Save as…')
    await until(win, `document.querySelector('.document-title').textContent.includes('converted.md') && !document.querySelector('.save-main').disabled`, 'Markdown conversion failed')
    assert.ok(fs.readFileSync(exportPath, 'utf8').includes('.assets/converted/'))
    assert.ok(fs.readFileSync(exportPath, 'utf8').includes('theme-overrides:'))
    assert.ok(!await js(win, `!!document.querySelector('[aria-label="Document history"]')`))
    await ready(win)
    assert.ok(await js(win, `document.querySelector('.pagination-output img').naturalWidth > 0`))
    console.log('PASS: native bundles, portable assets, saved palettes, revision restore, history-free sharing, Markdown conversion and PDF export')
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally { win.destroy(); app.quit() }
})
