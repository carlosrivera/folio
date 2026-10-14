import { describe, expect, it } from 'vitest'
import { formatFileName, formatDirectory } from './OpenButton'

describe('OpenButton helpers', () => {
  describe('formatFileName', () => {
    it('extracts filename from POSIX paths', () => {
      expect(formatFileName('/Users/carlos/Documents/Project.md')).toBe('Project.md')
    })

    it('extracts filename from Windows paths', () => {
      expect(formatFileName('C:\\Users\\carlos\\Documents\\Notes.folio')).toBe('Notes.folio')
    })

    it('handles root or empty trailing segments gracefully', () => {
      expect(formatFileName('')).toBe('Untitled.md')
      expect(formatFileName('/')).toBe('Untitled.md')
    })
  })

  describe('formatDirectory', () => {
    it('extracts directory from POSIX paths', () => {
      expect(formatDirectory('/Users/carlos/Documents/Project.md')).toBe('/Users/carlos/Documents')
    })

    it('extracts directory from Windows paths with normalized slashes', () => {
      expect(formatDirectory('C:\\Users\\carlos\\Documents\\Notes.folio')).toBe('C:/Users/carlos/Documents')
    })

    it('returns root slash for root files', () => {
      expect(formatDirectory('/test.md')).toBe('/')
    })
  })
})
