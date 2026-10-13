import { useEffect, type RefObject } from 'react'
import { renderSelectionFragment } from './document'

/** Normalize rendered Markdown without adding markup to the paginated pages. */
function renderedText(source: string, context?: string) {
  const element = document.createElement('div')
  element.innerHTML = renderSelectionFragment(source, context)
  return (element.textContent ?? '').trim().replace(/\s+/g, ' ')
}

function textIndex(elements: Element[]) {
  const points: { node: Text; offset: number; element: Element }[] = []
  let text = ''
  for (const element of elements) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      for (let offset = 0; offset < node.length; offset++) {
        const char = node.data[offset]
        if (/\s/.test(char) && text.endsWith(' ')) continue
        text += /\s/.test(char) ? ' ' : char
        points.push({ node, offset, element })
      }
    }
  }
  return { text, points }
}

export function previewSelectionRanges(root: HTMLElement, source: string, selection: { from: number; to: number }) {
  const ranges: Range[] = []
  const groups = new Map<string, HTMLElement[]>()
  for (const element of root.querySelectorAll<HTMLElement>('[data-source-from][data-source-to]')) {
    const from = Number(element.dataset.sourceFrom)
    const to = Number(element.dataset.sourceTo)
    if (from >= selection.to || to <= selection.from) continue
    // Prefer the innermost mapped block (a paragraph inside a list, for example).
    if (Array.from(element.querySelectorAll<HTMLElement>('[data-source-from]')).some(child =>
      Number(child.dataset.sourceFrom) < selection.to && Number(child.dataset.sourceTo) > selection.from)) continue
    const key = `${from}:${to}`
    const group = groups.get(key) ?? []
    group.push(element)
    groups.set(key, group)
  }
  for (const elements of groups.values()) {
    const from = Number(elements[0].dataset.sourceFrom)
    const to = Number(elements[0].dataset.sourceTo)
    const start = Math.max(from, selection.from)
    const end = Math.min(to, selection.to)
    const selectedSource = source.slice(start, end)
    let selected = renderedText(selectedSource)
    if (!selected) continue
    const prefix = renderedText(source.slice(from, start), source.slice(from, to))
    const { text, points } = textIndex(elements)
    // Prefix context distinguishes repeated words within a paragraph.
    const matches: number[] = []
    if (!text.includes(selected)) selected = renderedText(selectedSource, source.slice(from, to))
    if (!selected) continue
    let index = text.indexOf(selected)
    while (index !== -1) {
      matches.push(index)
      index = text.indexOf(selected, index + 1)
    }
    const match = matches.sort((a, b) => Math.abs(a - prefix.length) - Math.abs(b - prefix.length))[0]
    if (match === undefined) continue
    let cursor = match
    const endIndex = match + selected.length
    while (cursor < endIndex) {
      const first = points[cursor]
      if (!first) break
      let lastIndex = cursor
      while (lastIndex + 1 < endIndex && points[lastIndex + 1]?.element === first.element) lastIndex++
      const last = points[lastIndex]
      const range = document.createRange()
      range.setStart(first.node, first.offset)
      range.setEnd(last.node, last.offset + 1)
      ranges.push(range)
      cursor = lastIndex + 1
    }
  }
  return ranges
}

export function usePreviewSelection(ref: RefObject<HTMLDivElement | null>, source: string, selection: { from: number; to: number } | null) {
  useEffect(() => {
    const root = ref.current
    if (!root || !CSS.highlights || typeof Highlight === 'undefined') return
    let frame = 0
    const apply = () => {
      CSS.highlights.delete('folio-selection')
      if (selection) CSS.highlights.set('folio-selection', new Highlight(...previewSelectionRanges(root, source, selection)))
    }
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    })
    observer.observe(root, { childList: true, subtree: true })
    apply()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      CSS.highlights.delete('folio-selection')
    }
  }, [ref, source, selection])
}
