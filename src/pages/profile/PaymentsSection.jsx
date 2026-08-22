import { ArrowRight, CircleAlert, Receipt } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import Pill from '../../components/ui/Pill.jsx'
import { money } from '../../lib/format.js'
import { isPaymentActionable } from '../../lib/paymentProgress.js'

/**
 * PaymentsSection — PLU ARG
 *
 * El estado de cada cobro, del lado del atleta. Los emails de pago linkean acá
 * desde que existen (`/mi-cuenta?section=payments`) pero la sección nunca se
 * había construido: quien recibía "revisá el estado de tu pago" no tenía dónde
 * revisarlo.
 *
 * Regla de la pantalla: manda el estado de la ORDEN, no el del último intento.
 * Una afiliación acreditada después de un rechazo por prevención de fraude
 * figura acreditada, y el rechazo queda como historial — que es lo que pasó, en
 * ese orden. `derivePaymentProgress` (src/lib/paymentProgress.js) resuelve eso;
 * acá sólo se dibuja.
 *
 * Es una lista editorial, no una grilla de cards: son registros comparables en
 * orden cronológico, con una sola acción posible por cobro.
 */

function formatDate(value, locale) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Vencimiento al minuto: "venció el 20 de ago" sin la hora no explica nada. */
function formatDateTime(value, locale) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    // es-AR por defecto sale "04:36 p. m."; el reloj de 24 horas es el que se
    // usa acá y el que hace comparable la hora con la del comprobante de MP.
    hour12: locale === 'en',
  })
}

/**
 * Qué pasó con este cobro, en una frase. Un motivo del proveedor sin entrada en
 * el catálogo cae al texto crudo antes que a un hueco.
 */
function useReason(t, locale) {
  return (progress) => {
    if (!progress) return null
    if (progress.reasonText) return progress.reasonText
    if (!progress.reasonCode) return null

    const key = `account.payments.reason.${progress.reasonCode}`
    const translated = t(key, { date: formatDateTime(progress.expiredAt, locale) ?? '' })
    if (translated === key) return null

    // Un vencimiento con intentos fallidos detrás: además de que venció, por
    // qué no entró ninguno. Es la diferencia entre "no llegó a pagar" y "quiso
    // pagar y el medio de pago lo rechazó".
    if (progress.attemptReasonCode) {
      const attemptKey = `account.payments.reason.${progress.attemptReasonCode}`
      const attemptText = t(attemptKey)
      if (attemptText !== attemptKey) return `${translated} ${attemptText}`
    }
    return translated
  }
}

/**
 * Etapas del cobro. Se dibuja sólo mientras la orden sigue abierta: en una
 * acreditada o cerrada el recorrido ya no informa nada que el estado no diga.
 */
function ProgressTrack({ stages, t }) {
  return (
    <ol className="account-payment__track">
      {stages.map((stage) => (
        <li
          key={stage.key}
          className="account-payment__stage"
          data-done={stage.done ? 'true' : 'false'}
          data-current={stage.current ? 'true' : 'false'}
          aria-current={stage.current ? 'step' : undefined}
        >
          <span className="account-payment__stage-mark" aria-hidden />
          <span className="account-payment__stage-label">
            {t(`account.payments.stage.${stage.key}`)}
          </span>
        </li>
      ))}
    </ol>
  )
}

