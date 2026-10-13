import { useEffect, useRef, useState } from 'react'
import type { FolioRevision } from '../lib/folio-styles'
import { useUi } from './UiLanguage'

type Props = { revisions: FolioRevision[]; onRestore: (id: string) => Promise<void>; onShare: () => void; onClose: () => void }
export function DocumentHistory({ revisions, onRestore, onShare, onClose }: Props) {
  const { tr } = useUi()
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="folio-dialog document-history" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="history-title">
    <h2 id="history-title">{tr('Document history')}</h2>
    <p>{tr('Saved versions include text, images, and styles. Restoring a version creates an unsaved draft.')}</p>
    <ol>{revisions.map((revision, index) => <li key={revision.id}>
      <span><strong>{revision.title}</strong><time dateTime={revision.savedAt}>{new Date(revision.savedAt).toLocaleString()}</time>{index === 0 && <small>{tr('Latest saved version')}</small>}</span>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await onRestore(revision.id) } finally { setBusy(false) } }}>{tr('Restore')}</button>
    </li>)}</ol>
    <small>{tr('Keeps the latest 100 saved versions. Unchanged saves do not add a version.')}</small>
    <div className="folio-dialog-actions"><button disabled={busy} onClick={onShare}>{tr('Save a copy without history…')}</button><button disabled={busy} className="dialog-primary" onClick={onClose}>{tr('Close')}</button></div>
  </dialog>
}
