import { useMemo, useState } from 'react'
import { ArrowRight, CreditCard, IdCard, Landmark, Minus, Plus, QrCode, Ticket as TicketIcon } from 'lucide-react'
import Button from './Button.jsx'
import CardPreviewModal from './CardPreviewModal.jsx'
import FormSection from './FormSection.jsx'
import { Field, Select } from './FormFields.jsx'
import StatusPill from './StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PRICING } from '../../lib/constants.js'
import { getFormOptions } from '../../lib/formOptions.js'
import { money } from '../../lib/format.js'
import { toggleAttendeeAddon as applyAttendeeAddonToggle } from '../../lib/ticketAddons.js'
import { validateTicketAttendees } from '../../lib/validation.js'
import { priceForAttendee, priceForDayPass as resolveDayPassPrice, priceForOrder } from '../../services/ticketService.js'

const MAX_TICKETS = 8

function emptyAttendee() {
  return { fullName: '', dni: '', dayPass: 'day1', addonIds: [] }
}

function DayPassPicker({ compact = false, dayOptions, name, onChange, value }) {
  return (
    <div
      className={`ticket-purchase__day-picker${compact ? ' ticket-purchase__day-picker--compact' : ''}`}
      role="group"
      aria-label={name}
    >
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

function TicketAddonPicker({ addons, attendee, locale, onToggle, t }) {
  if (!addons?.length) return null

  const selected = Array.isArray(attendee.addonIds) ? attendee.addonIds : []

  return (
    <div className="ticket-purchase__addons" role="group" aria-label={t('pages.tickets.addonsTitle')}>
      <span className="ticket-purchase__addons-label">{t('pages.tickets.addonsTitle')}</span>
      <div className="ticket-purchase__addons-list">
        {addons.map((addon) => {
          const isSelected = selected.includes(addon.id)
          return (
            <label
              key={addon.id}
              className={`ticket-purchase__addon${isSelected ? ' is-selected' : ''}`}
            >
              <input
                checked={isSelected}
                type="checkbox"
                onChange={() => onToggle(addon.id)}
              />
              <span className="ticket-purchase__addon-copy">
                <strong>
                  {addon.label}
                  <span className="ticket-purchase__addon-price">+{money(addon.price, locale)}</span>
                </strong>
                {addon.description ? <small>{addon.description}</small> : null}
                {addon.redeemLabel ? (
                  <small className="ticket-purchase__addon-redeem">{addon.redeemLabel}</small>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function attendeeRowHasError(errors, index) {
  return Boolean(
    errors[`attendee-${index}-fullName`] ||
      errors[`attendee-${index}-dni`] ||
      errors[`attendee-${index}-dayPass`],
  )
}

function countAttendeeRowsWithErrors(errors, total) {
  let count = 0
  for (let index = 0; index < total; index += 1) {
    if (attendeeRowHasError(errors, index)) count += 1
  }
  return count
}

function EditorialAttendeesBatch({
  addons,
  attendees,
  dayOptions,
  errors,
  locale,
  onAddonToggle,
  onChange,
  pricing,
  t,
}) {
  const rowsWithErrors = countAttendeeRowsWithErrors(errors, attendees.length)

  return (
    <div className="ticket-purchase__attendees-batch">
      {rowsWithErrors > 0 ? (
        <p className="ticket-purchase__attendees-errors" role="alert">
          {rowsWithErrors === 1
            ? t('pages.tickets.attendeesFix_one')
            : t('pages.tickets.attendeesFix_other', { count: rowsWithErrors })}
        </p>
      ) : null}

      <div className="ticket-purchase__attendees-batch-scroll">
        <div className="ticket-purchase__attendees-batch-table" role="table">
          <div className="ticket-purchase__attendees-batch-head" role="row">
            <span className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--index" role="columnheader">
              #
            </span>
            <span className="ticket-purchase__attendees-batch-col" role="columnheader">
              {t('pages.tickets.fullName')}
            </span>
            <span className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--dni" role="columnheader">
              {t('pages.tickets.dniShort')}
            </span>
            <span className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--day" role="columnheader">
              {t('pages.tickets.day')}
            </span>
            <span className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--price" role="columnheader">
              {t('pages.tickets.rowPrice')}
            </span>
          </div>

          {attendees.map((attendee, index) => {
            const rowPrice = priceForAttendee(attendee, pricing, addons)
            const rowError = attendeeRowHasError(errors, index)

            return (
              <div
                key={index}
                className={`ticket-purchase__attendees-batch-row${rowError ? ' has-error' : ''}`}
                role="row"
              >
                <span className="ticket-purchase__attendees-batch-index" role="rowheader" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>

                <Field
                  hideLabel
                  className="ticket-purchase__field-name ticket-purchase__field-batch"
                  label={t('pages.tickets.attendee', { index: index + 1 })}
                  name={`attendee-${index}-fullName`}
                  value={attendee.fullName}
                  onChange={(e) => onChange(index, 'fullName', e.target.value)}
                  error={errors[`attendee-${index}-fullName`]}
                  placeholder={t('pages.tickets.fullNamePlaceholder')}
                  autoComplete="name"
                />

                <Field
                  hideLabel
                  className="ticket-purchase__field-dni ticket-purchase__field-batch"
                  label={t('pages.tickets.dni')}
                  name={`attendee-${index}-dni`}
                  value={attendee.dni}
                  onChange={(e) => onChange(index, 'dni', e.target.value.replace(/\D/g, ''))}
                  error={errors[`attendee-${index}-dni`]}
                  placeholder={t('pages.tickets.dniPlaceholder')}
                  inputMode="numeric"
                  maxLength={8}
                  autoComplete="off"
                />

                <div className="ticket-purchase__attendees-batch-day">
                  <DayPassPicker
                    compact
                    dayOptions={dayOptions}
                    name={`attendee-${index}-dayPass`}
                    value={attendee.dayPass}
                    onChange={(pass) => onChange(index, 'dayPass', pass)}
                  />
                  {errors[`attendee-${index}-dayPass`] ? (
                    <span className="ticket-purchase__batch-field-error">{errors[`attendee-${index}-dayPass`]}</span>
                  ) : null}
                </div>

                <span className="ticket-purchase__attendees-batch-price">{money(rowPrice, locale)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {addons?.length ? (
        <div className="ticket-purchase__addons-batch">
          {attendees.map((attendee, index) => (
            <div key={`addons-${index}`} className="ticket-purchase__addons-batch-row">
              <span className="ticket-purchase__addons-batch-label">
                {t('pages.tickets.addonsForAttendee', { index: index + 1 })}
              </span>
              <TicketAddonPicker
                addons={addons}
                attendee={attendee}
                locale={locale}
                onToggle={(addonId) => onAddonToggle(index, addonId)}
                t={t}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EditorialAttendeeFields({
  addons,
  attendee,
  dayOptions,
  errors,
  index,
  locale,
  onAddonToggle,
  onChange,
  pricing,
  quantity,
  t,
}) {
  const showIndex = quantity > 1
  const rowPrice = priceForAttendee(attendee, pricing, addons)

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

      <TicketAddonPicker
        addons={addons}
        attendee={attendee}
        locale={locale}
        onToggle={(addonId) => onAddonToggle(index, addonId)}
        t={t}
      />
    </div>
  )
}

function isManualTicketPayment(method) {
  return method === 'transferencia' || method === 'manual' || method === 'manual_link'
}

function TicketPaymentOptions({ paymentMethod, onChange, t }) {
  return (
    <fieldset className="ticket-purchase__payment-options">
      <legend>{t('pages.tickets.paymentMethod')}</legend>
      <label className={paymentMethod === 'mercado_pago' ? 'is-selected' : ''}>
        <input
          type="radio"
          name="ticket-payment"
          value="mercado_pago"
          checked={paymentMethod === 'mercado_pago'}
          onChange={(event) => onChange(event.target.value)}
        />
        <CreditCard size={18} aria-hidden />
        <span>
          <strong>{t('formOptions.payment.mercadoPago')}</strong>
          <small>{t('pages.tickets.paymentMpHint')}</small>
        </span>
      </label>
      <label className={paymentMethod === 'transferencia' ? 'is-selected' : ''}>
        <input
          type="radio"
          name="ticket-payment"
          value="transferencia"
          checked={paymentMethod === 'transferencia'}
          onChange={(event) => onChange(event.target.value)}
        />
        <Landmark size={18} aria-hidden />
        <span>
          <strong>{t('pages.tickets.paymentTransfer')}</strong>
          <small>{t('pages.tickets.paymentTransferHint')}</small>
        </span>
      </label>
    </fieldset>
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
  onUploadPaymentProof,
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
  const [proofFile, setProofFile] = useState(null)
  const [proofFileName, setProofFileName] = useState('')
  const [proofUploading, setProofUploading] = useState(false)
  const [proofUploadError, setProofUploadError] = useState('')
  const [proofUploaded, setProofUploaded] = useState(false)

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

  const ticketAddons = pricing?.addons ?? []
  const visibleOrder = createdOrder?.type === 'tickets' ? createdOrder : null
  const orderTickets = visibleOrder ? tickets.filter((item) => item.orderId === visibleOrder.orderId) : []
  const activeTicket = orderTickets.find((item) => item.id === activeTicketId) ?? null
  const total = priceForOrder(attendees, pricing, ticketAddons)

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

  function handleAddonToggle(index, addonId) {
    setAttendees((current) =>
      current.map((attendee, i) =>
        i === index ? applyAttendeeAddonToggle(attendee, addonId) : attendee,
      ),
    )
    setSubmitError('')
  }

  async function handleSubmit(domEvent) {
    domEvent.preventDefault()
    const validation = validateTicketAttendees(attendees, t)
    if (!validation.success) {
      setErrors(validation.errors)
      requestAnimationFrame(() => {
        document
          .querySelector(
            '.ticket-purchase__attendees-batch-row.has-error, .ticket-purchase__attendee-row .field input[aria-invalid="true"]',
          )
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      return
    }
    setErrors({})
    setSubmitting(true)
    const result = await onSubmit(domEvent, event, attendees, paymentMethod)
    setSubmitting(false)
    if (result?.error) setSubmitError(result.error)
  }

  async function handleProofUpload() {
    if (!visibleOrder?.orderId || !proofFile || !onUploadPaymentProof) return
    setProofUploading(true)
    setProofUploadError('')
    const result = await onUploadPaymentProof(visibleOrder.orderId, proofFile)
    setProofUploading(false)
    if (result?.error) {
      setProofUploadError(result.error)
      return
    }
    setProofUploaded(true)
    setProofFile(null)
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
          <>
            <p className="ticket-purchase__payment-note ticket-purchase__payment-note--auto">
              {t('pages.tickets.paymentMpPending')}
            </p>
            <Button className="btn--small" onClick={() => onApprovePayment(visibleOrder.orderId)}>
              {t('pages.tickets.simulatePayment')}
            </Button>
          </>
        ) : isManualTicketPayment(visibleOrder.paymentMethod) && visibleOrder.status !== 'aprobado' ? (
          <div className="ticket-purchase__transfer-panel">
            <p className="ticket-purchase__manual-note">{t('pages.tickets.manualNote')}</p>
            <p className="ticket-purchase__payment-note">{t('pages.tickets.transferQrDelay')}</p>
            <dl className="ticket-purchase__transfer-data">
              <div>
                <dt>{t('account.membership.transferAlias')}</dt>
                <dd>PLUARG.MAXIMAL</dd>
              </div>
              <div>
                <dt>{t('account.membership.transferCbu')}</dt>
                <dd>0000003100000000000001</dd>
              </div>
              <div>
                <dt>{t('account.membership.transferReference')}</dt>
                <dd>{visibleOrder.reference}</dd>
              </div>
              <div>
                <dt>{t('account.membership.transferAmount')}</dt>
                <dd>{money(visibleOrder.amount, locale)}</dd>
              </div>
            </dl>
            {visibleOrder.paymentProofUploadedAt || proofUploaded ? (
              <p className="ticket-purchase__proof-success">{t('pages.tickets.proofUploaded')}</p>
            ) : (
              <div className="ticket-purchase__proof-upload">
                <label>
                  <span>{t('pages.tickets.proofLabel')}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setProofFile(file)
                      setProofFileName(file?.name ?? '')
                      setProofUploadError('')
                    }}
                  />
                  <small>
                    {proofFileName
                      ? t('pages.tickets.proofSelected', { name: proofFileName })
                      : t('pages.tickets.proofHelp')}
                  </small>
                </label>
                {proofFile ? (
                  <button
                    type="button"
                    className="ticket-purchase__proof-submit"
                    disabled={proofUploading}
                    onClick={handleProofUpload}
                  >
                    {proofUploading ? t('pages.tickets.proofSubmitting') : t('pages.tickets.proofSubmit')}
                  </button>
                ) : null}
                {proofUploadError ? (
                  <p className="ticket-purchase__submit-error">{proofUploadError}</p>
                ) : null}
              </div>
            )}
          </div>
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
                {ticket.addons?.length ? (
                  <span className="ticket-purchase__ticket-benefits">
                    {t('pages.tickets.redeemBenefits')}:{' '}
                    {ticket.addons.map((addon) => addon.label).join(' · ')}
                  </span>
                ) : null}
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
            <div className="ticket-purchase__attendees-callout">
              <span className="ticket-purchase__attendees-callout-icon" aria-hidden>
                <QrCode size={18} strokeWidth={1.75} />
              </span>
              <div className="ticket-purchase__attendees-callout-copy">
                <p className="ticket-purchase__attendees-lead">{t('pages.tickets.editorialNote')}</p>
                <p className="ticket-purchase__attendees-note">
                  <IdCard size={13} aria-hidden />
                  <span>{t('pages.tickets.dniWhy')}</span>
                </p>
              </div>
            </div>
          </header>
        )}
        {editorial && quantity > 1 ? (
          <EditorialAttendeesBatch
            addons={ticketAddons}
            attendees={attendees}
            dayOptions={dayChipOptions}
            errors={errors}
            locale={locale}
            onAddonToggle={handleAddonToggle}
            onChange={changeAttendee}
            pricing={pricing}
            t={t}
          />
        ) : (
          attendees.map((attendee, index) =>
            editorial ? (
              <EditorialAttendeeFields
                key={index}
                addons={ticketAddons}
                attendee={attendee}
                dayOptions={dayChipOptions}
                errors={errors}
                index={index}
                locale={locale}
                onAddonToggle={handleAddonToggle}
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
                    {money(priceForAttendee(attendee, pricing, ticketAddons), locale)}
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
                <TicketAddonPicker
                  addons={ticketAddons}
                  attendee={attendee}
                  locale={locale}
                  onToggle={(addonId) => handleAddonToggle(index, addonId)}
                  t={t}
                />
              </div>
            ),
          )
        )}
      </div>

      <div className={`ticket-purchase__checkout${editorial ? ' ticket-purchase__checkout--editorial' : ''}`}>
        {editorial ? (
          <>
            <TicketPaymentOptions
              paymentMethod={paymentMethod}
              onChange={(value) => {
                setPaymentMethod(value)
                setSubmitError('')
              }}
              t={t}
            />
            {paymentMethod === 'transferencia' ? (
              <p className="ticket-purchase__payment-note ticket-purchase__payment-note--transfer">
                {t('pages.tickets.transferCheckoutNote')}
              </p>
            ) : (
              <p className="ticket-purchase__payment-note ticket-purchase__payment-note--auto">
                {t('pages.tickets.paymentMpCheckout')}
              </p>
            )}
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
