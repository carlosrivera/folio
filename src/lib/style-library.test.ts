import { describe, expect, it } from 'vitest'
import { parseStyleLibrary, sameStyle, uniqueStyleName } from './style-library'
import { parseDocument, upsertThemeOverrides } from './document'

describe('style library', () => {
  const style = { id: 'style-a', name: 'My report', theme: 'editorial' as const, overrides: { 'font-display': '"Space Grotesk", Inter, sans-serif', heading: '#123456' } }
  it('keeps reusable styles across serialization and applies quoted fonts without corrupting frontmatter', () => {
    const [restored] = parseStyleLibrary(JSON.stringify([style]))
    expect(restored).toEqual(style)
    const source = upsertThemeOverrides('---\ntheme: editorial\ntitle: Test\n---\n\n# Body', restored.overrides)
    const parsed = parseDocument(source)
    expect(parsed.metadata.themeOverrides).toEqual(style.overrides)
    expect(parsed.metadata.title).toBe('Test')
    expect(source).toContain('# Body')
  })
  it('rejects corrupt entries and sanitizes imported values', () => {
    expect(parseStyleLibrary('bad json')).toEqual([])
    expect(parseStyleLibrary(JSON.stringify([style, style, { ...style, id: 'bad', theme: 'missing' }, { ...style, id: 'safe', overrides: { heading: 'red; color:blue', 'font-body': 'Georgia, serif', unknown: 'x' } }]))).toEqual([style, { ...style, id: 'safe', overrides: { 'font-body': 'Georgia, serif' } }])
  })
  it('creates distinct names and detects unsaved style edits regardless of property order', () => {
    expect(uniqueStyleName('my report', [style])).toBe('my report 2')
    expect(sameStyle(style, 'editorial', { heading: '#123456', 'font-display': style.overrides['font-display'] })).toBe(true)
    expect(sameStyle(style, 'scientific', style.overrides)).toBe(false)
    expect(sameStyle(style, 'editorial', { ...style.overrides, link: '#111111' })).toBe(false)
  })
})
