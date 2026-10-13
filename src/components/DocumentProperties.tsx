import { useEffect, useRef, useState } from 'react'
import type { DocumentMetadata } from '../lib/document'
import { DOCUMENT_LAYOUTS } from './LayoutPicker'
import { useUi } from './UiLanguage'

const common = [['title', 'Title'], ['date', 'Date']] as const
const report = [['client', 'Client'], ['preparedFor', 'Prepared for'], ['preparedBy', 'Prepared by'], ['validUntil', 'Valid until'], ['documentId', 'Document ID']] as const
const cv = [['name', 'Name'], ['role', 'Role'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Location'], ['website', 'Website']] as const
const invoice = [['invoiceNumber', 'Invoice number'], ['dueDate', 'Due date'], ['from', 'From'], ['client', 'Bill to'], ['currency', 'Currency'], ['total', 'Total'], ['paymentTerms', 'Payment terms'], ['notes', 'Notes']] as const
const scientific = [['authors', 'Authors'], ['affiliations', 'Affiliations'], ['abstract', 'Abstract'], ['keywords', 'Keywords'], ['journal', 'Journal'], ['doi', 'DOI']] as const
const fieldsForLayout = (layout: unknown) => [...common, ...(layout === 'cv' ? cv : layout === 'invoice' ? invoice : layout === 'report' ? report : layout === 'scientific' ? scientific : [])]
const canonical = (key: string) => key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())

export function DocumentProperties({ metadata, onApply, onClose }: {
  metadata: DocumentMetadata; onApply: (values: Record<string, string | boolean>) => void; onClose: () => void
}) {
  const { tr } = useUi()
  const ref = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries([
    ['layout', metadata.layout],
    ['orientation', metadata.orientation],
    ...fieldsForLayout(metadata.layout).map(([key]) => [canonical(key), metadata[key] ?? '']),
    ...(['toc', 'header', 'footer'] as const).map(key => [key, metadata[key] ?? false]),
    ...(['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight'] as const).map(key => [canonical(key), metadata[key] ?? '']),
  ]))
  const fields = fieldsForLayout(values.layout)
  const existingValues = Object.fromEntries([...common, ...report, ...cv, ...invoice, ...scientific].map(([key]) => [canonical(key), metadata[key] ?? '']))
  const [error, setError] = useState('')
  useEffect(() => { ref.current?.showModal() }, [])
  const field = (key: string, label: string) => <label key={key}>{tr(label)}{key === 'abstract' || key === 'affiliations' ? <textarea name={key} rows={key === 'abstract' ? 5 : 2} value={String(values[key] ?? existingValues[key] ?? '')} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /> : <input name={key} value={String(values[key] ?? existingValues[key] ?? '')} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />}</label>
  return <dialog ref={ref} className="folio-dialog document-properties" aria-labelledby="properties-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <form onSubmit={event => { event.preventDefault(); try { onApply(values) } catch (error) { setError(error instanceof Error ? error.message : String(error)) } }}>
      <h2 id="properties-title">{tr('Document properties')}</h2>
      <div className="properties-fields">
        <label>{tr('Document layout')}<select name="layout" value={String(values.layout)} onChange={event => setValues(current => ({ ...current, layout: event.target.value }))}>{DOCUMENT_LAYOUTS.map(layout => <option key={layout.id} value={layout.id}>{tr(layout.title)}</option>)}</select></label>
        <label>{tr('Page orientation')}<select name="orientation" value={String(values.orientation)} onChange={event => setValues(current => ({ ...current, orientation: event.target.value }))}><option value="portrait">{tr('Portrait')}</option><option value="landscape">{tr('Landscape')}</option></select></label>
      </div>
      <div className="properties-fields">{fields.map(([key, label]) => field(canonical(key), label))}</div>
      <details open><summary>{tr('Page layout')}</summary>
        <label className="properties-toggle"><input type="checkbox" checked={Boolean(values.toc)} onChange={event => setValues(current => ({ ...current, toc: event.target.checked }))} />{tr('Table of contents')}</label>
        {(['header', 'footer'] as const).map(kind => <fieldset key={kind}>
          <legend><label className="properties-toggle"><input type="checkbox" checked={Boolean(values[kind])} onChange={event => setValues(current => ({ ...current, [kind]: event.target.checked }))} />{tr(kind === 'header' ? 'Header' : 'Footer')}</label></legend>
          <div className="properties-fields" inert={!values[kind]}>{(['left', 'center', 'right'] as const).map(position => field(`${kind}-${position}`, position[0].toUpperCase() + position.slice(1)))}</div>
        </fieldset>)}
        <small>{tr('Use {title}, {page}, and {pages} in headers and footers.')}</small>
      </details>
      {error && <p role="alert">{tr(error)}</p>}
      <div className="folio-dialog-actions"><button type="submit" className="dialog-primary">{tr('Apply')}</button><button type="button" onClick={onClose}>{tr('Cancel')}</button></div>
    </form>
  </dialog>
}
