import '../../styles/components/ticket-purchase.css'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CreditCard,
  IdCard,
  Landmark,
  Minus,
  Plus,
  QrCode,
  Ticket as TicketIcon,
} from 'lucide-react'
import Button from './Button.jsx'
import CardPreviewModal from './CardPreviewModal.jsx'
import FormSection from './FormSection.jsx'
import { Field, Select } from './FormFields.jsx'
import StatusPill from './StatusPill.jsx'
import TicketPassPreview from './TicketPassPreview.jsx'
import MercadoPagoEmbeddedCheckout from './MercadoPagoEmbeddedCheckout.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import { getFormOptions } from '../../lib/formOptions.js'
import { money } from '../../lib/format.js'
import { toggleAttendeeAddon as applyAttendeeAddonToggle } from '../../lib/ticketAddons.js'
import { validateTicketAttendees } from '../../lib/validation.js'
import { priceForAttendee, priceForOrder } from '../../services/ticketService.js'

const MAX_TICKETS = 8

function emptyAttendee(pricing) {
  return { fullName: '', dni: '', ticketTypeId: pricing?.ticketTypes?.[0]?.id ?? '', addonIds: [] }
}

function TicketTypePicker({ compact = false, name, onChange, ticketTypes, value }) {
  return (
    <div
      className={`ticket-purchase__day-picker${compact ? ' ticket-purchase__day-picker--compact' : ''}`}
      role="group"
      aria-label={name}
    >
      {ticketTypes.map((type) => (
        <button
          key={type.id}
          type="button"
          className="ticket-purchase__day-chip"
          aria-pressed={value === type.id}
          onClick={() => onChange(type.id)}
        >
          {type.name}
        </button>
      ))}
    </div>
  )
}

