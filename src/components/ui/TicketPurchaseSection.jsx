import '../../styles/components/ticket-purchase.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Banknote,
  FileText,
  CreditCard,
  IdCard,
  Landmark,
  Minus,
  Plus,
  QrCode,
  Share2,
  Ticket as TicketIcon,
  Upload,
  X,
} from 'lucide-react'
import Button from './Button.jsx'
import CardPreviewModal from './CardPreviewModal.jsx'
import FormSection from './FormSection.jsx'
import { Field, Select } from './FormFields.jsx'
import StatusPill from './StatusPill.jsx'
import TicketPassPreview from './TicketPassPreview.jsx'
import { credentialCountLabel, zoneScopeList } from './TicketTypeOptions.jsx'
import MercadoPagoEmbeddedCheckout from './MercadoPagoEmbeddedCheckout.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import { getFormOptions } from '../../lib/formOptions.js'
import { money } from '../../lib/format.js'
import { toggleAttendeeAddon as applyAttendeeAddonToggle } from '../../lib/ticketAddons.js'
import { groupCredentialsByBundle } from '../../lib/ticketCredentials.js'
import { TICKETS_PATH } from '../../lib/ticketsRoute.js'
import { isTicketTypeChannelOpen } from '../../lib/ticketTypePaymentChannels.js'
import { validateTicketAttendees, validateTicketBuyer } from '../../lib/validation.js'
import { priceForAttendee, priceForOrder } from '../../services/ticketService.js'
import { buildTicketPaymentPriceLabels } from '../../lib/ticketPaymentMethods.js'
import { formatWisePrice } from '../../services/checkoutPricing.js'
import { resolveTicketOrderWisePricing } from '../../../shared/ticketWisePricing.js'

const MAX_TICKETS = 10
const CHANNEL_KEYS = ['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer']
const MAX_PROOF_FILE_BYTES = 2 * 1024 * 1024
const PROOF_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

function formatProofFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const megabytes = bytes / (1024 * 1024)
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

function emptyAttendee(pricing) {
  return { fullName: '', dni: '', ticketTypeId: pricing?.ticketTypes?.[0]?.id ?? '', addonIds: [] }
}

function ticketTypeOptionLabel(type, locale) {
  return `${type.name} · ${money(type.price, locale)}`
}

/**
 * Select de tipo: el catálogo vive en la vidriera de ofertas, no se vuelve a
 * pintar acá. En lote cabe en la fila; en una sola entrada es el mismo control.
 */
