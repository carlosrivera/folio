// Pure helpers shared by the PNG export path in the main process (sibling file
// naming) and the raster renderer (canvas budget checks). No Node imports so
// both build targets can use it unchanged.

/** Chromium refuses canvases past these budgets, and the stitched image is one canvas. */
export const MAX_IMAGE_DIMENSION = 65_535
export const MAX_IMAGE_AREA = 268_435_456

export type ImageGeometry = { width: number; height: number }

/**
 * Numbered sibling paths for a per-page export: `deck.png` becomes
 * `deck-1.png` … `deck-12.png`, zero-padded to the page count so the files
 * sort correctly from page 10 on.
 */
export function pngSiblingNames(destination: string, pageCount: number): string[] {
  const base = destination.replace(/\.png$/i, '')
  const pad = Math.max(1, String(pageCount).length)
  return Array.from({ length: pageCount }, (_, index) => `${base}-${String(index + 1).padStart(pad, '0')}.png`)
}

/** Path of the stitched long image that joins every page top to bottom. */
export function stitchedPngName(destination: string): string {
  return `${destination.replace(/\.png$/i, '')}-long.png`
}

/** Size of the stitched canvas: widest page, heights summed, mixed orientations included. */
export function stitchedGeometry(pageSizes: ImageGeometry[]): ImageGeometry {
  if (pageSizes.length === 0) return { width: 0, height: 0 }
  return {
    width: Math.max(...pageSizes.map((size) => size.width)),
    height: pageSizes.reduce((sum, size) => sum + size.height, 0),
  }
}

/**
 * Null when the stitched image fits Chromium's canvas budgets, otherwise a
 * user-facing reason to lower the scale or skip the stitched copy.
 */
export function stitchedRejection(pageSizes: ImageGeometry[]): string | null {
  const { width, height } = stitchedGeometry(pageSizes)
  if (width === 0 && height === 0) return null
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return 'The stitched image is too tall for this scale. Try a lower resolution or export without it.'
  }
  if (width * height > MAX_IMAGE_AREA) {
    return 'The stitched image is too large for this scale. Try a lower resolution or export without it.'
  }
  return null
}
