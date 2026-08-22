import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeDollarSign,
  CalendarClock,
  CalendarOff,
  Check,
  CirclePlus,
  Copy,
  FlaskConical,
  History,
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
import {
  CODE_PAYMENT_MODES,
  MANUAL_PAYMENT_CHANNELS,
  applyCodePaymentMode,
  codePaymentModeOf,
  generateDiscountCode,
  getDiscountCodeAvailability,
  mapWithConcurrency,
  normalizeCodePrefix,
} from '../../services/pricingAdminService.js'

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

/**
 * Los dos tipos de código, en el vocabulario de quien los reparte: descuento
 * por porcentaje o precio fijo promocional. El "combo" (afiliación +
 * inscripción) no es un tipo: es un precio fijo con alcance 'combo'. Las
 * modalidades de oferta exclusiva ('offer'/'access') están retiradas
 * (20260915100000).
 */
const CODE_TYPES = ['percent', 'fixed_price']

/**
 * Tipo del panel para una modalidad guardada. Las modalidades históricas
 * `offer`/`access` están retiradas (20260915100000) y el catálogo del panel
 * las filtra antes de llegar acá; si una se colara, se lee como porcentaje en
 * vez de romper el formulario.
 */
function codeTypeOf(kind) {
  return ['percent', 'fixed_price'].includes(kind) ? kind : 'percent'
}

/**
 * Etiqueta de medios de pago del código para la lista.
 *
 * Un código que suma un canal manual dice qué habilita; uno que además cerró la
 * pasarela dice qué es lo único con lo que se puede pagar, que es la
 * información que cambia la operación —a ese atleta hay que cobrarle a mano—. Un
 * código que sólo va por Mercado Pago no lleva etiqueta: es el caso por defecto.
 */
function codeChannelsBadgeKey(code) {
  const channels = [...(code.manualChannels ?? [])].sort().join('+')
  if (!channels) return null
  return code.mercadoPagoEnabled === false
    ? `admin.sections.pricing.codeChannelsOnlyBadge.${channels}`
    : `admin.sections.pricing.manualChannelsBadge.${channels}`
}

/**
 * Los tres estados de una promoción, en el orden en que los recorre el
 * operador: apagada, abierta a todos, abierta sólo a quien tiene el código.
 * En la base son dos ejes (`active` × `audience`); acá es un valor único
 * porque es una sola pregunta: quién puede acceder a esta promo.
 */
const PROMO_STATES = ['off', 'code', 'public']

/**
 * Estados de orden con etiqueta propia en el historial de canjes. Uno que no
 * esté acá (un estado nuevo de la base) se muestra tal cual en vez de romper
 * la traducción.
 */
const REDEMPTION_ORDER_STATUSES = [
  'pendiente',
  'creado',
  'aprobado',
  'validacion_manual',
  'cancelado',
  'rechazado',
  'reembolsado',
]

