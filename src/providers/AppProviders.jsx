import { I18nProvider } from '../i18n/I18nProvider.jsx'
import { ThemeProvider } from './ThemeProvider.jsx'
import { OAuthProvider } from './OAuthProvider.jsx'

export default function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <OAuthProvider>{children}</OAuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
