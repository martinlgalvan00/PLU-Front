import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AppProviders from './providers/AppProviders.jsx'
import { initTheme } from './lib/theme.js'
import './styles/index.css'

initTheme()
document.documentElement.lang = localStorage.getItem('plu-arg-locale') ?? 'es'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
