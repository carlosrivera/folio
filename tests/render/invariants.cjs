// Layout invariants that must hold for every rendered document, independent of
// its content. Each one exists because it broke in production at least once.

/**
 * @param {object} report  structural report produced by collect-report.js
 * @param {{name: string, media: string}} context
 * @returns {string[]} human-readable violations, empty when the layout is sound
 */
function checkInvariants(report, context) {
  const problems = []
  const fail = (message) => problems.push(message)

  if (report.pageCount < 2) {
    fail(`expected a cover plus content, got ${report.pageCount} page(s)`)
    return problems
  }

  const [cover, ...rest] = report.pages

  if (!cover.classes.includes('folio-cover-sheet')) {
    fail(`page 1 is not marked as the cover (classes: ${cover.classes.join(' ') || 'none'})`)
  }
  if (cover.headerCount > 0 || cover.footerCount > 0) {
    fail('page 1 carries running chrome; the cover must stay clean')
  }

  // The regression that shipped: chrome present on screen, absent in print.
  for (const page of rest) {
    if (page.headerCount !== 1) {
      fail(`page ${page.index} has ${page.headerCount} running headers, expected exactly 1`)
    }
    if (page.footerCount !== 1) {
      fail(`page ${page.index} has ${page.footerCount} running footers, expected exactly 1`)
    }
    if (page.headerCount === 1 && page.headerInsidePage === false) {
      fail(`page ${page.index} renders its running header outside its page box`)
    }
    if (page.footerCount === 1 && page.footerInsidePage === false) {
      fail(`page ${page.index} renders its running footer outside its page box`)
    }
    if (page.footerText && !page.footerText.includes(String(page.index))) {
      fail(`page ${page.index} footer does not name its own page number: "${page.footerText}"`)
    }
  }

  for (const page of report.pages) {
    if (page.overflowPx > 0) {
      fail(`page ${page.index} overflows its box by ${page.overflowPx}px`)
    }
  }

  // Manual page breaks: every marker must actually have started a page.
  for (const brk of report.breakDivPages) {
    if (!brk.atTopOfPage) {
      fail(`a page-break marker on page ${brk.page} did not start that page`)
    }
  }
  if (report.leftoverBreakMarkers > 0) {
    fail(`${report.leftoverBreakMarkers} raw page-break marker(s) leaked into the rendered text`)
  }

  if (report.literalBrTags > 0) {
    fail(`${report.literalBrTags} literal <br> tag(s) rendered as visible text`)
  }

  if (report.unrenderedDiagrams > 0) {
    fail(`${report.unrenderedDiagrams} diagram(s) never rendered and still hold their source`)
  }

  for (const figure of report.figures) {
    if (figure.split) {
      fail(`a diagram on page ${figure.page} was split across pages`)
    }
    // A diagram with invalid syntax is meant to degrade to a visible message.
    if (figure.hasError) continue
    if (!figure.hasSvg) {
      fail(`a diagram on page ${figure.page} produced no SVG`)
    } else if (figure.drawingNodes === 0) {
      // The empty-frame symptom: only the <style> survives a Paged.js split.
      fail(`the diagram on page ${figure.page} rendered an empty frame`)
    }
    if (!figure.fitsPage) {
      fail(`the diagram on page ${figure.page} is ${figure.heightPx}px tall and does not fit its page`)
    }
  }

  if (context.name === 'equations.editorial') {
    if (report.equations.length < 5) fail(`only ${report.equations.length} equation(s) rendered`)
    if (report.equations.filter((equation) => equation.display).length < 3) fail('display equations did not render')
    for (const equation of report.equations) {
      if (!equation.hasMathML) fail(`equation on page ${equation.page} has no accessible MathML`)
      if (!equation.fitsPage) fail(`equation on page ${equation.page} extends beyond the content area`)
    }
  }

  if (report.tocRows.length === 0) {
    fail('the index rendered no entries')
  }
  for (const row of report.tocRows) {
    if (!row.counterResolved) {
      fail(`index entry "${row.label}" kept an unresolved page counter: ${row.rawCounter}`)
    }
  }

  // Paged.js resolves cross references with querySelector, which rejects ids
  // that start with a digit.
  for (const id of report.anchorIds) {
    if (/^\d/.test(id)) {
      fail(`anchor id "${id}" starts with a digit and is not a valid selector`)
    }
  }

  return problems.map((message) => `[${context.name} · ${context.media}] ${message}`)
}

/** Stable, diffable summary of which content landed on which page. */
function fingerprint(report) {
  return {
    pageCount: report.pageCount,
    diagramErrors: report.diagramErrors,
    palette: report.palette,
    pages: report.pages.map((page) => ({
      index: page.index,
      classes: page.classes,
      orientation: page.orientation,
      header: page.headerText,
      footer: page.footerText,
      outline: page.outline,
    })),
    index: report.tocRows.map((row) => `${row.label} → ${row.target}`),
  }
}

module.exports = { checkInvariants, fingerprint }
