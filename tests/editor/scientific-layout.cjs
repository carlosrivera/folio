const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PDFDocument } = require('pdf-lib')
const { pathToFileURL } = require('node:url')
const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-scientific-'))
const file = path.join(folder, 'article.md')
const literal = fs.readFileSync(path.join(root, 'src/lib/sample.ts'), 'utf8').match(/export const scientificStarterDocument = (`[\s\S]*?`)\s*\n/)[1]
const sample = new Function(`return ${literal}`)()
fs.writeFileSync(file, sample)
fs.writeFileSync(path.join(folder, 'recent-documents.json'), JSON.stringify([file]))
app.setPath('userData', folder)
const pdf = path.join(folder, 'article.pdf')
dialog.showSaveDialog = async () => ({ canceled: false, filePath: pdf })
BrowserWindow.prototype.show = function () {}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = (win, code) => win.webContents.executeJavaScript(code)
async function ready(win, marker) {
  for (let i = 0; i < 250; i++) {
    if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('.pagination-output .scientific-document') && document.querySelector('.pagination-output').textContent.includes(${JSON.stringify(marker)})`)) return
    await delay(100)
  }
  throw new Error('Scientific preview did not render')
}
async function inspect(win) {
  return js(win, `(() => {
    const output = document.querySelector('.pagination-output');
    const problems = [];
    for (const page of output.querySelectorAll('.pagedjs_page')) {
      const area = page.querySelector('.pagedjs_area').getBoundingClientRect();
      const blocks = Array.from(page.querySelectorAll('.scientific-title-block h1, .scientific-title-block p, .scientific-abstract h2, .scientific-abstract p, .scientific-keywords, .scientific-body h2, .scientific-body h3, .scientific-body p'));
      const rects = blocks.map(block => { const range = document.createRange(); range.selectNodeContents(block); return { text: block.textContent, rect: range.getBoundingClientRect() }; }).filter(item => item.rect.width > 0 && item.rect.left < area.right - 1);
      for (const item of rects) {
        const r = item.rect;
        if (r.left < area.left - 1 || r.right > area.right + 1 || r.top < area.top - 1 || r.bottom > area.bottom + 1) problems.push('Outside page: ' + item.text);
      }
      for (let i = 1; i < rects.length; i++) if (rects[i].rect.top < rects[i-1].rect.bottom - 1) problems.push('Overlapping text: ' + rects[i].text);
    }
    const heading = output.querySelector('.scientific-title-block h1');
    return { problems, pages: output.querySelectorAll('.pagedjs_page').length, covers: output.querySelectorAll('.folio-cover-sheet').length, titles: output.querySelectorAll('.scientific-title-block h1').length, firstPage: output.querySelector('.pagedjs_page').textContent, font: getComputedStyle(heading).fontFamily };
  })()`)
}
app.whenReady().then(async () => {
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href)
  let win
  for (let i = 0; !(win = BrowserWindow.getAllWindows()[0]) && i < 60; i++) await delay(100)
  try {
    await ready(win, 'References')
    const initial = await inspect(win)
    assert.equal(initial.titles, 1)
    assert.equal(initial.covers, 0)
    assert.match(initial.font, /Georgia/)
    assert.match(initial.firstPage, /First Author, Second Author/)
    assert.match(initial.firstPage, /Abstract/)
    assert.match(initial.firstPage, /1. Introduction/)
    assert.deepEqual(initial.problems, [])
    const long = sample + '\n\n## Appendix\n\n' + Array.from({length: 32}, (_, i) => 'Supplement ' + i + '. ' + 'Reproducible methods and observations are described in this supplementary paragraph. '.repeat(6)).join('\n\n') + '\n\nEnd of supplement.'
    await js(win, `(() => { const editor = document.querySelector('.cm-content').cmTile.view; editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:${JSON.stringify(long)}}}); })()`)
    await ready(win, 'End of supplement.')
    const updated = await inspect(win)
    assert.ok(updated.pages > 1)
    assert.equal(updated.titles, 1)
    assert.equal(updated.covers, 0)
    assert.deepEqual(updated.problems, [])
    const exported = await js(win, `window.folio.exportPdf(document.querySelector('.cm-content').cmTile.view.state.doc.toString(), 'article', 'scientific')`)
    assert.equal(exported.canceled, false)
    const document = await PDFDocument.load(fs.readFileSync(pdf))
    assert.equal(document.getPageCount(), updated.pages)
    assert.equal(document.getTitle(), 'Title of Your Article')
    assert.equal(document.getAuthor(), 'First Author, Second Author')
    await win.capturePage().then(image => fs.writeFileSync('/tmp/folio-scientific-preview.png', image.toPNG()))
    console.log('Scientific article passed (title, authors, abstract, first-page body, live pagination, page bounds, PDF metadata)')
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally { win.destroy(); app.exit(process.exitCode || 0) }
})
