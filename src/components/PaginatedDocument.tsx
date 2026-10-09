import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Previewer } from 'pagedjs'
import { AlertTriangle } from 'lucide-react'
import { parseDocument, formatChromeText, type DocumentTheme } from '../lib/document'
import { ReportTemplate } from './ReportTemplate'
import { CvTemplate } from './CvTemplate'
import { SimpleTemplate } from './SimpleTemplate'
import { InvoiceTemplate } from './InvoiceTemplate'
import { getTranslations, type SupportedLanguage } from '../lib/i18n'
import { transformCvHtml } from '../lib/cv-html'
import { themeOverrideCss } from '../lib/theme-tokens'
import appStyles from '../styles.css?inline'

/**
 * Paged.js only honours paged-media CSS (@page, break-before/after, named pages)
 * that it has parsed itself through its polisher. Anything left in the document's
 * own stylesheet is invisible to it, so the stylesheet has to be handed over on
 * every preview run.
 *
 * `@media print` blocks are stripped first: Paged.js hoists print rules into the
 * always-applied set, and this project's print block resets `@page` margins to 0
 * and flattens the on-screen page stack.
 */
function withoutPrintMedia(css: string): string {
  const atMedia = /@media[^{]*\bprint\b[^{]*\{/gi
  let result = ''
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = atMedia.exec(css)) !== null) {
    let depth = 1
    let index = match.index + match[0].length
    while (index < css.length && depth > 0) {
      const char = css[index]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      index += 1
    }
    result += css.slice(cursor, match.index)
    cursor = index
    atMedia.lastIndex = index
  }

  return result + css.slice(cursor)
}

const pagedStylesheet = withoutPrintMedia(appStyles)

// Space a diagram may occupy, derived from the `@page` box minus the padding and
// margins of `.mermaid-figure`. A diagram larger than this would overflow its
// page, and Paged.js tears an oversized SVG apart when it has to break inside
// one, leaving an empty frame behind.
const PAGE_BUDGETS = {
  portrait: { width: 158, height: 215 },
  landscape: { width: 235, height: 140 },
} as const
const PX_TO_MM = 25.4 / 96

type Props = {
  markdown: string
  overrideTheme?: DocumentTheme
  overrideLang?: SupportedLanguage
  onReady?: (pages: number) => void
  onPageCount?: (pages: number) => void
}

function getMermaidThemeVariables(theme: DocumentTheme) {
  if (theme === 'voltage') {
    return {
      primaryColor: '#f2f8d9',
      primaryTextColor: '#111111',
      primaryBorderColor: '#759000',
      lineColor: '#55584d',
      secondaryColor: '#ffffff',
      secondaryTextColor: '#111111',
      tertiaryColor: '#f7f7f3',
      tertiaryTextColor: '#111111',
      clusterBkg: '#f7f7f3',
      clusterBorder: '#c9ccc0',
      edgeLabelBackground: '#ffffff',
      textColor: '#111111',
      fontSize: '18px',
    }
  }

  if (theme === 'graphite') {
    return {
      primaryColor: '#eef8d8',
      primaryTextColor: '#18181b',
      primaryBorderColor: '#65a30d',
      lineColor: '#71717a',
      secondaryColor: '#fafafa',
      secondaryTextColor: '#18181b',
      tertiaryColor: '#f4f4f5',
      tertiaryTextColor: '#18181b',
      clusterBkg: '#f4f4f5',
      clusterBorder: '#d4d4d8',
      edgeLabelBackground: '#ffffff',
      textColor: '#18181b',
      fontSize: '18px',
    }
  }

  if (theme === 'contrast') {
    return {
      primaryColor: '#f5f5f5',
      primaryTextColor: '#111111',
      primaryBorderColor: '#111111',
      lineColor: '#777777',
      secondaryColor: '#ffffff',
      tertiaryColor: '#fafafa',
      clusterBkg: '#fafafa',
      clusterBorder: '#d4d4d4',
      edgeLabelBackground: '#ffffff',
      fontSize: '18px',
    }
  }

  if (theme === 'slate') {
    return {
      primaryColor: '#e0f2fe',
      primaryTextColor: '#0f172a',
      primaryBorderColor: '#0284c7',
      lineColor: '#64748b',
      secondaryColor: '#f1f5f9',
      tertiaryColor: '#f8fafc',
      clusterBkg: '#f8fafc',
      clusterBorder: '#cbd5e1',
      edgeLabelBackground: '#ffffff',
      fontSize: '18px',
    }
  }

  if (theme === 'nocturne') {
    return {
      primaryColor: '#f0e9ff',
      primaryTextColor: '#322b4d',
      primaryBorderColor: '#8a3fa0',
      lineColor: '#8d84a8',
      secondaryColor: '#faf7ff',
      tertiaryColor: '#f7f3ff',
      clusterBkg: '#faf7ff',
      clusterBorder: '#e0d5f5',
      edgeLabelBackground: '#ffffff',
      fontSize: '18px',
    }
  }

  if (theme === 'scientific') {
    return {
      primaryColor: '#edf2f5',
      primaryTextColor: '#202a32',
      primaryBorderColor: '#47657a',
      lineColor: '#61717b',
      secondaryColor: '#f8fafb',
      tertiaryColor: '#ffffff',
      clusterBkg: '#f8fafb',
      clusterBorder: '#cbd5dc',
      edgeLabelBackground: '#ffffff',
      textColor: '#202a32',
      fontSize: '18px',
    }
  }

  // default 'editorial'
  return {
    primaryColor: '#edf2ef',
    primaryTextColor: '#18342e',
    primaryBorderColor: '#4f6f66',
    lineColor: '#8c8980',
    secondaryColor: '#fff7f2',
    tertiaryColor: '#f6f1e8',
    clusterBkg: '#f6f1e8',
    clusterBorder: '#d8d7d0',
    edgeLabelBackground: '#ffffff',
    fontSize: '18px',
  }
}

function decodeDiagramSource(diagram: HTMLElement): string {
  const attr = diagram.getAttribute('data-mermaid-source')
  if (!attr) return diagram.textContent?.trim() ?? ''
  try {
    const binary = atob(attr)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    try {
      return decodeURIComponent(escape(atob(attr)))
    } catch {
      return attr
    }
  }
}

/**
 * Pins the diagram to an explicit size that fits inside a single page. Mermaid
 * emits its natural pixel size; left alone, a tall flowchart is rendered larger
 * than the page box and Paged.js splits the SVG, which drops its drawing and
 * leaves an empty frame.
 */
function sizeDiagramToPage(svgEl: SVGElement, figure: HTMLElement | null) {
  const viewBox = svgEl.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const naturalWidth = viewBox && viewBox.length === 4 && viewBox[2] > 0 ? viewBox[2] : 0
  const naturalHeight = viewBox && viewBox.length === 4 && viewBox[3] > 0 ? viewBox[3] : 0
  if (!naturalWidth || !naturalHeight) return

  const budget = figure?.closest('.folio-landscape') ? PAGE_BUDGETS.landscape : PAGE_BUDGETS.portrait
  const requested = figure?.getAttribute('data-diagram-width')
  // `full` fills the measure even when the drawing is small; `half` keeps a
  // narrow diagram narrow so it can sit beside surrounding prose comfortably.
  const maxWidth = requested === 'half' ? budget.width / 2 : budget.width
  const naturalMm = naturalWidth * PX_TO_MM
  const ratio = naturalHeight / naturalWidth

  let width = requested === 'full' ? maxWidth : Math.min(naturalMm, maxWidth)
  let height = width * ratio
  if (height > budget.height) {
    height = budget.height
    width = height / ratio
  }

  svgEl.removeAttribute('width')
  svgEl.removeAttribute('height')
  svgEl.style.width = `${width.toFixed(2)}mm`
  svgEl.style.height = `${height.toFixed(2)}mm`
}

// Diagram sources rarely change while prose is being edited, but every preview
// pass used to re-render all of them from scratch. Keyed by theme as well,
// since the theme decides the palette baked into the SVG.
const DIAGRAM_CACHE_LIMIT = 64
const diagramCache = new Map<string, string>()

function cacheDiagram(key: string, svg: string) {
  if (diagramCache.size >= DIAGRAM_CACHE_LIMIT) {
    const oldest = diagramCache.keys().next().value
    if (oldest !== undefined) diagramCache.delete(oldest)
  }
  diagramCache.set(key, svg)
}

async function renderMermaidDiagrams(container: HTMLElement, run: number, theme: DocumentTheme) {
  const diagrams = Array.from(container.querySelectorAll<HTMLElement>('[data-mermaid-source]'))
  if (diagrams.length === 0) return

  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      // Without this, a diagram with invalid syntax makes Mermaid inject a large
      // "Syntax error" graphic straight into document.body, outside the paginated
      // container — which then prints as a junk page at the end of the PDF.
      suppressErrorRendering: true,
      theme: 'base',
      fontFamily:
        theme === 'voltage'
          ? 'JetBrains Mono, Menlo, monospace'
          : theme === 'editorial'
            ? '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
            : 'Inter, -apple-system, sans-serif',
      themeVariables: getMermaidThemeVariables(theme),
      flowchart: { 
        curve: 'basis', 
        htmlLabels: true,
        useMaxWidth: false,
        nodeSpacing: 40,
        rankSpacing: 40,
        // Mermaid wraps node text at ~200px by default, which turns a stacked
        // flowchart into a narrow column: tall, thin, and mostly empty page.
        wrappingWidth: 380,
      },
    })

    await Promise.all(diagrams.map(async (diagram, index) => {
      const source = decodeDiagramSource(diagram)
      if (!source) return

      const cacheKey = `${theme}\u0000${source}`
      try {
        const cached = diagramCache.get(cacheKey)
        const svg = cached ?? (await mermaid.render(`folio-mermaid-${run}-${index}`, source)).svg
        if (!cached) cacheDiagram(cacheKey, svg)
        diagram.innerHTML = svg
        diagram.removeAttribute('data-mermaid-source')
        
        const svgEl = diagram.querySelector('svg')
        if (svgEl) {
          sizeDiagramToPage(svgEl, diagram.closest<HTMLElement>('.mermaid-figure'))
          svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        }
      } catch (error) {
        console.error('Mermaid render error on diagram:', source, error)
        const message = window.document.createElement('div')
        message.className = 'mermaid-error'
        message.textContent = 'Unable to render this Mermaid diagram. Check its syntax.'
        diagram.replaceWith(message)
      }
    }))
  } catch (outerErr) {
    console.error('Unable to initialize or render Mermaid diagrams:', outerErr)
  }
}

