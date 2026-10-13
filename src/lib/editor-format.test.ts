import { describe, expect, it } from 'vitest'
import { formatMarkdown } from './editor-format'

describe('formatMarkdown', () => {
  it('wraps selected text and keeps it selected', () => {
    expect(formatMarkdown('hello world', 6, 11, 'bold')).toEqual({ text: 'hello **world**', from: 8, to: 13 })
  })

  it('inserts a link with its URL selected', () => {
    expect(formatMarkdown('read docs', 5, 9, 'link')).toEqual({ text: 'read [docs](https://)', from: 12, to: 20 })
  })

  it('formats all selected list lines and toggles them off', () => {
    const first = formatMarkdown('one\ntwo\nthree', 0, 7, 'bullet-list')
    expect(first.text).toBe('- one\n- two\nthree')
    expect(formatMarkdown(first.text, 0, 11, 'bullet-list').text).toBe('one\ntwo\nthree')
  })

  it('inserts a table on its own line', () => {
    expect(formatMarkdown('Hello', 5, 5, 'table').text).toContain('Hello\n| Column 1 | Column 2 |')
  })

  it('converts another heading level to H2, then toggles H2 off', () => {
    expect(formatMarkdown('# Title', 2, 2, 'heading').text).toBe('## Title')
    expect(formatMarkdown('## Title', 3, 3, 'heading').text).toBe('Title')
  })

  it('inserts editable inline and display equations', () => {
    expect(formatMarkdown('Value ', 6, 6, 'math-inline')).toEqual({ text: 'Value $x$', from: 7, to: 8 })
    expect(formatMarkdown('Value', 5, 5, 'math-block').text).toBe('Value\n$$\nx^2 + y^2 = z^2\n$$\n')
  })
})

it('toggles selected bold without nesting markers, preserving selection', () => {
  const result = formatMarkdown('hello **world**', 8, 13, 'bold')
  expect(result).toEqual({ text: 'hello world', from: 6, to: 11 })
})
it('combines italic and bold without accidentally removing bold', () => {
  expect(formatMarkdown('**word**', 2, 6, 'italic').text).toBe('***word***')
  expect(formatMarkdown('***word***', 3, 7, 'italic').text).toBe('**word**')
})
it('creates sequential list numbers and normalizes mixed items', () => {
  expect(formatMarkdown('one\ntwo\nthree', 0, 13, 'numbered-list').text).toBe('1. one\n2. two\n3. three')
  expect(formatMarkdown('- one\ntwo', 0, 9, 'bullet-list').text).toBe('- one\n- two')
  expect(formatMarkdown('- one\n2. two\nthree', 0, 18, 'numbered-list').text).toBe('1. one\n2. two\n3. three')
})
it('supports all heading levels and toggles the selected level', () => {
  expect(formatMarkdown('# Title', 2, 2, 'heading-6').text).toBe('###### Title')
  expect(formatMarkdown('###### Title', 7, 7, 'heading-6').text).toBe('Title')
  expect(formatMarkdown('### Title', 4, 4, 'paragraph').text).toBe('Title')
})
it('inserts code fences on separate paragraphs and protects literal backticks', () => {
  const source = 'Before\n``` literal\nAfter'
  const from = source.indexOf('```'), to = source.indexOf('\nAfter')
  const result = formatMarkdown(source, from, to, 'code-block')
  expect(result.text).toBe('Before\n\n````\n``` literal\n````\n\nAfter')
  expect(result.text.slice(result.from, result.to)).toBe('``` literal')
})
