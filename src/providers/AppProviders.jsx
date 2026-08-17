import { I18nProvider } from '../i18n/I18nProvider.jsx'
import { ThemeProvider } from './ThemeProvider.jsx'
import { OAuthProvider } from './OAuthProvider.jsx'
import MotionProvider from '../motion/MotionProvider.tsx'
import { AppConfigProvider } from './AppConfigProvider.jsx'
import { AdminTourProvider } from './AdminTourProvider.jsx'
import AdminTourOverlay from '../components/admin/AdminTourOverlay.jsx'

export default function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <AppConfigProvider>
        <I18nProvider>
          <OAuthProvider>
            <MotionProvider>
              {/* Un solo motor de recorridos guiados para toda la app -- lo usan
                  tanto el panel admin como los flujos públicos (afiliación,
                  inscripción, registro). El nombre quedó "Admin" de cuando
                  era exclusivo del panel; sigue siendo genérico por dentro. */}
              <AdminTourProvider>
                {children}
                <AdminTourOverlay />
              </AdminTourProvider>
            </MotionProvider>
          </OAuthProvider>
        </I18nProvider>
      </AppConfigProvider>
    </ThemeProvider>
  )
}
