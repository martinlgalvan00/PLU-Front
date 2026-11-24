import '../../styles/components/ticket-checkout-flow.css'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { TICKET_CHECKOUT_STEPS } from '../../services/ticketCheckoutProgress.js'
import { money } from '../../lib/format.js'

/**
 * Checkout de entradas en tres pasos que se reemplazan, no se apilan: la
 * persona ve una sola tarea a la vez y el resumen con el botón queda siempre
 * a mano (columna fija en desktop, barra pegada abajo en mobile).
 */

const STEP_LABEL_KEY = {
  tickets: 'pages.tickets.flow.stepTickets',
  buyer: 'pages.tickets.flow.stepBuyer',
  payment: 'pages.tickets.flow.stepPayment',
}

/**
 * Dónde está la compra. Los pasos ya hechos son botones para volver; el
 * siguiente no se puede saltar, porque depende de lo que se carga en este.
 */
export function TicketCheckoutSteps({ step, onStepChange, t }) {
  const currentIndex = TICKET_CHECKOUT_STEPS.indexOf(step)

  return (
    <nav className="ticket-flow-steps" aria-label={t('pages.tickets.flow.railAria')}>
      <ol>
        {TICKET_CHECKOUT_STEPS.map((item, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'
          const label = t(STEP_LABEL_KEY[item])
          const mark = (
            <span className="ticket-flow-steps__mark" aria-hidden>
              {state === 'done' ? <Check size={12} strokeWidth={3} /> : index + 1}
            </span>
          )
          return (
            <li key={item} className="ticket-flow-steps__step" data-state={state}>
              {state === 'done' ? (
                <button
                  type="button"
                  onClick={() => onStepChange(item)}
                  aria-label={t('pages.tickets.flow.editStep', { step: label })}
                >
                  {mark}
                  <span className="ticket-flow-steps__label">{label}</span>
                </button>
              ) : (
                <span aria-current={state === 'current' ? 'step' : undefined}>
                  {mark}
                  <span className="ticket-flow-steps__label">{label}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Resumen de la compra con la única acción del paso. Es el mismo nodo en todos
 * los tamaños: en desktop acompaña al costado, en mobile se pega abajo y
 * esconde el detalle para dejar solo cantidad, total y botón.
 */
export function TicketOrderSummary({
  actionLabel,
  actionDisabled = false,
  count,
  event,
  lines,
  locale,
  t,
  total,
}) {
  const countLabel =
    count === 1
      ? t('pages.tickets.confirmationCount_one', { count })
      : t('pages.tickets.confirmationCount_other', { count })

  return (
    <aside className="ticket-flow-summary" aria-label={t('pages.tickets.flow.summaryTitle')}>
      <div className="ticket-flow-summary__detail">
        <p className="ticket-flow-summary__kicker">{t('pages.tickets.flow.summaryTitle')}</p>
        {event?.title ? <p className="ticket-flow-summary__event">{event.title}</p> : null}
        {event?.date || event?.venue ? (
          <p className="ticket-flow-summary__meta">
            {[event?.date, event?.venue].filter(Boolean).join(' · ')}
          </p>
        ) : null}

        {lines.length ? (
          <ul className="ticket-flow-summary__lines">
            {lines.map((line) => (
              <li key={line.id}>
                <span>
                  <span className="ticket-flow-summary__qty">{line.count}×</span> {line.name}
                </span>
                <span className="ticket-flow-summary__amount">{money(line.subtotal, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ticket-flow-summary__empty">{t('pages.tickets.flow.summaryEmpty')}</p>
        )}
      </div>

      <div className="ticket-flow-summary__bar">
        <p className="ticket-flow-summary__total" aria-live="polite">
          <span className="ticket-flow-summary__total-label">
            {count > 0 ? countLabel : t('pages.tickets.total')}
          </span>
          {/* `key` re-monta el número al cambiar: la entrada animada es la
              señal de que el total se actualizó, sin retrasar el valor real. */}
          <strong key={total}>{money(total, locale)}</strong>
        </p>
        <button
          type="submit"
          className="ticket-purchase__submit ticket-purchase__submit--primary ticket-flow-summary__action"
          disabled={actionDisabled}
        >
          <span>{actionLabel}</span>
          <ArrowRight size={16} aria-hidden />
        </button>
      </div>

      <p className="ticket-flow-summary__trust">
        <ShieldCheck size={14} aria-hidden />
        {t('pages.ticketsPage.secureFlow')}
      </p>
    </aside>
  )
}