function TicketAddonPicker({ addons, attendee, locale, onToggle, t, ticketTypes }) {
  if (!addons?.length) return null

  const selected = Array.isArray(attendee.addonIds) ? attendee.addonIds : []
  const includedAddonIds =
    ticketTypes.find((type) => type.id === attendee.ticketTypeId)?.includedAddonIds ?? []

  return (
    <div
      className="ticket-purchase__addons"
      role="group"
      aria-label={t('pages.tickets.addonsTitle')}
    >
      <span className="ticket-purchase__addons-label">{t('pages.tickets.addonsTitle')}</span>
      <div className="ticket-purchase__addons-list">
        {addons.map((addon) => {
          const included = includedAddonIds.includes(addon.id)
          const isSelected = included || selected.includes(addon.id)
          return (
            <label
              key={addon.id}
              className={`ticket-purchase__addon${isSelected ? ' is-selected' : ''}${included ? ' is-included' : ''}`}
            >
              <input
                checked={isSelected}
                disabled={included}
                type="checkbox"
                onChange={() => onToggle(addon.id)}
              />
              <span className="ticket-purchase__addon-copy">
                <strong>
                  {addon.label}
                  <span className="ticket-purchase__addon-price">
                    {included ? t('pages.tickets.addonIncluded') : `+${money(addon.price, locale)}`}
                  </span>
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
    errors[`attendee-${index}-ticketTypeId`],
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
            <span
              className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--index"
              role="columnheader"
            >
              #
            </span>
            <span className="ticket-purchase__attendees-batch-col" role="columnheader">
              {t('pages.tickets.fullName')}
            </span>
            <span
              className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--dni"
              role="columnheader"
            >
              {t('pages.tickets.dniShort')}
            </span>
            <span
              className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--day"
              role="columnheader"
            >
              {t('pages.tickets.day')}
            </span>
            <span
              className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--price"
              role="columnheader"
            >
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
                <span
                  className="ticket-purchase__attendees-batch-index"
                  role="rowheader"
                  aria-hidden
                >
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
                  <TicketTypePicker
                    compact
                    name={`attendee-${index}-ticketTypeId`}
                    ticketTypes={pricing.ticketTypes}
                    value={attendee.ticketTypeId}
                    onChange={(ticketTypeId) => onChange(index, 'ticketTypeId', ticketTypeId)}
                  />
                  {errors[`attendee-${index}-ticketTypeId`] ? (
                    <span className="ticket-purchase__batch-field-error">
                      {errors[`attendee-${index}-ticketTypeId`]}
                    </span>
                  ) : null}
                </div>

                <span className="ticket-purchase__attendees-batch-price">
                  {money(rowPrice, locale)}
                </span>
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
                ticketTypes={pricing.ticketTypes}
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
          <TicketTypePicker
            name={`attendee-${index}-ticketTypeId`}
            ticketTypes={pricing.ticketTypes}
            value={attendee.ticketTypeId}
            onChange={(ticketTypeId) => onChange(index, 'ticketTypeId', ticketTypeId)}
          />
        </div>
      </div>

      <TicketAddonPicker
        addons={addons}
        attendee={attendee}
        locale={locale}
        onToggle={(addonId) => onAddonToggle(index, addonId)}
        t={t}
        ticketTypes={pricing.ticketTypes}
      />
    </div>
  )
}

function isManualTicketPayment(method) {
  return method === 'transferencia' || method === 'manual' || method === 'manual_link'
}

function TicketPaymentOptions({ manualEnabled = true, wiseEnabled = false, paymentMethod, onChange, t }) {
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
      {/* Canal manual cerrado desde el panel: la opción no se muestra, en vez de
          aparecer y fallar con 409 al enviar la compra. */}
      {manualEnabled ? (
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
      ) : null}
      {/* Wise depende de su propio interruptor, independiente del de
          transferencia local. */}
      {wiseEnabled ? (
        <label className={paymentMethod === 'wise_transfer' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="ticket-payment"
            value="wise_transfer"
            checked={paymentMethod === 'wise_transfer'}
            onChange={(event) => onChange(event.target.value)}
          />
          <Landmark size={18} aria-hidden />
          <span>
            <strong>{t('pages.register.paymentWiseLabel')}</strong>
            <small>{t('pages.register.paymentWisePriceHint')}</small>
          </span>
        </label>
      ) : null}
    </fieldset>
  )
}

export default function TicketPurchaseSection({
  editorial = false,
  showPassPreview = true,
  event,
  // Interruptor de canal manual del panel. Default abierto: un consumidor que
  // todavía no lo pasa mantiene la compra por transferencia.
  manualPaymentEnabled = true,
  // Wise depende de su propio interruptor, independiente del anterior.
  // Default cerrado: sin dato, no se ofrece un medio que puede rechazar 409.
  wiseEnabled = false,
  pricing = { ticketTypes: [], addons: [] },
  tickets,
  createdOrder,
  onSubmit,
  onUploadPaymentProof,
}) {
  const { locale, t } = useI18n()
  const formOptions = useMemo(() => getFormOptions(t), [t])
  const [quantity, setQuantity] = useState(1)
  const [attendees, setAttendees] = useState([emptyAttendee(pricing)])
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

  // Con el canal manual cerrado queda solo Mercado Pago, y una selección previa
  // de transferencia vuelve ahí sola en vez de mandar una compra que va a fallar.
  const manualPaymentOptions = useMemo(
    () =>
      formOptions.paymentMethod.filter(([value]) => {
        if (value === 'wise_transfer') return wiseEnabled
        if (isManualTicketPayment(value)) return manualPaymentEnabled
        return true
      }),
    [formOptions.paymentMethod, manualPaymentEnabled, wiseEnabled],
  )

  useEffect(() => {
    if (!manualPaymentEnabled && isManualTicketPayment(paymentMethod)) {
      setPaymentMethod('mercado_pago')
    }
  }, [manualPaymentEnabled, paymentMethod])

  useEffect(() => {
    if (!wiseEnabled && paymentMethod === 'wise_transfer') {
      setPaymentMethod('mercado_pago')
    }
  }, [wiseEnabled, paymentMethod])

  const ticketAddons = pricing?.addons ?? []
  const ticketTypeNames = useMemo(
    () => Object.fromEntries((pricing.ticketTypes ?? []).map((type) => [type.id, type.name])),
    [pricing.ticketTypes],
  )
  const ticketTypeSelectOptions = useMemo(
    () => (pricing.ticketTypes ?? []).map((type) => [type.id, type.name]),
    [pricing.ticketTypes],
  )
  const visibleOrder = createdOrder?.type === 'tickets' ? createdOrder : null
  const orderTickets = visibleOrder
    ? tickets.filter((item) => item.orderId === visibleOrder.orderId)
    : []
  const activeTicket = orderTickets.find((item) => item.id === activeTicketId) ?? null
  const total = priceForOrder(attendees, pricing, ticketAddons)

  function changeQuantity(next) {
    const clamped = Math.min(MAX_TICKETS, Math.max(1, next))
    setQuantity(clamped)
    setAttendees((current) => {
      if (clamped > current.length) {
        return [
          ...current,
          ...Array.from({ length: clamped - current.length }, () => emptyAttendee(pricing)),
        ]
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
    const validation = validateTicketAttendees(
      attendees,
      t,
      (pricing.ticketTypes ?? []).map((type) => type.id),
    )
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
      <div className="ticket-purchase ticket-purchase--confirmation ticket-purchase--confirmation-editorial">
        <div className="ticket-purchase__confirmation-head">
          <TicketIcon size={22} aria-hidden />
          <div>
            <h3>{t('pages.tickets.confirmationTitle', { event: visibleOrder.eventTitle })}</h3>
            <p>
              {countLabel} · {money(visibleOrder.amount, locale, visibleOrder.currency)}
            </p>
          </div>
          <StatusPill value={visibleOrder.status} />
        </div>

        <p className="ticket-purchase__confirmation-lead">
          {t('pages.tickets.confirmationQrLead')}
        </p>

        {visibleOrder.paymentMethod === 'mercado_pago' && visibleOrder.status !== 'aprobado' ? (
          <>
            <p className="ticket-purchase__payment-note ticket-purchase__payment-note--auto">
              {t('pages.tickets.paymentMpPending')}
            </p>
            <MercadoPagoEmbeddedCheckout order={visibleOrder} />
          </>
        ) : isManualTicketPayment(visibleOrder.paymentMethod) &&
          visibleOrder.status !== 'aprobado' ? (
          <div className="ticket-purchase__transfer-panel">
            <p className="ticket-purchase__manual-note">{t('pages.tickets.manualNote')}</p>
            <p className="ticket-purchase__payment-note">{t('pages.tickets.transferQrDelay')}</p>
            <dl className="ticket-purchase__transfer-data">
              {visibleOrder.manualPaymentChannel === 'wise_transfer' ? (
                <>
                  <div>
                    <dt>{t('account.membership.transferWiseEmail')}</dt>
                    <dd>{env.payments.wiseEmail || t('account.membership.transferAskAdmin')}</dd>
                  </div>
                  {env.payments.wiseSwiftOrIban ? (
                    <div>
                      <dt>{t('account.membership.transferWiseSwiftIban')}</dt>
                      <dd>{env.payments.wiseSwiftOrIban}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{t('account.membership.transferHolder')}</dt>
                    <dd>{env.payments.wiseHolder || t('account.membership.transferAskAdmin')}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>{t('account.membership.transferAlias')}</dt>
                    <dd>{env.payments.transferAlias || t('account.membership.transferAskAdmin')}</dd>
                  </div>
                  <div>
                    <dt>{t('account.membership.transferAccount')}</dt>
                    <dd>{t('account.membership.transferAccountValue')}</dd>
                  </div>
                  {env.payments.transferCbu ? (
                    <div>
                      <dt>{t('account.membership.transferCbu')}</dt>
                      <dd>{env.payments.transferCbu}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{t('account.membership.transferHolder')}</dt>
                    <dd>{env.payments.transferHolder || t('account.membership.transferAskAdmin')}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{t('account.membership.transferReference')}</dt>
                <dd>{visibleOrder.reference}</dd>
              </div>
              <div>
                <dt>{t('account.membership.transferAmount')}</dt>
                <dd>{money(visibleOrder.amount, locale, visibleOrder.currency)}</dd>
              </div>
            </dl>
            <p className="ticket-purchase__transfer-warning" role="note">
              {t('account.membership.transferVerifyWarning')}
            </p>
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
                    {proofUploading
                      ? t('pages.tickets.proofSubmitting')
                      : t('pages.tickets.proofSubmit')}
                  </button>
                ) : null}
                {proofUploadError ? (
                  <p className="ticket-purchase__submit-error">{proofUploadError}</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <ul className="ticket-purchase__list ticket-purchase__list--passes">
          {orderTickets.map((ticket) => (
            <li key={ticket.id} className="ticket-purchase__pass-item">
              <TicketPassPreview
                live
                interactive={false}
                attendeeName={ticket.attendeeName}
                date={ticket.eventDate || event?.date}
                dayPassLabel={ticket.ticketTypeName ?? ticketTypeNames[ticket.ticketTypeId] ?? ''}
                eventSlug={ticket.eventSlug || event?.slug || ''}
                eventTitle={ticket.eventTitle || visibleOrder.eventTitle}
                qrCode={ticket.qrToken || ticket.ticketCode || ''}
                venue={ticket.eventVenue || event?.venue}
              />
              <div className="ticket-purchase__pass-actions">
                <div className="ticket-purchase__ticket-info">
                  <span>
                    {t('pages.tickets.dni')} {ticket.attendeeDni} · {ticket.ticketCode}
                  </span>
                  {ticket.addons?.length ? (
                    <span className="ticket-purchase__ticket-benefits">
                      {t('pages.tickets.redeemBenefits')}:{' '}
                      {ticket.addons.map((addon) => addon.label).join(' · ')}
                    </span>
                  ) : null}
                </div>
                <StatusPill value={ticket.status} />
                <button
                  type="button"
                  className="ticket-purchase__qr-btn"
                  onClick={() => setActiveTicketId(ticket.id)}
                >
                  <QrCode size={14} aria-hidden />
                  {t('pages.tickets.viewTicket')}
                </button>
              </div>
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
                  dayPassLabel:
                    activeTicket.ticketTypeName ?? ticketTypeNames[activeTicket.ticketTypeId] ?? '',
                  variant: 'ticket',
                }
              : {}
          }
        />
      </div>
    )
  }

  const buyLabel = submitting
    ? t('pages.tickets.buySubmitting')
    : quantity === 1
      ? t('pages.tickets.buy_one')
      : t('pages.tickets.buy_other', { count: quantity })

  const formClass = [
    'ticket-purchase',
    editorial ? 'ticket-purchase--editorial' : '',
    editorial && !showPassPreview ? 'ticket-purchase--editorial-solo' : '',
  ]
    .filter(Boolean)
    .join(' ')

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
          <span className="ticket-purchase__unit-price">{money(total, locale)}</span>
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
                <p className="ticket-purchase__attendees-lead">
                  {t('pages.tickets.editorialNote')}
                </p>
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
                    onChange={(e) =>
                      changeAttendee(index, 'dni', e.target.value.replace(/\D/g, ''))
                    }
                    error={errors[`attendee-${index}-dni`]}
                    placeholder={t('pages.tickets.dniPlaceholder')}
                    inputMode="numeric"
                    maxLength={8}
                  />
                  <Select
                    label={t('pages.tickets.day')}
                    name={`attendee-${index}-ticketTypeId`}
                    value={attendee.ticketTypeId}
                    onChange={(e) => changeAttendee(index, 'ticketTypeId', e.target.value)}
                    options={ticketTypeSelectOptions}
                  />
                </div>
                <TicketAddonPicker
                  addons={ticketAddons}
                  attendee={attendee}
                  locale={locale}
                  onToggle={(addonId) => handleAddonToggle(index, addonId)}
                  t={t}
                  ticketTypes={pricing.ticketTypes}
                />
              </div>
            ),
          )
        )}
      </div>

      <div
        className={`ticket-purchase__checkout${editorial ? ' ticket-purchase__checkout--editorial' : ''}`}
      >
        {editorial ? (
          <>
            <TicketPaymentOptions
              manualEnabled={manualPaymentEnabled}
              wiseEnabled={wiseEnabled}
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
                options={manualPaymentOptions}
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

  const previewDayLabel = ticketTypeNames[attendees[0]?.ticketTypeId] ?? ''

  return (
    <form className={formClass} onSubmit={handleSubmit}>
      {editorial ? (
        <div className="ticket-purchase__stage">
          <div className="ticket-purchase__form-col">{formBody}</div>
          {showPassPreview ? (
            <aside
              className="ticket-purchase__preview-col"
              aria-label={t('pages.ticketsPage.passLiveAria')}
            >
              <TicketPassPreview
                live
                showHint={false}
                attendeeName={attendees[0]?.fullName}
                date={event?.date}
                dayPassLabel={previewDayLabel}
                eventSlug={event?.slug ?? event?.id ?? ''}
                eventTitle={event?.title}
                quantity={quantity}
                venue={event?.venue}
              />
              <p className="ticket-purchase__preview-note">{t('pages.ticketsPage.passLiveNote')}</p>
            </aside>
          ) : null}
        </div>
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
