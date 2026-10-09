// Renders each fixture through the real Paged.js pipeline in an Electron window,
// in both screen and print media, then checks layout invariants and compares a
// page-by-page fingerprint against the committed golden files.
//
//   pnpm test:render                 check
//   UPDATE_GOLDEN=1 pnpm test:render rewrite the goldens
//
// CommonJS with no top-level await on purpose: awaiting before app.whenReady()
// deadlocks Electron's ESM main process.
const { app, BrowserWindow, ipcMain } = require('electron')
const { readFile, writeFile, mkdir } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')
const { PDFDocument } = require('pdf-lib')
const { checkInvariants, fingerprint } = require('./invariants.cjs')

const ROOT = path.join(__dirname, '..', '..')
const GOLDEN_DIR = path.join(__dirname, '__golden__')
const OUTPUT_DIR = path.join(__dirname, '__output__')
const UPDATE = process.env.UPDATE_GOLDEN === '1'
const LAYOUT_TIMEOUT_MS = 25_000

const CASES = [
  { name: 'kitchen-sink.editorial', fixture: 'kitchen-sink.md', theme: 'editorial', lang: 'es' },
  { name: 'kitchen-sink.voltage', fixture: 'kitchen-sink.md', theme: 'voltage', lang: 'es' },
  { name: 'kitchen-sink.graphite', fixture: 'kitchen-sink.md', theme: 'graphite', lang: 'en' },
  { name: 'kitchen-sink.contrast', fixture: 'kitchen-sink.md', theme: 'contrast', lang: 'en' },
  { name: 'kitchen-sink.slate', fixture: 'kitchen-sink.md', theme: 'slate', lang: 'en' },
  { name: 'kitchen-sink.nocturne', fixture: 'kitchen-sink.md', theme: 'nocturne', lang: 'en' },
  // Frontmatter token overrides, including entries that must be rejected.
  { name: 'theme-overrides.editorial', fixture: 'theme-overrides.md', theme: 'editorial', lang: 'es' },
  { name: 'equations.editorial', fixture: 'equations.md', theme: 'editorial', lang: 'en' },
  { name: 'equations.scientific', fixture: 'equations.md', theme: 'scientific', lang: 'en' },
]

const MEDIA = ['screen', 'print']

function createRenderWindow() {
  return new BrowserWindow({
    show: false,
    width: 1024,
    height: 1400,
    webPreferences: {
      preload: path.join(ROOT, 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
}

/**
 * Reset to a blank page so the next case starts from a clean renderer. Emulated
 * media survives navigation, so it has to be cleared too — otherwise the next
 * case lays out in print media and Paged.js sees different break rules.
 */
async function resetWindow(win) {
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen' })
  await win.loadURL('about:blank')
}

async function layout(win, payload) {
  await win.loadURL(`file://${path.join(ROOT, 'dist', 'index.html')}?mode=print`)
  // Whatever ExportApp hands the main process: the PDF's cover colour and
  // outline are derived from this, so it is asserted alongside the layout.
  let report
  await new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`layout did not finish within ${LAYOUT_TIMEOUT_MS}ms`))
    }, LAYOUT_TIMEOUT_MS)

    // loadURL resolves on did-finish-load, which can precede React mounting and
    // attaching the payload listener. Keep offering the payload until the
    // renderer answers, otherwise the first message is silently dropped.
    const resend = setInterval(() => {
      if (!settled) win.webContents.send('export:payload', payload)
    }, 250)

    function cleanup() {
      settled = true
      clearTimeout(timer)
      clearInterval(resend)
      ipcMain.removeListener('export:ready', onReady)
    }

    function onReady(event, incoming) {
      if (event.sender !== win.webContents) return
      report = incoming
      cleanup()
      resolve()
    }

    ipcMain.on('export:ready', onReady)
    win.webContents.send('export:payload', payload)
  })
  return report
}

async function reportFor(win, collector, media) {
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media })
  // Let the cascade settle before measuring.
  await win.webContents.executeJavaScript(
    'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))',
  )
  return win.webContents.executeJavaScript(collector)
}

