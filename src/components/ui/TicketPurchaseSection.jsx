import '../../styles/components/ticket-purchase.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Download,
  FileText,
  Minus,
  Plus,
  QrCode,
  Share2,
  Ticket as TicketIcon,
  UserRound,
  Upload,
  X,
} from 'lucide-react'
import Button from './Button.jsx'
import CardPreviewModal from './CardPreviewModal.jsx'
import ConfirmationSeal from './ConfirmationSeal.jsx'
import FormSection from './FormSection.jsx'
import { Field, Select } from './FormFields.jsx'
import StatusPill from './StatusPill.jsx'
import TicketPassPreview from './TicketPassPreview.jsx'
import TicketTypeOptions, { zoneScopeList } from './TicketTypeOptions.jsx'
import MercadoPagoEmbeddedCheckout from './MercadoPagoEmbeddedCheckout.jsx'
import { TicketCheckoutSteps, TicketOrderSummary } from './TicketCheckoutFlow.jsx'
import { TICKET_CHECKOUT_STEPS } from '../../services/ticketCheckoutProgress.js'
import MotionContentSwap from '../../motion/MotionContentSwap.tsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import { getFormOptions } from '../../lib/formOptions.js'
import { ticketTypeNameParts } from '../../lib/eventPricing.js'
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
import { formatDoorCode } from '../../lib/manualCheckinCode.js'
import {
  buildCardFilename,
  downloadCard,
  generateEventCard,
  preloadEventCardCapture,
} from '../../services/eventCardService.js'

/**
 * Espera a que las imágenes dentro del nodo (QR, logo) terminen de cargar
 * antes de rasterizar — sin esto, un tap muy rápido después de abrir la
 * confirmación podía descargar la entrada con el QR todavía en blanco.
 */
async function waitForPassImagesReady(node, { timeoutMs = 4000 } = {}) {
  if (!node) return
  const images = [...node.querySelectorAll('img')]
  await Promise.race([
    Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true })
          img.addEventListener('error', resolve, { once: true })
        })
      }),
    ),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

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

/**
 * Una entrada del pedido: de qué tipo es, cuánto sale y a nombre de quién va.
 * El tipo ya se eligió en el paso anterior; acá solo se completa la persona.
 */
