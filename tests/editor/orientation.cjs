const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PDFDocument } = require('pdf-lib')
const { pathToFileURL } = require('node:url')
const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-orientation-'))
const file = path.join(folder, 'orientation.md')
const sample = '---\nlayout: simple\ntheme: voltage\n---\n\n# Wide document\n\nFirst page content.\n\n<!-- pagebreak -->\n\n## Second page\n\nFinal content.'
fs.writeFileSync(file, sample)
fs.writeFileSync(path.join(folder, 'recent-documents.json'), JSON.stringify([file]))
app.setPath('userData', folder)
const pdf = path.join(folder, 'landscape.pdf')
dialog.showSaveDialog = async () => ({ canceled: false, filePath: pdf })
BrowserWindow.prototype.show = function () {}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = (win, code) => win.webContents.executeJavaScript(code)
async function ready(win, orientation, marker) {
  for (let i = 0; i < 250; i++) {
    if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && ${orientation === 'landscape' ? "document.querySelector('.cm-content')?.cmTile.view.state.doc.toString().includes('orientation: landscape')" : "!document.querySelector('.cm-content')?.cmTile.view.state.doc.toString().includes('orientation: landscape')"} && document.querySelector('.pagination-output')?.textContent.includes(${JSON.stringify(marker)}) && Array.from(document.querySelectorAll('.pagination-output .pagedjs_page')).every(page => ${orientation === 'landscape' ? 'page.getBoundingClientRect().width > page.getBoundingClientRect().height' : 'page.getBoundingClientRect().width < page.getBoundingClientRect().height'})`)) return
    await delay(100)
  }
  throw new Error('Orientation did not update: ' + orientation)
}
async function choose(win, orientation) {
  await js(win, `Array.from(document.querySelectorAll('.editor-toolbar button')).find(button => button.textContent.trim() === 'Document').click()` )
  await js(win, `(() => { const select = document.querySelector('.document-properties [name=orientation]'); select.value = '${orientation}'; select.dispatchEvent(new Event('change', {bubbles:true})); })()` )
  await js(win, `document.querySelector('.document-properties form').requestSubmit()` )
}
async function edit(win, content) {
  await js(win, `(() => { const editor = document.querySelector('.cm-content').cmTile.view; editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:${JSON.stringify(content)}}}); })()`)
}
app.whenReady().then(async () => {
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href)
  let win
  for (let i = 0; !(win = BrowserWindow.getAllWindows()[0]) && i < 60; i++) await delay(100)
  try {
    await ready(win, 'portrait', 'Final content.')
    await choose(win, 'landscape')
    await ready(win, 'landscape', 'Final content.')
    assert.equal(await js(win, `document.querySelectorAll('.toolbar .orientation-picker, .toolbar .layout-picker').length`), 0)
    await choose(win, 'portrait')
    await ready(win, 'portrait', 'Final content.')
    await choose(win, 'landscape')
    await ready(win, 'landscape', 'Final content.')
    const source = await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`)
    assert.match(source, /orientation: landscape/)
    const saved = await js(win, `window.folio.saveMarkdown(${JSON.stringify(file)}, ${JSON.stringify(source)})`)
    assert.equal(saved.canceled, false)
    assert.match(fs.readFileSync(file, 'utf8'), /orientation: landscape/)
    const count = await js(win, `document.querySelectorAll('.pagination-output .pagedjs_page').length`)
    assert.equal(count, 2)
    assert.ok(await js(win, `document.querySelector('.preview-scroll').scrollWidth <= document.querySelector('.preview-scroll').clientWidth + 2`), 'Landscape must fit page width without horizontal overflow')
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '1 / 2')
    await js(win, `document.querySelector('.preview-control-group button[title="Next page"]').click()`)
    await delay(200)
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '2 / 2')
    await js(win, `document.querySelector('.preview-control-group button[title="Previous page"]').click()`)
    await delay(200)
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '1 / 2')
    const exported = await js(win, `window.folio.exportPdf(${JSON.stringify(source)}, 'landscape', 'voltage')`)
    assert.equal(exported.canceled, false)
    const output = await PDFDocument.load(fs.readFileSync(pdf))
    assert.equal(output.getPageCount(), count)
    for (const page of output.getPages()) {
      const rotated = page.getRotation().angle % 180 !== 0
      const width = rotated ? page.getHeight() : page.getWidth()
      const height = rotated ? page.getWidth() : page.getHeight()
      assert.ok(width > height, 'PDF must display as landscape')
    }
    // Layout edits show the appropriate frontmatter fields and apply only on submission.
    const beforeLayout = await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`)
    await js(win, `Array.from(document.querySelectorAll('.editor-toolbar button')).find(button => button.textContent.trim() === 'Document').click()` )
    await js(win, `(() => { const select = document.querySelector('.document-properties [name=layout]'); select.value = 'scientific'; select.dispatchEvent(new Event('change', {bubbles:true})); })()` )
    assert.equal(await js(win, `!!document.querySelector('.document-properties [name=authors]')`), true)
    assert.equal(await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`), beforeLayout)
    await js(win, `Array.from(document.querySelectorAll('.document-properties button')).find(button => button.textContent === 'Cancel').click()` )
    assert.equal(await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`), beforeLayout)
    await js(win, `Array.from(document.querySelectorAll('.editor-toolbar button')).find(button => button.textContent.trim() === 'Document').click()` )
    await js(win, `(() => { const select = document.querySelector('.document-properties [name=layout]'); select.value = 'scientific'; select.dispatchEvent(new Event('change', {bubbles:true})); })()` )
    await js(win, `(() => { const input = document.querySelector('.document-properties [name=authors]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Test Author'); input.dispatchEvent(new Event('input', {bubbles:true})); })()` )
    await js(win, `document.querySelector('.document-properties form').requestSubmit()` )
    for (let i = 0; i < 100; i++) { if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('.pagination-output .scientific-authors')`)) break; await delay(100) }
    assert.match(await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`), /layout: scientific/)
    assert.equal(await js(win, `document.querySelector('.pagination-output .scientific-authors').textContent`), 'Test Author')
    // All templates support whole-document orientation, including the report cover.
    const cases = [['scientific', 'scientific'], ['cv', 'scientific'], ['invoice', 'scientific'], ...['editorial', 'voltage', 'graphite', 'contrast', 'slate', 'nocturne', 'scientific'].map(theme => ['report', theme])]
    for (const [layout, theme] of cases) {
      const content = '---\nlayout: ' + layout + '\norientation: landscape\ntheme: ' + theme + '\ntoc: false\nauthors: Test Author\nabstract: Summary.\n---\n\n# Wide template\n\nFinal template content.'
      await edit(win, content)
      await ready(win, 'landscape', 'Final template content.')
      const metrics = await js(win, `Array.from(document.querySelectorAll('.pagination-output .pagedjs_page')).map(page => { const r = page.getBoundingClientRect(); return { width:r.width, height:r.height, blank: !page.querySelector('.pagedjs_page_content').textContent.trim() }; })`)
      assert.ok(metrics.length <= 2, JSON.stringify({layout, metrics}))
      assert.ok(metrics.every(page => !page.blank), JSON.stringify({layout, metrics}))
      const errors = await js(win, `(() => { const problems = []; for (const page of document.querySelectorAll('.pagination-output .pagedjs_page')) { const area = page.querySelector('.pagedjs_area').getBoundingClientRect(); for (const block of page.querySelectorAll('h1, h2, .document-body p, .scientific-abstract p')) { const range = document.createRange(); range.selectNodeContents(block); const r = range.getBoundingClientRect(); if (r.width && r.left < area.right - 1 && (r.bottom > area.bottom + 1 || r.right > area.right + 1)) problems.push(block.textContent); } } return problems; })()`)
      assert.deepEqual(errors, [], layout + ':' + theme)
      if (layout === 'report' && theme === 'scientific') {
        await js(win, `window.folio.exportPdf(${JSON.stringify(content)}, 'landscape-cover', 'scientific')`)
        const reportPdf = await PDFDocument.load(fs.readFileSync(pdf))
        assert.equal(reportPdf.getPageCount(), metrics.length)
        for (const page of reportPdf.getPages()) assert.equal(page.getRotation().angle % 180, 90)
      }
    }
    await choose(win, 'portrait')
    await ready(win, 'portrait', 'Final template content.')
    console.log('Page orientation passed (visible control, live switching, all templates, save persistence, landscape PDF)')
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally { win.destroy(); app.exit(process.exitCode || 0) }
})