function renderHeaderElement(
  leftText: string,
  centerText: string,
  rightText: string,
): HTMLElement {
  const header = document.createElement('div')
  header.className = 'folio-page-header'
  header.append(Object.assign(document.createElement('span'), {
    className: 'folio-page-left',
    textContent: leftText,
  }))
  if (centerText) {
    header.append(Object.assign(document.createElement('span'), {
      className: 'folio-page-center',
      textContent: centerText,
    }))
  }
  header.append(Object.assign(document.createElement('span'), {
    className: 'folio-page-right',
    textContent: rightText,
  }))
  return header
}

function renderFooterElement(
  leftText: string,
  centerText: string,
  rightText: string,
): HTMLElement {
  const footer = document.createElement('div')
  footer.className = 'folio-page-footer'
  footer.append(Object.assign(document.createElement('span'), {
    className: 'folio-page-left',
    textContent: leftText,
  }))
  if (centerText) {
    footer.append(Object.assign(document.createElement('span'), {
      className: 'folio-page-center',
      textContent: centerText,
    }))
  }
  footer.append(Object.assign(document.createElement('span'), {
    className: 'folio-page-right',
    textContent: rightText,
  }))
  return footer
}

function addPageChrome(
  root: HTMLElement,
  doc: ReturnType<typeof parseDocument>,
  lang: SupportedLanguage,
  theme: DocumentTheme,
) {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page'))
  const t = getTranslations(lang)
  const layout = doc.metadata.layout

  if (layout === 'cv') {
    const cvHeader = transformCvHtml(doc.html).header
    const candidateName = cvHeader?.name || doc.metadata.name || doc.metadata.title
    const role = cvHeader?.role || doc.metadata.role || doc.metadata.subtitle || doc.metadata.tagline
    const contactParts = [
      doc.metadata.email,
      doc.metadata.phone,
      doc.metadata.linkedin ? `linkedin.com/in/${doc.metadata.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}` : undefined,
      doc.metadata.github ? `github.com/${doc.metadata.github.replace(/^https?:\/\/(www\.)?github\.com\//, '')}` : undefined,
      doc.metadata.website,
    ].filter(Boolean) as string[]
    const contactSummary = contactParts.slice(0, 3).join(' · ')

    pages.forEach((page, index) => {
      page.classList.add('folio-cv-sheet', `theme-${theme}`)
      const box = page.querySelector<HTMLElement>('.pagedjs_pagebox') ?? page

      if (index === 0) {
        page.classList.add('folio-cv-first-page')
        if (pages.length > 1 && doc.metadata.footer) {
          const defaultLeft = contactSummary || candidateName || ''
          const defaultRight = `${t.page} 1 ${t.of} ${pages.length}`
          const left = doc.metadata.footerLeft ? formatChromeText(doc.metadata.footerLeft, doc, index, pages.length, lang) : defaultLeft
          const center = doc.metadata.footerCenter ? formatChromeText(doc.metadata.footerCenter, doc, index, pages.length, lang) : ''
          const right = doc.metadata.footerRight ? formatChromeText(doc.metadata.footerRight, doc, index, pages.length, lang) : defaultRight
          const footer = renderFooterElement(left, center, right)
          footer.classList.add('folio-cv-footer')
          box.append(footer)
        }
        return
      }

      if (doc.metadata.header) {
        const roleSuffix = role && role.length <= 40 ? ` · ${role}` : ''
        const defaultLeft = candidateName ? `${candidateName}${roleSuffix}` : t.curriculumVitae
        const defaultRight = candidateName ? t.curriculumVitae : ''
        const left = doc.metadata.headerLeft ? formatChromeText(doc.metadata.headerLeft, doc, index, pages.length, lang) : defaultLeft
        const center = doc.metadata.headerCenter ? formatChromeText(doc.metadata.headerCenter, doc, index, pages.length, lang) : ''
        const right = doc.metadata.headerRight ? formatChromeText(doc.metadata.headerRight, doc, index, pages.length, lang) : defaultRight
        const header = renderHeaderElement(left, center, right)
        header.classList.add('folio-cv-header')
        box.append(header)
      }

      if (doc.metadata.footer) {
        const defaultLeft = contactSummary || candidateName || ''
        const defaultRight = `${t.page} ${index + 1} ${t.of} ${pages.length}`
        const left = doc.metadata.footerLeft ? formatChromeText(doc.metadata.footerLeft, doc, index, pages.length, lang) : defaultLeft
        const center = doc.metadata.footerCenter ? formatChromeText(doc.metadata.footerCenter, doc, index, pages.length, lang) : ''
        const right = doc.metadata.footerRight ? formatChromeText(doc.metadata.footerRight, doc, index, pages.length, lang) : defaultRight
        const footer = renderFooterElement(left, center, right)
        footer.classList.add('folio-cv-footer')
        box.append(footer)
      }
    })
    return
  }

  if (layout === 'simple') {
    pages.forEach((page, index) => {
      page.classList.add('folio-simple-sheet', `theme-${theme}`)
      if (page.querySelector('.folio-toc-page') !== null) {
        page.classList.add('folio-toc-sheet')
      }
      const box = page.querySelector<HTMLElement>('.pagedjs_pagebox') ?? page

      if (doc.metadata.header) {
        const defaultLeft = doc.metadata.title || ''
        const defaultRight = doc.metadata.date || ''
        const left = doc.metadata.headerLeft ? formatChromeText(doc.metadata.headerLeft, doc, index, pages.length, lang) : defaultLeft
        const center = doc.metadata.headerCenter ? formatChromeText(doc.metadata.headerCenter, doc, index, pages.length, lang) : ''
        const right = doc.metadata.headerRight ? formatChromeText(doc.metadata.headerRight, doc, index, pages.length, lang) : defaultRight
        box.append(renderHeaderElement(left, center, right))
      }

      if (doc.metadata.footer) {
        const defaultLeft = doc.metadata.title && pages.length > 1 ? doc.metadata.title : ''
        const defaultRight = `${t.page} ${index + 1} ${t.of} ${pages.length}`
        const left = doc.metadata.footerLeft ? formatChromeText(doc.metadata.footerLeft, doc, index, pages.length, lang) : defaultLeft
        const center = doc.metadata.footerCenter ? formatChromeText(doc.metadata.footerCenter, doc, index, pages.length, lang) : ''
        const right = doc.metadata.footerRight ? formatChromeText(doc.metadata.footerRight, doc, index, pages.length, lang) : defaultRight
        box.append(renderFooterElement(left, center, right))
      }
    })
    return
  }

  if (layout === 'invoice') {
    const invoiceId = doc.metadata.invoiceNumber || doc.metadata.documentId
    pages.forEach((page, index) => {
      page.classList.add('folio-invoice-sheet', `theme-${theme}`)
      const box = page.querySelector<HTMLElement>('.pagedjs_pagebox') ?? page

      if (index === 0) {
        // Page 1 of invoice has full invoice header; running top header only if explicitly requested
        if (doc.metadata.headerLeft || doc.metadata.headerRight) {
          const left = doc.metadata.headerLeft ? formatChromeText(doc.metadata.headerLeft, doc, index, pages.length, lang) : ''
          const center = doc.metadata.headerCenter ? formatChromeText(doc.metadata.headerCenter, doc, index, pages.length, lang) : ''
          const right = doc.metadata.headerRight ? formatChromeText(doc.metadata.headerRight, doc, index, pages.length, lang) : ''
          box.append(renderHeaderElement(left, center, right))
        }

        if (doc.metadata.footer) {
          const defaultLeft = doc.metadata.paymentTerms
            ? doc.metadata.paymentTerms
            : (doc.metadata.client ? `${t.billTo}: ${doc.metadata.client}` : '')
          const defaultRight = pages.length > 1 ? `${t.page} 1 ${t.of} ${pages.length}` : ''
          const left = doc.metadata.footerLeft ? formatChromeText(doc.metadata.footerLeft, doc, index, pages.length, lang) : defaultLeft
          const center = doc.metadata.footerCenter ? formatChromeText(doc.metadata.footerCenter, doc, index, pages.length, lang) : ''
          const right = doc.metadata.footerRight ? formatChromeText(doc.metadata.footerRight, doc, index, pages.length, lang) : defaultRight
          box.append(renderFooterElement(left, center, right))
        }
        return
      }

      // Subsequent invoice pages
      if (doc.metadata.header) {
        const defaultLeft = `${t.invoice} #${invoiceId}${doc.metadata.client ? ` · ${doc.metadata.client}` : ''}`
        const defaultRight = doc.metadata.date || ''
        const left = doc.metadata.headerLeft ? formatChromeText(doc.metadata.headerLeft, doc, index, pages.length, lang) : defaultLeft
        const center = doc.metadata.headerCenter ? formatChromeText(doc.metadata.headerCenter, doc, index, pages.length, lang) : ''
        const right = doc.metadata.headerRight ? formatChromeText(doc.metadata.headerRight, doc, index, pages.length, lang) : defaultRight
        box.append(renderHeaderElement(left, center, right))
      }

      if (doc.metadata.footer) {
        const defaultLeft = doc.metadata.client || ''
        const defaultRight = `${t.page} ${index + 1} ${t.of} ${pages.length}`
        const left = doc.metadata.footerLeft ? formatChromeText(doc.metadata.footerLeft, doc, index, pages.length, lang) : defaultLeft
        const center = doc.metadata.footerCenter ? formatChromeText(doc.metadata.footerCenter, doc, index, pages.length, lang) : ''
        const right = doc.metadata.footerRight ? formatChromeText(doc.metadata.footerRight, doc, index, pages.length, lang) : defaultRight
        box.append(renderFooterElement(left, center, right))
      }
    })
    return
  }

  // Default SOW layout chrome
  pages.forEach((page, index) => {
    if (index === 0) {
      page.classList.add('folio-cover-sheet', `theme-${theme}`)
      return
    }

    if (page.querySelector('.folio-toc-page') !== null) {
      page.classList.add('folio-toc-sheet')
    }

    const box = page.querySelector<HTMLElement>('.pagedjs_pagebox') ?? page

    if (doc.metadata.header) {
      const attribution = doc.metadata.preparedBy || doc.metadata.client
      const typeLabel = doc.metadata.kicker || t.report
      const defaultLeft = attribution ? `${attribution} / ${typeLabel}` : typeLabel
      const defaultRight = doc.metadata.documentId
      const left = doc.metadata.headerLeft ? formatChromeText(doc.metadata.headerLeft, doc, index, pages.length, lang) : defaultLeft
      const center = doc.metadata.headerCenter ? formatChromeText(doc.metadata.headerCenter, doc, index, pages.length, lang) : ''
      const right = doc.metadata.headerRight ? formatChromeText(doc.metadata.headerRight, doc, index, pages.length, lang) : defaultRight
      box.append(renderHeaderElement(left, center, right))
    }

    if (doc.metadata.footer) {
      const defaultLeft = doc.metadata.client
      const defaultRight = `${t.page} ${index + 1} ${t.of} ${pages.length}`
      const left = doc.metadata.footerLeft ? formatChromeText(doc.metadata.footerLeft, doc, index, pages.length, lang) : defaultLeft
      const center = doc.metadata.footerCenter ? formatChromeText(doc.metadata.footerCenter, doc, index, pages.length, lang) : ''
      const right = doc.metadata.footerRight ? formatChromeText(doc.metadata.footerRight, doc, index, pages.length, lang) : defaultRight
      box.append(renderFooterElement(left, center, right))
    }
  })
}

