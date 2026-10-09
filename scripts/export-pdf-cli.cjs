// scripts/export-pdf-cli.cjs
// Headless export of a Markdown file to PDF via Folio's Paged.js pipeline.
// Usage: electron scripts/export-pdf-cli.cjs --input <file.md> --output <file.pdf> [--theme <theme>] [--lang <lang>]

const { app, BrowserWindow, ipcMain } = require('electron')
const { readFile, writeFile, mkdir } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')
const { PDFDocument, PDFName, PDFNumber, PDFString, degrees } = require('pdf-lib')

const ROOT = path.join(__dirname, '..')
const LAYOUT_TIMEOUT_MS = 30_000

function parseArgs() {
  const args = process.argv.slice(2)
  const params = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' && i + 1 < args.length) params.input = args[++i]
    else if (arg === '--output' && i + 1 < args.length) params.output = args[++i]
    else if (arg === '--theme' && i + 1 < args.length) params.theme = args[++i]
    else if (arg === '--lang' && i + 1 < args.length) params.lang = args[++i]
  }
  return params
}

function parseCssColor(color) {
  if (!color || typeof color !== 'string') return null
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) return { hex: hex[0] }
  const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgb) {
    const toHex = (n) => parseInt(n, 10).toString(16).padStart(2, '0')
    return { hex: `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}` }
  }
  return null
}

function buildOutlineTree(entries) {
  const roots = []
  const stack = []

  for (const entry of entries) {
    const node = { title: entry.title, page: entry.page, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
      stack.pop()
    }
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1].node.children.push(node)
    stack.push({ level: entry.level, node })
  }

  return roots
}

function attachOutline(pdf, nodes) {
  if (!nodes || nodes.length === 0) return

  const context = pdf.context
  const pageRefs = pdf.getPages().map((page) => page.ref)
  if (pageRefs.length === 0) return

  const outlinesRef = context.nextRef()
  let descendants = 0

  const writeLevel = (levelNodes, parentRef) => {
    const refs = levelNodes.map(() => context.nextRef())

    levelNodes.forEach((node, index) => {
      descendants += 1
      const pageRef = pageRefs[Math.min(Math.max(node.page, 1), pageRefs.length) - 1]
      const dict = context.obj({
        Title: PDFString.of(node.title),
        Parent: parentRef,
        Dest: context.obj([pageRef, PDFName.of('Fit')]),
      })
      if (index > 0) dict.set(PDFName.of('Prev'), refs[index - 1])
      if (index < refs.length - 1) dict.set(PDFName.of('Next'), refs[index + 1])

      if (node.children.length > 0) {
        const { first, last } = writeLevel(node.children, refs[index])
        dict.set(PDFName.of('First'), first)
        dict.set(PDFName.of('Last'), last)
        dict.set(PDFName.of('Count'), PDFNumber.of(-node.children.length))
      }

      context.assign(refs[index], dict)
    })

    return { first: refs[0], last: refs[refs.length - 1] }
  }

  const { first, last } = writeLevel(nodes, outlinesRef)
  context.assign(
    outlinesRef,
    context.obj({
      Type: PDFName.of('Outlines'),
      First: first,
      Last: last,
      Count: PDFNumber.of(descendants),
    }),
  )
  pdf.catalog.set(PDFName.of('Outlines'), outlinesRef)
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
}

app.whenReady().then(async () => {
  const params = parseArgs()
  if (!params.input || !params.output) {
    console.error(JSON.stringify({ error: 'Missing --input or --output argument' }))
    app.exit(1)
    return
  }

  const inputPath = path.resolve(params.input)
  const outputPath = path.resolve(params.output)

  if (!existsSync(inputPath)) {
    console.error(JSON.stringify({ error: `Input file does not exist: ${inputPath}` }))
    app.exit(1)
    return
  }

  const distHtml = path.join(ROOT, 'dist', 'index.html')
  if (!existsSync(distHtml)) {
    console.error(JSON.stringify({ error: 'dist/index.html is missing. Run `pnpm build` first.' }))
    app.exit(1)
    return
  }

  const markdown = await readFile(inputPath, 'utf8')

  const win = new BrowserWindow({
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

  try {
    await win.loadURL(`file://${distHtml}?mode=print`)

    let report
    await new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Layout timed out after ${LAYOUT_TIMEOUT_MS}ms`))
      }, LAYOUT_TIMEOUT_MS)

      const payload = { markdown, theme: params.theme, lang: params.lang }
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

    const coverHex = parseCssColor(report?.coverColor)?.hex

    await win.webContents.insertCSS(
      `@media print {
         @page { size: A4 !important; margin: 0 !important; }
         ${coverHex ? `@page :first { background: ${coverHex} !important; }` : ''}
       }`,
      { cssOrigin: 'user' },
    )

    const pdfBytes = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
    })

    const rendered = await PDFDocument.load(pdfBytes)
    const finished = await PDFDocument.create()
    const sourcePages = rendered.getPages()
    const landscapePages = new Set(report?.landscapePages ?? [])

    for (const [index, sourcePage] of sourcePages.entries()) {
      const { width, height } = sourcePage.getSize()
      const page = finished.addPage([width, height])
      const [embeddedPage] = await finished.embedPages([sourcePage])
      page.drawPage(embeddedPage, { x: 0, y: 0, width, height })
      if (landscapePages.has(index + 1)) page.setRotation(degrees(270))
    }

    if (report?.metadata) {
      if (report.metadata.title) finished.setTitle(report.metadata.title)
      if (report.metadata.author) finished.setAuthor(report.metadata.author)
      if (report.metadata.subject) finished.setSubject(report.metadata.subject)
      if (report.metadata.keywords) finished.setKeywords(report.metadata.keywords)
      finished.setCreator('Folio')
      finished.setProducer('Folio')
    }

    attachOutline(finished, buildOutlineTree(report?.outline ?? []))

    await mkdir(path.dirname(outputPath), { recursive: true })
    const finalBuffer = await finished.save()
    await writeFile(outputPath, finalBuffer)

    console.log(
      JSON.stringify({
        success: true,
        path: outputPath,
        pageCount: sourcePages.length,
        sizeBytes: finalBuffer.length,
        title: report?.metadata?.title || 'Document',
      }),
    )

    win.destroy()
    app.exit(0)
  } catch (err) {
    win.destroy()
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    app.exit(1)
  }
})
