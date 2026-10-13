import { useEffect, useRef, useState } from 'react'
import { useUi } from './UiLanguage'
export type InsertKind = 'link' | 'image' | 'table'
export type InsertValues = { label: string; source: string; file?: File; rows: number; columns: number; caption: string; width: number }
export function InsertDialog({ kind, initialLabel, initialFile, initialSource = '', initialCaption = '', initialWidth = 100, editing = false, onSubmit, onClose }: {
  kind: InsertKind; initialLabel: string; initialFile?: File; initialSource?: string; initialCaption?: string; initialWidth?: number; editing?: boolean
  onSubmit: (values: InsertValues) => Promise<void> | void; onClose: () => void
}) {
  const { tr } = useUi()
  const ref = useRef<HTMLDialogElement>(null)
  const [label, setLabel] = useState(initialLabel)
  const [source, setSource] = useState(initialSource)
  const [caption, setCaption] = useState(initialCaption)
  const [width, setWidth] = useState(initialWidth)
  const [file, setFile] = useState(initialFile)
  const [rows, setRows] = useState(3)
  const [columns, setColumns] = useState(2)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="insert-dialog folio-dialog" aria-labelledby="insert-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onSubmit({ label, source, file, rows, columns, caption, width }) } catch (error) { setError(error instanceof Error ? error.message : 'Could not insert content'); setBusy(false) } }}>
      <h2 id="insert-dialog-title">{tr(`${editing ? 'Edit' : 'Insert'} ${kind}`)}</h2>
      {kind === 'table' ? <div className="insert-table-size">
        <label>{tr('Body rows')}<input type="number" min={1} max={50} value={rows} onChange={event => setRows(Number(event.target.value))} autoFocus required /></label>
        <label>{tr('Columns')}<input type="number" min={1} max={12} value={columns} onChange={event => setColumns(Number(event.target.value))} required /></label>
      </div> : <>
        <label>{tr(kind === 'image' ? 'Alt text' : 'Link text')}<input value={label} onChange={event => setLabel(event.target.value)} autoFocus placeholder={tr(kind === 'image' ? 'Describe the image' : 'Text to display')} /></label>
        <label>{tr(kind === 'image' ? 'Image URL' : 'Destination')}<input value={source} onChange={event => { setSource(event.target.value); setFile(undefined) }} required={!file} placeholder={kind === 'image' ? 'https://example.com/image.png' : 'https://example.com'} /></label>
        {kind === 'image' && <>
          <label>{tr('Or choose an image')}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" onChange={event => { setFile(event.target.files?.[0]); setSource('') }} />{file && <small>{file.name}</small>}<small>{tr('Draft images stay in temporary storage and move beside the document when saved.')}</small></label>
          <label>{tr('Caption')}<input value={caption} onChange={event => setCaption(event.target.value)} /></label>
          <label>{tr('Width')} · {width}%<input type="range" min={10} max={100} step={5} value={width} onChange={event => setWidth(Number(event.target.value))} /></label>
        </>}
      </>}
      {error && <p role="alert">{tr(error)}</p>}
      <div className="folio-dialog-actions"><button type="submit" className="dialog-primary" disabled={busy}>{tr(busy ? 'Inserting…' : editing ? 'Apply' : 'Insert')}</button><button type="button" onClick={onClose} disabled={busy}>{tr('Cancel')}</button></div>
    </form>
  </dialog>
}
