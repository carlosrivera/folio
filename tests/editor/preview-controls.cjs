const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-controls-'))
const file = path.join(folder, 'controls.md')
const sample = `---\nlayout: simple\ntheme: voltage\n---\n\n# Page 1\n\nFirst page body.\n\n<!-- pagebreak -->\n\n# Page 2\n\nSecond page body.\n\n<!-- pagebreak -->\n\n# Page 3\n\nThird page body.`
fs.writeFileSync(file, sample)
fs.writeFileSync(path.join(folder, 'recent-documents.json'), JSON.stringify([file]))
app.setPath('userData', folder)

BrowserWindow.prototype.show = function () {}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = (win, code) => win.webContents.executeJavaScript(code)

app.whenReady().then(async () => {
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href)
  let win
  for (let i = 0; !(win = BrowserWindow.getAllWindows()[0]) && i < 60; i++) await delay(100)

  try {
    // Wait for document to paginate
    for (let i = 0; i < 200; i++) {
      if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.pagination-output .pagedjs_page').length === 3`)) break
      await delay(100)
    }

    // 1. Verify hit-testing: every button in .preview-controls must be directly clickable
    const hitTests = await js(win, `
      Array.from(document.querySelectorAll('.preview-controls button')).map(button => {
        const r = button.getBoundingClientRect()
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return {
          title: button.getAttribute('title') || button.getAttribute('aria-label'),
          targetIsButton: el === button,
          width: r.width,
          height: r.height,
          hitTagName: el?.tagName
        }
      })
    `)

    for (const test of hitTests) {
      assert.ok(test.targetIsButton, `Button "${test.title}" must be hit-test target at center, got ${test.hitTagName}`)
      assert.ok(test.width >= 24, `Button "${test.title}" width should be >= 24px, got ${test.width}`)
      assert.ok(test.height >= 22, `Button "${test.title}" height should be >= 22px, got ${test.height}`)
    }

    // 2. Page Navigation controls
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '1 / 3')
    assert.equal(await js(win, `document.querySelector('.preview-control-group button[title="Previous page"]')?.disabled`), true)
    assert.equal(await js(win, `document.querySelector('.preview-control-group button[title="Next page"]')?.disabled`), false)

    // Click Next page
    await js(win, `document.querySelector('.preview-control-group button[title="Next page"]').click()`)
    await delay(200)
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '2 / 3')
    assert.equal(await js(win, `document.querySelector('.preview-control-group button[title="Previous page"]')?.disabled`), false)

    // Click Next page again
    await js(win, `document.querySelector('.preview-control-group button[title="Next page"]').click()`)
    await delay(200)
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '3 / 3')
    assert.equal(await js(win, `document.querySelector('.preview-control-group button[title="Next page"]')?.disabled`), true)

    // Click Previous page
    await js(win, `document.querySelector('.preview-control-group button[title="Previous page"]').click()`)
    await delay(200)
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '2 / 3')

    // Click Previous page back to page 1
    await js(win, `document.querySelector('.preview-control-group button[title="Previous page"]').click()`)
    await delay(200)
    assert.equal(await js(win, `document.querySelector('.preview-page-readout')?.textContent`), '1 / 3')
    assert.equal(await js(win, `document.querySelector('.preview-scroll').scrollTop`), 0)

    // 3. Zoom controls
    const initialFit = await js(win, `document.querySelector('.preview-control-group button[title="Fit page to width"]')?.getAttribute('aria-pressed')`)
    assert.equal(initialFit, 'true')

    const zoomTextInitial = await js(win, `document.querySelector('.preview-zoom-readout')?.textContent`)
    const initialPercent = parseInt(zoomTextInitial, 10)

    // Click Zoom In
    await js(win, `document.querySelector('.preview-control-group button[title="Zoom in"]').click()`)
    await delay(100)
    const zoomTextAfterIn = await js(win, `document.querySelector('.preview-zoom-readout')?.textContent`)
    const zoomInPercent = parseInt(zoomTextAfterIn, 10)
    assert.ok(zoomInPercent > initialPercent, `Zoom in should increase zoom: initial ${initialPercent} -> in ${zoomInPercent}`)
    assert.equal(await js(win, `document.querySelector('.preview-control-group button[title="Fit page to width"]')?.getAttribute('aria-pressed')`), 'false')

    // Click Zoom Out
    await js(win, `document.querySelector('.preview-control-group button[title="Zoom out"]').click()`)
    await delay(100)
    await js(win, `document.querySelector('.preview-control-group button[title="Zoom out"]').click()`)
    await delay(100)
    const zoomTextAfterOut = await js(win, `document.querySelector('.preview-zoom-readout')?.textContent`)
    const zoomOutPercent = parseInt(zoomTextAfterOut, 10)
    assert.ok(zoomOutPercent < zoomInPercent, `Zoom out should decrease zoom: in ${zoomInPercent} -> out ${zoomOutPercent}`)

    // Click Fit page to width to toggle back on
    await js(win, `document.querySelector('.preview-control-group button[title="Fit page to width"]').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.preview-control-group button[title="Fit page to width"]')?.getAttribute('aria-pressed')`), 'true')
    const zoomFitPercent = parseInt(await js(win, `document.querySelector('.preview-zoom-readout')?.textContent`), 10)
    assert.equal(zoomFitPercent, initialPercent)

    // Click Fit page to width again to toggle off -> resets zoom to 100%
    await js(win, `document.querySelector('.preview-control-group button[title="Fit page to width"]').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.preview-control-group button[title="Fit page to width"]')?.getAttribute('aria-pressed')`), 'false')
    assert.equal(await js(win, `document.querySelector('.preview-zoom-readout')?.textContent`), '100%')

    // 4. Sync scroll toggle
    const syncInitial = await js(win, `document.querySelector('.preview-sync-toggle')?.getAttribute('aria-pressed')`)
    assert.equal(syncInitial, 'true')
    await js(win, `document.querySelector('.preview-sync-toggle').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.preview-sync-toggle')?.getAttribute('aria-pressed')`), 'false')
    await js(win, `document.querySelector('.preview-sync-toggle').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.preview-sync-toggle')?.getAttribute('aria-pressed')`), 'true')

    console.log('Preview controls test passed successfully!')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    win.destroy()
    app.exit(process.exitCode || 0)
  }
})
