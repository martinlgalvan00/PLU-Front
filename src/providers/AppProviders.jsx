import { I18nProvider } from '../i18n/I18nProvider.jsx'
import { ThemeProvider } from './ThemeProvider.jsx'
import { OAuthProvider } from './OAuthProvider.jsx'
import MotionProvider from '../motion/MotionProvider.tsx'

export default function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <OAuthProvider>
          <MotionProvider>{children}</MotionProvider>
        </OAuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
