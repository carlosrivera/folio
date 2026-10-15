import { useEffect } from 'react'
import { stitchedRejection } from './lib/image-export'
import { installMapUpsertPolyfill } from './lib/map-upsert-polyfill'

/**
 * Headless companion to the print window: the main process hands over finished
 * PDF bytes and this window rasterizes them with pdf.js — either one PNG per
 * page, or the single stitched long image when one was requested. Rasterizing
 * the exported PDF rather than re-photographing the DOM is what makes the
 * images match the PDF exactly, including the mixed-landscape page rotation
 * applied in the main process.
 *
 * The worker is loaded on the main thread on purpose: real workers cannot be
 * spawned from file:// pages in the packaged app.
 */
export function RasterApp() {
  useEffect(() => {
    window.folio?.notifyRasterListening()
    return window.folio?.onRasterPayload((payload) => {
      void rasterize(payload)
    })
  }, [])

  return null
}

async function rasterize({ pdf, scale, stitched }: RasterPayload) {
  try {
    installMapUpsertPolyfill()
    const pdfjs = await import('pdfjs-dist')
    await import('pdfjs-dist/build/pdf.worker.mjs')
    const loaded = await pdfjs.getDocument({ data: pdf }).promise

    const pages = []
    for (let number = 1; number <= loaded.numPages; number++) {
      const page = await loaded.getPage(number)
      pages.push({ page, viewport: page.getViewport({ scale }) })
    }

    // The stitched copy is one tall canvas, so its budget is checked up front.
    // When one is requested but cannot fit, the per-page images are exported
    // instead and the reason travels back so the editor can explain the
    // missing file.
    const stitchRejection = stitched ? stitchedRejection(pages.map(({ viewport }) => ({ width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) }))) : null
    const stitchCanvas = stitched && !stitchRejection ? stitchCanvasFor(pages) : null
    const stitchContext = stitchCanvas?.getContext('2d') ?? null
    if (stitchCanvas && stitchContext) {
      stitchContext.fillStyle = '#ffffff'
      stitchContext.fillRect(0, 0, stitchCanvas.width, stitchCanvas.height)
    }
    const stitchWidth = stitchCanvas?.width ?? 0
    let stitchOffset = 0

    for (const [index, { page, viewport }] of pages.entries()) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not create a canvas for the page image.')
      // PDF pages can leave unpainted areas; paper is white so the PNG is too.
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise

      if (stitchContext) {
        // Mixed-orientation documents have pages of differing widths; centre
        // each one on the widest page so nothing is cropped.
        stitchContext.drawImage(canvas, Math.floor((stitchWidth - canvas.width) / 2), stitchOffset)
        stitchOffset += canvas.height
      } else {
        window.folio?.sendRasterPage(index, await pngBytes(canvas))
      }
      page.cleanup()
    }

    await window.folio?.sendRasterDone(stitchCanvas ? await pngBytes(stitchCanvas) : undefined, stitchRejection ?? undefined)
  } catch (error) {
    window.folio?.sendRasterError(error instanceof Error ? error.message : String(error))
  }
}

/** The stitched canvas is sized before rendering: widest page, heights summed. */
function stitchCanvasFor(pages: { viewport: { width: number; height: number } }[]) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(...pages.map(({ viewport }) => Math.ceil(viewport.width)))
  canvas.height = pages.reduce((sum, { viewport }) => sum + Math.ceil(viewport.height), 0)
  return canvas
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not encode a page as PNG.'))), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}