function TicketAttendeeCard({
  addons,
  attendee,
  buyerName,
  selfDni = '',
  errors,
  index,
  locale,
  onAddonToggle,
  onChange,
  paymentMethod,
  pricing,
  t,
}) {
  const type = pricing.ticketTypes.find((item) => item.id === attendee.ticketTypeId)
  const typeLabel = type ? ticketTypeNameParts(type.name, locale).title || type.name : ''
  const rowPrice = priceForAttendee(attendee, pricing, addons, paymentMethod)
  const hasError = Boolean(errors[`attendee-${index}-fullName`] || errors[`attendee-${index}-dni`])
  // Casi siempre quien compra también va: un toque copia su nombre (y, con la
  // sesión abierta, su DNI) en vez de pedirle que lo escriba dos veces. Con el
  // DNI de la cuenta la entrada además queda en su perfil.
  const selfName = buyerName.trim()
  const canUseBuyerName = index === 0 && selfName && !attendee.fullName.trim()

  function fillWithSelf() {
    onChange(index, 'fullName', selfName)
    if (selfDni && !attendee.dni.trim()) onChange(index, 'dni', selfDni)
  }

  return (
    <fieldset className={`ticket-purchase__attendee-card${hasError ? ' has-error' : ''}`}>
      <legend className="ticket-purchase__attendee-card-head">
        <span className="ticket-purchase__attendee-label">
          {t('pages.tickets.attendee', { index: index + 1 })}
        </span>
        {typeLabel ? <span className="ticket-purchase__attendee-type">{typeLabel}</span> : null}
        <span className="ticket-purchase__attendee-price">{money(rowPrice, locale)}</span>
      </legend>

      <div className="ticket-purchase__attendee-fields">
        <Field
          className="ticket-purchase__field-name"
          label={t('pages.tickets.fullName')}
          name={`attendee-${index}-fullName`}
          value={attendee.fullName}
          onChange={(e) => onChange(index, 'fullName', e.target.value)}
          error={errors[`attendee-${index}-fullName`]}
          placeholder={t('pages.tickets.fullNamePlaceholder')}
          autoComplete={index === 0 ? 'name' : 'off'}
        />
        <Field
          className="ticket-purchase__field-dni"
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
      </div>

      {canUseBuyerName ? (
        <button type="button" className="ticket-purchase__attendee-me" onClick={fillWithSelf}>
          {t('pages.tickets.flow.attendeeIsMe', { name: selfName })}
        </button>
      ) : null}

      <TicketAddonPicker
        addons={addons}
        attendee={attendee}
        locale={locale}
        onToggle={(addonId) => onAddonToggle(index, addonId)}
        t={t}
        ticketTypes={pricing.ticketTypes}
      />
    </fieldset>
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
function TicketBuyerFields({ buyer, errors, onChange, t, editorial = false }) {
  return (
    <fieldset className="ticket-purchase__buyer">
      <legend>
        {editorial ? t('pages.tickets.flow.buyerLegend') : t('pages.tickets.buyerTitle')}
      </legend>
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

/**
 * Una fila de medio de pago: misma lengua que TicketTypeOptions (nombre |
 * precio, hint, certeza de QR sólo en la seleccionada). El radio real sigue
 * en el DOM para teclado y para los e2e que apuntan a `ticket-payment`.
 */
function TicketPaymentOption({
  assurance = '',
  checked,
  compact = false,
  disabled = false,
  hint = '',
  onChange,
  priceLabel = '',
  savingsLabel = '',
  title,
  value,
}) {
  const className = [
    'ticket-purchase__payment-option',
    checked ? 'is-selected' : '',
    disabled ? 'is-disabled' : '',
    compact ? 'ticket-purchase__payment-option--soon' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={className}>
      <input
        type="radio"
        name="ticket-payment"
        value={value}
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="ticket-purchase__payment-head">
        <span className="ticket-purchase__payment-name">{title}</span>
        {priceLabel || savingsLabel ? (
          <span className="ticket-purchase__payment-amounts">
            {priceLabel ? (
              <span className="ticket-purchase__payment-price">{priceLabel}</span>
            ) : null}
            {savingsLabel ? (
              <span className="ticket-purchase__payment-savings">{savingsLabel}</span>
            ) : null}
          </span>
        ) : null}
      </span>
      {hint ? <span className="ticket-purchase__payment-hint">{hint}</span> : null}
      {checked && assurance ? (
        <span className="ticket-purchase__payment-assurance">
          <QrCode size={14} strokeWidth={1.8} aria-hidden />
          {assurance}
        </span>
      ) : null}
    </label>
  )
}

export function TicketPaymentOptions({
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
        <TicketPaymentOption
          value="mercado_pago"
          checked={paymentMethod === 'mercado_pago'}
          title={t('formOptions.payment.mercadoPago')}
          hint={t('pages.tickets.paymentMpHint')}
          priceLabel={priceLabels?.mercado_pago?.priceLabel}
          assurance={t('pages.tickets.paymentMpAssurance')}
          onChange={onChange}
        />
      ) : null}
      {/* Canal manual cerrado desde el panel: la opción no se muestra, en vez de
          aparecer y fallar con 409 al enviar la compra. */}
      {manualEnabled ? (
        <TicketPaymentOption
          value="transferencia"
          checked={paymentMethod === 'transferencia'}
          title={t('pages.tickets.paymentTransfer')}
          hint={t('pages.tickets.paymentTransferHint')}
          priceLabel={priceLabels?.transferencia?.priceLabel}
          savingsLabel={priceLabels?.transferencia?.savingsLabel}
          assurance={t('pages.tickets.paymentTransferAssurance')}
          onChange={onChange}
        />
      ) : null}
      {/* Efectivo en Pitbull: el espectador que pasa por el gimnasio paga en
          caja y no sube comprobante. Interruptor propio, igual que Wise. */}
      {cashEnabled ? (
        <TicketPaymentOption
          value="cash_pitbull"
          checked={paymentMethod === 'cash_pitbull'}
          title={t('pages.tickets.paymentCash')}
          hint={t('pages.tickets.paymentCashHint')}
          priceLabel={priceLabels?.cash_pitbull?.priceLabel}
          savingsLabel={priceLabels?.cash_pitbull?.savingsLabel}
          assurance={t('pages.tickets.paymentCashAssurance')}
          onChange={onChange}
        />
      ) : null}
      {/* Wise se anuncia siempre. No se puede elegir hasta que Administración
          abra el canal y cargue el USD de cada ítem: un monto convertido del
          peso no es un precio, y mostrarlo acá prometía un cobro que nadie
          decidió. Cerrado se degrada a fila, no a card competidora. */}
      <TicketPaymentOption
        value="wise_transfer"
        checked={wiseEnabled && paymentMethod === 'wise_transfer'}
        compact={!wiseEnabled}
        disabled={!wiseEnabled}
        title={t('pages.register.paymentWiseLabel')}
        hint={wiseEnabled ? t('pages.tickets.paymentWiseHint') : t('pages.tickets.paymentWiseSoon')}
        priceLabel={wiseEnabled ? wiseLabel : ''}
        assurance={wiseEnabled ? t('pages.tickets.paymentWiseAssurance') : ''}
        onChange={onChange}
      />
    </fieldset>
  )
}

export default function TicketPurchaseSection({
  editorial = false,
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
  // Cuenta con la sesión abierta ({ name, email, dni, emailVerified }) o null.
  // Precarga los datos y decide si la compra queda en Mis entradas.
  account = null,
  onOpenMyTickets,
  onCreateAccount,
  createdOrder,
  onSubmit,
  onUploadPaymentProof,
}) {
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const formOptions = useMemo(() => getFormOptions(t), [t])
  const [quantity, setQuantity] = useState(1)
  // En el checkout editorial se arranca sin entradas si hay más de un tipo:
  // precargar la primera obligaba a restar una para elegir otra, y era fácil
  // terminar pagando un tipo que nadie eligió. Con un solo tipo no hay nada
  // que decidir y se arranca en 1.
  const [attendees, setAttendees] = useState(() =>
    editorial && (pricing?.ticketTypes?.length ?? 0) !== 1 ? [] : [emptyAttendee(pricing)],
  )
  const [step, setStep] = useState(TICKET_CHECKOUT_STEPS[0])
  const [stepDirection, setStepDirection] = useState(1)
  const formRef = useRef(null)
  const stepHeadingRef = useRef(null)
  const stepChangedRef = useRef(false)
  const quantityTouchedRef = useRef(false)
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  // Quien compra no es necesariamente quien entra: una persona puede comprar
  // seis entradas para otras seis. El email es la única vía por la que le llega
  // el QR y el aviso de acreditación, así que vive acá y no por asistente.
  // Con la sesión abierta se compra "como uno mismo": nombre y mail de la
  // cuenta ya cargados, editables.
  const [buyer, setBuyer] = useState(() => ({
    name: account?.name ?? '',
    email: account?.email ?? '',
    phone: '',
  }))
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
  const [downloadingPassId, setDownloadingPassId] = useState(null)
  const [downloadPassError, setDownloadPassError] = useState('')
  const passNodesRef = useRef({})

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
  const effectiveManualPaymentEnabled =
    manualPaymentEnabled && openChannelsForSelection.bank_transfer
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

  // El catálogo puede llegar después del montaje. Si trae un único tipo y la
  // persona todavía no tocó cantidades, se arranca en 1 igual que si hubiera
  // estado desde el principio.
  useEffect(() => {
    if (!editorial || quantityTouchedRef.current) return
    const available = pricing?.ticketTypes ?? []
    if (available.length !== 1) return
    setAttendees((current) =>
      current.length ? current : [{ ...emptyAttendee(pricing), ticketTypeId: available[0].id }],
    )
  }, [editorial, pricing])

  // Al cambiar de paso el foco va al título nuevo (teclado y lector de
  // pantalla saben dónde están) y, si el formulario quedó arriba del
  // viewport, se lo trae a la vista: el paso nuevo arranca desde su comienzo.
  useEffect(() => {
    if (!stepChangedRef.current) return
    stepChangedRef.current = false
    const form = formRef.current
    const top = form?.getBoundingClientRect?.().top ?? 0
    if (top < 0) {
      form?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    }
    stepHeadingRef.current?.focus?.({ preventScroll: true })
  }, [step, reducedMotion])
  const ticketTypeNames = useMemo(
    () => Object.fromEntries((pricing.ticketTypes ?? []).map((type) => [type.id, type.name])),
    [pricing.ticketTypes],
  )
  const ticketTypeSelectOptions = useMemo(
    () => (pricing.ticketTypes ?? []).map((type) => [type.id, type.name]),
    [pricing.ticketTypes],
  )
  const visibleOrder = createdOrder?.type === 'tickets' ? createdOrder : null

  // Precarga el chunk de html2canvas apenas se ve la confirmación, para que
  // el primer tap en "Descargar entrada" no espere el import.
  useEffect(() => {
    if (visibleOrder) preloadEventCardCapture().catch(() => {})
  }, [visibleOrder])

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
  const ticketCount = editorial ? attendees.length : quantity
  const accountLinksWholeOrder = Boolean(
    account?.emailVerified &&
    account.email &&
    buyer.email.trim().toLowerCase() === account.email.trim().toLowerCase(),
  )

  // Cuántas de cada tipo hay en el pedido: el contador de cada fila del
  // selector sale de acá, no de un estado paralelo que pueda desincronizarse.
  const quantities = useMemo(() => {
    const counts = {}
    for (const attendee of attendees) {
      counts[attendee.ticketTypeId] = (counts[attendee.ticketTypeId] ?? 0) + 1
    }
    return counts
  }, [attendees])

  // Una línea por tipo para el resumen, con los extras de cada entrada ya
  // sumados y el precio del medio de pago elegido.
  const orderLines = useMemo(
    () =>
      (pricing.ticketTypes ?? []).flatMap((type) => {
        const ofType = attendees.filter((attendee) => attendee.ticketTypeId === type.id)
        if (!ofType.length) return []
        return [
          {
            id: type.id,
            name: ticketTypeNameParts(type.name, locale).title || type.name,
            count: ofType.length,
            subtotal: ofType.reduce(
              (sum, attendee) =>
                sum + priceForAttendee(attendee, pricing, ticketAddons, paymentMethod),
              0,
            ),
          },
        ]
      }),
    [attendees, locale, paymentMethod, pricing, ticketAddons],
  )

  function goToStep(next) {
    const from = TICKET_CHECKOUT_STEPS.indexOf(step)
    const to = TICKET_CHECKOUT_STEPS.indexOf(next)
    if (to < 0 || to === from) return
    stepChangedRef.current = true
    setStepDirection(to > from ? 1 : -1)
    setStep(next)
    setSubmitError('')
  }

  /**
   * Suma o resta una entrada de un tipo. El pedido se mantiene agrupado por
   * tipo, en el orden del catálogo, para que "Entrada 1, 2, 3" en el paso de
   * datos se lea en el mismo orden que el selector. Al restar se saca primero
   * una entrada vacía, así no se pierde un nombre ya cargado.
   */
  function changeTypeQuantity(ticketTypeId, delta) {
    quantityTouchedRef.current = true
    const order = (pricing.ticketTypes ?? []).map((type) => type.id)
    setAttendees((current) => {
      if (delta > 0) {
        if (current.length >= MAX_TICKETS) return current
        const next = [...current, { ...emptyAttendee(pricing), ticketTypeId }]
        return next
          .map((attendee, position) => ({ attendee, position }))
          .sort(
            (a, b) =>
              order.indexOf(a.attendee.ticketTypeId) - order.indexOf(b.attendee.ticketTypeId) ||
              a.position - b.position,
          )
          .map(({ attendee }) => attendee)
      }
      const indexes = current
        .map((attendee, position) => (attendee.ticketTypeId === ticketTypeId ? position : -1))
        .filter((position) => position >= 0)
      if (!indexes.length) return current
      const empty = indexes.filter(
        (position) => !current[position].fullName.trim() && !current[position].dni.trim(),
      )
      const drop = (empty.length ? empty : indexes).at(-1)
      return current.filter((_, position) => position !== drop)
    })
    // Los errores se guardan por posición: al cambiar el pedido dejan de
    // apuntar a la entrada correcta.
    setErrors({})
    setSubmitError('')
  }

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
    if (editorial && step === 'tickets') {
      if (!attendees.length) {
        setErrors({ tickets: t('pages.tickets.flow.pickOne') })
        return
      }
      setErrors({})
      goToStep('buyer')
      return
    }
    const validation = validateTicketAttendees(
      attendees,
      t,
      (pricing.ticketTypes ?? []).map((type) => type.id),
    )
    const buyerValidation = validateTicketBuyer(buyer, t)
    if (!validation.success || !buyerValidation.success) {
      setErrors({ ...validation.errors, ...buyerValidation.errors })
      // Los datos se cargan en el paso del medio: si algo falla al pagar, se
      // vuelve ahí con el error marcado en vez de avisar sobre un campo oculto.
      if (editorial && step !== 'buyer') {
        goToStep('buyer')
        return
      }
      requestAnimationFrame(() => {
        const firstInvalid = document.querySelector(
          '.ticket-purchase__buyer .field input[aria-invalid="true"], .ticket-purchase__attendee-card .field input[aria-invalid="true"], .ticket-purchase__attendee-row .field input[aria-invalid="true"]',
        )
        // El `?.` del método y no sólo del elemento: en jsdom (y en
        // cualquier entorno sin scroll) el nodo existe y el método no, y una
        // excepción acá tiraba abajo el aviso de error que estaba por mostrar.
        firstInvalid?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        // El foco va al campo, no sólo la vista: con teclado o lector de
        // pantalla el error tiene que quedar donde se escribe.
        firstInvalid?.focus?.({ preventScroll: true })
      })
      return
    }
    setErrors({})
    if (editorial && step === 'buyer') {
      goToStep('payment')
      return
    }
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

  async function handleDownloadPass(ticket) {
    const node = passNodesRef.current[ticket.id]
    if (!node) return
    setDownloadingPassId(ticket.id)
    setDownloadPassError('')
    try {
      await waitForPassImagesReady(node)
      const blob = await generateEventCard(node)
      const filename = buildCardFilename(
        ticket.attendeeName,
        ticket.eventSlug || event?.slug || 'evento',
        ticket.ticketCode || '',
      )
      downloadCard(blob, filename)
    } catch (err) {
      console.error('TicketPurchaseSection: descarga de entrada', err)
      setDownloadPassError(t('pages.tickets.downloadPassError'))
    } finally {
      setDownloadingPassId(null)
    }
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
        {visibleOrder.status === 'aprobado' ? (
          // El pago ya está acreditado: es uno de los momentos que cierra un
          // trámite (ver celebration.js), así que el sello reemplaza al
          // encabezado plano y festeja una sola vez por orden (`celebrateKey`
          // evita que se repita si la persona recarga la página o vuelve a
          // encontrar esta misma compra desde TicketOrderLookup).
          <ConfirmationSeal
            variant="payment"
            celebrate
            celebrateKey={`ticket-order:${visibleOrder.orderId}`}
            eyebrow={t('pages.tickets.sealEyebrow')}
            seal={countLabel}
            title={t('pages.tickets.confirmationTitle', { event: visibleOrder.eventTitle })}
            detail={t('pages.tickets.sealDetail', {
              amount: money(visibleOrder.amount, locale, visibleOrder.currency),
            })}
          />
        ) : (
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
        )}

        {visibleOrder.status !== 'aprobado' ? (
          <p className="ticket-purchase__confirmation-lead">
            {t('pages.tickets.confirmationQrLead')}
          </p>
        ) : null}

        {editorial && account && onOpenMyTickets ? (
          <div className="ticket-purchase__account-link">
            <p>
              {visibleOrder.status === 'aprobado'
                ? t('pages.tickets.account.savedMine')
                : t('pages.tickets.account.pendingMine')}
            </p>
            <button
              type="button"
              className="ticket-purchase__account-cta"
              onClick={onOpenMyTickets}
            >
              <TicketIcon size={15} aria-hidden />
              {t('pages.tickets.account.viewMine')}
            </button>
          </div>
        ) : null}

        {editorial && !account && onCreateAccount ? (
          <div className="ticket-purchase__account-link">
            <p>
              <strong>{t('pages.tickets.account.guestTitle')}</strong>{' '}
              {t('pages.tickets.account.guestLead')}
            </p>
            <button
              type="button"
              className="ticket-purchase__account-cta"
              onClick={onCreateAccount}
            >
              <UserRound size={15} aria-hidden />
              {t('pages.tickets.account.guestCta')}
            </button>
          </div>
        ) : null}

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
            {visibleOrder.manualPaymentChannel ===
            'cash_pitbull' ? null : visibleOrder.paymentProofUploadedAt || proofUploaded ? (
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
                    <strong>{proofFile ? proofFileName : t('pages.tickets.proofDropTitle')}</strong>
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

                    const isDownloading = downloadingPassId === ticket.id

                    return (
                      <li key={ticket.id} className="ticket-purchase__pass-item">
                        <div ref={(el) => (passNodesRef.current[ticket.id] = el)}>
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
                        </div>
                        <div className="ticket-purchase__pass-actions">
                          <div className="ticket-purchase__ticket-info">
                            <span>
                              {t('pages.tickets.dni')} {ticket.attendeeDni} · {ticket.ticketCode}
                            </span>
                            {/* Plan B del QR en la puerta: se le dicta a seguridad. */}
                            {ticket.doorCode ? (
                              <span className="ticket-purchase__door-code">
                                {t('pages.tickets.doorCode')}{' '}
                                <strong>{formatDoorCode(ticket.doorCode)}</strong>
                              </span>
                            ) : null}
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
                          <button
                            type="button"
                            className="ticket-purchase__qr-btn"
                            disabled={isDownloading}
                            onClick={() => handleDownloadPass(ticket)}
                          >
                            <Download size={14} aria-hidden />
                            {isDownloading
                              ? t('pages.tickets.downloadingPass')
                              : t('pages.tickets.downloadPass')}
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

        {downloadPassError ? (
          <p className="ticket-purchase__submit-error" role="alert">
            {downloadPassError}
          </p>
        ) : null}

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
    : ticketCount === 1
      ? t('pages.tickets.buy_one')
      : t('pages.tickets.buy_other', { count: ticketCount })

  if (editorial) {
    const stepIndex = TICKET_CHECKOUT_STEPS.indexOf(step)
    const stepCopy = {
      tickets: [t('pages.tickets.flow.ticketsTitle'), t('pages.tickets.flow.ticketsLead')],
      buyer: [t('pages.tickets.flow.buyerTitle'), t('pages.tickets.flow.buyerStepLead')],
      payment: [t('pages.tickets.flow.paymentTitle'), t('pages.tickets.flow.paymentLead')],
    }[step]
    const actionLabel =
      step === 'tickets'
        ? t('pages.tickets.flow.continue')
        : step === 'buyer'
          ? t('pages.tickets.flow.continueToPayment')
          : buyLabel
    const maxReached = attendees.length >= MAX_TICKETS

    const ticketsStep = (
      <>
        <TicketTypeOptions
          className="ticket-purchase__picker"
          locale={locale}
          maxReached={maxReached}
          onQuantityChange={changeTypeQuantity}
          quantities={quantities}
          t={t}
          ticketTypes={pricing.ticketTypes ?? []}
        />
        {maxReached ? (
          <p className="ticket-purchase__step-note">
            {t('pages.tickets.flow.maxReached', { max: MAX_TICKETS })}
          </p>
        ) : null}
        {errors.tickets ? (
          <p className="ticket-purchase__submit-error" role="alert">
            {errors.tickets}
          </p>
        ) : null}
      </>
    )

    const buyerStep = (
      <>
        <TicketBuyerFields editorial buyer={buyer} errors={errors} onChange={changeBuyer} t={t} />
        {account ? (
          // El backend asocia una entrada a la cuenta por el DNI del
          // asistente o por el mail de compra, si es el verificado de la
          // cuenta. El aviso dice cuál de los dos aplica a esta compra.
          <p className="ticket-purchase__account-note" aria-live="polite">
            <UserRound size={15} aria-hidden />
            <span>
              {accountLinksWholeOrder
                ? t('pages.tickets.account.linkedAll')
                : t('pages.tickets.account.linkedDni')}
            </span>
          </p>
        ) : null}
        <section className="ticket-purchase__attendees" aria-labelledby="ticket-attendees-title">
          <header className="ticket-purchase__attendees-head">
            <h3 id="ticket-attendees-title">{t('pages.tickets.flow.attendeesTitle')}</h3>
            <p>{t('pages.tickets.dniWhy')}</p>
          </header>
          {attendees.map((attendee, index) => (
            <TicketAttendeeCard
              key={index}
              addons={ticketAddons}
              attendee={attendee}
              buyerName={buyer.name}
              selfDni={account?.dni ?? ''}
              errors={errors}
              index={index}
              locale={locale}
              onAddonToggle={handleAddonToggle}
              onChange={changeAttendee}
              paymentMethod={paymentMethod}
              pricing={pricing}
              t={t}
            />
          ))}
        </section>
      </>
    )

    const paymentStep = (
      <div className="ticket-purchase__checkout ticket-purchase__checkout--editorial">
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
        ) : null}
        {submitError ? (
          <p className="ticket-purchase__submit-error" role="alert">
            {submitError}
          </p>
        ) : null}
      </div>
    )

    return (
      <form
        ref={formRef}
        className="ticket-purchase ticket-purchase--editorial ticket-purchase--wizard"
        onSubmit={handleSubmit}
      >
        <div className="ticket-purchase__main">
          <TicketCheckoutSteps step={step} onStepChange={goToStep} t={t} />

          <header className="ticket-purchase__step-head">
            {stepIndex > 0 ? (
              <button
                type="button"
                className="ticket-purchase__back"
                onClick={() => goToStep(TICKET_CHECKOUT_STEPS[stepIndex - 1])}
              >
                <ArrowLeft size={15} aria-hidden />
                {t('pages.tickets.flow.back')}
              </button>
            ) : null}
            {/* El título queda fuera del cambio animado: siempre está montado,
                así el foco puede ir a él apenas cambia el paso. */}
            <h2 ref={stepHeadingRef} tabIndex={-1} className="ticket-purchase__step-title">
              {stepCopy[0]}
            </h2>
            <p className="ticket-purchase__step-lead">{stepCopy[1]}</p>
          </header>

          <MotionContentSwap
            swapKey={step}
            direction={stepDirection}
            className="ticket-purchase__step-body"
          >
            {step === 'tickets' ? ticketsStep : step === 'buyer' ? buyerStep : paymentStep}
          </MotionContentSwap>
        </div>

        <TicketOrderSummary
          actionDisabled={submitting || (step === 'tickets' && attendees.length === 0)}
          actionLabel={actionLabel}
          count={attendees.length}
          event={event}
          lines={orderLines}
          locale={locale}
          t={t}
          total={total}
        />
      </form>
    )
  }

  return (
    <form className="ticket-purchase" onSubmit={handleSubmit}>
      <FormSection
        title={t('pages.tickets.title')}
        description={t('pages.tickets.description', { event: event.title })}
      >
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
          <span className="ticket-purchase__unit-price">{money(total, locale)}</span>
        </div>

        <div className="ticket-purchase__attendees">
          {attendees.map((attendee, index) => (
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
                  onChange={(e) => changeAttendee(index, 'dni', e.target.value.replace(/\D/g, ''))}
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
          ))}
        </div>

        <TicketBuyerFields buyer={buyer} errors={errors} onChange={changeBuyer} t={t} />

        <div className="ticket-purchase__checkout">
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
        </div>
      </FormSection>
    </form>
  )
}
