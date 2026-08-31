import { useEffect, useState } from 'react'
import { BarChart3, Lock } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import {
  analyticsAllowed,
  decideConsent,
  hasDecided,
  onOpenPreferences,
} from '../../services/cookieConsentService.js'

/**
 * CookieConsent — PLU ARG
 *
 * Decisión de cookies en un gesto: banda inferior fija con la acción principal
 * (aceptar), una salida igual de accesible (solo necesarias) y preferencias
 * plegables para quien quiera decidir categoría por categoría. No es un modal:
 * no bloquea la lectura del sitio ni captura el foco.
 *
 * Solo existen dos categorías reales —sesión y medición— y la banda no promete
 * más de eso. Si la analítica está apagada por configuración no hay nada que
 * consentir y el componente no renderiza nada.
 *
 * El footer conserva el acceso: "Preferencias de cookies" reabre esta banda en
 * modo edición, con la última decisión ya cargada.
 */
export default function CookieConsent() {
  const { t } = useI18n()
  const [mode, setMode] = useState(() => (hasDecided() ? 'hidden' : 'banner'))
  const [analytics, setAnalytics] = useState(() => analyticsAllowed())

  useEffect(
    () =>
      onOpenPreferences(() => {
        setAnalytics(analyticsAllowed())
        setMode('manage')
      }),
    [],
  )

  useEffect(() => {
    if (mode !== 'leaving') return undefined
    const timer = setTimeout(() => setMode('hidden'), 240)
    return () => clearTimeout(timer)
  }, [mode])

  // Escape cierra lo plegable sin decidir por la persona: si todavía no había
  // decisión, la banda vuelve a su forma corta; si la había (reapertura desde
  // el footer), se retira sin cambiar nada.
  useEffect(() => {
    if (mode !== 'manage') return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setMode(hasDecided() ? 'leaving' : 'banner')
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

  function save() {
    decideConsent({ analytics })
    setMode('leaving')
  }

  return (
    <div
      className={`cookie-consent${mode === 'leaving' ? ' is-leaving' : ''}`}
      role="region"
      aria-label={t('cookies.regionLabel')}
    >
      <section className="cookie-consent__card">
        <div className="cookie-consent__copy">
          <p className="cookie-consent__title">{t('cookies.title')}</p>
          <p className="cookie-consent__lead">{t('cookies.lead')}</p>
        </div>

        {mode === 'manage' ? (
          <div className="cookie-consent__preferences">
            <div className="cookie-consent__category">
              <span className="cookie-consent__category-icon" aria-hidden>
                <Lock size={14} />
              </span>
              <span className="cookie-consent__category-body">
                <strong>{t('cookies.necessaryTitle')}</strong>
                <span>{t('cookies.necessaryDetail')}</span>
              </span>
              <span className="cookie-consent__fixed">{t('cookies.alwaysOn')}</span>
            </div>
            <div className="cookie-consent__category">
              <span className="cookie-consent__category-icon" aria-hidden>
                <BarChart3 size={14} />
              </span>
              <span className="cookie-consent__category-body">
                <strong>{t('cookies.analyticsTitle')}</strong>
                <span>{t('cookies.analyticsDetail')}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={analytics}
                aria-label={t('cookies.analyticsTitle')}
                className={`cookie-consent__switch${analytics ? ' is-on' : ''}`}
                onClick={() => setAnalytics((current) => !current)}
              >
                <span className="cookie-consent__switch-knob" aria-hidden />
                <span className="cookie-consent__switch-label">
                  {analytics ? t('cookies.analyticsOn') : t('cookies.analyticsOff')}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="cookie-consent__actions">
          {mode === 'manage' ? (
            <>
              {decided ? (
                <button
                  type="button"
                  className="cookie-consent__tertiary"
                  onClick={() => setMode('leaving')}
                >
                  {t('cookies.close')}
                </button>
              ) : null}
              <button type="button" className="cookie-consent__primary" onClick={save}>
                {t('cookies.save')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="cookie-consent__tertiary"
                onClick={() => setMode('manage')}
              >
                {t('cookies.preferences')}
              </button>
              <button type="button" className="cookie-consent__secondary" onClick={onlyNecessary}>
                {t('cookies.onlyNecessary')}
              </button>
              <button type="button" className="cookie-consent__primary" onClick={acceptAll}>
                {t('cookies.acceptAll')}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
