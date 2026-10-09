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
  const cvHeader = metadata.layout === 'cv' ? transformCvHtml(parsedDoc.html).header : undefined
  const cvAuthor = cvHeader?.name || metadata.name || metadata.title
  const cvSubject = cvHeader?.role || metadata.role || 'Curriculum Vitae'

  // The effective cover colour, read off the rendered sheet so a document that
  // overrides `--cover-bg` gets that colour in the PDF's cover bands too.
  const coverBox = document.querySelector('.pagination-output .folio-cover-sheet .pagedjs_pagebox')
  const coverColor = coverBox ? getComputedStyle(coverBox).backgroundColor : null

  return {
    pageCount: pages.length,
    coverColor,
    outline,
    landscapePages,
    metadata: {
      title: metadata.title || cvAuthor,
      author: metadata.layout === 'cv' ? cvAuthor : metadata.preparedBy,
      subject: metadata.layout === 'cv' ? cvSubject : metadata.client,
      keywords: metadata.layout === 'cv'
        ? (['CV', 'Curriculum Vitae', cvSubject].filter(Boolean) as string[])
        : [metadata.documentId, metadata.client].filter(Boolean),
    },
  }
}

export function ExportApp() {
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [theme, setTheme] = useState<DocumentTheme | undefined>()
  const [lang, setLang] = useState<SupportedLanguage | undefined>()

  useEffect(() => {
    return window.folio?.onExportPayload((payload) => {
      if (typeof payload === 'string') {
        setMarkdown(payload)
      } else if (payload && typeof payload === 'object') {
        setMarkdown(payload.markdown)
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
      overrideTheme={theme}
      overrideLang={lang}
      onReady={onReady}
    />
  )
}
