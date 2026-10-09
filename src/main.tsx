import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ExportApp } from './ExportApp'
import 'katex/dist/katex.min.css'
import './styles.css'

const isPrintMode = new URLSearchParams(window.location.search).get('mode') === 'print'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrintMode ? <ExportApp /> : <App />}
  </StrictMode>,
)
