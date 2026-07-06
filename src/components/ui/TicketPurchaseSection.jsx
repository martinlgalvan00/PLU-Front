import { useMemo, useState } from 'react'
import { ArrowRight, IdCard, Minus, Plus, QrCode, Ticket as TicketIcon } from 'lucide-react'
import Button from './Button.jsx'
import CardPreviewModal from './CardPreviewModal.jsx'
import FormSection from './FormSection.jsx'
import { Field, Select } from './FormFields.jsx'
import StatusPill from './StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PRICING } from '../../lib/constants.js'
import { getFormOptions } from '../../lib/formOptions.js'
import { money } from '../../lib/format.js'
import { validateTicketAttendees } from '../../lib/validation.js'
import { priceForDayPass as resolveDayPassPrice } from '../../services/ticketService.js'

const MAX_TICKETS = 8

function emptyAttendee() {
  return { fullName: '', dni: '', dayPass: 'day1' }
}

function DayPassPicker({ dayOptions, name, onChange, value }) {
  return (
    <div className="ticket-purchase__day-picker" role="group" aria-label={name}>
      {dayOptions.map(([pass, label]) => (
        <button
          key={pass}
          type="button"
          className="ticket-purchase__day-chip"
          aria-pressed={value === pass}
          onClick={() => onChange(pass)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function EditorialAttendeeFields({
  attendee,
  dayOptions,
  errors,
  index,
  locale,
  onChange,
  pricing,
  quantity,
  t,
}) {
  const showIndex = quantity > 1
  const rowPrice = resolveDayPassPrice(attendee.dayPass, pricing)

  return (
    <div className="ticket-purchase__attendee-row">
      <div className="ticket-purchase__attendee-row-head">
        {showIndex ? (
          <>
            <span className="ticket-purchase__attendee-index" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="ticket-purchase__attendee-label">
              {t('pages.tickets.attendee', { index: index + 1 })}
            </span>
          </>
        ) : (
          <span className="ticket-purchase__attendee-label ticket-purchase__attendee-label--solo">
            {t('pages.tickets.attendeeSolo')}
          </span>
        )}
        <span className="ticket-purchase__attendee-price">{money(rowPrice, locale)}</span>
      </div>

      <div className="ticket-purchase__attendee-sheet">
        <Field
          className="ticket-purchase__field-name"
          label={t('pages.tickets.fullName')}
          name={`attendee-${index}-fullName`}
          value={attendee.fullName}
          onChange={(e) => onChange(index, 'fullName', e.target.value)}
          error={errors[`attendee-${index}-fullName`]}
          placeholder={t('pages.tickets.fullNamePlaceholder')}
        />
        <Field
          className="ticket-purchase__field-dni"
          label={t('pages.tickets.dniShort')}
          name={`attendee-${index}-dni`}
          value={attendee.dni}
          onChange={(e) => onChange(index, 'dni', e.target.value.replace(/\D/g, ''))}
          error={errors[`attendee-${index}-dni`]}
          placeholder={t('pages.tickets.dniPlaceholder')}
          inputMode="numeric"
          maxLength={8}
          autoComplete="off"
        />
        <div className="ticket-purchase__field-day">
          <span className="ticket-purchase__field-day-label">{t('pages.tickets.day')}</span>
          <DayPassPicker
            dayOptions={dayOptions}
            name={`attendee-${index}-dayPass`}
            value={attendee.dayPass}
            onChange={(pass) => onChange(index, 'dayPass', pass)}
          />
        </div>
      </div>
    </div>
  )
}

export default function TicketPurchaseSection({
  editorial = false,
  event,
  dayLabels = { day1: 'día 1', day2: 'día 2' },
  pricing = { day: PRICING.ticket, bothDays: PRICING.ticketBothDays },
  tickets,
  createdOrder,
  onSubmit,
  onApprovePayment,
}) {
  const { locale, t } = useI18n()
  const formOptions = useMemo(() => getFormOptions(t), [t])
  const [quantity, setQuantity] = useState(1)
  const [attendees, setAttendees] = useState([emptyAttendee()])
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const dayPassLabels = useMemo(
    () => ({
      day1: t('pages.tickets.day1'),
      day2: t('pages.tickets.day2'),
      both: t('pages.tickets.bothDays'),
    }),
    [t],
  )

  const dayOptions = useMemo(
    () => [
      ['day1', t('pages.tickets.dayOption', { n: 1, label: dayLabels.day1 })],
      ['day2', t('pages.tickets.dayOption', { n: 2, label: dayLabels.day2 })],
      ['both', t('pages.tickets.bothDays')],
    ],
    [dayLabels.day1, dayLabels.day2, t],
  )

  const dayChipOptions = useMemo(
    () => [
      ['day1', dayLabels.day1],
      ['day2', dayLabels.day2],
      ['both', t('pages.tickets.bothDays')],
    ],
    [dayLabels.day1, dayLabels.day2, t],
  )

  const visibleOrder = createdOrder?.type === 'tickets' ? createdOrder : null
  const orderTickets = visibleOrder ? tickets.filter((item) => item.orderId === visibleOrder.orderId) : []
  const activeTicket = orderTickets.find((item) => item.id === activeTicketId) ?? null
  const total = attendees.reduce((sum, attendee) => sum + resolveDayPassPrice(attendee.dayPass, pricing), 0)

  function changeQuantity(next) {
    const clamped = Math.min(MAX_TICKETS, Math.max(1, next))
    setQuantity(clamped)
    setAttendees((current) => {
      if (clamped > current.length) {
        return [...current, ...Array.from({ length: clamped - current.length }, emptyAttendee)]
      }
      return current.slice(0, clamped)
    })
  }

  function changeAttendee(index, field, value) {
    setAttendees((current) =>
      current.map((attendee, i) => (i === index ? { ...attendee, [field]: value } : attendee)),
    )
    const errorKey = `attendee-${index}-${field}`
    if (errors[errorKey]) setErrors((current) => ({ ...current, [errorKey]: '' }))
    setSubmitError('')
  }

  async function handleSubmit(domEvent) {
    domEvent.preventDefault()
    const validation = validateTicketAttendees(attendees, t)
    if (!validation.success) {
      setErrors(validation.errors)
      return
    }
    setErrors({})
    setSubmitting(true)
    const result = await onSubmit(domEvent, event, attendees, paymentMethod)
    setSubmitting(false)
    if (result?.error) setSubmitError(result.error)
  }

  if (visibleOrder) {
    const countLabel =
      visibleOrder.quantity === 1
        ? t('pages.tickets.confirmationCount_one', { count: visibleOrder.quantity })
        : t('pages.tickets.confirmationCount_other', { count: visibleOrder.quantity })

    return (
      <div className="ticket-purchase ticket-purchase--confirmation">
        <div className="ticket-purchase__confirmation-head">
          <TicketIcon size={22} aria-hidden />
          <div>
            <h3>{t('pages.tickets.confirmationTitle', { event: visibleOrder.eventTitle })}</h3>
            <p>
              {countLabel} · {money(visibleOrder.amount, locale)}
            </p>
          </div>
          <StatusPill value={visibleOrder.status} />
        </div>

        {visibleOrder.paymentMethod === 'mercado_pago' && visibleOrder.status !== 'aprobado' ? (
          <Button className="btn--small" onClick={() => onApprovePayment(visibleOrder.orderId)}>
            {t('pages.tickets.simulatePayment')}
          </Button>
        ) : visibleOrder.status !== 'aprobado' ? (
          <p className="ticket-purchase__manual-note">{t('pages.tickets.manualNote')}</p>
        ) : null}

        <ul className="ticket-purchase__list">
          {orderTickets.map((ticket) => (
            <li key={ticket.id} className="ticket-purchase__ticket-row">
              <div className="ticket-purchase__ticket-info">
                <strong>{ticket.attendeeName}</strong>
                <span>
                  {t('pages.tickets.dni')} {ticket.attendeeDni} · {ticket.ticketCode} ·{' '}
                  {dayPassLabels[ticket.dayPass] ?? ticket.dayPass}
                </span>
              </div>
              <StatusPill value={ticket.status} />
              <button type="button" className="ticket-purchase__qr-btn" onClick={() => setActiveTicketId(ticket.id)}>
                <QrCode size={14} aria-hidden />
                {t('pages.tickets.viewTicket')}
              </button>
            </li>
          ))}
        </ul>

        <CardPreviewModal
          open={Boolean(activeTicket)}
          onClose={() => setActiveTicketId(null)}
          cardData={
            activeTicket
              ? {
                  athleteName: activeTicket.attendeeName,
                  athleteCode: activeTicket.ticketCode,
                  qrCode: activeTicket.qrToken,
                  attendeeDocument: activeTicket.attendeeDni,
                  eventTitle: activeTicket.eventTitle,
                  eventDate: activeTicket.eventDate,
                  eventVenue: activeTicket.eventVenue,
                  eventLocation: activeTicket.eventLocation,
                  eventSlug: activeTicket.eventSlug,
                  dayPassLabel: dayPassLabels[activeTicket.dayPass] ?? activeTicket.dayPass,
                  variant: 'ticket',
                }
              : {}
          }
        />
      </div>
    )
  }

  const buyLabel =
    quantity === 1
      ? t('pages.tickets.buy_one')
      : t('pages.tickets.buy_other', { count: quantity })

  const formClass = ['ticket-purchase', editorial ? 'ticket-purchase--editorial' : ''].filter(Boolean).join(' ')

  const formBody = (
    <>
      <div className="ticket-purchase__quantity">
        <div className="ticket-purchase__quantity-main">
          <span>{t('pages.tickets.quantity')}</span>
          <div className="ticket-purchase__stepper">
            <button
              type="button"
              onClick={() => changeQuantity(quantity - 1)}
              disabled={quantity <= 1}
              aria-label={t('pages.tickets.subtract')}
            >
              <Minus size={14} aria-hidden />
            </button>
            <span>{quantity}</span>
            <button
              type="button"
              onClick={() => changeQuantity(quantity + 1)}
              disabled={quantity >= MAX_TICKETS}
              aria-label={t('pages.tickets.add')}
            >
              <Plus size={14} aria-hidden />
            </button>
          </div>
        </div>
        {editorial ? (
          <div className="ticket-purchase__summary-inline" aria-live="polite">
            <span>{t('pages.tickets.total')}</span>
            <strong>{money(total, locale)}</strong>
          </div>
        ) : (
          <span className="ticket-purchase__unit-price">
            {t('pages.tickets.unitPrice', {
              day: money(pricing.day, locale),
              both: money(pricing.bothDays, locale),
            })}
          </span>
        )}
      </div>

      <div className="ticket-purchase__attendees">
        {editorial && (
          <header className="ticket-purchase__attendees-head">
            <p className="ticket-purchase__attendees-lead">{t('pages.tickets.editorialNote')}</p>
            <p className="ticket-purchase__info-callout">
              <IdCard size={14} aria-hidden />
              <span>{t('pages.tickets.dniWhy')}</span>
            </p>
          </header>
        )}
        {attendees.map((attendee, index) =>
          editorial ? (
            <EditorialAttendeeFields
              key={index}
              attendee={attendee}
              dayOptions={dayChipOptions}
              errors={errors}
              index={index}
              locale={locale}
              onChange={changeAttendee}
              pricing={pricing}
              quantity={quantity}
              t={t}
            />
          ) : (
            <div key={index} className="ticket-purchase__attendee-row">
              <div className="ticket-purchase__attendee-row-head">
                <span className="ticket-purchase__attendee-label">
                  {t('pages.tickets.attendee', { index: index + 1 })}
                </span>
                <span className="ticket-purchase__attendee-price">
                  {money(resolveDayPassPrice(attendee.dayPass, pricing), locale)}
                </span>
              </div>
              <div className="form-grid form-grid--compact">
                <Field
                  label={t('pages.tickets.fullName')}
                  name={`attendee-${index}-fullName`}
                  value={attendee.fullName}
                  onChange={(e) => changeAttendee(index, 'fullName', e.target.value)}
                  error={errors[`attendee-${index}-fullName`]}
                  placeholder={t('pages.tickets.fullNamePlaceholder')}
                />
                <Field
                  label={t('pages.tickets.dni')}
                  name={`attendee-${index}-dni`}
                  value={attendee.dni}
                  onChange={(e) => changeAttendee(index, 'dni', e.target.value.replace(/\D/g, ''))}
                  error={errors[`attendee-${index}-dni`]}
                  placeholder={t('pages.tickets.dniPlaceholder')}
                  inputMode="numeric"
                  maxLength={8}
                />
                <Select
                  label={t('pages.tickets.day')}
                  name={`attendee-${index}-dayPass`}
                  value={attendee.dayPass}
                  onChange={(e) => changeAttendee(index, 'dayPass', e.target.value)}
                  options={dayOptions}
                />
              </div>
            </div>
          ),
        )}
      </div>

      <div className={`ticket-purchase__checkout${editorial ? ' ticket-purchase__checkout--editorial' : ''}`}>
        {editorial ? (
          <>
            <label className="ticket-purchase__payment">
              <span>{t('pages.tickets.paymentMethod')}</span>
              <select
                name="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {formOptions.paymentMethod.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <div className="ticket-purchase__checkout-action">
              <div className="ticket-purchase__checkout-total" aria-live="polite">
                <span>{t('pages.tickets.total')}</span>
                <strong>{money(total, locale)}</strong>
                {quantity > 1 && (
                  <span className="ticket-purchase__checkout-meta">
                    {t('pages.tickets.confirmationCount_other', { count: quantity })}
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="ticket-purchase__submit ticket-purchase__submit--primary"
                disabled={submitting}
              >
                {buyLabel}
                <ArrowRight size={14} aria-hidden />
              </button>
            </div>
            {submitError && <p className="ticket-purchase__submit-error">{submitError}</p>}
          </>
        ) : (
          <>
            <div className="form-grid form-grid--compact">
              <Select
                label={t('pages.tickets.paymentMethod')}
                name="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={formOptions.paymentMethod}
              />
              <div className="field field--readonly ticket-purchase__total">
                <span>{t('pages.tickets.total')}</span>
                <strong>{money(total, locale)}</strong>
              </div>
            </div>
            {submitError && <p className="ticket-purchase__submit-error">{submitError}</p>}
            <Button type="submit" className="btn--small" disabled={submitting}>
              {buyLabel}
            </Button>
          </>
        )}
      </div>
    </>
  )

  return (
    <form className={formClass} onSubmit={handleSubmit}>
      {editorial ? (
        formBody
      ) : (
        <FormSection
          title={t('pages.tickets.title')}
          description={t('pages.tickets.description', { event: event.title })}
        >
          {formBody}
        </FormSection>
      )}
    </form>
  )
}
