import { useEffect, useState } from 'react'
import { Check, EyeOff } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import { isOptedOut, setOptedOut } from '../../services/analyticsService.js'
import { onConsentChange } from '../../services/cookieConsentService.js'

/**
 * AnalyticsOptOut — PLU ARG
 *
 * Salida explícita de la medición de uso del sitio.
 *
 * No es una cortesía: la analítica vincula los eventos al atleta cuando hay
 * sesión iniciada, así que son datos personales. `docs/ANALYTICS.md` ya lo
 * declaraba como no opcional, pero el control existía sólo como función
 * (`setOptedOut`) sin ninguna pantalla que lo ofreciera.
 *
 * Si el tracker está apagado por configuración no se renderiza nada: ofrecer
 * salir de algo que no está midiendo confunde más de lo que informa.
 */
export default function AnalyticsOptOut({ className = '' }) {
  const { t } = useI18n()
  const [optedOut, setOptedOutState] = useState(() => isOptedOut())

  // La decisión de cookies escribe el mismo opt-out; sin esta escucha el
  // botón quedaba con el estado anterior hasta recargar.
  useEffect(
    () =>
      onConsentChange(() => {
        setOptedOutState(isOptedOut())
      }),
    [],
  )

  if (!env.analytics?.enabled) return null

  function toggle() {
    const next = !optedOut
    setOptedOut(next)
    setOptedOutState(next)
  }

  return (
    <button
      type="button"
      className={['analytics-optout', optedOut ? 'analytics-optout--active' : '', className]
        .filter(Boolean)
        .join(' ')}
      onClick={toggle}
      // El estado va en el nombre accesible y no sólo en el ícono: con el color
      // apagado, un lector de pantalla no tendría cómo saber si está activo.
      aria-pressed={optedOut}
    >
      {optedOut ? <Check size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
      <span>{optedOut ? t('analytics.optOutActive') : t('analytics.optOut')}</span>
    </button>
  )
}
