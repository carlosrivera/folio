import type { FolioStyles } from './lib/folio-styles'
import { useCallback, useEffect, useState } from 'react'
import { PaginatedDocument } from './components/PaginatedDocument'
import { parseDocument, type DocumentTheme } from './lib/document'
import { transformCvHtml } from './lib/cv-html'
import type { SupportedLanguage } from './lib/i18n'

/** Outline entry and page geometry the main process needs to finish the PDF. */
function collectExportReport(markdown: string) {
  const pages = Array.from(document.querySelectorAll<HTMLElement>('.pagination-output .pagedjs_page'))
  const pageOf = (element: Element) => {
    const page = element.closest('.pagedjs_page')
    return page ? pages.indexOf(page as HTMLElement) + 1 : 1
  }

  const outline = Array.from(
    document.querySelectorAll<HTMLElement>('.pagination-output .document-body h1, .pagination-output .document-body h2, .pagination-output .document-body h3'),
  )
    .map((heading) => ({
      title: (heading.textContent || '').replace(/\s+/g, ' ').trim(),
      level: Number(heading.tagName.slice(1)),
      page: pageOf(heading),
    }))
    .filter((entry) => entry.title.length > 0)

  const landscapePages = pages
    .map((page, index) => (page.classList.contains('pagedjs_landscape_page') ? index + 1 : 0))
    .filter((index) => index > 0)

  const parsedDoc = parseDocument(markdown)
  const { metadata } = parsedDoc
  const isCv = metadata.layout === 'cv'
  const isInvoice = metadata.layout === 'invoice'
  const isSimple = metadata.layout === 'simple'
  const isScientific = metadata.layout === 'scientific'

  const cvHeader = isCv ? transformCvHtml(parsedDoc.html).header : undefined
  const author = isCv
    ? (cvHeader?.name || metadata.name || metadata.title)
    : isInvoice
      ? (metadata.from || metadata.preparedBy || metadata.name || '')
      : (metadata.authors || metadata.preparedBy || metadata.name || '')

  const title = isInvoice && metadata.invoiceNumber
    ? (metadata.title || `Invoice ${metadata.invoiceNumber}`)
    : (metadata.title || author || 'Document')

  const subject = isCv
    ? (cvHeader?.role || metadata.role || 'Curriculum Vitae')
    : isInvoice
      ? (metadata.client ? `Invoice for ${metadata.client}` : 'Invoice')
      : (metadata.journal || metadata.client || metadata.title)

  const keywords = isCv
    ? (['CV', 'Curriculum Vitae', subject].filter(Boolean) as string[])
    : isInvoice
      ? (['Invoice', metadata.invoiceNumber || metadata.documentId, metadata.client].filter(Boolean) as string[])
      : isScientific
        ? (metadata.keywords || '').split(/[;,]/).map(word => word.trim()).filter(Boolean)
      : isSimple
        ? ([metadata.title].filter(Boolean) as string[])
        : ([metadata.documentId, metadata.client].filter(Boolean) as string[])

  const darkPages = pages
    .map((page, index) => (page.classList.contains('folio-dark-sheet') || page.classList.contains('folio-cover-sheet') ? index + 1 : 0))
    .filter((index) => index > 0)

  // The effective cover colour, read off the rendered sheet so a document that
  // overrides `--cover-bg` gets that colour in the PDF's cover bands too.
  const coverBox = document.querySelector('.pagination-output .folio-cover-sheet .pagedjs_pagebox, .pagination-output .folio-dark-sheet .pagedjs_pagebox')
  const coverColor = coverBox ? getComputedStyle(coverBox).backgroundColor : null

  return {
    pageCount: pages.length,
    coverColor,
    outline,
    landscapePages,
    darkPages,
    // Whole-document orientation: the print window uses it to pick the paper
    // size, so landscape files print unrotated instead of page-by-page.
    paperOrientation: metadata.orientation === 'landscape' ? ('landscape' as const) : ('portrait' as const),
    metadata: {
      title,
      author,
      subject,
      keywords,
    },
  }
}

export function ExportApp() {
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [documentPath, setDocumentPath] = useState<string | undefined>()
  const [styles, setStyles] = useState<FolioStyles>()
  const [theme, setTheme] = useState<DocumentTheme | undefined>()
  const [lang, setLang] = useState<SupportedLanguage | undefined>()

  // The bundled stylesheet's base `@page` is portrait A4, and Chrome lets it
  // decide the printed paper. A document that is landscape as a whole must
  // override it from the renderer: a late author-origin rule wins the cascade
  // and every page then prints unrotated on landscape paper.
  useEffect(() => {
    if (!markdown) return
    if (parseDocument(markdown).metadata.orientation !== 'landscape') return
    const style = window.document.createElement('style')
    style.textContent = '@page { size: A4 landscape !important; margin: 0 !important; }'
    window.document.head.append(style)
    return () => { style.remove() }
  }, [markdown])

  useEffect(() => {
    return window.folio?.onExportPayload((payload) => {
      if (typeof payload === 'string') {
        setMarkdown(payload)
      } else if (payload && typeof payload === 'object') {
        setMarkdown(payload.markdown)
        setDocumentPath(payload.documentPath)
        setStyles(payload.styles)
        if (payload.theme) setTheme(payload.theme as DocumentTheme)
        if (payload.lang) setLang(payload.lang as SupportedLanguage)
      }
    })
  }, [])

  const onReady = useCallback(async () => {
    await document.fonts.ready
    const report = markdown ? collectExportReport(markdown) : undefined
    requestAnimationFrame(() => requestAnimationFrame(() => window.folio?.notifyExportReady(report)))
  }, [markdown])

  if (markdown === null) return null
  return (
    <PaginatedDocument
      markdown={markdown}
      styles={styles}
      documentPath={documentPath}
      overrideTheme={theme}
      overrideLang={lang}
      onReady={onReady}
    />
  )
}
