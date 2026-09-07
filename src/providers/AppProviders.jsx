import { lazy, Suspense } from 'react'
import { I18nProvider } from '../i18n/I18nProvider.jsx'
import { ThemeProvider } from './ThemeProvider.jsx'
import { OAuthProvider } from './OAuthProvider.jsx'
import MotionProvider from '../motion/MotionProvider.tsx'
import { AdminTourProvider, useAdminTour } from './AdminTourProvider.jsx'
import { HelpProvider } from './HelpProvider.jsx'
import { AssistProvider } from './AssistProvider.jsx'

const AdminTourOverlay = lazy(() => import('../components/admin/AdminTourOverlay.jsx'))

function ActiveTourLayer() {
  const { activeTour } = useAdminTour()
  if (!activeTour) return null
  return (
    <Suspense fallback={null}>
      <AdminTourOverlay />
    </Suspense>
  )
}

export default function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <OAuthProvider>
          <MotionProvider>
            {/* Modo asistido: escala y navegación recortada. Va por fuera de
                la ayuda porque lo leen también el panel y la barra. */}
            <AssistProvider>
              {/* Un solo motor de recorridos guiados para toda la app -- lo usan
                tanto el panel admin como los flujos públicos (afiliación,
                inscripción, registro). El nombre quedó "Admin" de cuando
                era exclusivo del panel; sigue siendo genérico por dentro. */}
              <AdminTourProvider>
                {/* La ayuda guiada pública vive acá arriba porque la abren
                  superficies que no son hermanas del panel (la barra sticky
                  de la portada, el propio botón flotante). */}
                <HelpProvider>
                  {children}
                  <ActiveTourLayer />
                </HelpProvider>
              </AdminTourProvider>
            </AssistProvider>
          </MotionProvider>
        </OAuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
