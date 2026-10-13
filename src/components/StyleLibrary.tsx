import { useState } from 'react'
import { Copy, Plus } from 'lucide-react'
import type { DocumentTheme } from '../lib/document'
import { sameStyle, uniqueStyleName, type SavedStyle } from '../lib/style-library'
import { DOCUMENT_THEMES, themeLabel } from './ThemePicker'
import { useUi } from './UiLanguage'

export type StyleLibraryProps = {
  savedStyles: SavedStyle[]
  activeStyleId: string | null
  onApplyStyle: (style: SavedStyle) => void
  onSaveStyle: (style: SavedStyle) => boolean
  onSelectTheme: (theme: DocumentTheme) => void
}

export function StyleLibrary({ theme, overrides, savedStyles, activeStyleId, onApplyStyle, onSaveStyle, onSelectTheme }: StyleLibraryProps & { theme: DocumentTheme; overrides: Record<string, string> }) {
  const { tr } = useUi()
  const [creating, setCreating] = useState<'new' | 'copy' | null>(null)
  const [name, setName] = useState('')
  const [base, setBase] = useState(theme)
  const active = savedStyles.find(style => style.id === activeStyleId && style.theme === theme)
  const start = (mode: 'new' | 'copy') => {
    setCreating(mode)
    setBase(theme)
    setName(uniqueStyleName(mode === 'copy' ? `${active?.name ?? themeLabel(theme)} ${tr('copy')}` : tr('Untitled style'), savedStyles))
  }
  const selectValue = active ? active.id : theme
  return <div className="style-library">
    <label className="style-library-select">{tr('Style')}
      <select value={selectValue} onChange={event => {
        const style = savedStyles.find(style => style.id === event.target.value)
        if (style) onApplyStyle(style)
        else onSelectTheme(event.target.value as DocumentTheme)
      }}>
        <optgroup label={tr('Built-in styles')}>{DOCUMENT_THEMES.map(item => <option value={item.id} key={item.id}>{tr(item.label)}</option>)}</optgroup>
        {savedStyles.length > 0 && <optgroup label={tr('My styles')}>{savedStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</optgroup>}
      </select>
    </label>
    <div className="style-library-actions">
      <button type="button" onClick={() => start('copy')}><Copy size={13} />{tr('Duplicate style')}</button>
      <button type="button" onClick={() => start('new')}><Plus size={13} />{tr('New style')}</button>
      {active && <button type="button" disabled={sameStyle(active, theme, overrides)} onClick={() => onSaveStyle({ ...active, overrides: { ...overrides } })}>{tr('Save style changes')}</button>}
    </div>
    {creating && <form className="style-create-form" onSubmit={event => {
      event.preventDefault()
      const style: SavedStyle = { id: `style-${crypto.randomUUID()}`, name: uniqueStyleName(name, savedStyles), theme: creating === 'copy' ? theme : base, overrides: creating === 'copy' ? { ...overrides } : {} }
      if (onSaveStyle(style)) { onApplyStyle(style); setCreating(null) }
    }}>
      <label>{tr('Style name')}<input autoFocus value={name} maxLength={70} onChange={event => setName(event.target.value)} required /></label>
      {creating === 'new' && <label>{tr('Start from')}<select value={base} onChange={event => setBase(event.target.value as DocumentTheme)}>{DOCUMENT_THEMES.map(item => <option value={item.id} key={item.id}>{tr(item.label)}</option>)}</select></label>}
      <div className="style-library-actions"><button type="submit" disabled={!name.trim()}>{tr('Create style')}</button><button type="button" onClick={() => setCreating(null)}>{tr('Cancel')}</button></div>
    </form>}
    <p className="style-library-note">{tr('Styles travel with this document. Save as a Folio document to keep the style library.')}</p>
  </div>
}
