/* eslint-disable react-refresh/only-export-components */
import { useContext, useEffect, useMemo, useState } from 'react'
import { I18nContext } from './context.js'
import es from './locales/es.js'
import { translate } from './translate.js'
import { documentLangForLocale } from '../lib/localDateTime.js'

const LOCALE_STORAGE_KEY = 'plu-arg-locale'

function syncDocumentLocale(locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = documentLangForLocale(locale)
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
  // en.js (~79 KB + admin.en.js) solo se descarga si el usuario elige inglés;
  // mientras carga se muestra español para no bloquear el primer render.
  const [enMessages, setEnMessages] = useState(null)

  useEffect(() => {
    if (locale !== 'en' || enMessages) return undefined
    let cancelled = false
    import('./locales/en.js').then((module) => {
      if (!cancelled) setEnMessages(module.default)
    })
    return () => {
      cancelled = true
    }
  }, [locale, enMessages])

  const value = useMemo(() => {
    const messages = locale === 'en' ? (enMessages ?? es) : es

    function setLocale(next) {
      if (next !== 'es' && next !== 'en') return
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
      syncDocumentLocale(next)
      setLocaleState(next)
    }

    function t(key, vars) {
      return translate(messages, key, vars)
    }

    return { locale, setLocale, t, messages }
  }, [locale, enMessages])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n debe usarse dentro de I18nProvider')
  return ctx
}