export default function PaymentsSection({ payments = [], onNavigateSection, onRetryPayment }) {
  const { locale, t } = useI18n()
  const resolveReason = useReason(t, locale)

  const rows = [...payments].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  )
  // Cobros que de verdad necesitan que la persona haga algo: rechazado o
  // vencido, sin que la afiliación/inscripción haya quedado resuelta por otra
  // vía. Es el mismo criterio que ya decide si la fila ofrece "Generar un
  // cobro nuevo" — acá se cuenta para el aviso de arriba de la lista.
  const actionableCount = rows.filter((payment) => isPaymentActionable(payment.progress)).length

  return (
    <section id="account-payments" className="account-section account-section--neutral">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--neutral">
          <Receipt size={21} />
        </div>
        <div>
          <span>{t('account.payments.eyebrow')}</span>
          <h2>{t('account.payments.title')}</h2>
        </div>
      </div>

      {rows.length ? (
        <>
          <p className="account-section__lead">{t('account.payments.lead')}</p>

          {actionableCount > 0 ? (
            <div className="account-inline-alert account-inline-alert--danger" role="alert">
              <div className="account-inline-alert__icon">
                <CircleAlert size={18} aria-hidden />
              </div>
              <div className="account-inline-alert__body">
                <strong>
                  {t(
                    actionableCount === 1
                      ? 'account.payments.alertTitle_one'
                      : 'account.payments.alertTitle_other',
                    { count: actionableCount },
                  )}
                </strong>
                <p>{t('account.payments.alertBody')}</p>
              </div>
            </div>
          ) : null}

          <ul className="account-payments-list">
            {rows.map((payment) => {
              const progress = payment.progress
              const reason = resolveReason(progress)
              const date = formatDate(payment.createdAt, locale)
              const channelLabel = t(`account.payments.channel.${progress?.channel ?? 'mercado_pago'}`)
              const isActionable = isPaymentActionable(progress)

              return (
                <li key={payment.id} className="account-payment">
                  <div className="account-payment__head">
                    <div className="account-payment__identity">
                      <h3>{payment.concept}</h3>
                      {payment.conceptDetail ? (
                        <p className="account-payment__detail">{payment.conceptDetail}</p>
                      ) : null}
                      {/* Fecha, canal y referencia en una sola línea: son los
                          tres datos con los que se reclama un cobro, y separar
                          la referencia en su propia fila etiquetada la repetía
                          en cada registro sin agregar nada. */}
                      <p className="account-payment__meta">
                        {[date, channelLabel].filter(Boolean).join(' · ')}
                        {payment.reference ? (
                          <>
                            {' · '}
                            <code>{payment.reference}</code>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="account-payment__figures">
                      <strong className="account-payment__amount">
                        {money(payment.amount, locale)}
                      </strong>
                      <Pill tone={progress?.tone ?? 'neutral'}>
                        {t(`account.payments.state.${progress?.state ?? 'esperando_pago'}`)}
                      </Pill>
                    </div>
                  </div>

                  {progress?.open ? (
                    <ProgressTrack stages={progress.stages} t={t} />
                  ) : null}

                  {reason ? (
                    <p
                      className={`account-payment__reason${isActionable ? ' account-payment__reason--alert' : ''}`}
                    >
                      {isActionable ? <CircleAlert size={14} aria-hidden /> : null}
                      <span>{reason}</span>
                    </p>
                  ) : null}

                  {/* El intento fallido no cambia el estado, pero explica por qué
                      pudo haber llegado un aviso de rechazo antes del comprobante. */}
                  {progress?.settled && progress.failedAttempts > 0 ? (
                    <p className="account-payment__note">
                      {/* `translate` no resuelve plurales: la variante se elige acá. */}
                      {t(
                        progress.failedAttempts === 1
                          ? 'account.payments.settledAfterAttempts_one'
                          : 'account.payments.settledAfterAttempts_other',
                        { count: progress.failedAttempts },
                      )}
                    </p>
                  ) : null}

                  {progress?.mismatch ? (
                    <p className="account-payment__note account-payment__note--alert">
                      {t('account.payments.mismatch')}
                    </p>
                  ) : null}

                  {/* El cobro murió pero el derecho quedó otorgado igual: sin
                      esta línea, "Afiliación: activa" y "Pagos: afiliación
                      cancelada" se leen como una contradicción del sistema
                      cuando en realidad describen dos hechos distintos. */}
                  {progress?.resolvedElsewhere ? (
                    <p className="account-payment__note account-payment__note--alert">
                      {t(`account.payments.resolvedElsewhere.${progress.outcome.kind}`)}
                    </p>
                  ) : null}

                  {/* Sin `resolvedElsewhere`: ofrecerle pagar de nuevo a quien
                      ya tiene la afiliación activa es empujarlo a pagar dos
                      veces lo mismo. */}
                  {isActionable && typeof onRetryPayment === 'function' ? (
                    <button
                      type="button"
                      className="account-payment__action"
                      onClick={() => onRetryPayment(payment)}
                    >
                      {t('account.payments.action.retry')}
                      <ArrowRight size={14} aria-hidden />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <div className="account-empty">
          <p className="account-empty__title">{t('account.payments.emptyTitle')}</p>
          <p className="account-empty__lead">{t('account.payments.emptyLead')}</p>
          {typeof onNavigateSection === 'function' ? (
            <button
              type="button"
              className="account-empty__action"
              onClick={() => onNavigateSection('account-membership')}
            >
              {t('account.payments.emptyAction')}
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
