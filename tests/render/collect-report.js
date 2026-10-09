// Runs inside the render window. Returns a structural report of the laid-out
// document: enough detail to assert layout invariants and to fingerprint which
// content landed on which page, without rasterising anything.
(() => {
  const PAGE_BOX_TOLERANCE_PX = 2
  const OVERFLOW_TOLERANCE_PX = 1

  const pages = Array.from(document.querySelectorAll('.pagedjs_page'))
  const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim()
  const contentAreaOf = (page) => page.querySelector('.pagedjs_page_content') || page

  const outlineOf = (page) =>
    Array.from(contentAreaOf(page).querySelectorAll('h1, h2, h3, figure, table, pre, blockquote')).map((el) => {
      const tag = el.tagName.toLowerCase()
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/)[0]}` : ''
      const label = tag === 'table' || tag === 'figure' ? '' : text(el).slice(0, 48)
      return label ? `${tag}${cls} ${label}` : `${tag}${cls}`
    })

  // Only flow content counts as overflow. SVG internals (Mermaid's
  // foreignObject labels) and anything an ancestor clips on purpose (the bled
  // cover artwork) are laid out wider than the page by design.
  const horizontalOverflowOf = (page) => {
    const area = contentAreaOf(page)
    const areaRect = area.getBoundingClientRect()
    const isClipped = (el) => {
      for (let node = el.parentElement; node && node !== area.parentElement; node = node.parentElement) {
        if (getComputedStyle(node).overflowX !== 'visible') return true
      }
      return false
    }
    let overflow = 0
    for (const el of area.querySelectorAll('*')) {
      if (el.closest('svg') || isClipped(el)) continue
      // Paged.js lays each page out as a multicolumn box, so an element that
      // fragments has one client rect per column and getBoundingClientRect
      // returns their union — far wider than the sheet. The first fragment is
      // the one that actually sits on this page.
      const rect = el.getClientRects()[0]
      if (!rect || rect.width <= 0) continue
      overflow = Math.max(overflow, rect.right - areaRect.right)
    }
    return Math.max(0, Math.round(overflow - OVERFLOW_TOLERANCE_PX))
  }

  // Running chrome is absolutely positioned against the page box. If the box
  // stops being a containing block, the elements stay in the DOM but paint
  // somewhere off the sheet — present in the markup, missing from the PDF.
  // Compared against the box rather than the sheet, so a deliberately rotated
  // landscape box still reads as containing its own chrome.
  const sitsInsideBox = (el, pageRect) => {
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    return (
      rect.top >= pageRect.top - PAGE_BOX_TOLERANCE_PX &&
      rect.bottom <= pageRect.bottom + PAGE_BOX_TOLERANCE_PX &&
      rect.left >= pageRect.left - PAGE_BOX_TOLERANCE_PX &&
      rect.right <= pageRect.right + PAGE_BOX_TOLERANCE_PX
    )
  }

  const pageReports = pages.map((page, index) => {
    const pageRect = page.getBoundingClientRect()
    const boxRect = (page.querySelector('.pagedjs_pagebox') ?? page).getBoundingClientRect()
    const headers = page.querySelectorAll('.folio-page-header')
    const footers = page.querySelectorAll('.folio-page-footer')
    return {
      index: index + 1,
      headerInsidePage: sitsInsideBox(headers[0], boxRect),
      footerInsidePage: sitsInsideBox(footers[0], boxRect),
      classes: Array.from(page.classList)
        .filter((c) => c !== 'pagedjs_page')
        .sort(),
      headerCount: headers.length,
      footerCount: footers.length,
      headerText: text(headers[0]) || null,
      footerText: text(footers[0]) || null,
      outline: outlineOf(page),
      orientation: pageRect.width > pageRect.height ? 'landscape' : 'portrait',
      overflowPx: horizontalOverflowOf(page),
    }
  })

  const figures = Array.from(document.querySelectorAll('.pagedjs_page .mermaid-figure')).map((figure) => {
    const svg = figure.querySelector('svg')
    const page = figure.closest('.pagedjs_page')
    // The content area, not the sheet: in print a landscape sheet is rotated,
    // which makes the sheet's axis-aligned box meaningless for this check.
    const areaRect = page ? contentAreaOf(page).getBoundingClientRect() : null
    const rect = figure.getBoundingClientRect()
    return {
      page: page ? pages.indexOf(page) + 1 : null,
      split: figure.hasAttribute('data-split-from') || figure.hasAttribute('data-split-to'),
      hasError: !!figure.querySelector('.mermaid-error'),
      hasSvg: !!svg,
      // A Paged.js split tears the drawing out and leaves only the <style>.
      drawingNodes: svg ? svg.querySelectorAll('g').length : 0,
      heightPx: Math.round(rect.height),
      fitsPage: areaRect ? rect.height <= areaRect.height + PAGE_BOX_TOLERANCE_PX : false,
    }
  })

  const equations = Array.from(document.querySelectorAll('.pagedjs_page .document-body .katex')).map((equation) => {
    const page = equation.closest('.pagedjs_page')
    const area = page ? contentAreaOf(page) : null
    const rect = equation.getBoundingClientRect()
    const areaRect = area?.getBoundingClientRect()
    return {
      page: page ? pages.indexOf(page) + 1 : null,
      display: !!equation.closest('.katex-display'),
      hasMathML: !!equation.querySelector('math'),
      fitsPage: !!areaRect && rect.right <= areaRect.right + PAGE_BOX_TOLERANCE_PX,
    }
  })

  const tocRows = Array.from(document.querySelectorAll('.pagedjs_page .folio-toc-link')).map((link) => {
    // The resolved digits live in generated content and are not exposed to the
    // DOM. What is observable is whether Paged.js rewrote target-counter() into
    // one of its own counters — if its handler threw, the original text remains.
    const generated = getComputedStyle(link, '::after').content || ''
    return {
      target: link.getAttribute('href'),
      label: text(link.querySelector('.folio-toc-title')),
      counterResolved: /^counter\(target-counter-/.test(generated),
      rawCounter: generated.slice(0, 80),
    }
  })

  // Sampled colours, so a theme refactor cannot silently repaint the document.
  const palette = (() => {
    // Fully-qualified selectors: the cover treatment lives on the page element
    // itself, so a descendant prefix would never match it.
    const sample = (selector, property) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el)[property] : null
    }
    return {
      coverBackground: sample('.pagedjs_page.folio-cover-sheet .pagedjs_pagebox', 'backgroundColor'),
      coverTitle: sample('.pagedjs_page .cover-page h1', 'color'),
      coverTitleFont: sample('.pagedjs_page .cover-page h1', 'fontFamily'),
      coverTitleWeight: sample('.pagedjs_page .cover-page h1', 'fontWeight'),
      coverKicker: sample('.pagedjs_page .cover-kicker', 'color'),
      coverKickerFont: sample('.pagedjs_page .cover-kicker', 'fontFamily'),
      coverClient: sample('.pagedjs_page .cover-client', 'color'),
      coverRule: sample('.pagedjs_page .cover-rule', 'backgroundColor'),
      coverDt: sample('.pagedjs_page .cover-details dt', 'color'),
      coverDd: sample('.pagedjs_page .cover-details dd', 'color'),
      coverRingBorder: sample('.pagedjs_page .cover-accent span', 'borderTopColor'),
      bodyText: sample('.pagedjs_page .document-body p', 'color'),
      bodyFont: sample('.pagedjs_page .document-body p', 'fontFamily'),
      kicker: sample('.pagedjs_page .document-body h1', 'color'),
      heading: sample('.pagedjs_page .document-body h2', 'color'),
      headingFont: sample('.pagedjs_page .document-body h2', 'fontFamily'),
      headingWeight: sample('.pagedjs_page .document-body h2', 'fontWeight'),
      subheading: sample('.pagedjs_page .document-body h3', 'color'),
      subheadingFont: sample('.pagedjs_page .document-body h3', 'fontFamily'),
      subheadingTransform: sample('.pagedjs_page .document-body h3', 'textTransform'),
      quoteBorder: sample('.pagedjs_page .document-body blockquote', 'borderLeftColor'),
      quoteBackground: sample('.pagedjs_page .document-body blockquote', 'backgroundColor'),
      quoteText: sample('.pagedjs_page .document-body blockquote', 'color'),
      quoteFont: sample('.pagedjs_page .document-body blockquote', 'fontFamily'),
      tableHeadBorder: sample('.pagedjs_page .document-body th', 'borderBottomColor'),
      tableHeadText: sample('.pagedjs_page .document-body th', 'color'),
      tableHeadFont: sample('.pagedjs_page .document-body th', 'fontFamily'),
      tableBorder: sample('.pagedjs_page .document-body td', 'borderBottomColor'),
      link: sample('.pagedjs_page .document-body a', 'color'),
      figureBorder: sample('.pagedjs_page .mermaid-figure', 'borderTopColor'),
      figureBackground: sample('.pagedjs_page .mermaid-figure', 'backgroundColor'),
      figureRadius: sample('.pagedjs_page .mermaid-figure', 'borderRadius'),
      runningChrome: sample('.pagedjs_page .folio-page-header', 'color'),
      tocHeading: sample('.pagedjs_page .folio-toc-header h2', 'color'),
    }
  })()

  const output = document.querySelector('.pagination-output')
  const body = text(output)
  // Tags shown inside code samples are intentional; only prose should be clean.
  const prose = (() => {
    const clone = output?.cloneNode(true)
    if (!clone) return ''
    for (const code of clone.querySelectorAll('code, pre')) code.remove()
    return text(clone)
  })()

  return {
    palette,
    pageCount: pages.length,
    pages: pageReports,
    figures,
    equations,
    tocRows,
    unrenderedDiagrams: document.querySelectorAll('.pagedjs_page [data-mermaid-source]').length,
    diagramErrors: document.querySelectorAll('.pagedjs_page .mermaid-error').length,
    leftoverBreakMarkers: (body.match(/FOLIO_PAGE_BREAK/g) || []).length,
    literalBrTags: (prose.match(/<br\s*\/?>/gi) || []).length,
    breakDivPages: Array.from(document.querySelectorAll('.pagedjs_page .folio-page-break')).map((div) => {
      const page = div.closest('.pagedjs_page')
      const area = page ? contentAreaOf(page) : null
      // A break that fired sits at the very start of its page's content.
      const first = area?.firstElementChild
      return {
        page: page ? pages.indexOf(page) + 1 : null,
        atTopOfPage: first === div || first?.contains(div) || false,
      }
    }),
    anchorIds: Array.from(document.querySelectorAll('.pagedjs_page [id]'))
      .map((el) => el.id)
      .filter((id) => id.length > 0),
  }
})()