function releasePreviewer(previewer: Previewer | null) {
  if (!previewer) return
  try {
    const polisher = previewer.polisher as { styleEl?: Element; destroy?: () => void } | undefined
    if (polisher?.styleEl && typeof polisher.destroy === 'function') {
      polisher.destroy()
    }
  } catch {
    // Teardown is best-effort; avoid throwing if polisher was never attached
  }

  try {
    const chunker = previewer.chunker as { pagesArea?: Element; pageTemplate?: Element; destroy?: () => void } | undefined
    if (chunker?.pagesArea && chunker?.pageTemplate && typeof chunker.destroy === 'function') {
      chunker.destroy()
    }
  } catch {
    // Teardown is best-effort; avoid throwing if chunker was never setup
  }
}

export function PaginatedDocument({
  markdown,
  overrideTheme,
  overrideLang,
  onReady,
  onPageCount,
}: Props) {
  const sourceRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const backbufferRef = useRef<HTMLDivElement>(null)
  const runRef = useRef(0)
  const activePreviewerRef = useRef<Previewer | null>(null)
  const stagingPreviewerRef = useRef<Previewer | null>(null)
  const hasEverRenderedRef = useRef(false)
  const indicatorTimerRef = useRef<number | null>(null)

  const [layingOut, setLayingOut] = useState(true)
  const [showIndicator, setShowIndicator] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const document = useMemo(() => parseDocument(markdown), [markdown])

  const activeTheme = overrideTheme || document.metadata.theme || 'editorial'
  const activeLang = overrideLang || document.metadata.lang || 'en'

  const retryRender = useCallback(() => {
    setRenderError(null)
    setRetryNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    const run = ++runRef.current
    const isFirstRender = !hasEverRenderedRef.current

    setLayingOut(true)

    // Show the indicator immediately on first load, or after 250ms on edits to avoid visual bouncing
    if (isFirstRender) {
      setShowIndicator(true)
    } else {
      indicatorTimerRef.current = window.setTimeout(() => {
        setShowIndicator(true)
      }, 250)
    }

    // Debounce live typing to allow fluent keystrokes without thrashing,
    // or immediate if retry was requested or first mount.
    const debounceMs = isFirstRender || retryNonce > 0 ? 0 : 250

    const timer = window.setTimeout(async () => {
      if (!sourceRef.current || !pagesRef.current || !backbufferRef.current) {
        if (run === runRef.current) {
          setShowIndicator(false)
          setLayingOut(false)
        }
        return
      }

      const scrollContainer = pagesRef.current.closest('.preview-scroll')
      const previousScroll = scrollContainer ? scrollContainer.scrollTop : 0

      // Clean up any stale staging previewer from a previously cancelled run
      if (stagingPreviewerRef.current) {
        releasePreviewer(stagingPreviewerRef.current)
        stagingPreviewerRef.current = null
      }
      backbufferRef.current.replaceChildren()

      let previewer: Previewer | null = null

      try {
        previewer = new Previewer()
        stagingPreviewerRef.current = previewer

        const template = window.document.createElement('div')
        template.innerHTML = sourceRef.current.innerHTML
        await renderMermaidDiagrams(template, run, activeTheme)
        if (run !== runRef.current) {
          releasePreviewer(previewer)
          return
        }

        // On first render or export, render directly to pagesRef for exact geometry matching.
        // On live edits, render to backbufferRef to prevent any flicker while typing.
        const targetContainer = isFirstRender ? pagesRef.current : backbufferRef.current

        // Layout into target container
        const layoutPromise = previewer.preview(
          template.innerHTML,
          [{ 'folio-paged.css': pagedStylesheet }],
          targetContainer,
        )

        // Safety timeout against Paged.js infinite break loops (e.g. pathological markup)
        const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Layout timed out after 15 seconds')), 15000)
        })

        const flow = await Promise.race([layoutPromise, timeoutPromise])
        if (run !== runRef.current) {
          releasePreviewer(previewer)
          return
        }

        addPageChrome(
          targetContainer,
          document,
          activeLang,
          activeTheme,
        )

        const generatedPages = targetContainer.querySelectorAll('.pagedjs_page')
        if (generatedPages.length === 0) {
          throw new Error('No pages were generated')
        }

        // On live edits, atomically swap the completed sheets into the visible output
        if (!isFirstRender) {
          pagesRef.current.replaceChildren(...Array.from(backbufferRef.current.childNodes))
        }

        // Tear down old previewer stylesheet now that new pages are in place
        releasePreviewer(activePreviewerRef.current)
        activePreviewerRef.current = previewer
        stagingPreviewerRef.current = null

        hasEverRenderedRef.current = true
        setRenderError(null)

        const count = flow.total || generatedPages.length
        onPageCount?.(count)
        onReady?.(count)

        if (scrollContainer) {
          requestAnimationFrame(() => {
            scrollContainer.scrollTop = previousScroll
          })
        }
      } catch (error) {
        console.error('Unable to paginate document', error)
        if (previewer) {
          releasePreviewer(previewer)
        }
        stagingPreviewerRef.current = null
        if (backbufferRef.current) {
          backbufferRef.current.replaceChildren()
        }

        if (run === runRef.current) {
          setRenderError(
            error instanceof Error ? error.message : 'Unable to lay out document',
          )
        }
      } finally {
        if (run === runRef.current) {
          if (indicatorTimerRef.current !== null) {
            window.clearTimeout(indicatorTimerRef.current)
            indicatorTimerRef.current = null
          }
          setShowIndicator(false)
          setLayingOut(false)
        }
      }
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      if (indicatorTimerRef.current !== null) {
        window.clearTimeout(indicatorTimerRef.current)
        indicatorTimerRef.current = null
      }
    }
  }, [document, activeTheme, activeLang, retryNonce, onPageCount, onReady])

  useEffect(() => () => {
    releasePreviewer(activePreviewerRef.current)
    activePreviewerRef.current = null
    releasePreviewer(stagingPreviewerRef.current)
    stagingPreviewerRef.current = null
  }, [])

  // Emitted inside the stage so it reaches both the hidden measurement source
  // and the rendered sheets — and, because ExportApp renders this component,
  // the export window as well.
  const overrideCss = themeOverrideCss(activeTheme, document.metadata.themeOverrides)

  return (
    <div className={`pagination-stage theme-${activeTheme}`} aria-busy={layingOut}>
      {overrideCss && <style>{overrideCss}</style>}
      <div ref={sourceRef} className="pagination-source">
        {document.metadata.layout === 'cv' ? (
          <CvTemplate
            document={document}
            overrideTheme={activeTheme}
            overrideLang={activeLang}
          />
        ) : document.metadata.layout === 'invoice' ? (
          <InvoiceTemplate
            document={document}
            overrideTheme={activeTheme}
            overrideLang={activeLang}
          />
        ) : document.metadata.layout === 'simple' ? (
          <SimpleTemplate
            document={document}
            overrideTheme={activeTheme}
            overrideLang={activeLang}
          />
        ) : (
          <ReportTemplate 
            document={document} 
            overrideTheme={activeTheme} 
            overrideLang={activeLang} 
          />
        )}
      </div>
      {showIndicator && (
        <div className="layout-indicator">
          <span /> Laying out pages
        </div>
      )}
      {renderError && hasEverRenderedRef.current && (
        <div className="preview-error-pill" role="alert">
          <AlertTriangle size={12} />
          <span>Preview showing last valid draft · Layout or syntax issue</span>
          <button type="button" onClick={retryRender}>
            Retry
          </button>
        </div>
      )}
      {renderError && !hasEverRenderedRef.current && (
        <div className="preview-error-card" role="alert">
          <AlertTriangle size={24} />
          <h3>Unable to lay out document</h3>
          <p>{renderError}</p>
          <button type="button" onClick={retryRender} className="preview-retry-btn">
            Retry Render
          </button>
        </div>
      )}
      <div ref={pagesRef} className="pagination-output" />
      <div ref={backbufferRef} className="pagination-backbuffer" aria-hidden="true" />
    </div>
  )
}
