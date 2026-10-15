// Exports documents through the real window/menu pipeline as PNG images and
// checks the sibling file set, the stitched long image, and their pixel sizes.
const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-png-export-'))
fs.writeFileSync(path.join(folder, 'recent-documents.json'), JSON.stringify([]))
app.setPath('userData', folder)
const destinations = []
const destination = () => destinations[destinations.length - 1]
dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination() })
BrowserWindow.prototype.show = function () {}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = (win, code) => win.webContents.executeJavaScript(code)

function pngSize(file) {
  const bytes = fs.readFileSync(file)
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${file} must start with a PNG signature`)
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${file} must start with an IHDR chunk`)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

const twoPager = '---\nlayout: simple\ntheme: voltage\n---\n\n# Two pages\n\nFirst page content.\n\n<!-- pagebreak -->\n\n## Second page\n\nFinal content.'
const onePager = '---\nlayout: simple\ntheme: voltage\n---\n\n# One page\n\nOnly content.'

async function ready(win, marker) {
  for (let i = 0; i < 250; i++) {
    if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('.pagination-output')?.textContent.includes(${JSON.stringify(marker)})`)) return
    await delay(100)
  }
  throw new Error('Pagination did not settle: ' + marker)
}

async function edit(win, content) {
  await js(win, `(() => { const editor = document.querySelector('.cm-content').cmTile.view; editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:${JSON.stringify(content)}}}); })()`)
}

async function exportPng(win, source, options) {
  return js(win, `window.folio.exportPng(${JSON.stringify(source)}, 'deck', 'voltage', undefined, undefined, undefined, ${JSON.stringify(options)})`)
}

// A4 is 595.28 x 841.89 pt; the rasterizer ceil()s the scaled viewport, so the
// expected pixel sizes carry a small tolerance instead of exact equality.
function expectNear(actual, expected, file) {
  assert.ok(Math.abs(actual - expected) <= 2, `${file}: expected ~${expected}, got ${actual}`)
}

app.whenReady().then(async () => {
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href)
  let win
  for (let i = 0; !(win = BrowserWindow.getAllWindows()[0]) && i < 60; i++) await delay(100)
  try {
    await edit(win, twoPager)
    await ready(win, 'Final content.')
    const pageCount = await js(win, `document.querySelectorAll('.pagination-output .pagedjs_page').length`)
    assert.equal(pageCount, 2)
    const source = await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`)

    destinations.push(path.join(folder, 'deck.png'))
    const result = await exportPng(win, source, { scale: 2, stitched: true })
    assert.equal(result.canceled, false)
    assert.deepEqual(result.paths.map(file => path.basename(file)), ['deck-1.png', 'deck-2.png'], 'sibling files are numbered beside the destination')
    assert.equal(result.stitchedPath, path.join(folder, 'deck-long.png'))
    const pageHeights = []
    for (const file of result.paths) {
      const { width, height } = pngSize(file)
      expectNear(width, 1191, file)
      expectNear(height, 1684, file)
      pageHeights.push(height)
    }
    const stitched = pngSize(result.stitchedPath)
    expectNear(stitched.width, 1191, result.stitchedPath)
    expectNear(stitched.height, pageHeights[0] + pageHeights[1], result.stitchedPath)

    // Lower resolution lands on the A4 point size, and pages-only exports skip
    // the stitched file entirely.
    destinations.push(path.join(folder, 'small.png'))
    const small = await exportPng(win, source, { scale: 1, stitched: false })
    assert.equal(small.canceled, false)
    assert.deepEqual(small.paths.map(file => path.basename(file)), ['small-1.png', 'small-2.png'])
    assert.equal(small.stitchedPath, undefined)
    assert.ok(!fs.existsSync(path.join(folder, 'small-long.png')), 'pages-only export must not write a stitched image')

    // A single page is its own stitched image, so none is written.
    await edit(win, onePager)
    await ready(win, 'Only content.')
    const singleSource = await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`)
    destinations.push(path.join(folder, 'solo.png'))
    const single = await exportPng(win, singleSource, { scale: 2, stitched: true })
    assert.equal(single.canceled, false)
    assert.deepEqual(single.paths.map(file => path.basename(file)), ['solo-1.png'])
    assert.equal(single.stitchedPath, undefined)
    assert.ok(!fs.existsSync(path.join(folder, 'solo-long.png')), 'single-page export must not duplicate the page as a stitched image')

    console.log('PNG export passed (sibling files, stitched long image, scale factor, single page)')
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally { win.destroy(); app.exit(process.exitCode || 0) }
})
