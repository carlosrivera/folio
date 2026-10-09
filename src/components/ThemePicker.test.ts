import { describe, expect, it } from 'vitest'
import { DOCUMENT_THEMES } from './ThemePicker'
import { SUPPORTED_THEMES, parseDocument } from '../lib/document'

describe('template registry', () => {
  it('offers exactly the templates the renderer supports', () => {
    // A template present in one list but not the other is how a cover ends up
    // drawn by one part of the app and mislabelled or mis-coloured by another.
    expect(DOCUMENT_THEMES.map((theme) => theme.id)).toEqual(SUPPORTED_THEMES)
  })

  it('gives every template a distinct name and description', () => {
    const labels = DOCUMENT_THEMES.map((theme) => theme.label)
    const notes = DOCUMENT_THEMES.map((theme) => theme.note)
    expect(new Set(labels).size).toBe(labels.length)
    expect(new Set(notes).size).toBe(notes.length)
    expect(labels.every((label) => label.trim().length > 0)).toBe(true)
  })

  it('round-trips every offered template through the parser', () => {
    for (const theme of DOCUMENT_THEMES) {
      expect(parseDocument(`---\ntheme: ${theme.id}\n---\n\n# T\n`).metadata.theme).toBe(theme.id)
    }
  })
})
