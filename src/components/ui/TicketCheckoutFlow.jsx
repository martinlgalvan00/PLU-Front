import '../../styles/components/ticket-checkout-flow.css'
import { Check } from 'lucide-react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { TICKET_CHECKOUT_STEPS } from '../../services/ticketCheckoutProgress.js'

const STEP_LABEL_KEY = {
  tickets: 'pages.tickets.flow.stepTickets',
  buyer: 'pages.tickets.flow.stepBuyer',
  payment: 'pages.tickets.flow.stepPayment',
}

const chapterDomId = (step) => `ticket-chapter-${step}`

/**
 * Riel fijo con los tres capítulos y el total. Marca dónde está la persona y
 * deja saltar a cualquier capítulo: no bloquea, el formulario sigue siendo uno.
 */
export function TicketCheckoutRail({ progress, totalLabel, t }) {
  const { reducedMotion } = useMotionConfig()
  const fill = progress.completed / TICKET_CHECKOUT_STEPS.length

  function jump(step) {
    const node = document.getElementById(chapterDomId(step))
    node?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav className="ticket-flow-rail" aria-label={t('pages.tickets.flow.railAria')}>
      <ol className="ticket-flow-rail__steps">
        {TICKET_CHECKOUT_STEPS.map((step, index) => {
          const done = progress.done[step]
          const current = progress.current === step && !done
          return (
            <li
              key={step}
              className="ticket-flow-rail__step"
              data-state={done ? 'done' : current ? 'current' : 'todo'}
            >
              <button
                type="button"
                onClick={() => jump(step)}
                aria-current={current ? 'step' : undefined}
              >
                <span className="ticket-flow-rail__mark" aria-hidden>
                  {done ? <Check size={11} strokeWidth={3} /> : index + 1}
                </span>
                <span className="ticket-flow-rail__label">{t(STEP_LABEL_KEY[step])}</span>
                {done ? (
                  <span className="ticket-flow-rail__sr">{t('pages.tickets.flow.stepDone')}</span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>
      <p className="ticket-flow-rail__total" aria-live="polite">
        <span>{t('pages.tickets.total')}</span>
        {/* `key` re-monta el número al cambiar: la entrada animada es la señal
            de que el total se actualizó, sin retrasar el valor real. */}
        <strong key={totalLabel}>{totalLabel}</strong>
      </p>
      <span className="ticket-flow-rail__line" aria-hidden style={{ '--ticket-flow-fill': fill }} />
    </nav>
  )
}

/** Capítulo del checkout: número, estado y contenido. Todo el contenido queda montado. */
export function TicketCheckoutChapter({ step, index, done, children, t }) {
  return (
    <section
      id={chapterDomId(step)}
      className="ticket-flow-chapter"
      data-done={done || undefined}
      style={{ '--chapter-index': index }}
      aria-label={t(STEP_LABEL_KEY[step])}
    >
      <header className="ticket-flow-chapter__head" aria-hidden>
        <span className="ticket-flow-chapter__index">{String(index + 1).padStart(2, '0')}</span>
        <span className="ticket-flow-chapter__title">{t(STEP_LABEL_KEY[step])}</span>
        <span className="ticket-flow-chapter__seal">
          {done ? <Check size={12} strokeWidth={3} /> : null}
        </span>
      </header>
      <div className="ticket-flow-chapter__body">{children}</div>
    </section>
  )
}
