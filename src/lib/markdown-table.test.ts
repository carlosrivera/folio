import { expect, it } from 'vitest'
import { createMarkdownTable, editMarkdownTable, nextTableCell, tableAt } from './markdown-table'
const table = '| Name | Value |\n| --- | --- |\n| Alice | One |\n| Bob | Two |'
it('builds the requested number of body rows and columns', () => {
  const result = createMarkdownTable(3, 4)
  expect(result.trim().split('\n')).toHaveLength(5)
  expect(tableAt(result, 2)?.rows[0]).toHaveLength(4)
})
it('moves between cells and skips the separator row', () => {
  const value = nextTableCell(table, 2, false)!
  expect(table.slice(value.from, value.to)).toBe('Value')
  const body = nextTableCell(table, value.from, false)!
  expect(table.slice(body.from, body.to)).toBe('Alice')
  const previous = nextTableCell(table, body.from, true)!
  expect(table.slice(previous.from, previous.to)).toBe('Value')
})
it('adds a body row at the last cell and preserves text outside the table', () => {
  const source = '# Heading\n\n' + table + '\n\nAfter'
  const result = nextTableCell(source, source.indexOf('Two'), false)!
  expect(result.text).toContain('| Bob | Two |\n|  |  |\n\nAfter')
  expect(result.text).toMatch(/^# Heading/)
})
it('adds/removes columns and prevents removal of the last column/body row', () => {
  const added = editMarkdownTable(table, table.indexOf('Alice'), 'add-column')!
  expect(tableAt(added.text, added.from)?.rows[0]).toHaveLength(3)
  const removed = editMarkdownTable(added.text, added.from, 'remove-column')!
  expect(tableAt(removed.text, removed.from)?.rows[0]).toHaveLength(2)
  expect(editMarkdownTable('| Name |\n| --- |\n| Alice |', 22, 'remove-column')).toBeNull()
  const single = '| Name |\n| --- |\n| Alice |'
  expect(editMarkdownTable(single, single.indexOf('Alice'), 'remove-row')).toBeNull()
})
it('recognizes escaped pipes as cell content', () => {
  const source = '| A | B |\n| --- | --- |\n| a\\|b | c |'
  expect(tableAt(source, source.indexOf('a\\|b'))?.rows[2]).toEqual(['a\\|b', 'c'])
})
it('moves from trailing cell padding and handles header-only tables', () => {
  const source = '| Name    | Value |\n| --- | --- |'
  const next = nextTableCell(source, source.indexOf('Name') + 7, false)!
  expect(source.slice(next.from, next.to)).toBe('Value')
  const edited = editMarkdownTable(source, 2, 'add-column')!
  expect(edited.from).toBeLessThanOrEqual(edited.text.length)
})
