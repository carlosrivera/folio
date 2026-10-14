import { useCallback, useEffect, useRef, useState } from 'react'

/** A4 dimensions in CSS pixels; the preview always lays out at the `@page` size. */
const PAGE_PORTRAIT_WIDTH_PX = (210 * 96) / 25.4
const PAGE_LANDSCAPE_WIDTH_PX = (297 * 96) / 25.4
/** Matches the horizontal padding of `.pagination-stage`. */
const STAGE_PADDING_PX = 24
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1
const SCROLL_MARGIN_PX = 16

const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
const round = (value: number) => Math.round(value * 100) / 100

export type PreviewViewport = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  fitToWidth: boolean
  currentPage: number
  zoomIn: () => void
  zoomOut: () => void
  toggleFitToWidth: () => void
  recomputeFitToWidth: () => void
  goToPage: (page: number) => void
  revealAnchor: (id: string) => void
  revealPosition: (position: number) => void
}

export type PreviewViewportOptions = {
  layout?: string
  orientation?: 'portrait' | 'landscape'
}

/**
 * Zoom, page tracking and scroll targeting for the paginated preview. Zoom uses
 * the CSS `zoom` property rather than a transform so the scroll container keeps
 * a correct scrollable height at every level.
 */
export function usePreviewViewport(
  pageCount: number,
  options?: PreviewViewportOptions,
): PreviewViewport {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fitToWidth, setFitToWidth] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)

  const pagesOf = useCallback(
    () => Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('.pagination-output .pagedjs_page') ?? []),
    [],
  )

  const getExpectedPageWidth = useCallback(() => {
    if (options?.orientation === 'landscape') {
      return PAGE_LANDSCAPE_WIDTH_PX
    }
    if (options?.orientation === 'portrait') {
      return PAGE_PORTRAIT_WIDTH_PX
    }
    const firstPage = scrollRef.current?.querySelector<HTMLElement>('.pagination-output .pagedjs_page')
    if (firstPage && firstPage.offsetWidth > 0) {
      return firstPage.offsetWidth
    }
    return PAGE_PORTRAIT_WIDTH_PX
  }, [options?.orientation])

  const applyFitToWidth = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const available = container.clientWidth - STAGE_PADDING_PX * 2
    const pageWidth = getExpectedPageWidth()
    if (available > 0 && pageWidth > 0) {
      setZoom(round(clampZoom(available / pageWidth)))
    }
  }, [getExpectedPageWidth])

  // Reset zoom to fit page width on layout or orientation changes
  const prevLayoutKey = useRef(`${options?.layout}:${options?.orientation}`)
  useEffect(() => {
    const key = `${options?.layout}:${options?.orientation}`
    if (prevLayoutKey.current !== key) {
      prevLayoutKey.current = key
      setFitToWidth(true)
      const container = scrollRef.current
      if (container) {
        container.scrollTop = 0
        const available = container.clientWidth - STAGE_PADDING_PX * 2
        const pageWidth = options?.orientation === 'landscape' ? PAGE_LANDSCAPE_WIDTH_PX : PAGE_PORTRAIT_WIDTH_PX
        if (available > 0) {
          setZoom(round(clampZoom(available / pageWidth)))
        }
      }
    }
  }, [options?.layout, options?.orientation])

  // Fit-to-width has to be recomputed whenever the pane changes size or pages update.
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !fitToWidth) return

    applyFitToWidth()

    const observer = new ResizeObserver(applyFitToWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [fitToWidth, applyFitToWidth, pageCount])

  // Which page is currently under the top of the viewport.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    let queued = false
    const measure = () => {
      queued = false
      const pages = pagesOf()
      if (pages.length === 0 || !container.clientWidth || container.closest('[inert]')) return

      // Pin to last page if scrolled to the very bottom
      if (container.scrollHeight - container.scrollTop - container.clientHeight < 5) {
        setCurrentPage(pages.length)
        return
      }

      // Add 4px tolerance to prevent subpixel floating-point rounding from locking navigation
      const top = container.getBoundingClientRect().top + SCROLL_MARGIN_PX + 4
      let nearest = 1
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].getBoundingClientRect().top <= top) nearest = i + 1
        else break
      }
      setCurrentPage(nearest)
    }

    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(measure)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    measure()
    return () => container.removeEventListener('scroll', onScroll)
  }, [pagesOf, pageCount, zoom])

  const scrollTo = useCallback((element: HTMLElement | undefined, margin: number) => {
    const container = scrollRef.current
    if (!container || !element || !container.clientWidth || container.closest('[inert]')) return
    const delta = element.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTop += delta - margin
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      const pages = pagesOf()
      const target = Math.min(Math.max(page, 1), pages.length)
      if (target >= 1 && target <= pages.length) {
        setCurrentPage(target)
        if (target === 1 && scrollRef.current) {
          scrollRef.current.scrollTop = 0
        } else {
          scrollTo(pages[target - 1], SCROLL_MARGIN_PX)
        }
      }
    },
    [pagesOf, scrollTo],
  )

  const revealAnchor = useCallback(
    (id: string) => {
      const container = scrollRef.current
      if (!container || !id) return
      // Ids are author-derived; CSS.escape keeps an odd slug from throwing.
      const element = container.querySelector<HTMLElement>(`.pagination-output #${CSS.escape(id)}`)
      if (element) scrollTo(element, SCROLL_MARGIN_PX * 2)
    },
    [scrollTo],
  )

  const revealPosition = useCallback((position: number) => {
    const container = scrollRef.current
    if (!container) return
    const blocks = Array.from(container.querySelectorAll<HTMLElement>('.pagination-output [data-source-from][data-source-to]'))
    const target = blocks.filter(block => Number(block.dataset.sourceFrom) <= position && Number(block.dataset.sourceTo) > position)
      .sort((a, b) => (Number(a.dataset.sourceTo) - Number(a.dataset.sourceFrom)) - (Number(b.dataset.sourceTo) - Number(b.dataset.sourceFrom)))[0]
    if (!target) return
    const box = target.getBoundingClientRect()
    const viewport = container.getBoundingClientRect()
    // Leave visible paragraphs in place instead of jumping on each caret move.
    if (box.top < viewport.top + SCROLL_MARGIN_PX || box.bottom > viewport.bottom - SCROLL_MARGIN_PX) scrollTo(target, SCROLL_MARGIN_PX * 2)
  }, [scrollTo])

  const step = useCallback((direction: 1 | -1) => {
    setFitToWidth(false)
    setZoom((current) => round(clampZoom(current + direction * ZOOM_STEP)))
  }, [])

  return {
    scrollRef,
    zoom,
    fitToWidth,
    currentPage,
    zoomIn: useCallback(() => step(1), [step]),
    zoomOut: useCallback(() => step(-1), [step]),
    toggleFitToWidth: useCallback(() => {
      if (fitToWidth) {
        setFitToWidth(false)
        setZoom(1)
      } else {
        setFitToWidth(true)
        applyFitToWidth()
      }
    }, [fitToWidth, applyFitToWidth]),
    recomputeFitToWidth: applyFitToWidth,
    goToPage,
    revealAnchor,
    revealPosition,
  }
}