const EMPTY_DISCOUNT_CODE = {
  id: undefined,
  code: '',
  batchPrefix: '',
  description: '',
  // Quién accede: 'code' hay que tipearla, 'public' se aplica sola a todos.
  audience: 'code',
  // 'percent' descuenta un porcentaje; 'fixed_price' fija el importe final de
  // la compra (también la del combo, con appliesTo 'combo').
  kind: 'percent',
  percentOff: '',
  fixedPrice: '',
  // Importe final para transferencia y efectivo. Vacío = cobra lo mismo que
  // `fixedPrice` en cualquier canal, que es el caso más común.
  fixedPriceManual: '',
  appliesTo: 'membership',
  // A qué inscripción aplica. Vacío = cualquiera.
  eventId: '',
  maxRedemptions: '',
  startsAt: '',
  expiresAt: '',
  active: true,
  // Canales manuales que el código destraba además de la pasarela. Vacío =
  // ninguno.
  manualChannels: [],
  // La otra mitad de la matriz: apagarlo cierra Mercado Pago para este código.
  // Nace abierto, que es el comportamiento histórico de todos los códigos.
  mercadoPagoEnabled: true,
  // Financiamiento del código: quien lo canjea puede declarar que pagó por
  // transferencia o en efectivo y queda habilitado en forma provisoria; Finanzas
  // conserva la validación final y la deuda queda abierta. Exige al menos un
  // canal manual, porque es lo único que el atleta puede declarar.
  financed: false,
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
  onSetPlanActive,
  onSetPlanRetirement,
  onUpsertDiscountCode,
  onSetDiscountCodeState,
  onDeleteDiscountCode,
  onSimulatePromotionCode,
  onFetchDiscountCodeRedemptions,
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
  // El banner de resultado guarda texto y tono: un fallo de copiar o de bajar
  // el QR se anunciaba con el mismo aspecto que una confirmación, así que un
  // error se leía como éxito. `setNotice(texto)` sigue siendo la confirmación
  // de siempre; el tono 'error' se pide explícito.
  const [notice, setNoticeState] = useState(null)
  const setNotice = (text, tone = 'success') => setNoticeState(text ? { text, tone } : null)
  const [pendingAction, setPendingAction] = useState('')
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
  const [downloadedQrCodeId, setDownloadedQrCodeId] = useState(null)
  const [simulationState, setSimulationState] = useState({ id: null, loading: false, data: null })
  const [redemptionsState, setRedemptionsState] = useState({
    id: null,
    loading: false,
    data: null,
  })
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

  // La referencia temporal de los estados vencido/programado. Avanza con cada
  // tick del refresco: congelada al montar, un panel abierto varias horas
  // mostraba y ordenaba estados falsos.
  const [now, setNow] = useState(() => new Date())

  // Los canjes llegan desde los checkouts de atletas, no desde este panel. La
  // API relee el contador canónico periódicamente para que el operador vea
  // cómo se descuentan los cupos sin tener que recargar la pantalla. La misma
  // cadencia avanza `now`.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      setNow(new Date())
      onRefresh?.()
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
      setNotice(t('admin.sections.pricing.copyDiscountCodeError'), 'error')
    }
  }

  async function downloadPromotionQr(code) {
    try {
      // El QR codifica el código pelado, no una URL: no hay página pública que
      // canjearlo, y el destino del escaneo es el botón de la lupa que vive en
      // el campo de código de Afiliación e Inscripción.
      const qr = await generateCredentialQr(code.code)
      downloadDataUrl(qr, `${code.code}-canje.png`)
      setDownloadedQrCodeId(code.id)
      window.clearTimeout(copyFeedbackTimeoutRef.current)
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setDownloadedQrCodeId(null)
      }, COPY_FEEDBACK_MS)
    } catch {
      setNotice(t('admin.sections.pricing.downloadPromotionQrError'), 'error')
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

  // El historial responde "¿quién lo usó?" sin entrar a la base: el contador
  // de la lista dice cuántos, esto dice quiénes, cuándo y sobre qué orden.
  async function showRedemptions(code) {
    if (!onFetchDiscountCodeRedemptions) return
    // Segundo click sobre el mismo código: cierra el historial.
    if (redemptionsState.id === code.id && !redemptionsState.loading) {
      setRedemptionsState({ id: null, loading: false, data: null })
      return
    }
    setRedemptionsState({ id: code.id, loading: true, data: null })
    const result = await onFetchDiscountCodeRedemptions(code.id)
    setRedemptionsState({
      id: code.id,
      loading: false,
      data: result?.error
        ? { error: result.error }
        : { redemptions: result?.redemptions ?? [] },
    })
  }

  const pricingWritesEnabled = isFeatureEnabled(FEATURE_KEYS.pricingWrites)
  const locked = !pricingWritesEnabled || configuration.availability?.editable === false || !canEdit
  const showProductionLock =
    !pricingWritesEnabled || configuration.availability?.reason === 'production_coming_soon'
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
  const discountCodes = useMemo(() => {
    const list = [...(configuration.discountCodes ?? [])]
    const rank = (code) => (getDiscountCodeAvailability(code, now).status === 'active' ? 0 : 1)
    return list.sort((left, right) => {
      const byStatus = rank(left) - rank(right)
      if (byStatus !== 0) return byStatus
      return new Date(right.createdAt ?? 0) - new Date(left.createdAt ?? 0)
    })
  }, [configuration.discountCodes, now])
  // Búsqueda local sobre la lista: con lotes por invitado la sección puede
  // tener cientos de códigos y encontrar uno a ojo deja de ser razonable.
  // Filtra por código, descripción y torneo, sin distinguir mayúsculas.
  const [codeQuery, setCodeQuery] = useState('')
  const visibleDiscountCodes = useMemo(() => {
    const query = codeQuery.trim().toLowerCase()
    if (!query) return discountCodes
    return discountCodes.filter((code) =>
      [code.code, code.description, code.eventTitle]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query)),
    )
  }, [codeQuery, discountCodes])
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
  // Un código sin ningún medio no se puede guardar: el aviso lo dice en el
  // mismo fieldset, antes de que el operador intente enviar el formulario.
  const draftHasNoChannel = Boolean(
    codeDraft &&
    codeDraft.mercadoPagoEnabled === false &&
    (codeDraft.manualChannels ?? []).length === 0,
  )
  // El financiamiento se declara sobre transferencia o efectivo: sin ninguno de
  // los dos, el atleta sólo ve la pasarela —que acredita sola— y el interruptor
  // no significa nada. El formulario prende los canales al marcarlo, así que
  // esto sólo aparece si el operador los desmarcó después.
  const draftFinancingInert = Boolean(
    codeDraft && codeDraft.financed === true && (codeDraft.manualChannels ?? []).length === 0,
  )
  // Tipo elegido en el panel, que no siempre es la modalidad guardada (una
  // fila histórica puede traer una modalidad retirada).
  const draftCodeType = codeDraft ? codeTypeOf(codeDraft.kind) : 'percent'
  // Cómo se cobra, derivado de las tres columnas que guarda la base: así un
  // código ya cargado —incluso uno anterior a este selector— se reabre en el
  // modo que le corresponde en vez de en el default.
  const draftPaymentMode = codeDraft ? codePaymentModeOf(codeDraft) : 'mercado_pago'
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
            batchPrefix: '',
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
            mercadoPagoEnabled: source.mercadoPagoEnabled !== false,
            // Del código, no del combo del evento (20260912100000): antes dos
            // códigos del mismo torneo compartían un único interruptor, así que
            // editar uno reescribía el contrato del otro.
            financed: source.financed === true,
            inviteesText: (source.invitees ?? []).join('\n'),
          }
        : { ...EMPTY_DISCOUNT_CODE },
    )
  }

  async function submitCode(event) {
    event.preventDefault()
    setCodeError('')
    const isFixedPrice = codeDraft.kind === 'fixed_price'
    const percentOff = Number(codeDraft.percentOff)
    
    // Si Mercado Pago está desactivado, tomamos el precio manual como base
    // para cumplir con la validación de la base de datos (que exige > 0).
    const effectiveFixedPrice = isFixedPrice && codeDraft.mercadoPagoEnabled === false
      ? Number(codeDraft.fixedPriceManual)
      : Number(codeDraft.fixedPrice)

    // Se lee acá arriba y no junto a su validación: con más de un invitado el
    // código de cada uno se genera solo, así que el formato del que se tipeó
    // sólo aplica al caso de uno. Declararlo después dejaba ese `if` en la zona
    // muerta del `const` y guardar un código tiraba ReferenceError.
    const invitees = parseInvitees(codeDraft.inviteesText)

    if (
      invitees.length <= 1 &&
      !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test((codeDraft.code || '').toUpperCase())
    ) {
      setCodeError(t('admin.sections.pricing.codeFormatHint'))
      return
    }
    if (
      !isFixedPrice &&
      (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99)
    ) {
      setCodeError(t('admin.sections.pricing.percentOffInvalid'))
      return
    }
    if (isFixedPrice && (!Number.isInteger(effectiveFixedPrice) || effectiveFixedPrice < 1)) {
      setCodeError(codeDraft.mercadoPagoEnabled === false 
        ? t('admin.sections.pricing.fixedPriceManualInvalid')
        : t('admin.sections.pricing.fixedPriceInvalid'))
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
    // Mismos dos checks que el schema y la RPC, adelantados para explicarlos en
    // el formulario en vez de traducir un 400 del servidor.
    if (codeDraft.audience === 'public' && codeDraft.mercadoPagoEnabled === false) {
      setCodeError(t('admin.sections.pricing.publicPromoGatewayInvalid'))
      return
    }
    if (draftHasNoChannel) {
      setCodeError(t('admin.sections.pricing.codeChannelsEmpty'))
      return
    }
    if (draftFinancingInert) {
      setCodeError(t('admin.sections.pricing.codeFinancingChannelRequired'))
      return
    }
    if (codeDraft.financed && codeDraft.audience === 'public') {
      setCodeError(t('admin.sections.pricing.codeFinancingPublicInvalid'))
      return
    }

    setPendingAction('code')

    // Lo que comparte todo el lote. Se arma una sola vez: con 300 invitados,
    // recalcularlo por código era trabajo repetido y una oportunidad más de que
    // dos códigos del mismo lote no salieran idénticos en lo económico.
    const sharedPayload = {
      ...codeDraft,
      percentOff: isFixedPrice ? undefined : percentOff,
      fixedPrice: isFixedPrice ? effectiveFixedPrice : undefined,
      fixedPriceManual: isFixedPrice ? fixedPriceManual : undefined,
      // Sólo una inscripción o un combo pueden limitarse a un evento; el resto
      // manda el campo vacío para que el servidor lo descarte.
      eventId:
        codeDraft.eventId && ['registration', 'combo'].includes(codeDraft.appliesTo)
          ? codeDraft.eventId
          : undefined,
      maxRedemptions:
        codeDraft.maxRedemptions === '' ? undefined : Number(codeDraft.maxRedemptions),
    }

    // Un código por invitado, o el que se tipeó. Los generados se reservan
    // contra los que ya existen y contra el propio lote: chocar acá cuesta un
    // reintento local en vez de un 409 a mitad de camino.
    const taken = new Set(
      (configuration.discountCodes ?? []).map((item) => String(item.code ?? '').toUpperCase()),
    )
    const batch =
      invitees.length > 1
        ? invitees.map((email) => {
            const code = generateDiscountCode({ prefix: codeDraft.batchPrefix, taken })
            taken.add(code)
            return { code, invitees: [email] }
          })
        : [{ code: codeDraft.code.toUpperCase(), invitees }]

    // Concurrencia acotada y sin cortar en el primer error: antes un lote de 200
    // que fallaba en el tercero dejaba dos códigos creados y ningún reporte de
    // cuáles. Ahora se intentan todos y se informa lo que no entró.
    const results = await mapWithConcurrency(batch, async (item) => {
      const result = await onUpsertDiscountCode?.({ ...sharedPayload, ...item })
      if (result?.error) throw new Error(result.error)
      return result
    })
    const failures = results.filter((result) => !result.ok)

    setPendingAction('')
    if (failures.length > 0) {
      setCodeError(
        batch.length === 1
          ? failures[0].error.message
          : t('admin.sections.pricing.batchPartialError', {
              created: batch.length - failures.length,
              total: batch.length,
              reason: failures[0].error.message,
            }),
      )
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
        <div
          className={`admin-pricing__message${
            notice.tone === 'error' ? ' admin-pricing__message--error' : ''
          }`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
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

        {/* La búsqueda aparece recién cuando la lista la necesita: con un
            puñado de códigos es ruido, con un lote de invitados es la única
            forma de encontrar uno. */}
        {discountCodes.length > 5 ? (
          <label className="admin-pricing__code-search">
            <span>{t('admin.sections.pricing.codeSearchLabel')}</span>
            <input
              type="search"
              value={codeQuery}
              onChange={(event) => setCodeQuery(event.target.value)}
              placeholder={t('admin.sections.pricing.codeSearchPlaceholder')}
            />
          </label>
        ) : null}

        <div
          className="admin-pricing__plan-list"
          role="list"
          aria-label={t('admin.sections.pricing.discountCodesTitle')}
        >
          {visibleDiscountCodes.map((code) => {
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
                    {codeChannelsBadgeKey(code) ? (
                      <span className="admin-pricing__status admin-pricing__status--manual">
                        {t(codeChannelsBadgeKey(code))}
                      </span>
                    ) : null}
                    {availability.exclusive ? (
                      <span className="admin-pricing__status admin-pricing__status--exclusive">
                        {t('admin.sections.pricing.exclusiveBadge', {
                          count: availability.inviteeCount,
                        })}
                      </span>
                    ) : null}
                    {/* Quién puede delegar el pago cambia la operación: a ese
                        atleta hay que cobrarle a mano y la deuda queda abierta
                        hasta que Finanzas la valide. */}
                    {code.financed ? (
                      <span className="admin-pricing__status admin-pricing__status--financed">
                        {t('admin.sections.pricing.codeFinancedBadge')}
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
                      {/* La recaudación cierra el embudo: canjes sin plata no
                          cuentan la historia completa. Solo con pagos — un $0
                          al lado de "0 pagados" no informa nada. */}
                      {code.campaignMetrics.paidCount > 0 ? (
                        <div>
                          <dt>{t('admin.sections.pricing.campaignMetric.revenue')}</dt>
                          <dd>{money(code.campaignMetrics.revenue, locale)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>

                {code.kind === 'fixed_price' ? (
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
                ) : (
                  <strong className="admin-pricing__plan-amount admin-pricing__plan-amount--percent">
                    −{code.percentOff}%
                  </strong>
                )}

                <div className="admin-pricing__plan-actions">
                  {/* Sin enlace de canje: no existe una página pública que abra
                      un código. Lo que se reparte es el código —y su QR, que lo
                      codifica pelado para el botón de escaneo de los checkouts. */}
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
                  {/* Solo con canjes: un historial vacío no responde nada. */}
                  {onFetchDiscountCodeRedemptions && availability.redeemedCount > 0 ? (
                    <button
                      type="button"
                      className="admin-pricing__btn admin-pricing__btn--quiet"
                      onClick={() => showRedemptions(code)}
                      aria-expanded={redemptionsState.id === code.id}
                      disabled={redemptionsState.loading && redemptionsState.id === code.id}
                    >
                      <History size={14} aria-hidden />
                      {redemptionsState.loading && redemptionsState.id === code.id
                        ? t('admin.sections.pricing.redemptionsLoading')
                        : redemptionsState.id === code.id && redemptionsState.data
                          ? t('admin.sections.pricing.redemptionsHide')
                          : t('admin.sections.pricing.redemptionsShow')}
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
                        {/* El recorrido se verifica contra el checkout donde el
                            código se canjea de verdad: no hay una URL de canje
                            que abrir en otra pestaña. */}
                        <span className="admin-pricing__simulation-link">
                          {t('admin.sections.pricing.simulationRedeemHint')}
                        </span>
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
                {redemptionsState.id === code.id && redemptionsState.data ? (
                  <div className="admin-pricing__simulation" role="status">
                    {redemptionsState.data.error ? (
                      <p className="admin-pricing__promo-note is-error">
                        {redemptionsState.data.error}
                      </p>
                    ) : redemptionsState.data.redemptions.length === 0 ? (
                      /* El contador y el historial se leen en momentos
                         distintos: entre uno y otro una orden pudo morir y
                         liberar su canje. */
                      <p className="admin-pricing__promo-note">
                        {t('admin.sections.pricing.redemptionsEmpty')}
                      </p>
                    ) : (
                      <>
                        <strong>
                          {t('admin.sections.pricing.redemptionsTitle', {
                            count: redemptionsState.data.redemptions.length,
                          })}
                        </strong>
                        <ul className="admin-pricing__redemptions">
                          {redemptionsState.data.redemptions.map((redemption) => (
                            <li key={redemption.id}>
                              <strong>
                                {redemption.athlete?.fullName ||
                                  redemption.athlete?.email ||
                                  t('admin.sections.pricing.redemptionUnknownAthlete')}
                              </strong>
                              <span>
                                {redemption.redeemedAt
                                  ? new Intl.DateTimeFormat(locale, {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    }).format(new Date(redemption.redeemedAt))
                                  : null}
                              </span>
                              <span>
                                {t('admin.sections.pricing.redemptionSaved', {
                                  amount: money(redemption.discountAmount, locale),
                                })}
                              </span>
                              {redemption.order ? (
                                <span>
                                  {t('admin.sections.pricing.redemptionOrder', {
                                    amount: money(redemption.order.amount, locale),
                                    status: REDEMPTION_ORDER_STATUSES.includes(
                                      redemption.order.status,
                                    )
                                      ? t(
                                          `admin.sections.pricing.redemptionOrderStatus.${redemption.order.status}`,
                                        )
                                      : redemption.order.status,
                                  })}
                                </span>
                              ) : null}
                            </li>
                          ))}
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
          {!isLoading && discountCodes.length > 0 && visibleDiscountCodes.length === 0 ? (
            <p className="admin-pricing__empty">
              {t('admin.sections.pricing.codeSearchNoResults', { query: codeQuery.trim() })}
            </p>
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
              {/* Con más de un invitado no se tipea un código: se genera uno
                  por persona y lo único que se elige es el prefijo. */}
              <div className="admin-pricing__batch-group">
                {draftInviteeCount > 1 ? (
                  <label title={t('admin.sections.pricing.batchPrefixHint')}>
                    <span>{t('admin.sections.pricing.batchPrefix')}</span>
                    <input
                      name="batchPrefix"
                      value={codeDraft.batchPrefix || ''}
                      onChange={(event) =>
                        setCodeDraft({
                          ...codeDraft,
                          batchPrefix: normalizeCodePrefix(event.target.value),
                        })
                      }
                    />
                    <small>
                      {/* El ejemplo es el formato real: dos bloques de cuatro,
                          sin caracteres que se confundan al dictarlos. */}
                      {t('admin.sections.pricing.batchPreview', {
                        count: draftInviteeCount,
                        example: codeDraft.batchPrefix
                          ? `${codeDraft.batchPrefix}-A7KP-3QMX`
                          : 'A7KP-3QMX',
                      })}
                    </small>
                  </label>
                ) : (
                  <label title={t('admin.sections.pricing.codeFormatHint')}>
                    <span>{t('admin.sections.pricing.code')}</span>
                    <input
                      name="code"
                      value={codeDraft.code}
                      onChange={(event) =>
                        setCodeDraft({ ...codeDraft, code: event.target.value.toUpperCase() })
                      }
                      required
                    />
                  </label>
                )}
              </div>
              <label title={t('admin.sections.pricing.codeKindHint')}>
                <span>{t('admin.sections.pricing.codeKindLabel')}</span>
                <select
                  value={draftCodeType}
                  onChange={(event) => {
                    const type = event.target.value
                    setCodeDraft({
                      ...codeDraft,
                      kind: type,
                      // Un precio promocional necesita alcance único: si venía
                      // en "afiliación e inscripción", se cae a afiliación.
                      appliesTo:
                        type === 'fixed_price' && codeDraft.appliesTo === 'both'
                          ? 'membership'
                          : codeDraft.appliesTo,
                    })
                  }}
                >
                  {CODE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`admin.sections.pricing.codeKind.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              {/* El importe es todo el contrato de un precio promocional. */}
              {draftCodeType === 'fixed_price' && codeDraft.mercadoPagoEnabled !== false ? (
                <label title={t('admin.sections.pricing.fixedPriceHint')}>
                  <span>{t('admin.sections.pricing.fixedPrice')}</span>
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
                </label>
              ) : null}
              {draftCodeType === 'fixed_price' ? (
                <label title={t('admin.sections.pricing.fixedPriceManualHint')}>
                  <span>{t('admin.sections.pricing.fixedPriceManual')}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={t('admin.sections.pricing.fixedPriceManualPlaceholder')}
                    value={codeDraft.fixedPriceManual}
                    onChange={(event) =>
                      setCodeDraft({
                        ...codeDraft,
                        fixedPriceManual: event.target.value,
                      })
                    }
                  />
                </label>
              ) : null}
              {draftCodeType !== 'percent' ? null : (
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
                  <option value="membership">
                    {t('admin.sections.pricing.appliesTo.membership')}
                  </option>
                  <option value="registration">
                    {t('admin.sections.pricing.appliesTo.registration')}
                  </option>
                  <option value="combo">{t('admin.sections.pricing.appliesTo.combo')}</option>
                  {draftCodeType === 'fixed_price' ? null : (
                    <option value="both">{t('admin.sections.pricing.appliesTo.both')}</option>
                  )}
                </select>
              </label>
              {/* Alcance por inscripción. Opcional: sin evento, el código vale
                  para cualquiera. Una promo pública no puede limitarse (ver
                  discount_codes_public_event_check). */}
              {['registration', 'combo'].includes(codeDraft.appliesTo) &&
              codeDraft.audience === 'code' ? (
                <label>
                  <span>{t('admin.sections.pricing.codeEventLabel')}</span>
                  <select
                    value={codeDraft.eventId ?? ''}
                    onChange={(event) =>
                      setCodeDraft({ ...codeDraft, eventId: event.target.value })
                    }
                  >
                    <option value="">{t('admin.sections.pricing.codeEventAny')}</option>
                    {(configuration.events ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                  <small>{t('admin.sections.pricing.codeEventHint')}</small>
                </label>
              ) : null}
              <label title={t('admin.sections.pricing.maxRedemptionsHint')}>
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
              </label>
              <label title={t('admin.sections.pricing.startsAtHint')}>
                <span>{t('admin.sections.pricing.startsAt')}</span>
                <input
                  type="datetime-local"
                  value={codeDraft.startsAt}
                  onChange={(event) => setCodeDraft({ ...codeDraft, startsAt: event.target.value })}
                />
              </label>
              <label title={t('admin.sections.pricing.expiresAtHint')}>
                <span>{t('admin.sections.pricing.expiresAt')}</span>
                <input
                  type="datetime-local"
                  value={codeDraft.expiresAt}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, expiresAt: event.target.value })
                  }
                />
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
              <label title={t('admin.sections.pricing.audienceHint')}>
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
                      // que el servidor va a rechazar. Sin canal manual tampoco
                      // hay financiamiento posible —y una promo que se aplica
                      // sola nunca financia—, así que cae con ellos.
                      manualChannels: audience === 'public' ? [] : (codeDraft.manualChannels ?? []),
                      financed: audience === 'public' ? false : codeDraft.financed,
                    })
                  }}
                >
                  <option value="code">{t('admin.sections.pricing.audience.code')}</option>
                  <option value="public">{t('admin.sections.pricing.audience.public')}</option>
                </select>
              </label>
              {/* Cómo se cobra el código: UNA decisión, no cuatro casillas cuya
                  validez dependía entre sí. Los tres modos cubren las tres
                  intenciones reales —pasarela, cobro a mano, y cobro a mano que
                  habilita al avisar el pago— y ninguna combinación inválida es
                  alcanzable. Los canales y la reapertura de la pasarela quedan
                  como ajuste de los modos manuales, donde recién ahí significan
                  algo. */}
              <fieldset
                className="admin-pricing__channels admin-pricing__wide"
                disabled={codeDraft.audience === 'public'}
                title={
                  codeDraft.audience === 'public'
                    ? t('admin.sections.pricing.manualChannelsPublicHint')
                    : t(`admin.sections.pricing.codePaymentModeHint.${draftPaymentMode}`)
                }
              >
                <legend>{t('admin.sections.pricing.codeChannelsLegend')}</legend>
                <label>
                  <span>{t('admin.sections.pricing.codePaymentModeLabel')}</span>
                  <select
                    value={draftPaymentMode}
                    onChange={(event) =>
                      setCodeDraft(applyCodePaymentMode(codeDraft, event.target.value))
                    }
                  >
                    {CODE_PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`admin.sections.pricing.codePaymentMode.${mode}`)}
                      </option>
                    ))}
                  </select>
                  <small>{t(`admin.sections.pricing.codePaymentModeHint.${draftPaymentMode}`)}</small>
                </label>
                {draftPaymentMode === 'mercado_pago' ? null : (
                  <div className="admin-pricing__channels-grid">
                    {MANUAL_PAYMENT_CHANNELS.map((channel) => (
                      <label className="admin-pricing__toggle" key={channel}>
                        <input
                          type="checkbox"
                          checked={(codeDraft.manualChannels ?? []).includes(channel)}
                          onChange={(event) => {
                            const manualChannels = event.target.checked
                              ? MANUAL_PAYMENT_CHANNELS.filter(
                                  (item) =>
                                    item === channel ||
                                    (codeDraft.manualChannels ?? []).includes(item),
                                )
                              : (codeDraft.manualChannels ?? []).filter((item) => item !== channel)
                            setCodeDraft({ ...codeDraft, manualChannels })
                          }}
                        />
                        <span>{t(`admin.sections.pricing.manualChannel.${channel}`)}</span>
                      </label>
                    ))}
                    {/* La pasarela vuelve a abrirse acá y sólo acá: un código
                        pactado a mano que además acepta Mercado Pago es un
                        acuerdo válido, pero es la excepción, no el punto de
                        partida. */}
                    <label className="admin-pricing__toggle">
                      <input
                        type="checkbox"
                        checked={codeDraft.mercadoPagoEnabled === true}
                        onChange={(event) =>
                          setCodeDraft({ ...codeDraft, mercadoPagoEnabled: event.target.checked })
                        }
                      />
                      <span>{t('admin.sections.pricing.codeAlsoMercadoPago')}</span>
                    </label>
                  </div>
                )}
                {/* Los dos callejones sin salida se avisan en el mismo fieldset
                    y antes de enviar: un código sin ningún medio no se puede
                    pagar, y un financiamiento sin canal manual no se puede
                    declarar. */}
                {draftHasNoChannel ? (
                  <p className="admin-pricing__channels-warning" role="alert">
                    {t('admin.sections.pricing.codeChannelsEmpty')}
                  </p>
                ) : null}
                {draftFinancingInert ? (
                  <p className="admin-pricing__channels-warning" role="alert">
                    {t('admin.sections.pricing.codeFinancingChannelRequired')}
                  </p>
                ) : null}
              </fieldset>
              <label 
                className="admin-pricing__wide" 
                title={
                  draftInviteeCount > 0
                    ? draftInviteeCount === 1
                      ? t('admin.sections.pricing.personalCodeHint')
                      : t('admin.sections.pricing.inviteesCountHint', { count: draftInviteeCount })
                    : t('admin.sections.pricing.inviteesHint')
                }
              >
                <span>{t('admin.sections.pricing.invitees')}</span>
                <textarea
                  rows={2}
                  placeholder={t('admin.sections.pricing.inviteesPlaceholder')}
                  value={codeDraft.inviteesText}
                  onChange={(event) =>
                    setCodeDraft({ ...codeDraft, inviteesText: event.target.value })
                  }
                />
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
