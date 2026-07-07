import { useI18n } from '../i18n/I18nProvider.jsx'
import { getContent } from '../lib/content/index.js'

export function useContent() {
  const { locale } = useI18n()
  return getContent(locale)
}