function TicketTypePicker({
  className,
  error,
  hideLabel = true,
  label,
  locale,
  name,
  onChange,
  ticketTypes,
  value,
}) {
  return (
    <Select
      hideLabel={hideLabel}
      className={['ticket-purchase__field-type', className].filter(Boolean).join(' ')}
      error={error}
      label={label}
      name={name}
      options={ticketTypes.map((type) => [type.id, ticketTypeOptionLabel(type, locale)])}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function TicketTypeHint({ t, type }) {
  if (!type) return null

  const zones = zoneScopeList(type.zoneScopes, t)
  const count = type.credentialCount ?? 1
  const parts = [
    zones ? t('pages.tickets.ticketTypes.soloZone', { zones }) : null,
    credentialCountLabel(count, t),
    count > 1 ? t('pages.tickets.ticketTypes.quotaNote') : null,
  ].filter(Boolean)

  if (!parts.length) return null

  return <p className="ticket-purchase__type-hint">{parts.join(' · ')}</p>
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
  paymentMethod,
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
              {t('pages.tickets.ticketTypeCol')}
            </span>
            <span
              className="ticket-purchase__attendees-batch-col ticket-purchase__attendees-batch-col--price"
              role="columnheader"
            >
              {t('pages.tickets.rowPrice')}
            </span>
          </div>

          {attendees.map((attendee, index) => {
            const rowPrice = priceForAttendee(attendee, pricing, addons, paymentMethod)
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
                  maxLength={16}
                  autoComplete="off"
                />

                <div className="ticket-purchase__attendees-batch-day">
                  <TicketTypePicker
                    className="ticket-purchase__field-batch"
                    error={errors[`attendee-${index}-ticketTypeId`]}
                    label={`${t('pages.tickets.ticketTypes.legend')} · ${t('pages.tickets.attendee', { index: index + 1 })}`}
                    locale={locale}
                    name={`attendee-${index}-ticketTypeId`}
                    ticketTypes={pricing.ticketTypes}
                    value={attendee.ticketTypeId}
                    onChange={(ticketTypeId) => onChange(index, 'ticketTypeId', ticketTypeId)}
                  />
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
  paymentMethod,
  pricing,
  quantity,
  t,
}) {
  const showIndex = quantity > 1
  const rowPrice = priceForAttendee(attendee, pricing, addons, paymentMethod)

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
          maxLength={16}
          autoComplete="off"
        />
        <div className="ticket-purchase__field-day">
          <TicketTypePicker
            error={errors[`attendee-${index}-ticketTypeId`]}
            hideLabel={false}
            label={t('pages.tickets.ticketTypes.legend')}
            locale={locale}
            name={`attendee-${index}-ticketTypeId`}
            ticketTypes={pricing.ticketTypes}
            value={attendee.ticketTypeId}
            onChange={(ticketTypeId) => onChange(index, 'ticketTypeId', ticketTypeId)}
          />
          <TicketTypeHint
            t={t}
            type={pricing.ticketTypes.find((item) => item.id === attendee.ticketTypeId)}
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
  return (
    method === 'transferencia' ||
    method === 'manual' ||
    method === 'manual_link' ||
    method === 'cash_pitbull' ||
    method === 'wise_transfer'
  )
}

/**
 * Datos de quien compra. Separados de los asistentes porque no son la misma
 * persona: alguien compra seis entradas y entra ninguna.
 *
 * El email no es un dato de contacto más — es por donde llega el QR y el aviso
 * de que Finanzas acreditó el pago. Antes no se pedía y la orden quedaba sin
 * dirección: el comprador dependía de no cerrar la pestaña.
 */
function TicketBuyerFields({ buyer, errors, onChange, t }) {
  return (
    <fieldset className="ticket-purchase__buyer">
      <legend>{t('pages.tickets.buyerTitle')}</legend>
      <p className="ticket-purchase__buyer-lead">{t('pages.tickets.buyerLead')}</p>
      <div className="form-grid form-grid--compact">
        <Field
          label={t('pages.tickets.buyerName')}
          name="buyer-name"
          value={buyer.name}
          onChange={(event) => onChange('name', event.target.value)}
          error={errors['buyer-name']}
          placeholder={t('pages.tickets.buyerNamePlaceholder')}
          autoComplete="name"
        />
        <Field
          label={t('pages.tickets.buyerEmail')}
          name="buyer-email"
          type="email"
          value={buyer.email}
          onChange={(event) => onChange('email', event.target.value)}
          error={errors['buyer-email']}
          placeholder={t('pages.tickets.buyerEmailPlaceholder')}
          autoComplete="email"
          inputMode="email"
        />
        <Field
          label={t('pages.tickets.buyerPhone')}
          name="buyer-phone"
          value={buyer.phone}
          onChange={(event) => onChange('phone', event.target.value)}
          error={errors['buyer-phone']}
          placeholder={t('pages.tickets.buyerPhonePlaceholder')}
          autoComplete="tel"
          inputMode="tel"
        />
      </div>
    </fieldset>
  )
}

function TicketPaymentOptions({
  manualEnabled = true,
  mercadoPagoEnabled = true,
  cashEnabled = false,
  wiseEnabled = false,
  paymentMethod,
  priceLabels = null,
  wiseLabel = '',
  onChange,
  t,
}) {
  return (
    <fieldset className="ticket-purchase__payment-options">
      <legend>{t('pages.tickets.paymentMethod')}</legend>
      {/* La pasarela dejó de ser incondicional: se cierra por concepto igual que
          el canal manual. */}
      {mercadoPagoEnabled ? (
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
            {priceLabels?.mercado_pago ? (
              <strong className="ticket-purchase__payment-price">
                {priceLabels.mercado_pago.priceLabel}
              </strong>
            ) : null}
          </span>
        </label>
      ) : null}
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
            {priceLabels?.transferencia ? (
              <strong className="ticket-purchase__payment-price">
                {priceLabels.transferencia.priceLabel}
              </strong>
            ) : null}
            {priceLabels?.transferencia?.savingsLabel ? (
              <small className="ticket-purchase__payment-savings">
                {priceLabels.transferencia.savingsLabel}
              </small>
            ) : null}
          </span>
        </label>
      ) : null}
      {/* Efectivo en Pitbull: el espectador que pasa por el gimnasio paga en
          caja y no sube comprobante. Interruptor propio, igual que Wise. */}
      {cashEnabled ? (
        <label className={paymentMethod === 'cash_pitbull' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="ticket-payment"
            value="cash_pitbull"
            checked={paymentMethod === 'cash_pitbull'}
            onChange={(event) => onChange(event.target.value)}
          />
          <Banknote size={18} aria-hidden />
          <span>
            <strong>{t('pages.tickets.paymentCash')}</strong>
            <small>{t('pages.tickets.paymentCashHint')}</small>
            {priceLabels?.cash_pitbull ? (
              <strong className="ticket-purchase__payment-price">
                {priceLabels.cash_pitbull.priceLabel}
              </strong>
            ) : null}
            {priceLabels?.cash_pitbull?.savingsLabel ? (
              <small className="ticket-purchase__payment-savings">
                {priceLabels.cash_pitbull.savingsLabel}
              </small>
            ) : null}
          </span>
        </label>
      ) : null}
      {/* Wise se anuncia siempre. No se puede elegir hasta que Administración
          abra el canal y cargue el USD de cada ítem: un monto convertido del
          peso no es un precio, y mostrarlo acá prometía un cobro que nadie
          decidió. */}
      <label
        className={
          !wiseEnabled ? 'is-disabled' : paymentMethod === 'wise_transfer' ? 'is-selected' : ''
        }
      >
        <input
          type="radio"
          name="ticket-payment"
          value="wise_transfer"
          checked={wiseEnabled && paymentMethod === 'wise_transfer'}
          disabled={!wiseEnabled}
          aria-disabled={!wiseEnabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <Landmark size={18} aria-hidden />
        <span>
          <strong>{t('pages.register.paymentWiseLabel')}</strong>
          <small>{wiseEnabled && wiseLabel ? wiseLabel : t('pages.tickets.paymentWiseSoon')}</small>
        </span>
      </label>
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
  // Mercado Pago también se cierra por concepto desde Administración. Default
  // abierto para no dejar la pantalla sin medios ante una lectura incompleta.
  mercadoPagoEnabled = true,
  // Efectivo en Pitbull y Wise tienen cada uno su interruptor, independiente
  // del de transferencia. Default cerrado en los dos: sin dato, no se ofrece un
  // medio que puede rechazar 409.
  cashEnabled = false,
  wiseEnabled = false,
  // Datos bancarios del evento (alias/cbu/holder). Vacío = env global.
  accountDetails = null,
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
  // Quien compra no es necesariamente quien entra: una persona puede comprar
  // seis entradas para otras seis. El email es la única vía por la que le llega
  // el QR y el aviso de acreditación, así que vive acá y no por asistente.
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [proofFile, setProofFile] = useState(null)
  const [proofFileName, setProofFileName] = useState('')
  const [proofUploading, setProofUploading] = useState(false)
  const [proofUploadError, setProofUploadError] = useState('')
  const [proofUploaded, setProofUploaded] = useState(false)
  const proofInputRef = useRef(null)

  // Memoizado desde que la cotización en USD lo toma como dependencia: el `??
  // []` devolvía un array nuevo por render y recalculaba el total en cada tecla.
  const ticketAddons = useMemo(() => pricing?.addons ?? [], [pricing?.addons])

  // Precio de cada medio de pago para esta orden puntual, para que el
  // comprador compare antes de elegir en vez de descubrir el total recién
  // después de tocar un radio.
  const paymentPriceLabels = useMemo(
    () => buildTicketPaymentPriceLabels({ attendees, pricing, addons: ticketAddons, locale, t }),
    [attendees, pricing, ticketAddons, locale, t],
  )

  /**
   * Cotización Wise de la orden, misma regla que la API. El canal abierto no
   * alcanza: si falta el USD de algún ítem, la conversión no se ofrece como
   * medio de pago. Es un piso, no un precio.
   */
  const wiseQuote = useMemo(() => {
    try {
      return resolveTicketOrderWisePricing(
        attendees,
        { ticketTypes: pricing?.ticketTypes ?? [], addons: ticketAddons },
        {
          VITE_WISE_BLUE_RATE_ARS: env.payments.wiseBlueRateArs,
          VITE_WISE_ROUNDING_STEP_USD: env.payments.wiseRoundingStepUsd,
        },
      )
    } catch {
      // Un asistente sin tipo elegido todavía: el formulario recién arranca.
      return null
    }
  }, [attendees, pricing?.ticketTypes, ticketAddons])
  const wiseReady = wiseEnabled && wiseQuote?.source === 'configured'
  const wiseLabel = wiseReady ? formatWisePrice(wiseQuote.amount, locale) : ''

  // Tipos elegidos entre los asistentes: la orden es una sola, así que un
  // medio sólo se ofrece si TODOS los tipos del carrito lo aceptan. Mostrarlo
  // igual sería prometer un pago que el backend rechaza con 409 recién al
  // confirmar — el mismo modo de fallo que el resto del circuito evita.
  const selectedTicketTypeIds = useMemo(
    () => [...new Set(attendees.map((attendee) => attendee.ticketTypeId).filter(Boolean))],
    [attendees],
  )
  const openChannelsForSelection = useMemo(() => {
    const open = {}
    for (const channel of CHANNEL_KEYS) {
      open[channel] = selectedTicketTypeIds.every((id) => {
        const type = pricing.ticketTypes?.find((item) => item.id === id)
        return isTicketTypeChannelOpen(type?.paymentChannels ?? null, channel)
      })
    }
    return open
  }, [selectedTicketTypeIds, pricing.ticketTypes])

  const effectiveMercadoPagoEnabled = mercadoPagoEnabled && openChannelsForSelection.mercado_pago
  const effectiveManualPaymentEnabled = manualPaymentEnabled && openChannelsForSelection.bank_transfer
  const effectiveCashEnabled = cashEnabled && openChannelsForSelection.cash_pitbull
  const effectiveWiseEnabled = wiseReady && openChannelsForSelection.wise_transfer
  // El panel dice que el medio está abierto, pero el tipo elegido lo cierra:
  // sin este aviso el radio simplemente desaparece y no queda claro por qué.
  const paymentNarrowedByType =
    (mercadoPagoEnabled && !effectiveMercadoPagoEnabled) ||
    (manualPaymentEnabled && !effectiveManualPaymentEnabled) ||
    (cashEnabled && !effectiveCashEnabled) ||
    (wiseReady && !effectiveWiseEnabled)

  // Con el canal manual cerrado queda solo Mercado Pago, y una selección previa
  // de transferencia vuelve ahí sola en vez de mandar una compra que va a fallar.
  const manualPaymentOptions = useMemo(
    () =>
      formOptions.paymentMethod.filter(([value]) => {
        if (value === 'wise_transfer') return effectiveWiseEnabled
        if (value === 'cash_pitbull') return effectiveCashEnabled
        if (isManualTicketPayment(value)) return effectiveManualPaymentEnabled
        return value !== 'mercado_pago' || effectiveMercadoPagoEnabled
      }),
    [
      formOptions.paymentMethod,
      effectiveCashEnabled,
      effectiveManualPaymentEnabled,
      effectiveMercadoPagoEnabled,
      effectiveWiseEnabled,
    ],
  )

  /**
   * Un medio cerrado desde el panel (o por el tipo de entrada elegido) no
   * puede quedar seleccionado: el 409 llega recién al enviar la compra, con
   * el formulario ya completo. La selección cae al primero que sí está
   * abierto, en el orden en que se ofrecen.
   */
  useEffect(() => {
    const open = {
      mercado_pago: effectiveMercadoPagoEnabled,
      // La variante editorial llama `transferencia` al mismo canal que el
      // Select compacto llama `manual_link`. Las dos cuentan como el canal de
      // transferencia, así que ninguna se descarta por el nombre.
      transferencia: effectiveManualPaymentEnabled,
      manual_link: effectiveManualPaymentEnabled,
      cash_pitbull: effectiveCashEnabled,
      wise_transfer: effectiveWiseEnabled,
    }
    if (open[paymentMethod]) return
    const fallback = ['mercado_pago', 'transferencia', 'cash_pitbull', 'wise_transfer'].find(
      (method) => open[method],
    )
    if (fallback) setPaymentMethod(fallback)
  }, [
    effectiveCashEnabled,
    effectiveManualPaymentEnabled,
    effectiveMercadoPagoEnabled,
    effectiveWiseEnabled,
    paymentMethod,
  ])

  /**
   * Reconcilia lo elegido con el catálogo que efectivamente está a la venta.
   *
   * Pasa en dos momentos, y los dos terminaban igual de mal: el catálogo llega
   * después del montaje (el asistente nace con `ticketTypeId` vacío), o un tipo
   * sale de venta con el formulario abierto —se cerró su ventana propia, o
   * alguien lo desactivó— y la opción desaparece del select. En los dos casos
   * el asistente quedaba apuntando a algo que ya no está y el envío moría en
   * "Seleccioná un tipo de entrada válido", sin nada marcado que explicara por
   * qué: la opción que había elegido ya no figuraba en la lista.
   *
   * Se reasigna al primer tipo disponible en vez de vaciar: vaciar obliga a
   * elegir de nuevo algo que en la mayoría de los casos es la única opción.
   */
  useEffect(() => {
    const available = pricing?.ticketTypes ?? []
    if (available.length === 0) return
    const ids = new Set(available.map((type) => type.id))
    setAttendees((current) => {
      let changed = false
      const next = current.map((attendee) => {
        if (ids.has(attendee.ticketTypeId)) return attendee
        changed = true
        return { ...attendee, ticketTypeId: available[0].id, addonIds: [] }
      })
      return changed ? next : current
    })
  }, [pricing?.ticketTypes])
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
  // Las credenciales que salieron de una misma compra van juntas: dos filas con
  // el mismo nombre y el mismo DNI, sueltas, se leían como dos compras.
  const ticketBundles = groupCredentialsByBundle(orderTickets)
  // Qué dice cada pase impreso. La etiqueta de la credencial manda sólo cuando
  // la compra emitió más de una, que es donde distingue; para una entrada común
  // "Espectador" dice más que "Entrada general".
  const passLabelById = new Map(
    ticketBundles.flatMap((bundle) =>
      bundle.credentials.map((ticket) => [
        ticket.id,
        (bundle.credentials.length > 1 ? ticket.credentialLabel : null) ??
          ticket.ticketTypeName ??
          ticketTypeNames[ticket.ticketTypeId] ??
          '',
      ]),
    ),
  )
  const activeTicket = orderTickets.find((item) => item.id === activeTicketId) ?? null
  const total = priceForOrder(attendees, pricing, ticketAddons, paymentMethod)

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
      current.map((attendee, i) => {
        if (i !== index) return attendee
        const next = { ...attendee, [field]: value }
        if (field === 'ticketTypeId') {
          const included =
            pricing.ticketTypes.find((type) => type.id === value)?.includedAddonIds ?? []
          next.addonIds = (next.addonIds ?? []).filter((id) => !included.includes(id))
        }
        return next
      }),
    )
    const errorKey = `attendee-${index}-${field}`
    if (errors[errorKey]) setErrors((current) => ({ ...current, [errorKey]: '' }))
    setSubmitError('')
  }

  function changeBuyer(field, value) {
    setBuyer((current) => ({ ...current, [field]: value }))
    const errorKey = `buyer-${field}`
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
    const buyerValidation = validateTicketBuyer(buyer, t)
    if (!validation.success || !buyerValidation.success) {
      setErrors({ ...validation.errors, ...buyerValidation.errors })
      requestAnimationFrame(() => {
        document
          .querySelector(
            '.ticket-purchase__attendees-batch-row.has-error, .ticket-purchase__attendee-row .field input[aria-invalid="true"], .ticket-purchase__buyer .field input[aria-invalid="true"]',
          )
          // El `?.` del método y no sólo del elemento: en jsdom (y en
          // cualquier entorno sin scroll) el nodo existe y el método no, y una
          // excepción acá tiraba abajo el aviso de error que estaba por mostrar.
          ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
      })
      return
    }
    setErrors({})
    setSubmitting(true)
    const result = await onSubmit(domEvent, event, attendees, paymentMethod, {
      name: buyer.name.trim(),
      email: buyer.email.trim(),
      phone: buyer.phone.trim() || undefined,
    })
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

  function clearProofFile() {
    setProofFile(null)
    setProofFileName('')
    setProofUploadError('')
    if (proofInputRef.current) proofInputRef.current.value = ''
  }

  function selectProofFile(file) {
    if (!file) return
    if (!PROOF_FILE_TYPES.has(file.type)) {
      clearProofFile()
      setProofUploadError(t('pages.tickets.proofInvalidType'))
      return
    }
    if (file.size > MAX_PROOF_FILE_BYTES) {
      clearProofFile()
      setProofUploadError(t('pages.tickets.proofTooLarge'))
      return
    }
    setProofFile(file)
    setProofFileName(file.name)
    setProofUploadError('')
  }

  if (visibleOrder) {
    const countLabel =
      visibleOrder.quantity === 1
        ? t('pages.tickets.confirmationCount_one', { count: visibleOrder.quantity })
        : t('pages.tickets.confirmationCount_other', { count: visibleOrder.quantity })

    const shareUrl = `${env.appUrl || (typeof window !== 'undefined' ? window.location.origin : '')}${TICKETS_PATH}${
      event?.slug ? `?evento=${encodeURIComponent(event.slug)}` : ''
    }`
    const shareText = t('pages.tickets.shareMessage', {
      event: visibleOrder.eventTitle,
      link: shareUrl,
    })
    const shareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`

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

        {editorial ? (
          <a
            className="ticket-purchase__share-cta"
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Share2 size={15} aria-hidden />
            <span>{t('pages.tickets.shareCta')}</span>
          </a>
        ) : null}

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
            <p className="ticket-purchase__manual-note">
              {/* El efectivo no tiene destino de cobro que copiar: se paga en
                  caja y Finanzas acredita sin comprobante. */}
              {visibleOrder.manualPaymentChannel === 'cash_pitbull'
                ? t('pages.tickets.cashNote')
                : t('pages.tickets.manualNote')}
            </p>
            <p className="ticket-purchase__payment-note">{t('pages.tickets.transferQrDelay')}</p>
            <dl className="ticket-purchase__transfer-data">
              {visibleOrder.manualPaymentChannel === 'cash_pitbull' ? (
                <div>
                  <dt>{t('pages.tickets.cashWhereLabel')}</dt>
                  <dd>{t('pages.tickets.cashWhereValue')}</dd>
                </div>
              ) : visibleOrder.manualPaymentChannel === 'wise_transfer' ? (
                <>
                  <div>
                    <dt>{t('account.membership.transferHolder')}</dt>
                    <dd>{env.payments.wiseHolder || t('account.membership.transferAskAdmin')}</dd>
                  </div>
                  <div>
                    <dt>{t('account.membership.transferWiseAccountType')}</dt>
                    <dd>
                      {env.payments.wiseAccountType || t('account.membership.transferAskAdmin')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('account.membership.transferWiseRoutingNumber')}</dt>
                    <dd>
                      {env.payments.wiseRoutingNumber || t('account.membership.transferAskAdmin')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('account.membership.transferWiseAccountNumber')}</dt>
                    <dd>{env.payments.wiseAccount || t('account.membership.transferAskAdmin')}</dd>
                  </div>
                  <div>
                    <dt>{t('account.membership.transferWiseAddress')}</dt>
                    <dd>{env.payments.wiseAddress || t('account.membership.transferAskAdmin')}</dd>
                  </div>
                  {env.payments.wiseSwiftOrIban ? (
                    <div>
                      <dt>{t('account.membership.transferWiseSwiftBic')}</dt>
                      <dd>{env.payments.wiseSwiftOrIban}</dd>
                    </div>
                  ) : null}
                  {env.payments.wiseEmail ? (
                    <div>
                      <dt>{t('account.membership.transferWiseEmail')}</dt>
                      <dd>{env.payments.wiseEmail}</dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div>
                    <dt>{t('account.membership.transferAlias')}</dt>
                    <dd>
                      {accountDetails?.alias ||
                        env.payments.transferAlias ||
                        t('account.membership.transferAskAdmin')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('account.membership.transferAccount')}</dt>
                    <dd>{t('account.membership.transferAccountValue')}</dd>
                  </div>
                  {accountDetails?.cbu || env.payments.transferCbu ? (
                    <div>
                      <dt>{t('account.membership.transferCbu')}</dt>
                      <dd>{accountDetails?.cbu || env.payments.transferCbu}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{t('account.membership.transferHolder')}</dt>
                    <dd>
                      {accountDetails?.holder ||
                        env.payments.transferHolder ||
                        t('account.membership.transferAskAdmin')}
                    </dd>
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
            {/* Efectivo: no hay archivo que subir, así que el bloque de
                comprobante no aparece en vez de pedir algo que no existe. */}
            {visibleOrder.manualPaymentChannel === 'cash_pitbull' ? null : visibleOrder.paymentProofUploadedAt ||
              proofUploaded ? (
              <p className="ticket-purchase__proof-success">{t('pages.tickets.proofUploaded')}</p>
            ) : (
              <div className="ticket-purchase__proof-upload">
                <div className="ticket-purchase__proof-heading">
                  <span>{t('pages.tickets.proofLabel')}</span>
                  <small>{t('pages.tickets.proofHelp')}</small>
                </div>
                <label
                  className={`ticket-purchase__proof-dropzone${proofFile ? ' is-selected' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    selectProofFile(event.dataTransfer.files?.[0] ?? null)
                  }}
                >
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => selectProofFile(event.target.files?.[0] ?? null)}
                  />
                  <span className="ticket-purchase__proof-dropzone-icon" aria-hidden>
                    {proofFile ? <FileText size={20} /> : <Upload size={20} />}
                  </span>
                  <span className="ticket-purchase__proof-dropzone-copy">
                    <strong>
                      {proofFile ? proofFileName : t('pages.tickets.proofDropTitle')}
                    </strong>
                    <small>
                      {proofFile
                        ? formatProofFileSize(proofFile.size)
                        : t('pages.tickets.proofDropHint')}
                    </small>
                  </span>
                  <span className="ticket-purchase__proof-change">
                    {proofFile ? t('pages.tickets.proofChange') : t('pages.tickets.proofSelect')}
                  </span>
                </label>
                {proofFile ? (
                  <div className="ticket-purchase__proof-actions">
                    <button
                      type="button"
                      className="ticket-purchase__proof-remove"
                      disabled={proofUploading}
                      aria-label={t('pages.tickets.proofRemove')}
                      title={t('pages.tickets.proofRemove')}
                      onClick={clearProofFile}
                    >
                      <X size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ticket-purchase__proof-submit"
                      disabled={proofUploading}
                      onClick={handleProofUpload}
                    >
                      <Upload size={16} aria-hidden />
                      {proofUploading
                        ? t('pages.tickets.proofSubmitting')
                        : t('pages.tickets.proofSubmit')}
                    </button>
                  </div>
                ) : null}
                {proofUploadError ? (
                  <p className="ticket-purchase__submit-error" role="alert">
                    {proofUploadError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="ticket-purchase__bundles">
          {ticketBundles.map((bundle) => {
            // Una compra de entrenador emite dos credenciales con el mismo
            // nombre y el mismo DNI. Sin agruparlas parecían dos compras
            // distintas, y sin la etiqueta se leían idénticas.
            const multi = bundle.credentials.length > 1
            const holder = bundle.credentials[0]?.attendeeName ?? ''

            return (
              <section key={bundle.bundleId} className="ticket-purchase__bundle">
                {multi ? (
                  <header className="ticket-purchase__bundle-head">
                    <h4>{t('pages.tickets.credentialsFor', { name: holder })}</h4>
                    <p>
                      {t('pages.tickets.bundleNote_other', {
                        count: bundle.credentials.length,
                      })}
                    </p>
                  </header>
                ) : null}

                <ul className="ticket-purchase__list ticket-purchase__list--passes">
                  {bundle.credentials.map((ticket) => {
                    const passLabel = passLabelById.get(ticket.id) ?? ''
                    const scopes = ticket.credentialScopes ?? []
                    // "Abre Puerta general" en una entrada común es ruido; en un
                    // juego de dos, o cuando abre algo más que la puerta, es el
                    // dato.
                    const showZones =
                      scopes.length > 0 &&
                      (multi || scopes.some((scope) => scope !== 'gate_tickets'))

                    return (
                      <li key={ticket.id} className="ticket-purchase__pass-item">
                        <TicketPassPreview
                          live
                          interactive={false}
                          attendeeName={ticket.attendeeName}
                          date={ticket.eventDate || event?.date}
                          dayPassLabel={passLabel}
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
                            {showZones ? (
                              <span className="ticket-purchase__ticket-zones">
                                {t('pages.tickets.credentialOpens', {
                                  zones: zoneScopeList(scopes, t),
                                })}
                              </span>
                            ) : null}
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
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>

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
                  dayPassLabel: passLabelById.get(activeTicket.id) ?? '',
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
            paymentMethod={paymentMethod}
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
                paymentMethod={paymentMethod}
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
                    {money(priceForAttendee(attendee, pricing, ticketAddons, paymentMethod), locale)}
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
                    maxLength={16}
                  />
                  <Select
                    label={t('pages.tickets.ticketTypes.legend')}
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
        {/* Va antes del medio de pago, no después: es el dato que decide a
            dónde llega la entrada, y dejarlo al final lo volvía un trámite
            posterior al pago en la lectura de la pantalla. */}
        <TicketBuyerFields buyer={buyer} errors={errors} onChange={changeBuyer} t={t} />

        {editorial ? (
          <>
            <TicketPaymentOptions
              manualEnabled={effectiveManualPaymentEnabled}
              mercadoPagoEnabled={effectiveMercadoPagoEnabled}
              cashEnabled={effectiveCashEnabled}
              wiseEnabled={effectiveWiseEnabled}
              paymentMethod={paymentMethod}
              priceLabels={paymentPriceLabels}
              wiseLabel={wiseLabel}
              onChange={(value) => {
                setPaymentMethod(value)
                setSubmitError('')
              }}
              t={t}
            />
            {paymentNarrowedByType ? (
              <p className="ticket-purchase__payment-note ticket-purchase__payment-note--narrowed">
                {t('pages.tickets.paymentNarrowedByType')}
              </p>
            ) : null}
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
