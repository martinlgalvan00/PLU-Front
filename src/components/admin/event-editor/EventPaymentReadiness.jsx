import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle } from 'lucide-react'
import { useI18n } from '../../../i18n/I18nProvider.jsx'

const STATE_ICON = {
  ready: CheckCircle2,
  warning: AlertTriangle,
  missing: AlertTriangle,
  loading: CircleDashed,
  off: MinusCircle,
}

/**
 * Resumen previo a guardar de los medios de cobro: qué verá quien paga y a qué
 * destino se acredita. Solo lee el modelo de `buildPaymentReadiness`; el
 * servidor sigue validando al publicar.
 */
export default function EventPaymentReadiness({ readiness }) {
  const { t } = useI18n()
  const base = 'admin.eventEditor'

  return (
    <section
      className="admin-event-form__readiness"
      aria-labelledby="event-payment-readiness-title"
      aria-busy={readiness.loading || undefined}
    >
      <header>
        <h5 id="event-payment-readiness-title">{t(`${base}.paymentReadinessTitle`)}</h5>
        <p>{t(`${base}.paymentReadinessHint`)}</p>
        <small>{t(`${base}.paymentReadinessCount`, { count: readiness.offeredCount })}</small>
      </header>
      {readiness.loading ? (
        <p className="admin-event-form__notice" role="status">
          {t(`${base}.paymentReadinessLoading`)}
        </p>
      ) : (
        <ul>
          {readiness.rows.map((row) => {
            const Icon = STATE_ICON[row.state] ?? CircleDashed
            return (
              <li data-state={row.state} key={row.channel}>
                <Icon aria-hidden size={15} />
                <strong>{t(`${base}.paymentChannelShort.${row.channel}`)}</strong>
                <span>{t(`${base}.${row.detail.key}`, row.detail.params)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
