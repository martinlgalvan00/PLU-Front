import { createContext, useContext, useMemo, useState } from 'react'
import en from './locales/en.js'
import es from './locales/es.js'
import { translate } from './translate.js'

const LOCALE_STORAGE_KEY = 'plu-arg-locale'
const LOCALES = { es, en }

const I18nContext = createContext(null)

function syncDocumentLocale(locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dataset.localeRegion = locale === 'es' ? 'ar' : 'us'
}

function getInitialLocale() {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  return stored === 'en' || stored === 'es' ? stored : 'es'
}

const initialLocale = getInitialLocale()
syncDocumentLocale(initialLocale)

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(initialLocale)

  const value = useMemo(() => {
    const messages = LOCALES[locale] ?? LOCALES.es

    function setLocale(next) {
      if (!LOCALES[next]) return
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
      syncDocumentLocale(next)
      setLocaleState(next)
    }

    function t(key, vars) {
      return translate(messages, key, vars)
    }

    return { locale, setLocale, t, messages }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n debe usarse dentro de I18nProvider')
  return ctx
}
