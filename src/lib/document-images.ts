/** Give pagination atomic image blocks and their final dimensions up front. */
export async function prepareDocumentImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(images.map(async image => {
    await new Promise<void>(resolve => {
      const timer = window.setTimeout(resolve, 5000)
      image.decode().catch(() => {}).finally(() => { window.clearTimeout(timer); resolve() })
    })
    if (image.naturalWidth && image.naturalHeight) {
      // Paged.js marks inline-styled nodes as undisplayed unless display is
      // explicit, then skips them when choosing the next page's start node.
      image.style.display = 'block'
      const landscape = !!image.closest('.folio-landscape, .folio-document-landscape')
      const maxWidth = (landscape ? 235 : 158) * (Number(image.dataset.imageWidth || 100) / 100)
      const maxHeight = landscape ? 130 : 200
      const scale = Math.min(25.4 / 96, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
      image.style.width = `${image.naturalWidth * scale}mm`
      image.style.height = `${image.naturalHeight * scale}mm`
      image.width = Math.round(image.naturalWidth * scale * 96 / 25.4)
      image.height = Math.round(image.naturalHeight * scale * 96 / 25.4)
    }
  }))

  // A block image inside a paragraph still belongs to that paragraph's line
  // fragments. Paged.js can split those fragments across the image. Separate
  // the prose into real paragraphs, preserving formatting and source mapping.
  let image: HTMLImageElement | null
  while ((image = container.querySelector<HTMLImageElement>('p:not(.document-image) img'))) {
    const paragraph = image.closest('p')
    if (!paragraph) break
    const link = image.closest('a')
    const imageNode = link && link.textContent?.trim() === '' && link.querySelectorAll('img').length === 1 ? link : image
    const before = document.createRange()
    before.selectNodeContents(paragraph)
    before.setEndBefore(imageNode)
    const after = document.createRange()
    after.selectNodeContents(paragraph)
    after.setStartAfter(imageNode)
    const leading = paragraph.cloneNode(false) as HTMLElement
    leading.append(before.cloneContents())
    const trailing = paragraph.cloneNode(false) as HTMLElement
    trailing.append(after.cloneContents())
    const figure = document.createElement('figure')
    for (const attribute of paragraph.attributes) {
      if (attribute.name.startsWith('data-')) figure.setAttribute(attribute.name, attribute.value)
    }
    figure.className = 'document-image'
    const caption = image.getAttribute('title')
    if (image.style.height) {
      figure.style.display = 'flex'
      figure.style.height = image.style.height
    }
    figure.append(imageNode)
    if (caption) {
      const label = document.createElement('figcaption')
      label.textContent = caption
      figure.append(label)
      figure.style.height = 'auto'
    }
    paragraph.replaceWith(...(leading.textContent?.trim() || leading.querySelector('img') ? [leading] : []), figure,
      ...(trailing.textContent?.trim() || trailing.querySelector('img') ? [trailing] : []))
    if (caption && image.style.height) {
      const height = figure.getBoundingClientRect().height
      if (height) figure.style.height = `${height}px`
    }
  }
}

/** Recover whole blocks that Paged.js misses in clipped future columns. */
export function documentOverflowRange(overflow: Range | undefined, rendered: HTMLElement, bounds: DOMRect) {
  // The preview swaps its offscreen buffer into view. Layout's cached bounds
  // still describe the old position during subsequent overflow callbacks.
  const limits = rendered.closest('.pagedjs_area')?.getBoundingClientRect() ?? bounds
  let earliest = overflow
  if (overflow) {
    const element = overflow.startContainer.nodeType === Node.ELEMENT_NODE ? overflow.startContainer as Element : overflow.startContainer.parentElement
    const figure = element?.closest('.mermaid-figure')
    if (figure) {
      const box = figure.getBoundingClientRect()
      // Invisible SVG nodes (style, defs, markers) report boxes at the viewport
      // origin. In the offscreen buffer that looks like a future column to
      // Paged.js, even though the drawing itself fits. Never fragment its tree.
      earliest = undefined
      if (box.left >= limits.right - 1 || box.top >= limits.bottom - 1 || box.bottom > limits.bottom + 1) {
        earliest = document.createRange()
        earliest.setStartBefore(figure)
        earliest.setEndAfter(rendered.lastChild!)
      }
    }
  }
  for (const block of rendered.querySelectorAll<HTMLElement>('.document-body p, .document-body pre, .document-body table, .document-image, .mermaid-figure')) {
    const box = block.getBoundingClientRect()
    if (box.left < limits.right - 1) continue
    // Taller blocks need normal text fragmentation rather than moving whole.
    if (box.height > limits.height + 1) continue
    const range = document.createRange()
    range.setStartBefore(block)
    range.setEndAfter(rendered.lastChild!)
    if (!earliest || range.compareBoundaryPoints(Range.START_TO_START, earliest) < 0) earliest = range
  }
  // `overflow-wrap: anywhere` can put a paragraph's tail in another column
  // while its bounding box still starts inside this page. Find the first
  // clipped character, rather than trusting that paragraph's combined box.
  const outside = (rect: DOMRect) => rect.left >= limits.right - 1 || rect.top >= limits.bottom - 1
  const walker = document.createTreeWalker(rendered, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!node.parentElement?.closest('.document-body') || node.parentElement.closest('.mermaid-figure, svg') || !node.textContent?.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    if (!Array.from(range.getClientRects()).some(outside)) continue
    const text = node.textContent
    let low = 0, high = text.length
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      range.setStart(node, mid)
      range.setEnd(node, mid + 1)
      const rect = range.getBoundingClientRect()
      if (outside(rect)) high = mid
      else low = mid + 1
    }
    if (low === text.length) continue
    range.setStart(node, low)
    range.setEndAfter(rendered.lastChild!)
    if (!earliest || range.compareBoundaryPoints(Range.START_TO_START, earliest) < 0) earliest = range
  }
  return earliest !== overflow ? earliest ?? null : undefined
}
