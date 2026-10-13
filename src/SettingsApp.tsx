import { useUi } from './components/UiLanguage'
import { AppThemeToggle } from './components/AppThemeToggle'
import { useAppTheme } from './lib/use-app-theme'
import { useEditorPreference, useNumberPreference } from './lib/use-editor-preference'

export function SettingsApp() {
  const { tr, language, setLanguage } = useUi()
  const theme = useAppTheme()
  const [numbers, setNumbers] = useEditorPreference('line-numbers', true)
  const [folding, setFolding] = useEditorPreference('folding', true)
  const [activeLine, setActiveLine] = useEditorPreference('active-line', true)
  const [autosave, setAutosave] = useEditorPreference('autosave', false)
  const [spellcheck, setSpellcheck] = useEditorPreference('spellcheck', true)
  const [fontSize, setFontSize] = useNumberPreference('font-size', 16, 12, 24)
  const [lineSpacing, setLineSpacing] = useNumberPreference('line-spacing', 1.68, 1.2, 2.2)
  const [textWidth, setTextWidth] = useNumberPreference('text-width', 90, 40, 140)
  const [paneWidth, setPaneWidth] = useNumberPreference('pane-width', 46, 25, 75)
  const [selection, setSelection] = useEditorPreference('preview-selection', true)
  return <main className="settings-window">
    <header><h1>{tr('Settings')}</h1><p>{tr('Changes apply immediately and are saved for next time.')}</p></header>
    <section aria-labelledby="appearance-settings"><h2 id="appearance-settings">{tr('Appearance')}</h2>
      <div className="settings-row"><span>{tr('App appearance')}</span><AppThemeToggle value={theme.preference} onChange={theme.setPreference} /></div>
    </section>
    <section aria-labelledby="language-settings"><h2 id="language-settings">{tr('Interface language')}</h2><label className="settings-row"><span>{tr('Interface language')}</span><select aria-label={tr('Interface language')} value={language} onChange={event => setLanguage(event.target.value === 'es' ? 'es' : 'en')}><option value="en">🇺🇸 English</option><option value="es">🇪🇸 Español</option></select></label></section>
    <section aria-labelledby="editor-settings"><h2 id="editor-settings">{tr('Editor')}</h2>
      <label className="settings-row"><span>{tr('Show line numbers')}</span><input type="checkbox" checked={numbers} onChange={event => setNumbers(event.target.checked)} /></label>
      <label className="settings-row"><span>{tr('Show folding arrows')}</span><input type="checkbox" checked={folding} onChange={event => setFolding(event.target.checked)} /></label>
      <label className="settings-row"><span>{tr('Highlight the current line')}<small>{tr('A subtle guide separate from selected text.')}</small></span><input type="checkbox" checked={activeLine} onChange={event => setActiveLine(event.target.checked)} /></label>
    </section>
    <section aria-labelledby="writing-settings"><h2 id="writing-settings">{tr('Writing')}</h2>
      <label className="settings-row"><span>{tr('Font size')}</span><input type="number" min="12" max="24" value={fontSize} onChange={event => setFontSize(Math.max(12, Math.min(24, Number(event.target.value) || 16)))} /></label>
      <label className="settings-row"><span>{tr('Line spacing')}</span><input type="number" min="1.2" max="2.2" step="0.1" value={lineSpacing} onChange={event => setLineSpacing(Math.max(1.2, Math.min(2.2, Number(event.target.value) || 1.68)))} /></label>
      <label className="settings-row"><span>{tr('Text width')}<small>{tr('Maximum characters per line.')}</small></span><input type="number" min="40" max="140" value={textWidth} onChange={event => setTextWidth(Math.max(40, Math.min(140, Number(event.target.value) || 90)))} /></label>
      <label className="settings-row"><span>{tr('Editor pane width')} · {Math.round(paneWidth)}%</span><input type="range" min="25" max="75" value={paneWidth} onChange={event => setPaneWidth(Number(event.target.value))} /></label>
      <label className="settings-row"><span>{tr('Spellcheck')}</span><input type="checkbox" checked={spellcheck} onChange={event => setSpellcheck(event.target.checked)} /></label>
      <label className="settings-row"><span>{tr('Autosave existing files')}<small>{tr('Save after a pause in typing. New documents use Save first.')}</small></span><input type="checkbox" checked={autosave} onChange={event => setAutosave(event.target.checked)} /></label>
    </section>
    <section aria-labelledby="preview-settings"><h2 id="preview-settings">{tr('Document preview')}</h2>
      <label className="settings-row"><span>{tr('Show selected text in the preview')}<small>{tr('Highlight editor selections on the page. Exported PDFs stay unchanged.')}</small></span><input type="checkbox" checked={selection} onChange={event => setSelection(event.target.checked)} /></label>
    </section>
  </main>
}
