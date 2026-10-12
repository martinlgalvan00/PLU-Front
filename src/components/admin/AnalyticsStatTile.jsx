import { useContext } from 'react'
import { I18nContext } from '../../i18n/context.js'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'

const TONES = ['default', 'celeste', 'gold', 'alert']

/**
 * Tile read-only de métrica para Analítica. Inspirado en admin-ops__kpi del
 * dashboard, sin interacción de navegación.
 */
export default function AnalyticsStatTile({
  label,
  value,
  hint = null,
  delta = null,
  tone = 'default',
  compact = false,
  icon: Icon = null,
  className = '',
}) {
  // Los números siguen el idioma de la app, no el del navegador: sin esto el
  // tile mostraba `1,282` al lado de un `1.611` formateado como es-AR.
  const i18n = useContext(I18nContext)
  const numberLocale = i18n ? (i18n.locale === 'en' ? 'en-US' : 'es-AR') : undefined
  const resolvedTone = TONES.includes(tone) ? tone : 'default'
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null

  return (
    <article
      className={[
        'admin-analytics__stat',
        compact ? 'admin-analytics__stat--compact' : '',
        `admin-analytics__stat--${resolvedTone}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Icon ? (
        <span className="admin-analytics__stat-icon" aria-hidden>
          <Icon size={15} strokeWidth={1.7} />
        </span>
      ) : null}
      <div className="admin-analytics__stat-body">
        <p className="admin-analytics__stat-value">
          {numericValue !== null ? (
            <AnimatedNumber
              className="admin-analytics__stat-number"
              locale={numberLocale}
              value={numericValue}
            />
          ) : (
            <span className="admin-analytics__stat-number">{value}</span>
          )}
          {delta}
        </p>
        <p className="admin-analytics__stat-label">{label}</p>
        {hint ? <p className="admin-analytics__stat-hint">{hint}</p> : null}
      </div>
    </article>
  )
}
