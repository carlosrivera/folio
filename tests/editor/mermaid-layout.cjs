const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PDFDocument } = require('pdf-lib')
const { pathToFileURL } = require('node:url')
const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-mermaid-'))
const file = path.join(folder, 'petstore.md')
// Evaluate the trusted template literal so the regression stays tied to the shipped sample.
// Sliced by position: the sample contains fenced code blocks, so no backtick
// regex can find the literal's true end — only the next export declaration can.
const source = fs.readFileSync(path.join(root, 'src/lib/sample.ts'), 'utf8')
const marker = 'export const samplePetstoreDocument = `'
const literalStart = source.indexOf(marker)
if (literalStart === -1) throw new Error('sample.ts is missing samplePetstoreDocument')
const from = literalStart + marker.length
const nextExport = source.indexOf('\nexport const ', from)
const literalEnd = source.lastIndexOf('`', nextExport === -1 ? source.length : nextExport)
if (literalEnd <= from) throw new Error('sample.ts no longer holds a samplePetstoreDocument template literal')
const sample = new Function('return `' + source.slice(from, literalEnd) + '`')()
fs.writeFileSync(file, sample)
fs.writeFileSync(path.join(folder, 'recent-documents.json'), JSON.stringify([file]))
app.setPath('userData', folder)
const pdf = path.join(folder, 'petstore.pdf')
dialog.showSaveDialog = async () => ({ canceled: false, filePath: pdf })
BrowserWindow.prototype.show = function () {}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = (win, code) => win.webContents.executeJavaScript(code)
async function ready(win, marker) {
  for (let i = 0; i < 250; i++) {
    if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('.pagination-output .mermaid-diagram svg') && document.querySelector('.pagination-output').textContent.includes(${JSON.stringify(marker)})`)) return
    await delay(100)
  }
  throw new Error('Mermaid preview did not render')
}
async function geometry(win) {
  return js(win, `(() => {
    const diagrams = [], problems = [];
    for (const figure of document.querySelectorAll('.pagination-output .mermaid-figure')) {
      const svg = figure.querySelector('svg'); if (!svg) continue;
      const rect = svg.getBoundingClientRect(), box = figure.getBoundingClientRect();
      const area = figure.closest('.pagedjs_page').querySelector('.pagedjs_area').getBoundingClientRect();
      if (box.left >= area.right - 1) continue;
      diagrams.push({ svg: { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }, figure: { top: box.top, bottom: box.bottom, height: box.height }, area: { top: area.top, bottom: area.bottom } });
      if (rect.top < box.top - 1 || rect.bottom > box.bottom + 1) problems.push('Diagram escapes its figure');
      if (rect.left < area.left - 1 || rect.right > area.right + 1 || rect.top < area.top - 1 || rect.bottom > area.bottom + 1) problems.push('Diagram escapes the page');
      for (const block of figure.closest('.pagedjs_page').querySelectorAll('.document-body p, .document-body h2, .document-body h3, .document-body table, .document-body pre')) {
        if (figure.contains(block)) continue;
        const range = document.createRange(); range.selectNodeContents(block);
        for (const text of range.getClientRects()) {
          if (Math.min(rect.right, text.right) - Math.max(rect.left, text.left) > 1 && Math.min(rect.bottom, text.bottom) - Math.max(rect.top, text.top) > 1) { problems.push('Diagram overlaps ' + block.textContent.slice(0, 45)); break; }
        }
      }
    }
    return { diagrams, problems };
  })()`)
}
app.whenReady().then(async () => {
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href)
  let win
  for (let i = 0; !(win = BrowserWindow.getAllWindows()[0]) && i < 60; i++) await delay(100)
  try {
    await ready(win, 'Integration checklist')
    const initial = await geometry(win)
    assert.equal(initial.diagrams.length, 1)
    assert.deepEqual(initial.problems, [])
    await js(win, `(() => { const editor = document.querySelector('.cm-content').cmTile.view; editor.dispatch({ changes: { from: editor.state.doc.length, insert: '\\n\\nLive diagram update.' } }); })()`)
    await ready(win, 'Live diagram update.')
    const updated = await geometry(win)
    assert.equal(updated.diagrams.length, 1)
    assert.deepEqual(updated.problems, [])
    const pageCount = await js(win, `document.querySelectorAll('.pagination-output .pagedjs_page').length`)
    const exported = await js(win, `window.folio.exportPdf(document.querySelector('.cm-content').cmTile.view.state.doc.toString(), 'petstore', 'slate')`)
    assert.equal(exported.canceled, false)
    assert.equal((await PDFDocument.load(fs.readFileSync(pdf))).getPageCount(), pageCount)
    const tall = '---\nlayout: simple\ntheme: voltage\n---\n\n# Tall diagram\n\nBefore the diagram.\n\n```mermaid\nflowchart TB\n' + Array.from({length: 35}, (_, i) => `N${i}[Step ${i}] --> N${i + 1}[Step ${i + 1}]`).join('\n') + '\n```\n\nAfter the tall diagram.'
    await js(win, `(() => { const editor = document.querySelector('.cm-content').cmTile.view; editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert: ${JSON.stringify(tall)}}}); })()`)
    await ready(win, 'After the tall diagram.')
    const tallGeometry = await geometry(win)
    assert.equal(tallGeometry.diagrams.length, 1, JSON.stringify(tallGeometry))
    assert.deepEqual(tallGeometry.problems, [])
    console.log('Mermaid layout passed (Petstore, live edits, page bounds, text separation, tall diagrams, PDF)')
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally { win.destroy(); app.exit(process.exitCode || 0) }
})
