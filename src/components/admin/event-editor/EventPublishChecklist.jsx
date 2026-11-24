import { AlertTriangle, ArrowRight, Check, Circle } from 'lucide-react'
import { useI18n } from '../../../i18n/I18nProvider.jsx'
import { PUBLISH_READINESS_GROUPS } from '../../../lib/eventPublishReadiness.js'
import '../../../styles/pages/admin-event-readiness.css'

const base = 'admin.eventEditor.readiness'

const STATE_ICON = { ok: Check, todo: Circle, warning: AlertTriangle }

/** `offering` habla de qué se ofrece (`detail`), no de pendiente/listo. */
function hintKey(item) {
  return item.key === 'offering' ? (item.detail ?? 'default') : item.state
}

/**
 * Checklist de contenido «Listo para publicar». Presentacional: recibe el
 * resultado de `resolveEventPublishReadiness` y no decide nada. Informativo, no
 * bloquea la publicación; el botón «Ir a …» solo aparece si hay `onGoTo`.
 *
 * @param {{
 *   readiness: ReturnType<typeof import('../../../lib/eventPublishReadiness.js').resolveEventPublishReadiness>,
 *   onGoTo?: (target: string, key: string) => void,
 * }} props
 */
export default function EventPublishChecklist({ readiness, onGoTo }) {
  const { t } = useI18n()
  if (!readiness?.items?.length) return null

  const { items, doneCount, total, ready } = readiness
  const places = {
    basics: t('admin.eventEditor.navBasics'),
    sales: t('admin.eventEditor.navSales'),
    visibility: t('admin.eventEditor.navVisibility'),
  }

  return (
    <section className="admin-event-readiness" aria-labelledby="event-readiness-title">
      <header className="admin-event-readiness__head">
        <h5 className="admin-event-readiness__title" id="event-readiness-title">
          {t(`${base}.title`)}
        </h5>
        <p className="admin-event-readiness__count">
          {t(`${base}.count`, { done: doneCount, total })}
        </p>
      </header>
      <p className="admin-event-readiness__summary" role="status">
        {ready ? t(`${base}.summaryReady`) : t(`${base}.summaryPending`)}
      </p>

      {PUBLISH_READINESS_GROUPS.map((group) => {
        const rows = items.filter((item) => item.group === group)
        if (rows.length === 0) return null
        return (
          <div className="admin-event-readiness__group" key={group}>
            <h6 className="admin-event-readiness__group-title">{t(`${base}.groups.${group}`)}</h6>
            <ul className="admin-event-readiness__list">
              {rows.map((item) => {
                const Icon = STATE_ICON[item.state] ?? Circle
                const label = t(`${base}.items.${item.key}.label`)
                const place = places[item.target]
                return (
                  <li
                    className={`admin-event-readiness__row admin-event-readiness__row--${item.state}`}
                    data-key={item.key}
                    data-state={item.state}
                    key={item.key}
                  >
                    <Icon className="admin-event-readiness__icon" size={15} aria-hidden />
                    <div className="admin-event-readiness__copy">
                      <p className="admin-event-readiness__label">
                        <strong>{label}</strong>
                        <span className="admin-event-readiness__state">
                          {t(`${base}.states.${item.state}`)}
                        </span>
                      </p>
                      <p className="admin-event-readiness__hint">
                        {t(`${base}.items.${item.key}.${hintKey(item)}`)}
                      </p>
                    </div>
                    {onGoTo && item.state !== 'ok' ? (
                      <button
                        type="button"
                        className="admin-event-readiness__goto"
                        aria-label={t(`${base}.goToAria`, { item: label, place })}
                        onClick={() => onGoTo(item.target, item.key)}
                      >
                        {t(`${base}.goTo`, { place })}
                        <ArrowRight size={13} aria-hidden />
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
