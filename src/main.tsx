import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SettingsApp } from './SettingsApp'
import { ExportApp } from './ExportApp'
import 'katex/dist/katex.min.css'
import './styles.css'
import { UiProvider } from './components/UiLanguage'

const mode = new URLSearchParams(window.location.search).get('mode')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiProvider>{mode === 'print' ? <ExportApp /> : mode === 'settings' ? <SettingsApp /> : <App />}</UiProvider>
  </StrictMode>,
)
