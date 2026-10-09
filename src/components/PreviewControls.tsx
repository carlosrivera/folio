import { ChevronLeft, ChevronRight, Link2, Link2Off, Maximize2, Minus, Plus } from 'lucide-react'

type Props = {
  zoom: number
  fitToWidth: boolean
  currentPage: number
  pageCount: number
  syncScroll: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToWidth: () => void
  onGoToPage: (page: number) => void
  onToggleSync: () => void
}

export function PreviewControls({
  zoom,
  fitToWidth,
  currentPage,
  pageCount,
  syncScroll,
  onZoomIn,
  onZoomOut,
  onFitToWidth,
  onGoToPage,
  onToggleSync,
}: Props) {
  const atFirst = currentPage <= 1
  const atLast = pageCount === 0 || currentPage >= pageCount

  return (
    <div className="preview-controls">
      <div className="preview-control-group" role="group" aria-label="Page navigation">
        <button type="button" onClick={() => onGoToPage(currentPage - 1)} disabled={atFirst} title="Previous page">
          <ChevronLeft size={13} />
        </button>
        <span className="preview-page-readout" aria-live="polite">
          {pageCount ? `${currentPage} / ${pageCount}` : '—'}
        </span>
        <button type="button" onClick={() => onGoToPage(currentPage + 1)} disabled={atLast} title="Next page">
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="preview-control-group" role="group" aria-label="Zoom">
        <button type="button" onClick={onZoomOut} disabled={zoom <= 0.25} title="Zoom out">
          <Minus size={13} />
        </button>
        <span className="preview-zoom-readout">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={onZoomIn} disabled={zoom >= 2} title="Zoom in">
          <Plus size={13} />
        </button>
        <button
          type="button"
          onClick={onFitToWidth}
          className={fitToWidth ? 'is-active' : undefined}
          title="Fit page to width"
          aria-pressed={fitToWidth}
        >
          <Maximize2 size={13} />
        </button>
      </div>

      <button
        type="button"
        className={`preview-sync-toggle${syncScroll ? ' is-active' : ''}`}
        onClick={onToggleSync}
        title={syncScroll ? 'Following the editor caret' : 'Not following the editor caret'}
        aria-pressed={syncScroll}
      >
        {syncScroll ? <Link2 size={13} /> : <Link2Off size={13} />}
      </button>
    </div>
  )
}
