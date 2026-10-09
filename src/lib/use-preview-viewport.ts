import { useCallback, useEffect, useRef, useState } from 'react'

/** A4 width in CSS pixels; the preview always lays out at the `@page` size. */
const PAGE_WIDTH_PX = (210 * 96) / 25.4
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
  goToPage: (page: number) => void
  revealAnchor: (id: string) => void
}

/**
 * Zoom, page tracking and scroll targeting for the paginated preview. Zoom uses
 * the CSS `zoom` property rather than a transform so the scroll container keeps
 * a correct scrollable height at every level.
 */
export function usePreviewViewport(pageCount: number): PreviewViewport {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fitToWidth, setFitToWidth] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const pagesOf = useCallback(
    () => Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('.pagination-output .pagedjs_page') ?? []),
    [],
  )

  // Fit-to-width has to be recomputed whenever the pane changes size.
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !fitToWidth) return

    const apply = () => {
      const available = container.clientWidth - STAGE_PADDING_PX * 2
      if (available > 0) setZoom(round(clampZoom(available / PAGE_WIDTH_PX)))
    }
    apply()

    const observer = new ResizeObserver(apply)
    observer.observe(container)
    return () => observer.disconnect()
  }, [fitToWidth])

  // Which page is currently under the top of the viewport.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    let queued = false
    const measure = () => {
      queued = false
      const pages = pagesOf()
      if (pages.length === 0) return
      const top = container.getBoundingClientRect().top + SCROLL_MARGIN_PX
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
    if (!container || !element) return
    const delta = element.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTop += delta - margin
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      const pages = pagesOf()
      const target = Math.min(Math.max(page, 1), pages.length)
      scrollTo(pages[target - 1], SCROLL_MARGIN_PX)
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
      setFitToWidth((on) => {
        if (on) setZoom(1)
        return !on
      })
    }, []),
    goToPage,
    revealAnchor,
  }
}
