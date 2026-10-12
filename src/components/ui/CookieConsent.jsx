import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import PluGlassMark from './PluGlassMark.jsx'
import {
  decideConsent,
  hasDecided,
  onOpenPreferences,
} from '../../services/cookieConsentService.js'

/**
 * CookieConsent — PLU ARG
 *
 * Decisión de cookies en un gesto: banda inferior fija con la acción principal
 * (aceptar) y una salida igual de accesible (solo necesarias). No es un modal:
 * no bloquea la lectura del sitio ni captura el foco.
 *
 * Solo existen dos categorías reales —sesión y medición— y la banda no promete
 * más de eso. El control fino de la medición vive en el footer ("No medir mi
 * navegación"), no acá. Si la analítica está apagada por configuración no hay
 * nada que consentir y el componente no renderiza nada.
 *
 * El footer conserva el acceso: "Cookies" reabre esta banda con la opción de
 * cerrarla sin cambiar la decisión anterior.
 */
export default function CookieConsent() {
  const { t } = useI18n()
  const [mode, setMode] = useState(() => (hasDecided() ? 'hidden' : 'banner'))

  useEffect(() => onOpenPreferences(() => setMode('banner')), [])

  useEffect(() => {
    if (mode !== 'leaving') return undefined
    const timer = setTimeout(() => setMode('hidden'), 240)
    return () => clearTimeout(timer)
  }, [mode])

  // Escape solo retira la banda cuando ya había una decisión (reapertura desde
  // el footer): sin decisión previa no se decide por la persona.
  useEffect(() => {
    if (mode !== 'banner' || !hasDecided()) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setMode('leaving')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  if (!env.analytics?.enabled || mode === 'hidden') return null

  const decided = hasDecided()

  function acceptAll() {
    decideConsent({ analytics: true })
    setMode('leaving')
  }

  function onlyNecessary() {
    decideConsent({ analytics: false })
    setMode('leaving')
  }

  return (
    <div
      className={`cookie-consent${mode === 'leaving' ? ' is-leaving' : ''}`}
      role="region"
      aria-label={t('cookies.regionLabel')}
    >
      <section className="cookie-consent__card">
        <div className="cookie-consent__intro">
          <PluGlassMark className="cookie-consent__mark" size={40} />
          <div className="cookie-consent__copy">
            <p className="cookie-consent__title">{t('cookies.title')}</p>
            <p className="cookie-consent__lead">{t('cookies.lead')}</p>
          </div>
        </div>

        <div className="cookie-consent__actions">
          {decided ? (
            <button
              type="button"
              className="cookie-consent__tertiary"
              onClick={() => setMode('leaving')}
            >
              {t('cookies.close')}
            </button>
          ) : null}
          <button type="button" className="cookie-consent__secondary" onClick={onlyNecessary}>
            {t('cookies.onlyNecessary')}
          </button>
          <button type="button" className="cookie-consent__primary" onClick={acceptAll}>
            {t('cookies.acceptAll')}
          </button>
        </div>
      </section>
    </div>
  )
}
