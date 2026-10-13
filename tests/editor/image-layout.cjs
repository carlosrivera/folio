const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const root = path.join(__dirname, '../..')
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-image-layout-'))
const file = path.join(folder, 'report.md')
const table = '| Column 1 | Column 2 |\n| --- | --- |\n| asd | ew |\n| asd | ewewrw |\n| sdfsdf|  232342 |\n'
const short = 'werdfsasdas'.repeat(15) + ' ' + 'werdfsasdas'.repeat(25)
const long = Array.from({ length: 4 }, () => 'werdfsasdas'.repeat(28)).join(' ')
const section = table + '\n' + short + '\n\n```js\ncode\ntypesafe\n```\n\n' + long + '\n\n'
fs.copyFileSync(process.env.FOLIO_TEST_IMAGE || path.join(root, 'build/icon.png'), path.join(folder, 'photo.png'))
fs.writeFileSync(file, '---\nlayout: report\ntheme: voltage\n---\n\n# Untitled\n\nStart writing in plain Markdown...\n\nStart writing in plain Markdown...\n\n![wer](<photo.png>)\n\n' + section.repeat(2))
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
    for (let i = 0; i < 200; i++) {
      if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.pagination-output table').length >= 2`)) break
      await delay(100)
    }
    const view = await js(win, `document.querySelector('.cm-content').cmTile.view.state.doc.toString()`);
    await js(win, `(() => { const editor = document.querySelector('.cm-content').cmTile.view; editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert: ${JSON.stringify(view + '\n\nLive update marker.')}}}); })()`);
    for (let i = 0; i < 200; i++) {
      if (await js(win, `document.querySelector('.pagination-stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('.pagination-output')?.textContent.includes('Live update marker.')`)) break;
      await delay(100);
    }
    const report = await js(win, `(() => {
      const problems = [], pages = []; let visibleCode = 0, visibleImages = 0, visibleLetters = 0;
      for (const page of document.querySelectorAll('.pagination-output .pagedjs_page')) {
        const area = page.querySelector('.pagedjs_area').getBoundingClientRect();
        const blocks = Array.from(page.querySelectorAll('.document-body p, .document-body img, .document-body pre, .document-body table'));
        const boxes = blocks.flatMap((block, index) => {
          if (block.matches('img')) return [{ index, kind: 'img', rect: block.getBoundingClientRect(), text: block.alt }];
          const range = document.createRange(); range.selectNodeContents(block);
          return Array.from(range.getClientRects()).map(rect => ({index, kind: block.tagName, rect, text: block.textContent.slice(0, 30)}));
        }).filter(x => x.rect.left < area.right && x.rect.right > area.left && x.rect.top < area.bottom && x.rect.bottom > area.top);
        visibleImages += boxes.filter(x => x.kind === 'img').length;
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const first = boxes[i], second = boxes[j];
          if (first.index === second.index) continue;
          if (first.rect.left < second.rect.right - 1 && first.rect.right > second.rect.left + 1 && first.rect.top < second.rect.bottom - 1 && first.rect.bottom > second.rect.top + 1) problems.push({first: first.text, second: second.text});
        }
        visibleCode += blocks.filter(block => block.tagName === 'PRE' && Array.from(block.getClientRects()).some(rect => rect.left < area.right && rect.right > area.left)).length;
        const walker = document.createTreeWalker(page.querySelector('.document-body') || page, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          for (let offset = 0; offset < node.textContent.length; offset++) {
            if (node.textContent[offset] !== 'w') continue;
            const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1);
            const rect = range.getBoundingClientRect();
            if (rect.left < area.right && rect.right > area.left && rect.top < area.bottom && rect.bottom > area.top) visibleLetters++;
          }
        }
        pages.push({page: page.dataset.pageNumber, boxes: boxes.map(x => ({kind:x.kind,text:x.text,rect:x.rect.toJSON()})), area:area.toJSON()});
      }
      if (visibleImages !== 1) problems.push({visibleImages});
      if (visibleCode !== 2) problems.push({visibleCode});
      return { problems, pages, visibleLetters };
    })()`)
    if (process.env.FOLIO_LAYOUT_OUTPUT) {
      fs.mkdirSync(process.env.FOLIO_LAYOUT_OUTPUT, {recursive:true})
      fs.writeFileSync(path.join(process.env.FOLIO_LAYOUT_OUTPUT, 'layout.json'), JSON.stringify(report, null, 2))
      await js(win, `document.querySelectorAll('.pagination-output .pagedjs_page')[1].scrollIntoView({block:'start'})`)
      await delay(100)
      fs.writeFileSync(path.join(process.env.FOLIO_LAYOUT_OUTPUT, 'image.png'), (await win.webContents.capturePage()).toPNG())
      await js(win, `document.querySelectorAll('.pagination-output .pagedjs_page')[2].scrollIntoView({block:'start'})`)
      await delay(100)
      fs.writeFileSync(path.join(process.env.FOLIO_LAYOUT_OUTPUT, 'text.png'), (await win.webContents.capturePage()).toPNG())
    }
    assert.ok(report.pages.length > 1, 'Document never rendered')
    assert.equal(report.visibleLetters, (fs.readFileSync(file, 'utf8').match(/w/g) || []).length - 1, 'Paragraph characters disappeared at page breaks')
    assert.deepEqual(report.problems, [], 'Report blocks overlap or disappear')
    console.log('Voltage report block flow passed (images, tables, code, long words, live edits)')
  } finally {
    BrowserWindow.getAllWindows().forEach(window => window.destroy())
    fs.rmSync(folder, {recursive:true, force:true})
  }
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