/** Path-based deep diff: line-index diffing reports noise when a key is added. */
function diffFingerprints(expected, actual, prefix = '') {
  const lines = []
  const walk = (a, b, path) => {
    if (lines.length >= 25) return
    const isObject = (v) => v !== null && typeof v === 'object'
    if (!isObject(a) || !isObject(b) || Array.isArray(a) !== Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        lines.push(`${prefix}${path || '(root)'}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`)
      }
      return
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key
      if (!(key in a)) lines.push(`${prefix}${childPath}: added ${JSON.stringify(b[key])}`)
      else if (!(key in b)) lines.push(`${prefix}${childPath}: removed`)
      else walk(a[key], b[key], childPath)
    }
  }
  walk(expected, actual, '')
  return lines
}

app.whenReady().then(async () => {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('dist/index.html is missing — run `pnpm build` first.')
    app.exit(2)
    return
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  if (UPDATE) await mkdir(GOLDEN_DIR, { recursive: true })

  const collector = await readFile(path.join(__dirname, 'collect-report.js'), 'utf8')
  const failures = []
  let updated = 0

  // One window, reused across cases: spawning a renderer per case is slower and
  // trips process-launch limits on some machines.
  const win = createRenderWindow()
  win.webContents.debugger.attach('1.3')

  for (const testCase of CASES) {
    const markdown = await readFile(path.join(ROOT, 'tests', 'fixtures', testCase.fixture), 'utf8')

    try {
      const report = await layout(win, { markdown, theme: testCase.theme, lang: testCase.lang })

      const reports = {}
      for (const media of MEDIA) {
        const report = await reportFor(win, collector, media)
        reports[media] = report
        const problems = checkInvariants(report, { name: testCase.name, media })
        failures.push(...problems)
      }

      await writeFile(
        path.join(OUTPUT_DIR, `${testCase.name}.json`),
        `${JSON.stringify(reports, null, 2)}\n`,
      )

      // The export must take the cover colour from the sheet it just laid out.
      // A second copy of the palette anywhere else goes stale on every template
      // added or renamed, and paints the wrong colour onto the cover.
      if (!report) {
        failures.push(`[${testCase.name}] the render window reported nothing back to the export path`)
      } else if (report.coverColor !== reports.print.palette.coverBackground) {
        failures.push(
          `[${testCase.name}] the export was handed cover colour ${report.coverColor} but the cover sheet is ${reports.print.palette.coverBackground}`,
        )
      }

      // The PDF is the actual deliverable: assert it agrees with the layout.
      const pdfBytes = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
      })
      await writeFile(path.join(OUTPUT_DIR, `${testCase.name}.pdf`), pdfBytes)
      const pdf = await PDFDocument.load(pdfBytes)
      const pdfPages = pdf.getPages()
      const pdfSizes = pdfPages.map((page) => {
        const size = page.getSize()
        return `${Math.round(size.width)}x${Math.round(size.height)}`
      })
      if (pdfPages.length !== reports.print.pageCount) {
        failures.push(
          `[${testCase.name}] the PDF has ${pdfPages.length} pages but the layout produced ${reports.print.pageCount} (sizes: ${pdfSizes.join(', ')})`,
        )
      }
      // The print fingerprint is the one that matches the exported PDF.
      const actual = fingerprint(reports.print)
      const goldenPath = path.join(GOLDEN_DIR, `${testCase.name}.json`)
      if (UPDATE || !existsSync(goldenPath)) {
        await writeFile(goldenPath, `${JSON.stringify(actual, null, 2)}\n`)
        updated += 1
        console.log(`${UPDATE ? 'updated' : 'created'} golden  ${testCase.name}`)
      } else {
        const expected = JSON.parse(await readFile(goldenPath, 'utf8'))
        const actualText = JSON.stringify(actual)
        if (JSON.stringify(expected) !== actualText) {
          failures.push(
            `[${testCase.name}] layout changed against its golden file:\n${diffFingerprints(expected, actual, '    ').join('\n')}\n    (run UPDATE_GOLDEN=1 pnpm test:render if this change is intended)`,
          )
        } else {
          console.log(`ok  ${testCase.name}  ${actual.pageCount} pages`)
        }
      }
    } catch (error) {
      failures.push(`[${testCase.name}] ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      await resetWindow(win)
    }
  }

  win.destroy()

  if (failures.length > 0) {
    console.error(`\n${failures.length} render failure(s):\n`)
    for (const failure of failures) console.error(` • ${failure}`)
    app.exit(1)
    return
  }

  console.log(`\nrender suite passed${updated ? ` (${updated} golden file(s) written)` : ''}`)
  app.exit(0)
})
