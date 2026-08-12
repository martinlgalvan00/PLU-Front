import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AppProviders from './providers/AppProviders.jsx'
import PageErrorBoundary from './components/layout/PageErrorBoundary.jsx'
import { initTheme } from './lib/theme.js'
import './styles/index.css'

initTheme()
document.documentElement.lang = localStorage.getItem('plu-arg-locale') ?? 'es'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProviders>
      {/* Red de seguridad para las vistas que se devuelven antes de los shells
          (admin, check-in, security gate): sin esto un error de render deja
          pantalla en blanco. Va dentro de AppProviders para que el fallback
          tenga i18n y tema. */}
      <PageErrorBoundary onGoHome={() => window.location.assign('/')}>
        <App />
      </PageErrorBoundary>
    </AppProviders>
  </StrictMode>,
)
