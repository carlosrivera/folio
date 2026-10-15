import { useEffect, useRef, useState } from 'react'
import { useUi } from './UiLanguage'

const SCALES = [
  { value: 1, label: '1× · compact' },
  { value: 2, label: '2× · sharp text' },
  { value: 3, label: '3× · print quality' },
]

/**
 * Options for the PNG export: a resolution for the page images and whether to
 * add the stitched long image that joins every page top to bottom.
 */
export function PngExportDialog({ pageCount, suggestedName, onSubmit, onClose }: {
  pageCount: number
  suggestedName: string
  onSubmit: (options: { scale: number; stitched: boolean }) => void
  onClose: () => void
}) {
  const { tr } = useUi()
  const ref = useRef<HTMLDialogElement>(null)
  const [scale, setScale] = useState(2)
  const [stitched, setStitched] = useState(true)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="png-export-dialog folio-dialog" aria-labelledby="png-export-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <form onSubmit={event => { event.preventDefault(); onSubmit({ scale, stitched }) }}>
      <h2 id="png-export-title">{tr('Export PNG images')}</h2>
      <p>{tr('Pages are saved as numbered files beside the location you choose, rasterized from the finished PDF so they match it exactly.')}</p>
      <fieldset className="png-export-scale">
        <legend>{tr('Resolution')}</legend>
        {SCALES.map(({ value, label }) => <label key={value}><input type="radio" name="png-scale" checked={scale === value} onChange={() => setScale(value)} /> {tr(label)}</label>)}
      </fieldset>
      <label className="png-export-stitched"><input type="checkbox" checked={stitched} onChange={event => setStitched(event.target.checked)} /> {tr('Also save a stitched long image joining every page')}</label>
      {stitched && pageCount > 1 && <p className="png-export-names">{suggestedName}-1.png … {suggestedName}-{pageCount}.png + {suggestedName}-long.png</p>}
      <div className="folio-dialog-actions"><button type="submit" className="dialog-primary">{tr('Export')}</button><button type="button" onClick={onClose}>{tr('Cancel')}</button></div>
    </form>
  </dialog>
}
