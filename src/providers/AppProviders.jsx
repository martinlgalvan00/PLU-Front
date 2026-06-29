import { I18nProvider } from '../i18n/I18nProvider.jsx'
import { ThemeProvider } from './ThemeProvider.jsx'

export default function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <I18nProvider>{children}</I18nProvider>
    </ThemeProvider>
  )
}
