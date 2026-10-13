import type { FormatResult } from './editor-format'

function cells(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim())
}
const separator = (line: string) => cells(line).every(cell => /^:?-{3,}:?$/.test(cell))

export function createMarkdownTable(rows: number, columns: number) {
  const width = Math.max(1, Math.min(12, Math.round(columns)))
  const height = Math.max(1, Math.min(50, Math.round(rows)))
  const row = (values: string[]) => `| ${values.join(' | ')} |`
  return [row(Array.from({ length: width }, (_, i) => `Column ${i + 1}`)), row(Array(width).fill('---')), ...Array.from({ length: height }, () => row(Array(width).fill('')))].join('\n') + '\n'
}

export function tableAt(text: string, position: number) {
  const lines = text.split('\n')
  let index = text.slice(0, position).split('\n').length - 1
  if (!lines[index]?.trim().startsWith('|')) return null
  let start = index, end = index
  while (start > 0 && lines[start - 1].trim().startsWith('|')) start--
  while (end + 1 < lines.length && lines[end + 1].trim().startsWith('|')) end++
  if (end - start < 1 || !separator(lines[start + 1])) return null
  const from = lines.slice(0, start).reduce((offset, line) => offset + line.length + 1, 0)
  const rows = lines.slice(start, end + 1).map(cells)
  const lineFrom = lines.slice(0, index).reduce((offset, line) => offset + line.length + 1, 0)
  const before = lines[index].slice(0, position - lineFrom)
  const column = Math.max(0, Math.min(rows[0].length - 1, (before.match(/(?<!\\)\|/g) ?? []).length - 1))
  return { from, to: from + lines.slice(start, end + 1).join('\n').length, rows, row: index - start, column }
}

export type TableAction = 'add-row' | 'remove-row' | 'add-column' | 'remove-column' | 'align-left' | 'align-center' | 'align-right'
export function editMarkdownTable(text: string, position: number, action: TableAction): FormatResult | null {
  const table = tableAt(text, position)
  if (!table) return null
  let targetRow = Math.min(table.rows.length - 1, Math.max(2, table.row)), targetColumn = table.column
  if (action.startsWith('align-')) table.rows[1][targetColumn] = action === 'align-center' ? ':---:' : action === 'align-right' ? '---:' : ':---'
  if (action === 'add-row') {
    targetRow = Math.min(table.rows.length, Math.max(2, table.row + 1))
    table.rows.splice(targetRow, 0, Array(table.rows[0].length).fill(''))
  }
  if (action === 'remove-row') {
    if (table.row < 2 || table.rows.length <= 3) return null
    table.rows.splice(table.row, 1)
    targetRow = Math.min(table.row, table.rows.length - 1)
  }
  if (action === 'add-column') {
    targetColumn++
    table.rows.forEach((row, index) => row.splice(targetColumn, 0, index === 1 ? '---' : ''))
  }
  if (action === 'remove-column') {
    if (table.rows[0].length <= 1) return null
    table.rows.forEach(row => row.splice(targetColumn, 1))
    targetColumn = Math.min(targetColumn, table.rows[0].length - 1)
  }
  const lines = table.rows.map(row => `| ${row.join(' | ')} |`)
  const replacement = lines.join('\n')
  const anchor = table.from + lines.slice(0, targetRow).reduce((offset, line) => offset + line.length + 1, 0) + 2 + table.rows[targetRow].slice(0, targetColumn).reduce((offset, cell) => offset + cell.length + 3, 0)
  return { text: text.slice(0, table.from) + replacement + text.slice(table.to), from: anchor, to: anchor }
}

export function nextTableCell(text: string, position: number, backwards: boolean): FormatResult | null {
  const table = tableAt(text, position)
  if (!table) return null
  const cells: { from: number; to: number; start: number; end: number }[] = []
  let offset = table.from
  for (const [index, line] of text.slice(table.from, table.to).split('\n').entries()) {
    if (index !== 1) {
      const pipes = [...line.matchAll(/(?<!\\)\|/g)].map(match => match.index!)
      for (let i = 0; i + 1 < pipes.length; i++) {
        const value = line.slice(pipes[i] + 1, pipes[i + 1])
        const leading = value.match(/^\s*/)?.[0].length ?? 0
        const start = offset + pipes[i] + 1 + Math.min(leading, Math.max(0, value.length - 1))
        cells.push({ from: start, to: start + value.trim().length, start: offset + pipes[i], end: offset + pipes[i + 1] })
      }
    }
    offset += line.length + 1
  }
  const current = cells.findIndex(cell => position >= cell.start && position < cell.end)
  if (current < 0) return null
  if (backwards && current <= 0) return null
  if (!backwards && current === cells.length - 1) {
    const added = editMarkdownTable(text, position, 'add-row')!
    return added
  }
  const target = cells[current + (backwards ? -1 : 1)]
  return target ? { text, ...target } : null
}
