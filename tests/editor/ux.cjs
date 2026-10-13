const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-ux-'))
const originalPath = path.join(folder, 'document.md')
const renamedPath = path.join(folder, 'elsewhere', 'renamed.md')
const pdfPath = path.join(folder, 'document.pdf')
fs.mkdirSync(path.dirname(renamedPath))
fs.writeFileSync(originalPath, '# UX document\n\nLabel\n\nFirst paragraph.\n\nSecond paragraph.\n')
fs.writeFileSync(path.join(folder, 'recent-documents.json'), JSON.stringify([originalPath]))
app.setPath('userData', folder)
BrowserWindow.prototype.show = function () {}
let markdownSaveDialogs = 0
dialog.showSaveDialog = async (_window, options) => {
  if (!/PDF/i.test(options.title)) markdownSaveDialogs++
  return { canceled: false, filePath: /PDF/i.test(options.title) ? pdfPath : renamedPath }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = (win, code) => win.webContents.executeJavaScript(code)
async function until(win, condition, message, attempts = 180) {
  for (let i = 0; i < attempts; i++) {
    if (await js(win, condition)) return
    await delay(100)
  }
  throw new Error(message)
}
async function click(win, selector, text) {
  await js(win, `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(x => x.textContent.trim() === ${JSON.stringify(text)}).click()`)
  await delay(80)
}
async function setInput(win, selector, value) {
  await js(win, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, ${JSON.stringify(String(value))}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await delay(80)
}
async function setDocument(win, text, from = 0, to = from) {
  await js(win, `(() => { const view = document.querySelector('.cm-content').cmTile.view; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: ${JSON.stringify(text)} }, selection: { anchor: ${from}, head: ${to} } }); view.focus(); })()`)
  await delay(100)
}
const editorText = win => js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`)
async function insert(win, kind) {
  await js(win, `document.querySelector('.editor-insert-menu').open = true`)
  await click(win, '.editor-insert-menu button', kind)
  await until(win, `!!document.querySelector('.insert-dialog[open]')`, 'Insert dialog missing')
}
async function preference(settings, label, value) {
  // Sections have independent child indexes; assign an id using the observed label.
  await js(settings, `Array.from(document.querySelectorAll('.settings-row')).find(x => x.textContent.startsWith(${JSON.stringify(label)})).querySelector('input').id = 'ux-preference'`)
  if (typeof value === 'boolean') {
    await js(settings, `(() => { const input = document.querySelector('#ux-preference'); if (input.checked !== ${value}) input.click(); })()`)
  } else await setInput(settings, '#ux-preference', value)
  await js(settings, `document.querySelector('#ux-preference').removeAttribute('id')`)
  await delay(150)
}

app.whenReady().then(async () => {
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href)
  for (let i = 0; !BrowserWindow.getAllWindows().length && i < 60; i++) await delay(100)
  const win = BrowserWindow.getAllWindows()[0]
  try {
    await until(win, `!!document.querySelector('.cm-content') && !document.querySelector('.welcome-overlay')`, 'Document did not open')
    await until(win, `document.querySelector('.document-title')?.textContent.includes('document.md')`, 'Startup path missing')

    const source = '# UX document\n\nLabel\n\nFirst paragraph.\n\nSecond paragraph.\n'
    const from = source.indexOf('Label')
    await setDocument(win, source, from, from + 5)
    await click(win, '.editor-toolbar button', 'B')
    assert.match(await editorText(win), /\*\*Label\*\*/)
    assert.equal(await js(win, `document.querySelector('[aria-label="Bold"]').getAttribute('aria-pressed')`), 'true')
    await click(win, '.editor-toolbar button', 'B')
    assert.equal(await editorText(win), source)
    await setInput(win, '[aria-label="Heading level"]', 'heading-6')
    assert.match(await editorText(win), /###### Label/)

    await setDocument(win, source, from, from + 5)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    await until(win, `!!document.querySelector('.insert-dialog[open]')`, 'Link shortcut did not open dialog')
    await setInput(win, '.insert-dialog label:nth-of-type(2) input', 'https://example.com/a b')
    await click(win, '.insert-dialog button', 'Insert')
    assert.match(await editorText(win), /\[Label\]\(<https:\/\/example.com\/a b>\)/)
    await setDocument(win, source, from, from + 5)
    await js(win, `(() => { const data = new DataTransfer(); data.setData('text/plain', 'https://example.com'); document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); })()`)
    assert.match(await editorText(win), /\[Label\]\(<?https:\/\/example.com>?\)/)

    await setDocument(win, '# UX document\n\n', 15)
    await insert(win, 'Table')
    await setInput(win, '.insert-table-size label:nth-child(1) input', '2')
    await setInput(win, '.insert-table-size label:nth-child(2) input', '3')
    await click(win, '.insert-dialog button', 'Insert')
    let tableText = await editorText(win)
    assert.equal(tableText.split('\n').filter(line => line.startsWith('|')).length, 4)
    assert.match(tableText, /Column 3/)
    await js(win, `(() => { const view = document.querySelector('.cm-content').cmTile.view; const anchor = view.state.doc.toString().indexOf('Column 1'); view.dispatch({ selection: { anchor } }); view.focus(); })()`)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
    await delay(100)
    assert.equal(await js(win, `(() => { const view = document.querySelector('.cm-content').cmTile.view; return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to); })()`), 'Column 2')
    await js(win, `Array.from(document.querySelectorAll('.editor-insert-menu')).find(x => x.querySelector('summary').textContent === 'Table').open = true`)
    await click(win, '.editor-insert-menu button', 'add column')
    assert.equal((await editorText(win)).split('\n').find(line => line.startsWith('|')).split('|').length, 6)

    await setDocument(win, source, source.length)
    const bytes = [...fs.readFileSync(path.join(root, 'build/icon.png'))]
    await js(win, `(() => { const data = new DataTransfer(); data.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})], 'folio.png', { type: 'image/png' })); document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); })()`)
    await until(win, `!!document.querySelector('.insert-dialog[open]')`, 'Pasted image did not open dialog')
    await setInput(win, '.insert-dialog label:nth-of-type(1) input', 'Folio icon')
    await click(win, '.insert-dialog button', 'Insert')
    await until(win, `!document.querySelector('.insert-dialog')`, 'Image import did not finish')
    assert.match(await editorText(win), /!\[Folio icon\]\(<\.assets\/document\//)
    await until(win, `Array.from(document.querySelectorAll('.pagination-output img')).some(x => x.alt === 'Folio icon' && x.naturalWidth > 0)`, 'Imported image failed in preview')
    assert.equal(await js(win, `(() => { const image = Array.from(document.querySelectorAll('.pagination-output img')).find(x => x.alt === 'Folio icon'); const box = image.getBoundingClientRect(); const page = image.closest('.pagedjs_area').getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.left >= page.left - 1 && box.right <= page.right + 1 && box.top >= page.top - 1 && box.bottom <= page.bottom + 1; })()`), true, 'Imported image overflows the printable page')
    win.webContents.send('menu:command', 'save')
    await until(win, `document.querySelector('.editor-status')?.textContent.startsWith('Saved')`, 'Save did not finish')
    assert.equal(fs.readFileSync(originalPath, 'utf8'), await editorText(win))

    await js(win, `document.querySelector('[aria-label="Editor pane width"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
    await delay(100)
    assert.equal(await js(win, `localStorage.getItem('folio:editor:pane-width')`), '48')
    assert.ok(await js(win, `document.querySelector('.view-switcher').getBoundingClientRect().width <= 90`), 'View switcher is too wide')
    await js(win, `document.querySelector('[aria-label="Preview only"]').click()`)
    await delay(100)
    assert.equal(await js(win, `getComputedStyle(document.querySelector('.editor-pane')).display`), 'none')
    await until(win, `Array.from(document.querySelectorAll('.pagination-output p[data-source-from]')).some(x => x.textContent.trim() === 'Second paragraph.')`, 'Paragraph mapping missing')
    await js(win, `Array.from(document.querySelectorAll('.pagination-output p[data-source-from]')).find(x => x.textContent.trim() === 'Second paragraph.').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.workspace').dataset.mode`), 'preview', 'Reading a paragraph unexpectedly reopened split view')
    await js(win, `document.querySelector('[aria-label="Split view"]').click()`)
    await delay(100)
    await js(win, `window.getSelection().removeAllRanges(); Array.from(document.querySelectorAll('.pagination-output p[data-source-from]')).find(x => x.textContent.trim() === 'Second paragraph.').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.cm-content').cmTile.view.state.selection.main.from`), source.indexOf('Second paragraph.'))
    await js(win, `document.querySelector('[aria-label="Editor only"]').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.preview-pane').inert && document.querySelector('.preview-pane').getBoundingClientRect().right < 0`), true)
    await js(win, `document.querySelector('[aria-label="Split view"]').click()`)
    await delay(100)
    win.setSize(1040, 920)
    for (let i = 0; i < 14; i++) {
      await js(win, `document.querySelector('[aria-label="Editor pane width"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
      await delay(20)
    }
    const geometry = await js(win, `(() => { const workspace = document.querySelector('.workspace').getBoundingClientRect(); const editor = document.querySelector('.editor-pane').getBoundingClientRect(); const preview = document.querySelector('.preview-pane').getBoundingClientRect(); return { total: workspace.width - 6, editor: editor.width, preview: preview.width, right: preview.right, window: innerWidth }; })()`)
    assert.ok(Math.abs(geometry.editor / geometry.total - 0.75) < 0.01, 'Divider does not respect the pane ratio')
    assert.ok(geometry.right <= geometry.window + 1, 'Panes overflow the window')
    await js(win, `document.querySelector('[aria-label="Editor pane width"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await delay(100)
    await js(win, `document.querySelector('[aria-label="Editor pane width"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
    win.setSize(1440, 920)
    await delay(100)
    const beforeSwitch = await editorText(win)
    for (const label of ['Editor only', 'Preview only', 'Split view', 'Preview only', 'Split view']) {
      await js(win, `document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`)
      await delay(60)
    }
    assert.equal(await editorText(win), beforeSwitch, 'Switching views changed the document')
    await js(win, `document.querySelector('[aria-label="Editor only"]').click()`)
    const longWord = 'VeryLongWord'.repeat(100)
    const code = `const value = "${'x'.repeat(240)}";\nconsole.log(value);`
    const longDocument = beforeSwitch + '\n\n' + longWord + '\n\n```javascript\n' + code + '\n```\n\n' + Array.from({ length: 40 }, (_, i) => `## Section ${i + 1}\n\n${'A paragraph written while the preview is hidden. '.repeat(8)}\n\n`).join('')
    await setDocument(win, longDocument)
    await until(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.pagination-output .pagedjs_page').length > 3 && document.querySelector('.pagination-output')?.textContent.includes('Section 40')`, 'Preview failed to paginate edits in editor-only mode')
    await js(win, `document.querySelector('[aria-label="Preview only"]').click()`)
    await delay(100)
    assert.equal(await js(win, `document.querySelector('.preview-pane').inert`), false)
    assert.ok(await js(win, `document.querySelectorAll('.pagination-output .pagedjs_page').length > 3`))
    assert.equal(await js(win, `!!document.querySelector('.pagination-output pre .hljs-keyword') && !!document.querySelector('.pagination-output pre .hljs-string')`), true, 'Code fence has no syntax highlighting')
    assert.equal(await js(win, `Array.from(document.querySelectorAll('.pagination-output pre code')).some(x => x.textContent.trim() === ${JSON.stringify(code)})`), true, 'Code fence did not render as code')
    assert.equal(await js(win, `(() => { const blocks = Array.from(document.querySelectorAll('.pagination-output p, .pagination-output pre')).filter(x => x.textContent.includes('VeryLongWord') || x.tagName === 'PRE'); return blocks.length >= 2 && blocks.every(block => { const area = block.closest('.pagedjs_area').getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(block); return Array.from(range.getClientRects()).filter(rect => rect.left < area.right && rect.right > area.left).every(rect => rect.right <= area.right + 1 && rect.left >= area.left - 1); }); })()`), true, 'Long prose/code overflows page margins')
    await js(win, `document.querySelector('[aria-label="Split view"]').click()`)
    await setDocument(win, beforeSwitch)

    await js(win, `document.querySelector('[aria-label="Settings"]').click()`)
    for (let i = 0; BrowserWindow.getAllWindows().length < 2 && i < 60; i++) await delay(100)
    const settings = BrowserWindow.getAllWindows().find(candidate => candidate !== win)
    await until(settings, `!!document.querySelector('.settings-window')`, 'Settings missing')
    await preference(settings, 'Font size', 20)
    await preference(settings, 'Line spacing', 1.8)
    await preference(settings, 'Text width', 72)
    await preference(settings, 'Spellcheck', false)
    assert.equal(await js(win, `getComputedStyle(document.querySelector('.cm-scroller')).fontSize`), '20px')
    assert.equal(await js(win, `getComputedStyle(document.querySelector('.cm-line')).lineHeight`), '36px')
    assert.equal(await js(win, `document.querySelector('.cm-content').spellcheck`), false)
    assert.equal(await js(win, `localStorage.getItem('folio:editor:text-width')`), '72')
    await preference(settings, 'Autosave existing files', true)
    const autosaved = (await editorText(win)) + '\nAutosaved paragraph.\n'
    await setDocument(win, autosaved, autosaved.length)
    await until(win, `document.querySelector('.editor-status')?.textContent.startsWith('Saved')`, 'Autosave did not finish')
    assert.equal(fs.readFileSync(originalPath, 'utf8'), autosaved)
    await until(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('.pagination-output')?.textContent.includes('Autosaved paragraph.')`, 'Text after image did not render')
    assert.equal(await js(win, `(() => { const image = Array.from(document.querySelectorAll('.pagination-output img')).find(x => x.alt === 'Folio icon'); const after = Array.from(document.querySelectorAll('.pagination-output p')).find(x => x.textContent.trim() === 'Autosaved paragraph.'); const pages = Array.from(document.querySelectorAll('.pagination-output .pagedjs_page')); const imagePage = image.closest('.pagedjs_page'), afterPage = after.closest('.pagedjs_page'); const walker = document.createTreeWalker(after, NodeFilter.SHOW_TEXT); let node, textTop = Infinity; while (node = walker.nextNode()) { if (node.textContent.includes('Autosaved paragraph.')) { const range = document.createRange(); range.selectNodeContents(node); textTop = range.getBoundingClientRect().top; break; } } return afterPage === imagePage ? textTop !== Infinity && textTop >= image.getBoundingClientRect().bottom - 1 : pages.indexOf(afterPage) > pages.indexOf(imagePage); })()`), true, 'Image overlaps or hides following text')
    assert.match(await js(win, `document.querySelector('.editor-status').textContent`), /words.*Ln \d+, Col \d+/)

    fs.writeFileSync(originalPath, '# Outside edit\n\nKeep this version.\n')
    await until(win, `!!document.querySelector('.disk-change-banner')`, 'External edit was not detected')
    await setDocument(win, autosaved + '\nMy edit.\n')
    await delay(1800)
    assert.match(fs.readFileSync(originalPath, 'utf8'), /Outside edit/)
    await click(win, '.disk-change-banner button', 'Save my version')
    await until(win, `!document.querySelector('.disk-change-banner')`, 'Overwrite resolution failed')
    assert.match(fs.readFileSync(originalPath, 'utf8'), /My edit/)
    fs.writeFileSync(originalPath, '# Reloaded\n\nExternal paragraph.\n')
    await until(win, `!!document.querySelector('.disk-change-banner')`, 'Second external edit was not detected')
    await click(win, '.disk-change-banner button', 'Reload from disk')
    assert.match(await editorText(win), /External paragraph/)

    await setDocument(win, autosaved, autosaved.length)
    await until(win, `document.querySelector('.editor-status')?.textContent.startsWith('Saved')`, 'Restored file did not autosave')
    win.webContents.send('menu:command', 'save-as')
    await until(win, `document.querySelector('.document-title')?.textContent.includes('renamed.md')`, 'Save As failed')
    await until(win, `Array.from(document.querySelectorAll('.pagination-output img')).some(x => x.alt === 'Folio icon' && x.naturalWidth > 0)`, 'Save As lost image assets')
    const pdf = await js(win, `window.folio.exportPdf(${JSON.stringify(autosaved)}, 'UX document', 'editorial', 'en', ${JSON.stringify(renamedPath)})`)
    assert.equal(pdf.canceled, false)
    assert.equal(fs.readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
    assert.ok(fs.statSync(pdfPath).size > 10000)
    const { PDFDocument, PDFName } = require('pdf-lib')
    const exported = await PDFDocument.load(fs.readFileSync(pdfPath))
    assert.ok(exported.context.enumerateIndirectObjects().some(([, value]) => value.dict?.get(PDFName.of('Subtype')) === PDFName.of('Image')), 'Exported PDF omitted the imported image')
    settings.destroy()
    await win.webContents.reload()
    await until(win, `!!document.querySelector('.cm-content') && document.querySelector('.document-title')?.textContent.includes('renamed.md')`, 'Restart did not reopen the saved document')
    assert.equal(await js(win, `getComputedStyle(document.querySelector('.cm-scroller')).fontSize`), '20px')
    assert.equal(await js(win, `document.querySelector('[aria-label="Editor pane width"]').getAttribute('aria-valuenow')`), '48')
    await until(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && Array.from(document.querySelectorAll('.pagination-output img')).some(x => x.alt === 'Folio icon' && x.naturalWidth > 0)`, 'Reopened preview did not finish')
    await delay(200)
    console.log('Markdown UX desktop flows passed (formatting, insertion, tables, navigation, views, settings, autosave, conflicts, assets, PDF, persistence)')
    if (process.env.FOLIO_UX_SCREENSHOT) fs.writeFileSync(process.env.FOLIO_UX_SCREENSHOT, (await win.webContents.capturePage()).toPNG())
    const embedded = '# Embedded repair\n\n![Old image](data:image/png;base64,' + Buffer.from(bytes).toString('base64') + ')\n'
    await setDocument(win, embedded)
    win.webContents.send('menu:command', 'save')
    await until(win, `!document.querySelector('.cm-content').cmTile.view.state.doc.toString().includes('base64')`, 'Saving did not repair old embedded image Markdown')
    assert.ok(!fs.readFileSync(renamedPath, 'utf8').includes('base64'))
    await until(win, `Array.from(document.querySelectorAll('.pagination-output img')).some(x => x.alt === 'Old image' && x.naturalWidth > 0)`, 'Repaired image did not render')
    await click(win, '.toolbar-actions button', 'New')
    await until(win, `!!document.querySelector('.folio-template-card')`, 'New document picker missing')
    await js(win, `Array.from(document.querySelectorAll('.folio-template-card')).find(x => x.textContent.includes('Simple Markdown')).click()`)
    await until(win, `!document.querySelector('.folio-template-card')`, 'New document was not created')
    await setDocument(win, '# New image document\n\n', 22)
    const dialogsBeforeImport = markdownSaveDialogs
    await js(win, `(() => { const data = new DataTransfer(); data.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})], 'photo.png', { type: 'image/png' })); document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); })()`)
    await until(win, `!!document.querySelector('.insert-dialog[open]')`, 'New document image dialog missing')
    await click(win, '.insert-dialog button', 'Insert')
    await until(win, `!document.querySelector('.insert-dialog')`, 'New document image import failed')
    assert.match(await editorText(win), /!\[photo\]\(<folio-draft:\/\//)
    assert.equal(markdownSaveDialogs, dialogsBeforeImport, 'Pasting an image forced a document save')
    assert.ok(!(await editorText(win)).includes('base64'), 'New document contains an embedded image')
    await until(win, `Array.from(document.querySelectorAll('.pagination-output img')).some(x => x.alt === 'photo' && x.naturalWidth > 0)`, 'New document file image did not render')
    await win.webContents.reload()
    await until(win, `!!document.querySelector('#recover-title')`, 'Draft was not offered for recovery')
    await click(win, '.folio-dialog button', 'Restore draft')
    await until(win, `Array.from(document.querySelectorAll('.pagination-output img')).some(x => x.alt === 'photo' && x.naturalWidth > 0)`, 'Temporary image did not survive draft recovery')
    const draftMarkdown = await editorText(win)
    const draftPdf = await js(win, `window.folio.exportPdf(${JSON.stringify(draftMarkdown)}, 'Draft image', 'editorial', 'en')`)
    assert.equal(draftPdf.canceled, false)
    const draftExport = await PDFDocument.load(fs.readFileSync(pdfPath))
    assert.ok(draftExport.context.enumerateIndirectObjects().some(([, value]) => value.dict?.get(PDFName.of('Subtype')) === PDFName.of('Image')), 'Draft PDF omitted the temporary image')
    win.webContents.send('menu:command', 'save')
    await until(win, `!document.querySelector('.cm-content').cmTile.view.state.doc.toString().includes('folio-draft:')`, 'Saving did not promote temporary images')
    assert.match(await editorText(win), /!\[photo\]\(<\.assets\/renamed\//)
    assert.ok(!fs.readFileSync(renamedPath, 'utf8').includes('folio-draft:'))
    await until(win, `Array.from(document.querySelectorAll('.pagination-output img')).some(x => x.alt === 'photo' && x.naturalWidth > 0)`, 'Saved draft image stopped rendering')
    const imageMarkup = (await editorText(win)).match(/!\[photo\]\(<[^>]+>\)/)[0]
    const mixedImages = '# Image layout stress\n\n' + 'Prose before the image. '.repeat(100) + '\n' + imageMarkup + '\nText immediately after first image.\n' + imageMarkup + '\nText immediately after second image.\n\n<!-- landscape -->\n\nText before landscape image.\n' + imageMarkup + '\nText after landscape image.\n\n<!-- /landscape -->\n\nFinal visible text.'
    await setDocument(win, mixedImages)
    await until(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('.pagination-output')?.textContent.includes('Final visible text.') && document.querySelectorAll('.pagination-output img').length >= 3`, 'Mixed images did not finish pagination')
    const overlaps = await js(win, `(() => {
      const problems = [];
      let visibleImages = 0;
      for (const page of document.querySelectorAll('.pagination-output .pagedjs_page')) {
        const area = page.querySelector('.pagedjs_area').getBoundingClientRect();
        const images = Array.from(page.querySelectorAll('img')).map(x => x.getBoundingClientRect()).filter(rect => rect.left < area.right && rect.right > area.left);
        visibleImages += images.length;
        const walker = document.createTreeWalker(page.querySelector('.pagedjs_page_content'), NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.left >= area.right || rect.right <= area.left || rect.top >= area.bottom || rect.bottom <= area.top) continue;
            if (images.some(image => rect.left < image.right - 1 && rect.right > image.left + 1 && rect.top < image.bottom - 1 && rect.bottom > image.top + 1)) problems.push(node.textContent.slice(0, 80));
          }
        }
        for (const image of images) if (image.bottom > area.bottom + 1 || image.top < area.top - 1 || image.right > area.right + 1) problems.push({ error: 'Image outside page', image: image.toJSON(), area: area.toJSON(), landscape: !!page.querySelector('.folio-landscape') });
      }
      if (visibleImages !== 3) problems.push({ visibleImages });
      return problems;
    })()`)
    if (process.env.FOLIO_IMAGE_SCREENSHOT) { await js(win, `document.querySelectorAll('.pagination-output .pagedjs_page')[2].scrollIntoView({block: 'start'})`); await delay(100); }
    if (process.env.FOLIO_IMAGE_SCREENSHOT) fs.writeFileSync(process.env.FOLIO_IMAGE_SCREENSHOT, (await win.webContents.capturePage()).toPNG())
    assert.deepEqual(overlaps, [], 'Images overlap text or page boundaries')
    await setDocument(win, '# Syntax colors\n\n```javascript\nconst greeting = "Hello"; // comment\nconsole.log(greeting);\n```\n')
    await until(win, `Array.from(document.querySelectorAll('.cm-content span')).some(span => span.textContent === 'const' && getComputedStyle(span).color === 'rgb(198, 160, 239)')`, 'Editor fenced code has no keyword highlighting')
    await until(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('.pagination-output .hljs-keyword')`, 'Highlighted preview missing')
    console.log('Document flows passed (code blocks, long words, image/text layout, temporary image insertion, recovery, PDF, save promotion)')
  } finally {
    BrowserWindow.getAllWindows().forEach(window => window.destroy())
    fs.rmSync(folder, { recursive: true, force: true })
  }
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
