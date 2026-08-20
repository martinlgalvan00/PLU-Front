import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeDollarSign,
  CalendarClock,
  CalendarOff,
  Check,
  ChevronDown,
  CirclePlus,
  Copy,
  FlaskConical,
  Link2,
  Pencil,
  QrCode,
  RefreshCw,
  Repeat,
  Save,
  X,
  Trash2,
} from 'lucide-react'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import FeatureComingSoon from '../../components/ui/FeatureComingSoon.jsx'
import { FEATURE_KEYS, isFeatureEnabled } from '../../lib/featureAvailability.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getPricingTourSteps } from '../../lib/adminTourSteps.js'
import { money } from '../../lib/format.js'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { getDiscountCodeAvailability } from '../../services/pricingAdminService.js'
import { buildPromotionCodeUrl } from '../../services/promotionCodeService.js'
import { COMBO_VISIBILITY_STATES } from '../../services/comboOfferService.js'

const EMPTY_PLAN = {
  sourcePlanId: undefined,
  familyCode: '',
  name: '',
  description: '',
  price: '',
  manualPrice: '',
  currency: 'ARS',
  billingFrequency: 'annual',
  collectionMode: 'one_time',
  intervalCount: 1,
  graceDays: 0,
  effectiveFrom: '',
  retiresAt: '',
}

// Mercado Pago no se lista: está siempre disponible y no se puede apagar por
// código. Sólo los canales manuales son opt-in.
const MANUAL_PAYMENT_CHANNELS = ['bank_transfer', 'cash_pitbull']

/**
 * Los tres estados de una promoción, en el orden en que los recorre el
 * operador: apagada, abierta a todos, abierta sólo a quien tiene el código.
 * En la base son dos ejes (`active` × `audience`); acá es un valor único
 * porque es una sola pregunta: quién puede acceder a esta promo.
 */
const PROMO_STATES = ['off', 'code', 'public']

const EMPTY_DISCOUNT_CODE = {
  id: undefined,
  code: '',
  description: '',
  // Quién accede: 'code' hay que tipearla, 'public' se aplica sola a todos.
  audience: 'code',
  // 'percent' descuenta un porcentaje; 'fixed_price' fija el importe final de
  // la compra; 'access' no descuenta nada — es un código secreto que sólo
  // desbloquea el combo; 'offer' es la OFERTA EXCLUSIVA: desbloquea el combo y
  // además fija su precio ("afiliación + inscripción a $120.000" detrás de un
  // código secreto). 'access' y 'offer' sólo valen con appliesTo 'combo'.
  kind: 'percent',
  percentOff: '',
  fixedPrice: '',
  // Importe final para transferencia y efectivo. Vacío = cobra lo mismo que
  // `fixedPrice` en cualquier canal, que es el caso más común.
  fixedPriceManual: '',
  appliesTo: 'membership',
  // A qué inscripción aplica. Vacío = cualquiera. Obligatorio en 'offer': la
  // oferta se cotiza contra el combo de ese evento.
  eventId: '',
  maxRedemptions: '',
  startsAt: '',
  expiresAt: '',
  active: true,
  // Canales manuales que el código destraba, además de Mercado Pago (que
  // siempre está disponible). Vacío = sólo Mercado Pago.
  manualChannels: [],
  // Exclusividad nominal, un email por línea. Vacío = promo abierta.
  inviteesText: '',
}

/**
 * Los emails de la lista de invitados se tipean de a uno por línea, pero pegar
 * una columna de una planilla trae comas, punto y coma o tabulaciones. Se
 * aceptan los cuatro separadores y se normaliza a minúsculas sin repetidos.
 */
function parseInvitees(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const SUBSCRIPTION_STATUS_LABELS = {
  pending: 'pending',
  authorized: 'active',
  paused: 'paused',
  past_due: 'pastDue',
  cancelled: 'cancelled',
  ended: 'ended',
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const DAY_MS = 86_400_000

function describeExpiry(expiresAt, now, locale, t) {
  if (!expiresAt)
    return { label: t('admin.sections.pricing.noExpiry'), urgent: false, expired: false }
  const date = new Date(expiresAt)
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  const diffDays = Math.floor((date.getTime() - now.getTime()) / DAY_MS)

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays)
    return {
      label:
        daysAgo === 1
          ? t('admin.sections.pricing.expiredYesterday')
          : t('admin.sections.pricing.expiredDaysAgo', { count: daysAgo }),
      urgent: true,
      expired: true,
    }
  }
  if (diffDays === 0)
    return { label: t('admin.sections.pricing.expiresToday'), urgent: true, expired: false }
  if (diffDays === 1)
    return { label: t('admin.sections.pricing.expiresTomorrow'), urgent: true, expired: false }
  if (diffDays <= 7) {
    return {
      label: t('admin.sections.pricing.expiresInDays', { count: diffDays }),
      urgent: true,
      expired: false,
    }
  }
  return {
    label: t('admin.sections.pricing.expiresOn', { date: dateLabel }),
    urgent: false,
    expired: false,
  }
}

function planStatus(plan, now) {
  if (!plan.active || (plan.retiredAt && new Date(plan.retiredAt) <= now)) return 'inactive'
  if (plan.effectiveFrom && new Date(plan.effectiveFrom) > now) return 'scheduled'
  return 'active'
}

// Lo que se mira acá son cupos de códigos de descuento que se canjean de a uno
// desde los checkouts, no un contador que corra solo. A 10 s una pestaña de
// panel abierta durante la jornada pedía el catálogo completo unas 2.900 veces
// por operador; a 30 s el operador ve lo mismo y la función se invoca un tercio.
const PRICING_LIVE_SYNC_MS = 30_000
const COPY_FEEDBACK_MS = 2_000

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
  } catch {
    // En contextos sin permiso de clipboard (iframes, HTTP o Safari), se usa
    // el fallback sincronico que todavia soportan los navegadores modernos.
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard copy failed')
}

function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  // Safari y algunos webviews ignoran clicks sobre anchors que nunca se
  // montaron. Se monta un instante y se limpia en el mismo tick.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

