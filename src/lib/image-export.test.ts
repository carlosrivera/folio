import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_AREA, MAX_IMAGE_DIMENSION, pngSiblingNames, stitchedGeometry, stitchedPngName, stitchedRejection } from './image-export'

describe('pngSiblingNames', () => {
  it('numbers pages without padding below ten', () => {
    expect(pngSiblingNames('/tmp/deck.png', 3)).toEqual(['/tmp/deck-1.png', '/tmp/deck-2.png', '/tmp/deck-3.png'])
  })

  it('zero-pads to the page count so files sort past page ten', () => {
    expect(pngSiblingNames('/tmp/deck.png', 12).slice(8)).toEqual(['/tmp/deck-09.png', '/tmp/deck-10.png', '/tmp/deck-11.png', '/tmp/deck-12.png'])
  })

  it('handles destinations without an extension', () => {
    expect(pngSiblingNames('deck', 1)).toEqual(['deck-1.png'])
  })

  it('is case-insensitive about the png extension', () => {
    expect(pngSiblingNames('deck.PNG', 2)).toEqual(['deck-1.png', 'deck-2.png'])
  })
})

describe('stitchedPngName', () => {
  it('appends the long suffix before the extension', () => {
    expect(stitchedPngName('/tmp/deck.png')).toBe('/tmp/deck-long.png')
    expect(stitchedPngName('deck')).toBe('deck-long.png')
  })
})

describe('stitchedGeometry', () => {
  it('uses the widest page and sums the heights', () => {
    expect(stitchedGeometry([
      { width: 1191, height: 1684 },
      { width: 1684, height: 1191 },
    ])).toEqual({ width: 1684, height: 2875 })
  })

  it('returns zero for no pages', () => {
    expect(stitchedGeometry([])).toEqual({ width: 0, height: 0 })
  })
})

describe('stitchedRejection', () => {
  it('accepts ordinary documents', () => {
    expect(stitchedRejection([{ width: 1191, height: 1684 }])).toBeNull()
  })

  it('rejects a canvas taller than Chromium allows', () => {
    expect(stitchedRejection([{ width: 1191, height: MAX_IMAGE_DIMENSION + 1 }])).toMatch(/too tall/)
  })

  it('rejects a canvas over the area budget even when each side fits', () => {
    const side = Math.floor(Math.sqrt(MAX_IMAGE_AREA))
    expect(stitchedRejection([{ width: side + 1, height: side }])).toMatch(/too large/)
  })
})