export default function PricingSection({
  canEdit = false,
  canEditSubscriptions = false,
  configuration = { plans: [], events: [], discountCodes: [], availability: { editable: true } },
  error,
  isLoading = false,
  onCreatePlanVersion,
  onDeletePlan,
  onRefresh,
  onSaveComboOffer,
  onDeleteComboOffer,
  onSetPlanActive,
  onSetPlanRetirement,
  onUpsertDiscountCode,
  onSetDiscountCodeState,
  onDeleteDiscountCode,
  onSimulatePromotionCode,
  subscriptions = [],
  subscriptionsLoading = false,
  subscriptionsError,
  onRefreshSubscriptions,
  onCancelSubscription,
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()

  useEffect(() => {
    startTour('admin-pricing', getPricingTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  const [planDraft, setPlanDraft] = useState(null)
  const [planError, setPlanError] = useState('')
  const [planToDelete, setPlanToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [comboError, setComboError] = useState('')
  // El combo era la única fila del catálogo que se podía crear y editar pero no
  // dar de baja: quedaba inactiva para siempre. La confirmación reusa el mismo
  // diálogo que planes y promos.
  const [comboToDelete, setComboToDelete] = useState(null)
  const [notice, setNotice] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [comboEditorOpen, setComboEditorOpen] = useState(false)
  const [selectedEventSlug, setSelectedEventSlug] = useState('')
  const [comboDraft, setComboDraft] = useState({
    membershipPlanId: '',
    price: '',
    manualPrice: '',
    startsAt: '',
    endsAt: '',
    active: false,
    // Quién ve el paquete: público, restringido por llave o privado para
    // prepararlo/pausarlo. Es visibilidad, no precio ni estado operativo.
    audience: 'public',
    accessCode: '',
  })
  const [retirementPlanId, setRetirementPlanId] = useState(null)
  const [retirementDraft, setRetirementDraft] = useState('')
  const [codeDraft, setCodeDraft] = useState(null)
  const [codeError, setCodeError] = useState('')
  // El error de cambiar el estado de una promo se muestra en su propia fila:
  // `codeError` sólo se renderiza dentro del formulario, así que un rechazo al
  // togglear desde la lista (cupo agotado, promo pública con canal manual)
  // quedaba invisible y el control volvía solo a su lugar sin explicar nada.
  const [codeStateError, setCodeStateError] = useState({ id: null, message: '' })
  const [copiedCodeId, setCopiedCodeId] = useState(null)
  const [copiedLinkCodeId, setCopiedLinkCodeId] = useState(null)
  const [downloadedQrCodeId, setDownloadedQrCodeId] = useState(null)
  const [simulationState, setSimulationState] = useState({ id: null, loading: false, data: null })
  const [codeToDelete, setCodeToDelete] = useState(null)
  const [codeDeleteError, setCodeDeleteError] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const planFormRef = useRef(null)
  const codeFormRef = useRef(null)
  const copyFeedbackTimeoutRef = useRef(null)

  useEffect(() => {
    onRefresh?.()
  }, [onRefresh])

  // Los canjes llegan desde los checkouts de atletas, no desde este panel. La
  // API relee el contador canónico periódicamente para que el operador vea
  // cómo se descuentan los cupos sin tener que recargar la pantalla.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') onRefresh?.()
    }
    const timerId = window.setInterval(refresh, PRICING_LIVE_SYNC_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [onRefresh])

  useEffect(() => {
    onRefreshSubscriptions?.()
  }, [onRefreshSubscriptions])

  useEffect(
    () => () => {
      window.clearTimeout(copyFeedbackTimeoutRef.current)
    },
    [],
  )

  async function copyDiscountCode(code) {
    try {
      await copyText(code.code)
      setCopiedCodeId(code.id)
      window.clearTimeout(copyFeedbackTimeoutRef.current)
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setCopiedCodeId(null)
      }, COPY_FEEDBACK_MS)
    } catch {
      setNotice(t('admin.sections.pricing.copyDiscountCodeError'))
    }
  }

  async function copyPromotionLink(code) {
    try {
      await copyText(buildPromotionCodeUrl(code.code))
      setCopiedLinkCodeId(code.id)
      window.clearTimeout(copyFeedbackTimeoutRef.current)
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setCopiedLinkCodeId(null)
      }, COPY_FEEDBACK_MS)
    } catch {
      setNotice(t('admin.sections.pricing.copyPromotionLinkError'))
    }
  }

  async function downloadPromotionQr(code) {
    try {
      const qr = await generateCredentialQr(buildPromotionCodeUrl(code.code))
      downloadDataUrl(qr, `${code.code}-canje.png`)
      setDownloadedQrCodeId(code.id)
      window.clearTimeout(copyFeedbackTimeoutRef.current)
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setDownloadedQrCodeId(null)
      }, COPY_FEEDBACK_MS)
    } catch {
      setNotice(t('admin.sections.pricing.downloadPromotionQrError'))
    }
  }

  async function simulatePromotion(code) {
    if (!onSimulatePromotionCode || simulationState.loading) return
    setSimulationState({ id: code.id, loading: true, data: null })
    try {
      const result = await onSimulatePromotionCode(code.id)
      setSimulationState({
        id: code.id,
        loading: false,
        data: result?.error
          ? { error: result.error }
          : (result?.simulation ?? { error: t('admin.sections.pricing.simulationEmpty') }),
      })
    } catch (error) {
      setSimulationState({
        id: code.id,
        loading: false,
        data: { error: error?.message ?? t('admin.sections.pricing.simulationError') },
      })
    }
  }

  const pricingWritesEnabled = isFeatureEnabled(FEATURE_KEYS.pricingWrites)
  const locked = !pricingWritesEnabled || configuration.availability?.editable === false || !canEdit
  const showProductionLock =
    !pricingWritesEnabled || configuration.availability?.reason === 'production_coming_soon'
  const now = useMemo(() => new Date(), [])
  const plans = useMemo(() => {
    const list = [...(configuration.plans ?? [])]
    const rank = (plan) => {
      const status = planStatus(plan, now)
      if (status === 'active') return 0
      if (status === 'scheduled') return 1
      return 2
    }
    return list.sort((left, right) => {
      const byStatus = rank(left) - rank(right)
      if (byStatus !== 0) return byStatus
      const byFamily = String(left.familyCode).localeCompare(String(right.familyCode))
      if (byFamily !== 0) return byFamily
      return (Number(right.version) || 0) - (Number(left.version) || 0)
    })
  }, [configuration.plans, now])
  const events = useMemo(() => configuration.events ?? [], [configuration.events])
  const discountCodes = useMemo(() => {
    const list = [...(configuration.discountCodes ?? [])]
    const rank = (code) => (getDiscountCodeAvailability(code, now).status === 'active' ? 0 : 1)
    return list.sort((left, right) => {
      const byStatus = rank(left) - rank(right)
      if (byStatus !== 0) return byStatus
      return new Date(right.createdAt ?? 0) - new Date(left.createdAt ?? 0)
    })
  }, [configuration.discountCodes, now])
  const oneTimePlans = useMemo(
    () =>
      plans.filter((plan) => {
        if (!plan.active || plan.collectionMode !== 'one_time') return false
        if (plan.effectiveFrom && new Date(plan.effectiveFrom) > now) return false
        return !plan.retiredAt || new Date(plan.retiredAt) > now
      }),
    [now, plans],
  )
  const selectedEvent =
    events.find((event) => event.slug === selectedEventSlug) ?? events[0] ?? null
  const selectedOfferEvent = codeDraft?.eventId
    ? (events.find((event) => event.id === codeDraft.eventId) ?? null)
    : null
  const selectedPlan = oneTimePlans.find((plan) => plan.id === comboDraft.membershipPlanId) ?? null
  const separatePrice =
    Number(selectedPlan?.price ?? 0) + Number(selectedEvent?.registrationPrice ?? 0)
  const comboPriceValue = Number(comboDraft.price)
  const comboSavings =
    Number.isInteger(comboPriceValue) && comboPriceValue > 0
      ? separatePrice - comboPriceValue
      : null
  const comboOverLimit = comboSavings != null && comboSavings < 0
  // Mismo tope que aplica staff_save_event_combo_offer del lado del servidor:
  // la suma de los precios manuales (o de catálogo si el plan/evento no tiene
  // uno propio) del plan y el evento.
  const separateManualPrice =
    Number(selectedPlan?.manualPrice ?? selectedPlan?.price ?? 0) +
    Number(selectedEvent?.registrationManualPrice ?? selectedEvent?.registrationPrice ?? 0)
  const comboManualPriceValue =
    comboDraft.manualPrice === '' ? null : Number(comboDraft.manualPrice)
  const comboManualOverLimit =
    comboManualPriceValue != null && comboManualPriceValue > separateManualPrice

  useEffect(() => {
    if (!selectedEventSlug && events[0]) setSelectedEventSlug(events[0].slug)
  }, [events, selectedEventSlug])

  useEffect(() => {
    if (!selectedEvent) return
    const offer = selectedEvent.comboOffer
    setComboDraft({
      membershipPlanId: offer?.membershipPlanId ?? oneTimePlans[0]?.id ?? '',
      price: offer?.price ?? '',
      manualPrice: offer?.manualPrice ?? '',
      startsAt: toLocalDateTime(offer?.startsAt),
      endsAt: toLocalDateTime(offer?.endsAt),
      active: offer?.active === true,
      audience: COMBO_VISIBILITY_STATES.includes(offer?.audience) ? offer.audience : 'public',
      accessCode: offer?.accessCode ?? '',
    })
    setComboError('')
  }, [oneTimePlans, selectedEvent])

  // Dependemos de si el formulario está abierto, no del draft entero: el
  // draft cambia en cada tecla y antes reenfocaba el primer campo en cada
  // keystroke, sacando el cursor de donde el operador estaba escribiendo.
  const planFormOpen = Boolean(planDraft)
  useEffect(() => {
    if (!planFormOpen) return undefined
    const form = planFormRef.current
    if (typeof form?.scrollIntoView === 'function') {
      form.scrollIntoView({ block: 'nearest' })
    }
    const firstField = form?.querySelector(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    )
    firstField?.focus?.()
    return undefined
  }, [planFormOpen])

  const codeFormOpen = Boolean(codeDraft)
  // La exclusividad se lee del contador en vivo: el operador tiene que ver
  // cuántas direcciones quedaron cargadas antes de guardar, no después.
  const draftInviteeCount = codeDraft ? parseInvitees(codeDraft.inviteesText).length : 0
  useEffect(() => {
    if (!codeFormOpen) return undefined
    const form = codeFormRef.current
    if (typeof form?.scrollIntoView === 'function') {
      form.scrollIntoView({ block: 'nearest' })
    }
    const firstField = form?.querySelector('input:not([disabled]), select:not([disabled])')
    firstField?.focus?.()
    return undefined
  }, [codeFormOpen])

  function openPlanForm(source = null) {
    setNotice('')
    setPlanError('')
    setPlanDraft(
      source
        ? {
            sourcePlanId: source.id,
            familyCode: source.familyCode,
            name: source.name,
            description: source.description,
            price: source.price,
            manualPrice: source.manualPrice ?? '',
            currency: 'ARS',
            billingFrequency: source.billingFrequency,
            collectionMode: source.collectionMode,
            intervalCount: source.intervalCount,
            graceDays: source.graceDays,
            effectiveFrom: '',
            retiresAt: '',
          }
        : { ...EMPTY_PLAN },
    )
  }

  async function submitPlan(event) {
    event.preventDefault()
    setPlanError('')
    const price = Number(planDraft.price)
    const manualPrice = planDraft.manualPrice === '' ? undefined : Number(planDraft.manualPrice)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(planDraft.familyCode)) {
      setPlanError(t('admin.sections.pricing.familyCodeHint'))
      return
    }
    if (planDraft.name.trim().length < 3 || !Number.isInteger(price) || price <= 0) {
      setPlanError(t('admin.sections.pricing.loadError'))
      return
    }
    if (manualPrice !== undefined && (!Number.isInteger(manualPrice) || manualPrice <= 0)) {
      setPlanError(t('admin.sections.pricing.loadError'))
      return
    }

    setPendingAction('plan')
    const result = await onCreatePlanVersion?.({ ...planDraft, price, manualPrice })
    setPendingAction('')
    if (result?.error) {
      setPlanError(result.error)
      return
    }
    setPlanDraft(null)
    setNotice(t('admin.sections.pricing.saved'))
  }

  async function togglePlan(plan) {
    setPendingAction(plan.id)
    setNotice('')
    const result = await onSetPlanActive?.(plan.id, !plan.active)
    setPendingAction('')
    if (result?.error) setPlanError(result.error)
    else setNotice(t('admin.sections.pricing.saved'))
  }

  function openRetirementEditor(plan) {
    setNotice('')
    setPlanError('')
    setRetirementPlanId(plan.id)
    setRetirementDraft(toLocalDateTime(plan.retiredAt))
  }

  async function submitRetirement(event, plan) {
    event.preventDefault()
    setPendingAction(`retire-${plan.id}`)
    const result = await onSetPlanRetirement?.(plan.id, retirementDraft || null)
    setPendingAction('')
    if (result?.error) {
      setPlanError(result.error)
      return
    }
    setRetirementPlanId(null)
    setNotice(t('admin.sections.pricing.saved'))
  }

  function openCodeForm(source = null) {
    setNotice('')
    setCodeError('')
    setCodeDraft(
      source
        ? {
            id: source.id,
            code: source.code,
            description: source.description,
            kind: source.kind ?? 'percent',
            audience: source.audience === 'public' ? 'public' : 'code',
            percentOff: source.kind === 'percent' ? source.percentOff : '',
            fixedPrice: source.fixedPrice ?? '',
            fixedPriceManual: source.fixedPriceManual ?? '',
            appliesTo: source.appliesTo,
            eventId: source.eventId ?? '',
            maxRedemptions: source.maxRedemptions ?? '',
            startsAt: toLocalDateTime(source.startsAt),
            expiresAt: toLocalDateTime(source.expiresAt),
            active: source.active,
            manualChannels: source.manualChannels ?? [],
            inviteesText: (source.invitees ?? []).join('\n'),
          }
        : { ...EMPTY_DISCOUNT_CODE },
    )
  }

  async function submitCode(event) {
    event.preventDefault()
    setCodeError('')
    const isOffer = codeDraft.kind === 'offer'
    // 'offer' comparte con 'fixed_price' todo lo económico: importe obligatorio,
    // precio manual opcional y alcance único.
    const isFixedPrice = codeDraft.kind === 'fixed_price' || isOffer
    const isAccess = codeDraft.kind === 'access'
    const percentOff = Number(codeDraft.percentOff)
    const fixedPrice = Number(codeDraft.fixedPrice)
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(codeDraft.code.toUpperCase())) {
      setCodeError(t('admin.sections.pricing.codeFormatHint'))
      return
    }
    if (
      !isFixedPrice &&
      !isAccess &&
      (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99)
    ) {
      setCodeError(t('admin.sections.pricing.percentOffInvalid'))
      return
    }
    if (isFixedPrice && (!Number.isInteger(fixedPrice) || fixedPrice < 1)) {
      setCodeError(t('admin.sections.pricing.fixedPriceInvalid'))
      return
    }
    // A propósito sin comparar contra `fixedPrice`: el precio del canal manual
    // puede ser igual, menor o mayor. Sólo se valida que sea un importe real.
    const fixedPriceManual =
      codeDraft.fixedPriceManual === '' || codeDraft.fixedPriceManual == null
        ? undefined
        : Number(codeDraft.fixedPriceManual)
    if (
      isFixedPrice &&
      fixedPriceManual !== undefined &&
      (!Number.isInteger(fixedPriceManual) || fixedPriceManual < 1)
    ) {
      setCodeError(t('admin.sections.pricing.fixedPriceManualInvalid'))
      return
    }
    if (
      codeDraft.startsAt &&
      codeDraft.expiresAt &&
      new Date(codeDraft.expiresAt) <= new Date(codeDraft.startsAt)
    ) {
      setCodeError(t('admin.sections.pricing.promoWindowInvalid'))
      return
    }
    const invitees = parseInvitees(codeDraft.inviteesText)
    const invalidEmail = invitees.find((email) => !EMAIL_PATTERN.test(email))
    if (invalidEmail) {
      setCodeError(t('admin.sections.pricing.inviteesInvalid', { email: invalidEmail }))
      return
    }
    if (invitees.length > 500) {
      setCodeError(t('admin.sections.pricing.inviteesTooMany'))
      return
    }
    // El servidor lo rechaza igual; adelantarlo acá evita el viaje y explica
    // el porqué en el mismo formulario.
    if (isFixedPrice && codeDraft.appliesTo === 'both') {
      setCodeError(t('admin.sections.pricing.fixedPriceScopeInvalid'))
      return
    }
    if (codeDraft.audience === 'public' && (codeDraft.manualChannels ?? []).length > 0) {
      setCodeError(t('admin.sections.pricing.publicPromoChannelsInvalid'))
      return
    }
    if (isOffer) {
      if (!codeDraft.eventId) {
        setCodeError(t('admin.sections.pricing.offerEventRequired'))
        return
      }
      const offerEvent = configuration.events?.find((item) => item.id === codeDraft.eventId)
      // Sin combo cargado no hay qué ofertar: el combo define qué plan de
      // afiliación se empaqueta y contra qué precio se compara la oferta.
      if (!offerEvent?.comboOffer) {
        setCodeError(t('admin.sections.pricing.offerComboMissing'))
        return
      }
      if (!offerEvent.comboOffer.active || offerEvent.comboOffer.audience !== 'code') {
        setCodeError(t('admin.sections.pricing.offerComboVisibilityRequired'))
        return
      }
      if (fixedPrice >= Number(offerEvent.comboOffer.price)) {
        setCodeError(
          t('admin.sections.pricing.offerPriceTooHigh', {
            price: money(offerEvent.comboOffer.price, locale),
          }),
        )
        return
      }
    }

    setPendingAction('code')
    const result = await onUpsertDiscountCode?.({
      ...codeDraft,
      code: codeDraft.code.toUpperCase(),
      percentOff: isFixedPrice || isAccess ? undefined : percentOff,
      fixedPrice: isFixedPrice ? fixedPrice : undefined,
      fixedPriceManual: isFixedPrice ? fixedPriceManual : undefined,
      // Sólo una inscripción o un combo pueden limitarse a un evento; el resto
      // manda el campo vacío para que el servidor lo descarte.
      eventId:
        codeDraft.eventId && ['registration', 'combo'].includes(codeDraft.appliesTo)
          ? codeDraft.eventId
          : undefined,
      maxRedemptions:
        codeDraft.maxRedemptions === '' ? undefined : Number(codeDraft.maxRedemptions),
      invitees,
    })
    setPendingAction('')
    if (result?.error) {
      setCodeError(result.error)
      return
    }
    setCodeDraft(null)
    setNotice(t('admin.sections.pricing.saved'))
  }

  async function changeCodeState(code, state) {
    if (state === getDiscountCodeAvailability(code, now).state) return
    setPendingAction(code.id)
    setNotice('')
    setCodeStateError({ id: null, message: '' })
    const result = await onSetDiscountCodeState?.(code.id, state)
    setPendingAction('')
    if (result?.error) {
      setCodeStateError({ id: code.id, message: result.error })
      return
    }
    setNotice(t('admin.sections.pricing.saved'))
  }

  async function confirmDeleteCode() {
    if (!codeToDelete) return
    setPendingAction(`delete-code:${codeToDelete.id}`)
    setCodeDeleteError('')
    setNotice('')
    const result = await onDeleteDiscountCode?.(codeToDelete.id)
    setPendingAction('')
    if (result?.error) {
      setCodeDeleteError(result.error)
      return
    }
    setCodeDraft((current) => (current?.id === codeToDelete.id ? null : current))
    setCodeToDelete(null)
    // Con canjes la promo no se borra: se archiva. Decir "eliminada" a secas
    // escondería que la fila sigue respaldando órdenes ya cobradas.
    setNotice(
      t(
        result?.archived
          ? 'admin.sections.pricing.codeArchived'
          : 'admin.sections.pricing.codeDeleted',
      ),
    )
  }

  async function confirmCancelSubscription() {
    if (!cancelTarget) return
    setPendingAction(`cancel-${cancelTarget.id}`)
    setCancelError('')
    const result = await onCancelSubscription?.(cancelTarget.id)
    setPendingAction('')
    if (result?.error) {
      setCancelError(result.error)
      return
    }
    setCancelTarget(null)
  }

  async function confirmDeletePlan() {
    if (!planToDelete) return
    setPendingAction(`delete:${planToDelete.id}`)
    setDeleteError('')
    setNotice('')
    const result = await onDeletePlan?.(planToDelete.id)
    setPendingAction('')
    if (result?.error) {
      setDeleteError(result.error)
      return
    }
    setPlanDraft((current) => (current?.sourcePlanId === planToDelete.id ? null : current))
    setPlanToDelete(null)
    setNotice(t('admin.sections.pricing.deleted'))
  }

  async function submitCombo(event) {
    event.preventDefault()
    setComboError('')
    setNotice('')
    const price = Number(comboDraft.price)
    const manualPrice = comboDraft.manualPrice === '' ? undefined : Number(comboDraft.manualPrice)
    const separatePrice =
      Number(selectedPlan?.price ?? 0) + Number(selectedEvent?.registrationPrice ?? 0)
    if (!selectedEvent || !selectedPlan || !Number.isInteger(price) || price <= 0) {
      setComboError(t('admin.sections.pricing.loadError'))
      return
    }
    if (price > separatePrice) {
      setComboError(t('admin.eventEditor.validation.comboTooHigh'))
      return
    }
    if (manualPrice !== undefined && (!Number.isInteger(manualPrice) || manualPrice <= 0)) {
      setComboError(t('admin.sections.pricing.loadError'))
      return
    }
    if (manualPrice !== undefined && manualPrice > separateManualPrice) {
      setComboError(t('admin.eventEditor.validation.comboTooHigh'))
      return
    }
    if (comboDraft.startsAt && comboDraft.endsAt && comboDraft.endsAt < comboDraft.startsAt) {
      setComboError(t('admin.eventEditor.validation.registrationWindowInvalid'))
      return
    }
    // Un combo restringido sin código no lo puede comprar nadie. El servidor lo
    // rechaza igual; adelantarlo evita el viaje y lo explica en el formulario.
    if (
      comboDraft.audience === 'code' &&
      !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(comboDraft.accessCode.trim().toUpperCase())
    ) {
      setComboError(t('admin.sections.pricing.comboAccessCodeInvalid'))
      return
    }

    setPendingAction('combo')
    const result = await onSaveComboOffer?.(selectedEvent.slug, {
      ...comboDraft,
      price,
      manualPrice,
    })
    setPendingAction('')
    if (result?.error) setComboError(result.error)
    else {
      setNotice(t('admin.sections.pricing.saved'))
      setComboEditorOpen(false)
    }
  }

  async function confirmDeleteCombo() {
    if (!comboToDelete) return
    setPendingAction('delete-combo')
    setComboError('')
    setNotice('')
    const result = await onDeleteComboOffer?.(comboToDelete.slug)
    setPendingAction('')
    if (result?.error) {
      setComboError(result.error)
      setComboToDelete(null)
      return
    }
    setComboToDelete(null)
    setComboEditorOpen(false)
    setNotice(t('admin.sections.pricing.comboDeleted'))
  }

  return (
    <section className="admin-pricing" aria-labelledby="admin-pricing-title">
      <header className="admin-pricing__hero">
        <div className="admin-pricing__hero-copy">
          <p className="admin-pricing__eyebrow">
            <BadgeDollarSign size={14} aria-hidden />
            {t('admin.sections.pricing.eyebrow')}
          </p>
          <h1 id="admin-pricing-title">{t('admin.sections.pricing.title')}</h1>
          <p className="admin-pricing__subtitle">{t('admin.sections.pricing.subtitle')}</p>
        </div>
        <button
          type="button"
          className="admin-pricing__btn admin-pricing__btn--ghost admin-pricing__refresh"
          aria-label={t('admin.sections.pricing.retry')}
          title={t('admin.sections.pricing.retry')}
          onClick={() => onRefresh?.()}
          disabled={isLoading}
        >
          <RefreshCw size={15} aria-hidden />
          <span className="admin-pricing__btn-label">{t('admin.sections.pricing.retry')}</span>
        </button>
      </header>

      {showProductionLock ? (
        <FeatureComingSoon
          className="admin-pricing__locked"
          lead={t('admin.sections.pricing.comingSoonLead')}
          title={t('admin.sections.pricing.comingSoonTitle')}
          variant="banner"
        />
      ) : null}

      {error ? (
        <div className="admin-pricing__message admin-pricing__message--error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="admin-pricing__message" role="status">
          {notice}
        </div>
      ) : null}
      {isLoading && plans.length === 0 ? (
        <p className="admin-pricing__loading">{t('admin.sections.pricing.loading')}</p>
      ) : null}

      <section className="admin-pricing__block" aria-labelledby="pricing-plans-title">
        <header className="admin-pricing__block-head">
          <div>
            <h2 id="pricing-plans-title">{t('admin.sections.pricing.plansTitle')}</h2>
            <p>{t('admin.sections.pricing.plansLead')}</p>
          </div>
          <button
            type="button"
            className="admin-pricing__btn admin-pricing__btn--primary"
            onClick={() => openPlanForm()}
            disabled={locked}
          >
            <CirclePlus size={15} aria-hidden />
            <span className="admin-pricing__btn-label">{t('admin.sections.pricing.newPlan')}</span>
          </button>
        </header>

        <div
          className="admin-pricing__plan-list"
          role="list"
          aria-label={t('admin.sections.pricing.plansTitle')}
        >
          {plans.map((plan) => {
            const status = planStatus(plan, now)
            const effectiveLabel = plan.effectiveFrom
              ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(plan.effectiveFrom),
                )
              : '—'

            return (
              <article
                className={`admin-pricing__plan-row admin-pricing__plan-row--${status}`}
                key={plan.id}
                role="listitem"
              >
                <div className="admin-pricing__plan-main">
                  <div className="admin-pricing__plan-title-row">
                    <span
                      className={`admin-pricing__status-dot admin-pricing__status-dot--${status}`}
                      aria-hidden
                    />
                    <h3>{plan.name}</h3>
                    <span className={`admin-pricing__status admin-pricing__status--${status}`}>
                      {t(`admin.sections.pricing.${status}`)}
                    </span>
                  </div>
                  <p className="admin-pricing__plan-meta">
                    <span>
                      <code>{plan.familyCode}</code>
                    </span>
                    <span>
                      {t('admin.sections.pricing.currentVersion', { version: plan.version })}
                    </span>
                    <span>{t(`admin.sections.pricing.${plan.billingFrequency}`)}</span>
                    <span>
                      {t(
                        `admin.sections.pricing.${plan.collectionMode === 'recurring' ? 'recurring' : 'oneTime'}`,
                      )}
                    </span>
                    <span className="admin-pricing__plan-meta-date">
                      <CalendarClock size={12} aria-hidden />
                      {effectiveLabel}
                    </span>
                  </p>
                </div>

                <strong className="admin-pricing__plan-amount">{money(plan.price, locale)}</strong>

                <div className="admin-pricing__plan-actions">
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet"
                    onClick={() => openRetirementEditor(plan)}
                    disabled={locked}
                  >
                    <CalendarOff size={14} aria-hidden />
                    {plan.retiredAt
                      ? t('admin.sections.pricing.retiresOn', {
                          date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                            new Date(plan.retiredAt),
                          ),
                        })
                      : t('admin.sections.pricing.scheduleRetirement')}
                  </button>
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet"
                    onClick={() => openPlanForm(plan)}
                    disabled={locked || pendingAction === `delete:${plan.id}`}
                  >
                    <Pencil size={14} aria-hidden />
                    {t('admin.sections.pricing.newVersion')}
                  </button>
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet is-danger"
                    onClick={() => {
                      setPlanToDelete(plan)
                      setDeleteError('')
                      setNotice('')
                    }}
                    disabled={locked || pendingAction === plan.id}
                    aria-label={t('admin.sections.pricing.deletePlanAria', { name: plan.name })}
                  >
                    <Trash2 size={14} aria-hidden />
                    {t('admin.sections.pricing.deletePlan')}
                  </button>
                  <label
                    className={`admin-pricing__switch${plan.active ? ' is-active' : ' is-cancelled'}`.trim()}
                    aria-label={t(`admin.sections.pricing.${plan.active ? 'active' : 'inactive'}`)}
                  >
                    <input
                      type="checkbox"
                      checked={plan.active}
                      onChange={() => togglePlan(plan)}
                      disabled={locked || pendingAction === plan.id}
                    />
                    <span aria-hidden />
                    <strong>
                      {t(
                        `admin.sections.pricing.${plan.active ? 'activeSwitch' : 'cancelledSwitch'}`,
                      )}
                    </strong>
                  </label>
                </div>

                {retirementPlanId === plan.id ? (
                  <form
                    className="admin-pricing__retirement-form"
                    onSubmit={(event) => submitRetirement(event, plan)}
                    noValidate
                  >
                    <label>
                      <span>{t('admin.sections.pricing.retiresAt')}</span>
                      <input
                        type="datetime-local"
                        value={retirementDraft}
                        onChange={(event) => setRetirementDraft(event.target.value)}
                        disabled={locked || pendingAction === `retire-${plan.id}`}
                      />
                    </label>
                    <div className="admin-pricing__retirement-actions">
                      <button
                        type="button"
                        className="admin-pricing__btn admin-pricing__btn--ghost"
                        onClick={() => setRetirementPlanId(null)}
                      >
                        {t('admin.sections.pricing.cancel')}
                      </button>
                      <button
                        type="submit"
                        className="admin-pricing__btn admin-pricing__btn--primary"
                        disabled={locked || pendingAction === `retire-${plan.id}`}
                      >
                        {t('admin.sections.pricing.save')}
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            )
          })}
          {!isLoading && plans.length === 0 ? (
            <p className="admin-pricing__empty">{t('admin.sections.pricing.plansEmpty')}</p>
          ) : null}
        </div>

        {planDraft ? (
          <form ref={planFormRef} className="admin-pricing__form" onSubmit={submitPlan} noValidate>
            <header>
              <h3>
                {planDraft.sourcePlanId
                  ? t('admin.sections.pricing.formTitleVersion', { name: planDraft.name })
                  : t('admin.sections.pricing.formTitleNew')}
              </h3>
            </header>
            <fieldset disabled={locked || pendingAction === 'plan'}>
              <label>
                <span>{t('admin.sections.pricing.familyCode')}</span>
                <input
                  name="familyCode"
                  value={planDraft.familyCode}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, familyCode: event.target.value.toLowerCase() })
                  }
                  disabled={Boolean(planDraft.sourcePlanId)}
                  required
                />
                <small>{t('admin.sections.pricing.familyCodeHint')}</small>
              </label>
              <label>
                <span>{t('admin.sections.pricing.name')}</span>
                <input
                  name="name"
                  value={planDraft.name}
                  onChange={(event) => setPlanDraft({ ...planDraft, name: event.target.value })}
                  required
                />
              </label>
              <label className="admin-pricing__wide">
                <span>{t('admin.sections.pricing.description')}</span>
                <textarea
                  value={planDraft.description}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, description: event.target.value })
                  }
                  rows={3}
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.price')}</span>
                <input
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  value={planDraft.price}
                  onChange={(event) => setPlanDraft({ ...planDraft, price: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.manualPrice')}</span>
                <input
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  placeholder={t('admin.sections.pricing.manualPricePlaceholder')}
                  value={planDraft.manualPrice}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, manualPrice: event.target.value })
                  }
                />
                <small>{t('admin.sections.pricing.manualPriceHint')}</small>
              </label>
              <label>
                <span>{t('admin.sections.pricing.currency')}</span>
                <input value="ARS" disabled />
              </label>
              <label>
                <span>{t('admin.sections.pricing.billingFrequency')}</span>
                <select
                  value={planDraft.billingFrequency}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, billingFrequency: event.target.value })
                  }
                >
                  <option value="annual">{t('admin.sections.pricing.annual')}</option>
                  <option value="monthly">{t('admin.sections.pricing.monthly')}</option>
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.collectionMode')}</span>
                <select
                  value={planDraft.collectionMode}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, collectionMode: event.target.value })
                  }
                >
                  <option value="one_time">{t('admin.sections.pricing.oneTime')}</option>
                  <option value="recurring">{t('admin.sections.pricing.recurring')}</option>
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.intervalCount')}</span>
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="1"
                  value={planDraft.intervalCount}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, intervalCount: event.target.value })
                  }
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.graceDays')}</span>
                <input
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  value={planDraft.graceDays}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, graceDays: event.target.value })
                  }
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.effectiveFrom')}</span>
                <input
                  type="datetime-local"
                  value={planDraft.effectiveFrom}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, effectiveFrom: event.target.value })
                  }
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.retiresAt')}</span>
                <input
                  type="datetime-local"
                  value={planDraft.retiresAt}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, retiresAt: event.target.value })
                  }
                />
                <small>{t('admin.sections.pricing.retiresAtHint')}</small>
              </label>
            </fieldset>
            {planError ? (
              <p className="admin-pricing__form-error" role="alert">
                {planError}
              </p>
            ) : null}
            <div className="admin-pricing__form-actions">
              <button
                type="button"
                className="admin-pricing__btn admin-pricing__btn--ghost"
                onClick={() => setPlanDraft(null)}
              >
                {t('admin.sections.pricing.cancel')}
              </button>
              <button
                type="submit"
                className="admin-pricing__btn admin-pricing__btn--primary"
                disabled={locked || pendingAction === 'plan'}
              >
                <Save size={15} aria-hidden />
                {pendingAction === 'plan'
                  ? t('admin.sections.pricing.saving')
                  : t('admin.sections.pricing.publish')}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {planToDelete ? (
        <AdminDeleteConfirmDialog
          busy={pendingAction === `delete:${planToDelete.id}`}
          error={deleteError}
          title={t('admin.sections.pricing.deleteConfirmTitle', { name: planToDelete.name })}
          description={t('admin.sections.pricing.deleteConfirmDescription', {
            code: planToDelete.code ?? planToDelete.familyCode,
          })}
          warning={t('admin.sections.pricing.deleteConfirmWarning')}
          cancelLabel={t('admin.sections.pricing.deleteConfirmCancel')}
          confirmLabel={t('admin.sections.pricing.deleteConfirmConfirm')}
          busyLabel={t('admin.sections.pricing.deleting')}
          onCancel={() => {
            if (pendingAction === `delete:${planToDelete.id}`) return
            setPlanToDelete(null)
            setDeleteError('')
          }}
          onConfirm={confirmDeletePlan}
        />
      ) : null}

      <section
        className="admin-pricing__block admin-pricing__block--combo"
        aria-labelledby="pricing-combo-title"
      >
        <header className="admin-pricing__block-head">
          <div>
            <h2 id="pricing-combo-title">{t('admin.sections.pricing.comboTitle')}</h2>
            <p>{t('admin.sections.pricing.comboLead')}</p>
          </div>
          {selectedEvent ? (
            <div className="admin-pricing__combo-head-actions">
              <span
                className={`admin-pricing__offer-pill${comboDraft.active ? ' is-on' : ''}`.trim()}
              >
                {comboDraft.active
                  ? t('admin.sections.pricing.comboOfferStatus', {
                      visibility: t(
                        `admin.sections.pricing.comboVisibilityShort.${comboDraft.audience}`,
                      ),
                    })
                  : t('admin.sections.pricing.comboOfferOff')}
              </span>
              <button
                type="button"
                className="admin-pricing__btn admin-pricing__btn--quiet admin-pricing__combo-disclosure"
                aria-expanded={comboEditorOpen}
                aria-controls="pricing-combo-editor"
                onClick={() => setComboEditorOpen((open) => !open)}
              >
                {comboEditorOpen ? <X size={14} aria-hidden /> : <Pencil size={14} aria-hidden />}
                {comboEditorOpen
                  ? t('admin.sections.pricing.closeComboEditor')
                  : t('admin.sections.pricing.editCombo')}
                <ChevronDown
                  className="admin-pricing__combo-disclosure-chevron"
                  size={14}
                  aria-hidden
                />
              </button>
            </div>
          ) : null}
        </header>

        {events.length === 0 ? (
          <p className="admin-pricing__empty">{t('admin.sections.pricing.noEvents')}</p>
        ) : (
          <>
            {!comboEditorOpen ? (
              <dl className="admin-pricing__combo-summary">
                <div>
                  <dt>{t('admin.sections.pricing.event')}</dt>
                  <dd>{selectedEvent?.title ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('admin.sections.pricing.membershipPlan')}</dt>
                  <dd>{selectedPlan?.name ?? t('admin.sections.pricing.comboNotConfigured')}</dd>
                </div>
                <div className="admin-pricing__combo-summary-price">
                  <dt>{t('admin.sections.pricing.comboPrice')}</dt>
                  <dd>
                    {comboPriceValue > 0
                      ? money(comboPriceValue, locale)
                      : t('admin.sections.pricing.comboNotConfigured')}
                  </dd>
                </div>
                <div>
                  <dt>{t('admin.sections.pricing.comboSavings')}</dt>
                  <dd>
                    {comboSavings != null && comboSavings >= 0 ? money(comboSavings, locale) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>{t('admin.sections.pricing.comboVisibilityLabel')}</dt>
                  <dd>
                    {t(`admin.sections.pricing.comboVisibility.${comboDraft.audience}.title`)}
                  </dd>
                </div>
              </dl>
            ) : null}

            {comboEditorOpen ? (
              <form
                id="pricing-combo-editor"
                className="admin-pricing__form admin-pricing__form--combo"
                onSubmit={submitCombo}
                noValidate
              >
                <div className="admin-pricing__combo-toolbar">
                  <label className="admin-pricing__combo-event">
                    <span>{t('admin.sections.pricing.event')}</span>
                    <select
                      value={selectedEvent?.slug ?? ''}
                      onChange={(event) => setSelectedEventSlug(event.target.value)}
                      disabled={locked || pendingAction === 'combo'}
                    >
                      {events.map((item) => (
                        <option key={item.id} value={item.slug}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-pricing__combo-plan">
                    <span>{t('admin.sections.pricing.membershipPlan')}</span>
                    <select
                      value={comboDraft.membershipPlanId}
                      onChange={(event) =>
                        setComboDraft({ ...comboDraft, membershipPlanId: event.target.value })
                      }
                      disabled={locked || pendingAction === 'combo' || oneTimePlans.length === 0}
                      required
                    >
                      {oneTimePlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} · {money(plan.price, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedPlan && selectedEvent ? (
                  <div
                    className={`admin-pricing__combo-board${comboOverLimit ? ' is-invalid' : ''}`.trim()}
                    aria-live="polite"
                  >
                    <div className="admin-pricing__combo-stack">
                      <div className="admin-pricing__combo-line">
                        <span>{t('admin.sections.pricing.membershipAmount')}</span>
                        <strong>{money(selectedPlan.price, locale)}</strong>
                      </div>
                      <div className="admin-pricing__combo-op" aria-hidden>
                        {t('admin.sections.pricing.comboPlus')}
                      </div>
                      <div className="admin-pricing__combo-line">
                        <span>{t('admin.sections.pricing.registrationPrice')}</span>
                        <strong>{money(selectedEvent.registrationPrice ?? 0, locale)}</strong>
                      </div>
                      <div className="admin-pricing__combo-op" aria-hidden>
                        {t('admin.sections.pricing.comboEquals')}
                      </div>
                      <div className="admin-pricing__combo-line admin-pricing__combo-line--total">
                        <span>{t('admin.sections.pricing.separateTotal')}</span>
                        <strong>{money(separatePrice, locale)}</strong>
                      </div>
                    </div>

                    <div className="admin-pricing__combo-decision">
                      <label>
                        <span>{t('admin.sections.pricing.comboPrice')}</span>
                        <input
                          type="number"
                          min="1"
                          max="10000000"
                          step="1"
                          value={comboDraft.price}
                          onChange={(event) =>
                            setComboDraft({ ...comboDraft, price: event.target.value })
                          }
                          disabled={
                            locked || pendingAction === 'combo' || oneTimePlans.length === 0
                          }
                          required
                        />
                      </label>
                      <p className="admin-pricing__combo-max">
                        {t('admin.sections.pricing.comboMax', {
                          amount: money(separatePrice, locale),
                        })}
                      </p>
                      {comboSavings != null ? (
                        <p
                          className={`admin-pricing__combo-delta${comboOverLimit ? ' is-invalid' : ''}`.trim()}
                        >
                          {comboOverLimit
                            ? t('admin.sections.pricing.comboOverLimit')
                            : t('admin.sections.pricing.comboSavings')}
                          {': '}
                          <strong>{money(Math.abs(comboSavings), locale)}</strong>
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <label>
                  <span>{t('admin.sections.pricing.manualPrice')}</span>
                  <input
                    type="number"
                    min="1"
                    max="10000000"
                    step="1"
                    placeholder={t('admin.sections.pricing.manualPricePlaceholder')}
                    value={comboDraft.manualPrice}
                    onChange={(event) =>
                      setComboDraft({ ...comboDraft, manualPrice: event.target.value })
                    }
                    disabled={locked || pendingAction === 'combo' || oneTimePlans.length === 0}
                  />
                  <small>
                    {comboManualOverLimit
                      ? t('admin.sections.pricing.comboOverLimit')
                      : t('admin.sections.pricing.comboMax', {
                          amount: money(separateManualPrice, locale),
                        })}
                  </small>
                </label>

                <fieldset
                  className="admin-pricing__combo-window"
                  disabled={locked || pendingAction === 'combo' || oneTimePlans.length === 0}
                >
                  <label>
                    <span>{t('admin.sections.pricing.comboStarts')}</span>
                    <input
                      type="datetime-local"
                      value={comboDraft.startsAt}
                      onChange={(event) =>
                        setComboDraft({ ...comboDraft, startsAt: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('admin.sections.pricing.comboEnds')}</span>
                    <input
                      type="datetime-local"
                      value={comboDraft.endsAt}
                      onChange={(event) =>
                        setComboDraft({ ...comboDraft, endsAt: event.target.value })
                      }
                    />
                  </label>
                  <label className="admin-pricing__toggle">
                    <input
                      type="checkbox"
                      checked={comboDraft.active}
                      onChange={(event) =>
                        setComboDraft({ ...comboDraft, active: event.target.checked })
                      }
                    />
                    <span>{t('admin.sections.pricing.comboActive')}</span>
                  </label>
                  <fieldset className="admin-pricing__combo-visibility">
                    <legend>{t('admin.sections.pricing.comboVisibilityLabel')}</legend>
                    <div className="admin-pricing__combo-visibility-options">
                      {COMBO_VISIBILITY_STATES.map((visibility) => (
                        <label
                          className={comboDraft.audience === visibility ? 'is-selected' : ''}
                          key={visibility}
                        >
                          <input
                            type="radio"
                            name="combo-visibility"
                            value={visibility}
                            checked={comboDraft.audience === visibility}
                            onChange={() =>
                              setComboDraft({
                                ...comboDraft,
                                audience: visibility,
                                accessCode: visibility === 'code' ? comboDraft.accessCode : '',
                              })
                            }
                          />
                          <span>
                            <strong>
                              {t(`admin.sections.pricing.comboVisibility.${visibility}.title`)}
                            </strong>
                            <small>
                              {t(
                                `admin.sections.pricing.comboVisibility.${visibility}.description`,
                              )}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {comboDraft.audience === 'private' ? (
                      <p className="admin-pricing__combo-private-note" role="status">
                        {t('admin.sections.pricing.comboPrivateNote')}
                      </p>
                    ) : null}
                  </fieldset>
                  {comboDraft.audience === 'code' ? (
                    <label>
                      <span>{t('admin.sections.pricing.comboAccessCode')}</span>
                      <input
                        value={comboDraft.accessCode}
                        onChange={(event) =>
                          setComboDraft({
                            ...comboDraft,
                            accessCode: event.target.value.toUpperCase(),
                          })
                        }
                        placeholder={t('admin.sections.pricing.comboAccessCodePlaceholder')}
                        required
                      />
                      <small>{t('admin.sections.pricing.comboAccessCodeHint')}</small>
                    </label>
                  ) : null}
                </fieldset>

                {oneTimePlans.length === 0 ? (
                  <p className="admin-pricing__form-error">
                    {t('admin.sections.pricing.noOneTimePlans')}
                  </p>
                ) : null}
                {comboError ? (
                  <p className="admin-pricing__form-error" role="alert">
                    {comboError}
                  </p>
                ) : null}

                <div className="admin-pricing__form-actions">
                  {selectedEvent?.comboOffer ? (
                    <button
                      type="button"
                      className="admin-pricing__btn admin-pricing__btn--quiet is-danger"
                      onClick={() => {
                        setComboError('')
                        setNotice('')
                        setComboToDelete(selectedEvent)
                      }}
                      disabled={locked || pendingAction === 'delete-combo'}
                    >
                      <Trash2 size={14} aria-hidden />
                      {t('admin.sections.pricing.deleteCombo')}
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="admin-pricing__btn admin-pricing__btn--primary"
                    disabled={
                      locked ||
                      pendingAction === 'combo' ||
                      oneTimePlans.length === 0 ||
                      comboOverLimit ||
                      comboManualOverLimit
                    }
                  >
                    <Save size={15} aria-hidden />
                    {pendingAction === 'combo'
                      ? t('admin.sections.pricing.saving')
                      : t('admin.sections.pricing.saveCombo')}
                  </button>
                </div>
              </form>
            ) : null}
          </>
        )}
      </section>

      <section className="admin-pricing__block" aria-labelledby="pricing-codes-title">
        <header className="admin-pricing__block-head">
          <div>
            <h2 id="pricing-codes-title">{t('admin.sections.pricing.discountCodesTitle')}</h2>
            <p>{t('admin.sections.pricing.discountCodesLead')}</p>
          </div>
          <button
            type="button"
            className="admin-pricing__btn admin-pricing__btn--primary"
            onClick={() => openCodeForm()}
            disabled={locked}
          >
            <CirclePlus size={15} aria-hidden />
            <span className="admin-pricing__btn-label">
              {t('admin.sections.pricing.newDiscountCode')}
            </span>
          </button>
        </header>

        <div
          className="admin-pricing__plan-list"
          role="list"
          aria-label={t('admin.sections.pricing.discountCodesTitle')}
        >
          {discountCodes.map((code) => {
            const availability = getDiscountCodeAvailability(code, now)
            const { status } = availability
            const expiry = describeExpiry(code.expiresAt, now, locale, t)
            const usageLabel = availability.hasLimit
              ? t('admin.sections.pricing.redeemedOf', {
                  count: availability.redeemedCount,
                  max: availability.maxRedemptions,
                })
              : t('admin.sections.pricing.redeemedUnlimited', { count: availability.redeemedCount })

            return (
              <article
                className={`admin-pricing__plan-row admin-pricing__plan-row--${status === 'active' ? 'active' : 'inactive'} admin-pricing__coupon-row admin-pricing__coupon-row--${status}`}
                key={code.id}
                role="listitem"
              >
                <div className="admin-pricing__plan-main">
                  <div className="admin-pricing__plan-title-row">
                    <span
                      className={`admin-pricing__status-dot${status === 'active' ? ' admin-pricing__status-dot--active' : ''}`}
                      aria-hidden
                    />
                    <h3>
                      <code>{code.code}</code>
                    </h3>
                    <button
                      type="button"
                      className="admin-pricing__btn admin-pricing__btn--quiet admin-pricing__copy-code"
                      onClick={() => copyDiscountCode(code)}
                      aria-label={t('admin.sections.pricing.copyDiscountCode', { code: code.code })}
                    >
                      {copiedCodeId === code.id ? (
                        <Check size={14} aria-hidden />
                      ) : (
                        <Copy size={14} aria-hidden />
                      )}
                      <span aria-live="polite">
                        {copiedCodeId === code.id
                          ? t('admin.sections.pricing.discountCodeCopied')
                          : t('admin.sections.pricing.copy')}
                      </span>
                    </button>
                    {/* El modificador por estado deja que `scheduled` tome el
                        token celeste que ya existe para los planes; los estados
                        sin variante propia (agotado, vencido, desactivado) caen
                        en el estilo base, como antes. */}
                    <span className={`admin-pricing__status admin-pricing__status--${status}`}>
                      {t(`admin.sections.pricing.discountStatus.${status}`)}
                    </span>
                    {status === 'active' && code.audience === 'public' ? (
                      <span className="admin-pricing__status admin-pricing__status--public">
                        {t('admin.sections.pricing.promoAudienceBadge.public')}
                      </span>
                    ) : null}
                    {(code.manualChannels ?? []).length ? (
                      <span className="admin-pricing__status admin-pricing__status--manual">
                        {t(
                          `admin.sections.pricing.manualChannelsBadge.${[...(code.manualChannels ?? [])].sort().join('+')}`,
                        )}
                      </span>
                    ) : null}
                    {availability.exclusive ? (
                      <span className="admin-pricing__status admin-pricing__status--exclusive">
                        {t('admin.sections.pricing.exclusiveBadge', {
                          count: availability.inviteeCount,
                        })}
                      </span>
                    ) : null}
                    {code.kind === 'offer' ? (
                      <span className="admin-pricing__status admin-pricing__status--offer">
                        {t('admin.sections.pricing.offerBadge')}
                      </span>
                    ) : null}
                  </div>
                  <p className="admin-pricing__plan-meta">
                    <span>{t(`admin.sections.pricing.appliesTo.${code.appliesTo}`)}</span>
                    {code.eventTitle ? <span>{code.eventTitle}</span> : null}
                    {/* Cuánta gente tiene el código contra cuánta lo usó: es lo
                        único que hace legible una oferta secreta. */}
                    {code.unlockedCount ? (
                      <span>
                        {t('admin.sections.pricing.unlockedCount', { count: code.unlockedCount })}
                      </span>
                    ) : null}
                    {!availability.hasLimit ? <span>{usageLabel}</span> : null}
                    {availability.scheduled ? (
                      <span className="admin-pricing__plan-meta-date">
                        <CalendarClock size={12} aria-hidden />
                        {t('admin.sections.pricing.opensOn', {
                          date: new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(code.startsAt)),
                        })}
                      </span>
                    ) : null}
                    <span
                      className={`admin-pricing__plan-meta-date${
                        expiry.urgent ? ' admin-pricing__plan-meta-date--urgent' : ''
                      }`}
                    >
                      <CalendarClock size={12} aria-hidden />
                      {expiry.label}
                    </span>
                  </p>
                  {availability.hasLimit ? (
                    <div className="admin-pricing__coupon-usage">
                      <div className="admin-pricing__coupon-usage-head">
                        <span>
                          {t('admin.sections.pricing.remainingRedemptions', {
                            count: availability.remaining,
                          })}
                        </span>
                        <strong>{usageLabel}</strong>
                      </div>
                      <progress
                        aria-label={t('admin.sections.pricing.availabilityProgress', {
                          count: availability.remaining,
                          max: availability.maxRedemptions,
                        })}
                        className="admin-pricing__coupon-progress"
                        max={availability.maxRedemptions}
                        value={availability.remaining}
                      />
                    </div>
                  ) : null}
                  {code.description ? (
                    <p className="admin-pricing__plan-meta">{code.description}</p>
                  ) : null}
                  {code.campaignMetrics ? (
                    <dl className="admin-pricing__campaign-funnel">
                      {['resolvedCount', 'unlockedCount', 'checkoutCount', 'paidCount'].map(
                        (metric) => (
                          <div key={metric}>
                            <dt>{t(`admin.sections.pricing.campaignMetric.${metric}`)}</dt>
                            <dd>{code.campaignMetrics[metric]}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  ) : null}
                </div>

                {['fixed_price', 'offer'].includes(code.kind) ? (
                  <div className="admin-pricing__plan-amount-stack">
                    <strong className="admin-pricing__plan-amount">
                      {money(code.fixedPrice ?? 0, locale)}
                    </strong>
                    {/* Sólo cuando difiere: si el canal manual cobra lo mismo,
                        repetir el importe no informa nada. */}
                    {code.fixedPriceManual != null && code.fixedPriceManual !== code.fixedPrice ? (
                      <span className="admin-pricing__plan-amount-note">
                        {t('admin.sections.pricing.fixedPriceManualNote', {
                          amount: money(code.fixedPriceManual, locale),
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : code.kind === 'access' ? (
                  /* Un código de acceso no tiene importe: sin esta rama la lista
                     mostraba "−null%". */
                  <strong className="admin-pricing__plan-amount admin-pricing__plan-amount--percent">
                    {t('admin.sections.pricing.accessAmount')}
                  </strong>
                ) : (
                  <strong className="admin-pricing__plan-amount admin-pricing__plan-amount--percent">
                    −{code.percentOff}%
                  </strong>
                )}

                <div className="admin-pricing__plan-actions">
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet"
                    onClick={() => copyPromotionLink(code)}
                  >
                    <Link2 size={14} aria-hidden />
                    {copiedLinkCodeId === code.id
                      ? t('admin.sections.pricing.promotionLinkCopied')
                      : t('admin.sections.pricing.copyPromotionLink')}
                  </button>
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet"
                    onClick={() => downloadPromotionQr(code)}
                  >
                    <QrCode size={14} aria-hidden />
                    {downloadedQrCodeId === code.id
                      ? t('admin.sections.pricing.promotionQrDownloaded')
                      : t('admin.sections.pricing.downloadPromotionQr')}
                  </button>
                  {onSimulatePromotionCode ? (
                    <button
                      type="button"
                      className="admin-pricing__btn admin-pricing__btn--quiet"
                      onClick={() => simulatePromotion(code)}
                      disabled={simulationState.loading && simulationState.id === code.id}
                    >
                      <FlaskConical size={14} aria-hidden />
                      {simulationState.loading && simulationState.id === code.id
                        ? t('admin.sections.pricing.simulatingPromotion')
                        : t('admin.sections.pricing.simulatePromotion')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet"
                    onClick={() => openCodeForm(code)}
                    disabled={locked}
                  >
                    <Pencil size={14} aria-hidden />
                    {t('admin.sections.pricing.edit')}
                  </button>
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet is-danger"
                    onClick={() => {
                      setCodeToDelete(code)
                      setCodeDeleteError('')
                      setNotice('')
                    }}
                    disabled={locked || pendingAction === `delete-code:${code.id}`}
                    aria-label={t('admin.sections.pricing.deleteDiscountCodeAria', {
                      code: code.code,
                    })}
                  >
                    <Trash2 size={14} aria-hidden />
                    {t('admin.sections.pricing.deleteDiscountCode')}
                  </button>
                </div>

                <div
                  className="admin-pricing__promo-state"
                  role="radiogroup"
                  aria-label={t('admin.sections.pricing.promoStateLegend', { code: code.code })}
                >
                  {PROMO_STATES.map((state) => {
                    // El cierre automático por cupo apaga la promo. Volver a
                    // abrirla sin ampliar el cupo no habilita nada: la RPC lo
                    // rechaza. Se deshabilitan las dos opciones abiertas en vez
                    // de aceptar un click que no va a tener efecto.
                    const unreachable = availability.exhausted && state !== 'off'
                    return (
                      <label
                        className={`admin-pricing__promo-state-option${
                          availability.state === state ? ' is-selected' : ''
                        }`}
                        key={state}
                      >
                        <input
                          type="radio"
                          name={`promo-state-${code.id}`}
                          value={state}
                          checked={availability.state === state}
                          onChange={() => changeCodeState(code, state)}
                          disabled={locked || unreachable || pendingAction === code.id}
                        />
                        <span>{t(`admin.sections.pricing.promoState.${state}`)}</span>
                      </label>
                    )
                  })}
                </div>

                {availability.exhausted ? (
                  <p className="admin-pricing__promo-note">
                    {t('admin.sections.pricing.promoExhaustedNote')}
                  </p>
                ) : null}
                {codeStateError.id === code.id ? (
                  <p className="admin-pricing__promo-note is-error" role="alert">
                    {codeStateError.message}
                  </p>
                ) : null}
                {simulationState.id === code.id && simulationState.data ? (
                  <div className="admin-pricing__simulation" role="status">
                    {simulationState.data.error ? (
                      <p className="admin-pricing__promo-note is-error">
                        {simulationState.data.error}
                      </p>
                    ) : (
                      <>
                        <strong>{t('admin.sections.pricing.simulationTitle')}</strong>
                        <span>
                          {t('admin.sections.pricing.simulationDestination', {
                            destination: simulationState.data.destination?.kind ?? 'stay',
                          })}
                        </span>
                        <a
                          className="admin-pricing__simulation-link"
                          href={buildPromotionCodeUrl(code.code)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Link2 size={13} aria-hidden />
                          {t('admin.sections.pricing.openPromotionLink')}
                        </a>
                        <ul>
                          {Object.entries(simulationState.data.checks ?? {}).map(
                            ([check, passed]) => (
                              <li className={passed ? 'is-passed' : 'is-failed'} key={check}>
                                {passed ? '✓' : '×'}{' '}
                                {t(`admin.sections.pricing.simulationCheck.${check}`)}
                              </li>
                            ),
                          )}
                        </ul>
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            )
          })}
          {!isLoading && discountCodes.length === 0 && !codeDraft ? (
            <p className="admin-pricing__empty">{t('admin.sections.pricing.discountCodesEmpty')}</p>
          ) : null}
        </div>

        {codeDraft ? (
          <form ref={codeFormRef} className="admin-pricing__form" onSubmit={submitCode} noValidate>
            <header>
              <h3>
                {codeDraft.id
                  ? t('admin.sections.pricing.formTitleEditCode', { code: codeDraft.code })
                  : t('admin.sections.pricing.formTitleNewCode')}
              </h3>
            </header>
            <fieldset disabled={locked || pendingAction === 'code'}>
              <label>
                <span>{t('admin.sections.pricing.code')}</span>
                <input
                  name="code"
                  value={codeDraft.code}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, code: event.target.value.toUpperCase() })
                  }
                  required
                />
                <small>{t('admin.sections.pricing.codeFormatHint')}</small>
              </label>
              <label>
                <span>{t('admin.sections.pricing.codeKindLabel')}</span>
                <select
                  value={codeDraft.kind}
                  onChange={(event) => {
                    const kind = event.target.value
                    setCodeDraft({
                      ...codeDraft,
                      kind,
                      appliesTo:
                        // Un precio promocional necesita alcance único: si venía
                        // en "afiliación e inscripción", se cae a afiliación.
                        kind === 'fixed_price' && codeDraft.appliesTo === 'both'
                          ? 'membership'
                          : // Un código de acceso y una oferta exclusiva sólo
                            // existen para el combo (nunca 'both': no hay nada
                            // que desbloquear en una afiliación o inscripción
                            // sueltas).
                            ['access', 'offer'].includes(kind) && codeDraft.appliesTo !== 'combo'
                            ? 'combo'
                            : codeDraft.appliesTo,
                      // Una oferta secreta que se aplica sola a todo el mundo no
                      // es una oferta secreta: es el precio nuevo del combo.
                      audience: kind === 'offer' ? 'code' : codeDraft.audience,
                    })
                  }}
                >
                  <option value="percent">{t('admin.sections.pricing.codeKind.percent')}</option>
                  <option value="fixed_price">
                    {t('admin.sections.pricing.codeKind.fixed_price')}
                  </option>
                  <option value="access">{t('admin.sections.pricing.codeKind.access')}</option>
                  <option value="offer">{t('admin.sections.pricing.codeKind.offer')}</option>
                </select>
                <small>{t('admin.sections.pricing.codeKindHint')}</small>
              </label>
              {['fixed_price', 'offer'].includes(codeDraft.kind) ? (
                <label>
                  <span>
                    {codeDraft.kind === 'offer'
                      ? t('admin.sections.pricing.offerPrice')
                      : t('admin.sections.pricing.fixedPrice')}
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={codeDraft.fixedPrice}
                    onChange={(event) =>
                      setCodeDraft({ ...codeDraft, fixedPrice: event.target.value })
                    }
                    required
                  />
                  <small>{t('admin.sections.pricing.fixedPriceHint')}</small>
                </label>
              ) : null}
              {['fixed_price', 'offer'].includes(codeDraft.kind) ? (
                <label>
                  <span>{t('admin.sections.pricing.fixedPriceManual')}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={t('admin.sections.pricing.fixedPriceManualPlaceholder')}
                    value={codeDraft.fixedPriceManual}
                    onChange={(event) =>
                      setCodeDraft({ ...codeDraft, fixedPriceManual: event.target.value })
                    }
                  />
                  <small>{t('admin.sections.pricing.fixedPriceManualHint')}</small>
                </label>
              ) : null}
              {['fixed_price', 'access', 'offer'].includes(codeDraft.kind) ? null : (
                <label>
                  <span>{t('admin.sections.pricing.percentOff')}</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    value={codeDraft.percentOff}
                    onChange={(event) =>
                      setCodeDraft({ ...codeDraft, percentOff: event.target.value })
                    }
                    required
                  />
                </label>
              )}
              <label>
                <span>{t('admin.sections.pricing.appliesToLabel')}</span>
                <select
                  value={codeDraft.appliesTo}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, appliesTo: event.target.value })
                  }
                >
                  {['access', 'offer'].includes(codeDraft.kind) ? null : (
                    <option value="membership">
                      {t('admin.sections.pricing.appliesTo.membership')}
                    </option>
                  )}
                  {['access', 'offer'].includes(codeDraft.kind) ? null : (
                    <option value="registration">
                      {t('admin.sections.pricing.appliesTo.registration')}
                    </option>
                  )}
                  <option value="combo">{t('admin.sections.pricing.appliesTo.combo')}</option>
                  {['fixed_price', 'access', 'offer'].includes(codeDraft.kind) ? null : (
                    <option value="both">{t('admin.sections.pricing.appliesTo.both')}</option>
                  )}
                </select>
              </label>
              {/* Alcance por inscripción. Obligatorio en una oferta exclusiva
                  —se cotiza contra el combo de ese evento— y opcional en el
                  resto: sin evento, el código vale para cualquiera. Una promo
                  pública no puede limitarse (ver discount_codes_public_event_check). */}
              {['registration', 'combo'].includes(codeDraft.appliesTo) &&
              codeDraft.audience === 'code' ? (
                <label>
                  <span>
                    {codeDraft.kind === 'offer'
                      ? t('admin.sections.pricing.offerEventLabel')
                      : t('admin.sections.pricing.codeEventLabel')}
                  </span>
                  <select
                    value={codeDraft.eventId ?? ''}
                    onChange={(event) =>
                      setCodeDraft({ ...codeDraft, eventId: event.target.value })
                    }
                    required={codeDraft.kind === 'offer'}
                  >
                    {codeDraft.kind === 'offer' ? (
                      <option value="">{t('admin.sections.pricing.offerEventPlaceholder')}</option>
                    ) : (
                      <option value="">{t('admin.sections.pricing.codeEventAny')}</option>
                    )}
                    {(configuration.events ?? [])
                      .filter(
                        (item) =>
                          codeDraft.kind !== 'offer' ||
                          (item.comboOffer?.active && item.comboOffer?.audience === 'code'),
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                          {codeDraft.kind === 'offer' && item.comboOffer
                            ? ` · ${t('admin.sections.pricing.offerEventComboPrice', {
                                price: money(item.comboOffer.price, locale),
                              })}`
                            : ''}
                        </option>
                      ))}
                  </select>
                  <small>
                    {codeDraft.kind === 'offer'
                      ? t('admin.sections.pricing.offerEventHint')
                      : t('admin.sections.pricing.codeEventHint')}
                  </small>
                </label>
              ) : null}
              {codeDraft.kind === 'offer' ? (
                <aside
                  className="admin-pricing__exclusive-flow admin-pricing__wide"
                  aria-labelledby="pricing-exclusive-flow-title"
                >
                  <div className="admin-pricing__exclusive-flow-intro">
                    <span>{t('admin.sections.pricing.exclusiveFlowEyebrow')}</span>
                    <h4 id="pricing-exclusive-flow-title">
                      {t('admin.sections.pricing.exclusiveFlowTitle')}
                    </h4>
                    <p>{t('admin.sections.pricing.exclusiveFlowLead')}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>{t('admin.sections.pricing.exclusiveFlowCode')}</dt>
                      <dd>
                        {codeDraft.code || t('admin.sections.pricing.exclusiveFlowCodePending')}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('admin.sections.pricing.exclusiveFlowBenefit')}</dt>
                      <dd>
                        {selectedOfferEvent && Number(codeDraft.fixedPrice) > 0
                          ? `${selectedOfferEvent.title} · ${money(
                              Number(codeDraft.fixedPrice),
                              locale,
                            )}`
                          : t('admin.sections.pricing.exclusiveFlowBenefitPending')}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('admin.sections.pricing.exclusiveFlowDestination')}</dt>
                      <dd>{t('admin.sections.pricing.exclusiveFlowDestinationValue')}</dd>
                    </div>
                  </dl>
                </aside>
              ) : null}
              <label>
                <span>{t('admin.sections.pricing.maxRedemptions')}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t('admin.sections.pricing.unlimitedUses')}
                  value={codeDraft.maxRedemptions}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, maxRedemptions: event.target.value })
                  }
                />
                <small>{t('admin.sections.pricing.maxRedemptionsHint')}</small>
              </label>
              <label>
                <span>{t('admin.sections.pricing.startsAt')}</span>
                <input
                  type="datetime-local"
                  value={codeDraft.startsAt}
                  onChange={(event) => setCodeDraft({ ...codeDraft, startsAt: event.target.value })}
                />
                <small>{t('admin.sections.pricing.startsAtHint')}</small>
              </label>
              <label>
                <span>{t('admin.sections.pricing.expiresAt')}</span>
                <input
                  type="datetime-local"
                  value={codeDraft.expiresAt}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, expiresAt: event.target.value })
                  }
                />
                <small>{t('admin.sections.pricing.expiresAtHint')}</small>
              </label>
              <label className="admin-pricing__wide">
                <span>{t('admin.sections.pricing.description')}</span>
                <input
                  value={codeDraft.description}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, description: event.target.value })
                  }
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.audienceLabel')}</span>
                <select
                  value={codeDraft.audience}
                  onChange={(event) => {
                    const audience = event.target.value
                    setCodeDraft({
                      ...codeDraft,
                      audience,
                      // Una promo pública no destraba canales manuales: pasar a
                      // pública limpia la selección en vez de mandar un payload
                      // que el servidor va a rechazar.
                      manualChannels: audience === 'public' ? [] : (codeDraft.manualChannels ?? []),
                    })
                  }}
                >
                  <option value="code">{t('admin.sections.pricing.audience.code')}</option>
                  {codeDraft.kind === 'offer' ? null : (
                    <option value="public">{t('admin.sections.pricing.audience.public')}</option>
                  )}
                </select>
                <small>{t('admin.sections.pricing.audienceHint')}</small>
              </label>
              <fieldset
                className="admin-pricing__channels admin-pricing__wide"
                disabled={codeDraft.audience === 'public'}
              >
                <legend>{t('admin.sections.pricing.manualChannelsLegend')}</legend>
                {MANUAL_PAYMENT_CHANNELS.map((channel) => (
                  <label className="admin-pricing__toggle" key={channel}>
                    <input
                      type="checkbox"
                      checked={(codeDraft.manualChannels ?? []).includes(channel)}
                      onChange={(event) =>
                        setCodeDraft({
                          ...codeDraft,
                          manualChannels: event.target.checked
                            ? [...new Set([...(codeDraft.manualChannels ?? []), channel])]
                            : (codeDraft.manualChannels ?? []).filter((item) => item !== channel),
                        })
                      }
                    />
                    <span>{t(`admin.sections.pricing.manualChannel.${channel}`)}</span>
                  </label>
                ))}
                <small>
                  {codeDraft.audience === 'public'
                    ? t('admin.sections.pricing.manualChannelsPublicHint')
                    : t('admin.sections.pricing.manualChannelsHint')}
                </small>
              </fieldset>
              <label className="admin-pricing__wide">
                <span>{t('admin.sections.pricing.invitees')}</span>
                <textarea
                  rows={4}
                  placeholder={t('admin.sections.pricing.inviteesPlaceholder')}
                  value={codeDraft.inviteesText}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, inviteesText: event.target.value })
                  }
                />
                <small>
                  {draftInviteeCount > 0
                    ? draftInviteeCount === 1
                      ? t('admin.sections.pricing.personalCodeHint')
                      : t('admin.sections.pricing.inviteesCountHint', { count: draftInviteeCount })
                    : t('admin.sections.pricing.inviteesHint')}
                </small>
              </label>
            </fieldset>
            {codeError ? (
              <p className="admin-pricing__form-error" role="alert">
                {codeError}
              </p>
            ) : null}
            <div className="admin-pricing__form-actions">
              <button
                type="button"
                className="admin-pricing__btn admin-pricing__btn--ghost"
                onClick={() => setCodeDraft(null)}
              >
                {t('admin.sections.pricing.cancel')}
              </button>
              <button
                type="submit"
                className="admin-pricing__btn admin-pricing__btn--primary"
                disabled={locked || pendingAction === 'code'}
              >
                <Save size={15} aria-hidden />
                {pendingAction === 'code'
                  ? t('admin.sections.pricing.saving')
                  : t('admin.sections.pricing.publishDiscountCode')}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {comboToDelete ? (
        <AdminDeleteConfirmDialog
          busy={pendingAction === 'delete-combo'}
          error={comboError}
          title={t('admin.sections.pricing.deleteComboConfirmTitle', {
            event: comboToDelete.title,
          })}
          description={t('admin.sections.pricing.deleteComboConfirmDescription', {
            event: comboToDelete.title,
          })}
          warning={t('admin.sections.pricing.deleteComboConfirmWarning')}
          cancelLabel={t('admin.sections.pricing.deleteComboConfirmCancel')}
          confirmLabel={t('admin.sections.pricing.deleteComboConfirmConfirm')}
          busyLabel={t('admin.sections.pricing.deleting')}
          onCancel={() => {
            if (pendingAction === 'delete-combo') return
            setComboToDelete(null)
          }}
          onConfirm={confirmDeleteCombo}
        />
      ) : null}

      {codeToDelete ? (
        <AdminDeleteConfirmDialog
          busy={pendingAction === `delete-code:${codeToDelete.id}`}
          error={codeDeleteError}
          title={t('admin.sections.pricing.deleteCodeConfirmTitle', { code: codeToDelete.code })}
          description={t('admin.sections.pricing.deleteCodeConfirmDescription', {
            code: codeToDelete.code,
          })}
          warning={t(
            codeToDelete.redeemedCount > 0
              ? 'admin.sections.pricing.deleteCodeConfirmWarningRedeemed'
              : 'admin.sections.pricing.deleteCodeConfirmWarning',
            { count: codeToDelete.redeemedCount },
          )}
          cancelLabel={t('admin.sections.pricing.deleteCodeConfirmCancel')}
          confirmLabel={t('admin.sections.pricing.deleteCodeConfirmConfirm')}
          busyLabel={t('admin.sections.pricing.deleting')}
          onCancel={() => {
            if (pendingAction === `delete-code:${codeToDelete.id}`) return
            setCodeToDelete(null)
            setCodeDeleteError('')
          }}
          onConfirm={confirmDeleteCode}
        />
      ) : null}

      <section className="admin-pricing__block" aria-labelledby="pricing-subscriptions-title">
        <header className="admin-pricing__block-head">
          <div>
            <h2 id="pricing-subscriptions-title">
              {t('admin.sections.pricing.subscriptionsTitle')}
            </h2>
            <p>{t('admin.sections.pricing.subscriptionsLead')}</p>
          </div>
        </header>

        {subscriptionsError ? (
          <div className="admin-pricing__message admin-pricing__message--error" role="alert">
            {subscriptionsError}
          </div>
        ) : null}
        {subscriptionsLoading && subscriptions.length === 0 ? (
          <p className="admin-pricing__loading">{t('admin.sections.pricing.loading')}</p>
        ) : null}

        <div
          className="admin-pricing__plan-list"
          role="list"
          aria-label={t('admin.sections.pricing.subscriptionsTitle')}
        >
          {subscriptions.map((subscription) => {
            const statusKey = SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? 'pending'
            const canCancel = !['cancelled', 'ended'].includes(subscription.status)
            const nextBillingLabel = subscription.nextBillingAt
              ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(subscription.nextBillingAt),
                )
              : '—'

            return (
              <article className="admin-pricing__plan-row" key={subscription.id} role="listitem">
                <div className="admin-pricing__plan-main">
                  <div className="admin-pricing__plan-title-row">
                    <span
                      className={`admin-pricing__status-dot${subscription.status === 'authorized' ? ' admin-pricing__status-dot--active' : ''}`}
                      aria-hidden
                    />
                    <h3>{subscription.athleteName}</h3>
                    <span
                      className={`admin-pricing__status${subscription.status === 'authorized' ? ' admin-pricing__status--active' : ''}`}
                    >
                      {t(`admin.sections.pricing.subscriptionStatus.${statusKey}`)}
                    </span>
                  </div>
                  <p className="admin-pricing__plan-meta">
                    <span>{subscription.planName}</span>
                    <span>{subscription.athleteEmail}</span>
                    <span className="admin-pricing__plan-meta-date">
                      <Repeat size={12} aria-hidden />
                      {t('admin.sections.pricing.nextBilling', { date: nextBillingLabel })}
                    </span>
                  </p>
                </div>

                <strong className="admin-pricing__plan-amount">
                  {money(subscription.amount, locale)}
                </strong>

                <div className="admin-pricing__plan-actions">
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet is-danger"
                    onClick={() => {
                      setCancelError('')
                      setCancelTarget(subscription)
                    }}
                    disabled={!canEditSubscriptions || !canCancel}
                  >
                    <X size={14} aria-hidden />
                    {t('admin.sections.pricing.cancelSubscription')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        {!subscriptionsLoading && subscriptions.length === 0 ? (
          <div className="admin-pricing__subscription-empty" role="status">
            <span className="admin-pricing__subscription-empty-icon" aria-hidden>
              <Repeat size={18} />
            </span>
            <div>
              <strong>{t('admin.sections.pricing.subscriptionsEmpty')}</strong>
              <p>{t('admin.sections.pricing.subscriptionsEmptyHint')}</p>
            </div>
          </div>
        ) : null}
      </section>

      {cancelTarget ? (
        <AdminDeleteConfirmDialog
          busy={pendingAction === `cancel-${cancelTarget.id}`}
          error={cancelError}
          title={t('admin.sections.pricing.cancelSubscriptionConfirmTitle')}
          description={t('admin.sections.pricing.cancelSubscriptionConfirmDescription', {
            athlete: cancelTarget.athleteName,
          })}
          warning={t('admin.sections.pricing.cancelSubscriptionConfirmWarning')}
          cancelLabel={t('admin.sections.pricing.cancel')}
          confirmLabel={t('admin.sections.pricing.cancelSubscription')}
          busyLabel={t('admin.sections.pricing.saving')}
          onCancel={() => setCancelTarget(null)}
          onConfirm={confirmCancelSubscription}
        />
      ) : null}
    </section>
  )
}
