import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  ImageDown,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react'
import { env } from '../../config/env.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, formatShortStamp, money } from '../../lib/format.js'
import { describeDiscountPreviewError } from '../../lib/discountPreviewError.js'
import { resolveEventPricing } from '../../lib/eventPricing.js'
import { isPaidCheckoutOpen } from '../../lib/registrationSchedule.js'
import { ACCOUNT_OFFER_TAB, ACCOUNT_PAYMENTS_TAB } from '../../lib/navigation.js'
import { listMembershipPlans, paymentUpdateStatus } from '../../services/paymentService.js'
import { previewDiscountCode } from '../../services/athleteApi.js'
import {
  previewCheckoutPrice,
  toApiPaymentMethod,
  wisePriceLabel,
} from '../../services/checkoutPricing.js'
import { getEventComboAvailability } from '../../services/comboOfferService.js'
import {
  clearPendingPromotionCode,
  promotionBenefitPresentation,
  promotionDestination,
  promotionPaymentPresentation,
  promotionScarcityPresentation,
  readPendingPromotionCode,
  redeemPromotionCode,
  savePendingPromotionCode,
} from '../../services/promotionCodeService.js'
import {
  getMembershipLifecycle,
  isMembershipCurrent,
  MEMBERSHIP_LIFECYCLE,
} from '../../services/membershipService.js'
import MotionContentSwap from '../../motion/MotionContentSwap.tsx'
import CheckoutDesk, { CheckoutBar } from '../../components/checkout/CheckoutDesk.jsx'
import CodeScanButton from '../../components/ui/CodeScanButton.jsx'
import MercadoPagoEmbeddedCheckout from '../../components/ui/MercadoPagoEmbeddedCheckout.jsx'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import PromotionRevealModal from '../../components/ui/PromotionRevealModal.jsx'
import FeatureComingSoon from '../../components/ui/FeatureComingSoon.jsx'
import Reveal from '../../components/ui/Reveal.jsx'
import SeasonComboOffer from '../../components/ui/SeasonComboOffer.jsx'
import TransferPayModal from '../../components/checkout/TransferPayModal.jsx'
import ManualPaymentConfirmation from '../../components/checkout/ManualPaymentConfirmation.jsx'
import FinancedDebtNotice from '../../components/ui/FinancedDebtNotice.jsx'
import SegmentedSwitch from '../../components/ui/SegmentedSwitch.jsx'
import RegistrationAccessGateModal from '../../components/checkout/RegistrationAccessGateModal.jsx'
import PaymentRecoveryPanel from '../../components/checkout/PaymentRecoveryPanel.jsx'
import { fetchRegistrationAccessRequirements } from '../../services/registrationAccessService.js'
import { channelOpen } from '../../lib/paymentChannels.js'
import '../../styles/components/code-band.css'

export default function MembershipPurchaseSection({
  athlete,
  membership,
  onActivateMembership,
  onCancelMembership,
  onStartMembershipPayment,
  demoMode = false,
  gateEvent = null,
  events = [],
  onSelectEvent,
  checkoutAvailability = {},
  onNavigate,
  onNavigateSection,
  // Orden financiada abierta de esta persona: sostiene la afiliación que se ve
  // arriba y la puede dar de baja si vence. Se resuelve en AthleteProfilePage,
  // que es quien tiene la lista de pagos completa.
  pendingFinancedPayment = null,
}) {
  const { locale, t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferOrderId, setTransferOrderId] = useState(null)
  const [transferChannel, setTransferChannel] = useState('bank_transfer')
  const [transferAmount, setTransferAmount] = useState(null)
  const [manualOrder, setManualOrder] = useState(null)
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [embeddedOrder, setEmbeddedOrder] = useState(null)
  const [paymentRecovery, setPaymentRecovery] = useState(null)
  const [changingMethod, setChangingMethod] = useState(false)
  const [plans, setPlans] = useState([])
  const [planCode, setPlanCode] = useState('plu-annual')
  const [cardOpen, setCardOpen] = useState(false)
  // En mobile el destino natural es una historia de Instagram; en desktop,
  // el post cuadrado. Mismo criterio que QrCredentialSection. El usuario
  // puede cambiarlo dentro del modal.
  const [cardInitialFormat, setCardInitialFormat] = useState('square')
  function openCardModal() {
    const prefersStory =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
    setCardInitialFormat(prefersStory ? 'story' : 'square')
    setCardOpen(true)
  }
  const [plansState, setPlansState] = useState('loading')
  const [plansError, setPlansError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkoutIsError, setCheckoutIsError] = useState(false)
  const [discountCodeInput, setDiscountCodeInput] = useState('')
  const [discountPreview, setDiscountPreview] = useState(null)
  // Qué anunciar cuando el código resultó ser una promo con identidad propia.
  // Es el payload del resolvedor, no el preview económico: el preview dice
  // cuánto se paga, el resolvedor dice QUÉ se canjeó. El dato y "está abierto"
  // son dos cosas distintas: cerrar el anuncio no puede borrar lo anunciado, o
  // no queda nada para reabrir.
  const [revealPromotion, setRevealPromotion] = useState(null)
  const [revealOpen, setRevealOpen] = useState(false)
  // Oferta exclusiva recién canjeada desde esta pantalla. No entra al cálculo
  // del precio de la afiliación: la oferta se compra en el checkout del torneo.
  // Acá sólo se confirma el canje y se ofrece la ficha donde vive.
  const pendingPromotionAppliedRef = useRef(null)
  // Promoción que corre para todos y se aplica sola dentro de la transacción de
  // compra. Se guarda aparte del cupón tipeado porque son dos cosas distintas:
  // el cupón se puede quitar, la promo pública no es del atleta. Si hay cupón,
  // manda el cupón — la orden lleva un solo descuento.
  const [publicPromo, setPublicPromo] = useState(null)
  const [discountChecking, setDiscountChecking] = useState(false)
  const [discountError, setDiscountError] = useState('')
  const [discountOpen, setDiscountOpen] = useState(false)
  const discountInputRef = useRef(null)
  const [membershipAccessRequired, setMembershipAccessRequired] = useState(false)
  // Mercado Pago es el único canal inicial. Transferencia y efectivo requieren
  // una habilitación explícita desde Administración: arrancar en `false` evita
  // que el selector muestre esos medios un instante y falle con 409 al enviar.
  const [manualChannelEnabled, setManualChannelEnabled] = useState(false)
  const [membershipAccessCode, setMembershipAccessCode] = useState('')
  const [accessUnlocked, setAccessUnlocked] = useState(false)
  const [accessGateOpen, setAccessGateOpen] = useState(false)
  // Vigencia y no `status === 'activa'`: es la condición que exige la RPC de
  // inscripción y la que responde la puerta al escanear. Una fila marcada
  // activa con fechas vencidas daba acá una afiliación "al día", escondía el
  // botón de renovar —única salida del atleta— y ofrecía una credencial con
  // una fecha ya pasada como si sirviera.
  const membershipLifecycle = getMembershipLifecycle(membership)
  const membershipActive = isMembershipCurrent(membership)
  const membershipExpired = membershipLifecycle === MEMBERSHIP_LIFECYCLE.EXPIRED
  const membershipScheduled = membershipLifecycle === MEMBERSHIP_LIFECYCLE.SCHEDULED
  const membershipCancelled = membershipLifecycle === MEMBERSHIP_LIFECYCLE.CANCELLED
  const membershipRefunded = membershipLifecycle === MEMBERSHIP_LIFECYCLE.REFUNDED
  // Una transferencia con comprobante ya enviado no se puede reemplazar por
  // otro medio: Finanzas tiene que revisar ese comprobante primero. Evita que
  // el atleta cancele sin querer la orden que está en validación.
  const transferUnderReview = membership?.paymentStatus === 'validacion_manual'
  const membershipCanPurchase = !membershipActive && !membershipScheduled && !transferUnderReview
  const publicMembershipCheckoutEnabled = checkoutAvailability.membershipEnabled !== false
  const publicManualChannelEnabled = checkoutAvailability.membershipManualEnabled !== false
  const paidCheckoutOpen =
    isPaidCheckoutOpen(gateEvent, env, new Date(), { checkoutKind: 'membership' }) &&
    publicMembershipCheckoutEnabled
  // El interruptor general puede seguir apagado: un código de promoción
  // destraba puntualmente los canales que declara, y sólo esos.
  const codeChannels = discountPreview?.manualChannels ?? []
  const activeDiscount = discountPreview ?? publicPromo
  const manualChannelsOpenGlobally = manualChannelEnabled && publicManualChannelEnabled
  // Transferencia y efectivo siguen anunciados como "próximamente" para el
  // caso general (decisión de producto: la afiliación se cobra por Mercado
  // Pago). Un código que los habilita explícitamente sí los vuelve operables:
  // es exactamente para eso que existe.
  const transferEnabledGlobally = checkoutAvailability.paymentChannels?.membership?.bank_transfer === true
  const cashEnabledGlobally = checkoutAvailability.paymentChannels?.membership?.cash_pitbull === true
  const transferSelectable = transferEnabledGlobally || codeChannels.includes('bank_transfer')
  const cashSelectable = cashEnabledGlobally || codeChannels.includes('cash_pitbull')
  const transferOffered = transferSelectable || (manualChannelsOpenGlobally && transferEnabledGlobally)
  const cashOffered = cashSelectable || (manualChannelsOpenGlobally && cashEnabledGlobally)
  // La pasarela también se cierra por concepto desde Administración. Un cupón no
  // la reabre —para eso sólo sirven los canales manuales—, pero sí la puede
  // cerrar: un código pactado a un precio que sólo cierra por transferencia o
  // en efectivo viaja con `mercadoPagoEnabled: false` (20260908100000) y la RPC
  // rechaza la orden con PLU28.
  const codeClosesMercadoPago =
    discountPreview?.valid && discountPreview.mercadoPagoEnabled === false
  const mercadoPagoOffered =
    !codeClosesMercadoPago && channelOpen(checkoutAvailability, 'membership', 'mercado_pago')
  // Wise tiene interruptor propio, independiente del canal manual local y de
  // los cupones que lo destraban.
  // Wise se ofrece únicamente para inscripciones; una afiliación siempre se
  // cobra en ARS por Mercado Pago, transferencia o efectivo.
  const wiseOffered = false
  const showPurchaseCheckout = membershipCanPurchase && paidCheckoutOpen
  const showCheckoutSoon = membershipCanPurchase && !paidCheckoutOpen
  // El combo se ofrece antes de vender la afiliación sola: el próximo evento
  // con oferta vigente es el candidato natural, no cualquiera del calendario.
  const comboEvent = useMemo(() => {
    if (!membershipCanPurchase) return null
    const eligible = events
      .filter((event) => getEventComboAvailability(event, { hasActiveMembership: false }).enabled)
      .sort((a, b) => new Date(a.dateISO ?? a.date ?? 0) - new Date(b.dateISO ?? b.date ?? 0))
    return eligible[0] ?? null
  }, [events, membershipCanPurchase])
  const comboOffer = comboEvent?.comboOffer ?? null
  const comboPricing = comboEvent ? resolveEventPricing(comboEvent) : null
  const cardData = membershipActive
    ? {
        athleteName: athlete.fullName,
        athleteCode: membership.memberCode,
        athletePhotoUrl: athlete.photoUrl,
        // El QR apunta a la persona, no al período: la credencial impresa
        // sobrevive a la renovación. `qrToken` queda de fallback para una
        // cuenta cuyo snapshot todavía no trae el token nuevo.
        qrCode: athlete.credentialToken ?? membership.qrToken,
        membershipExpiration: membership.expirationDate
          ? formatShortDate(membership.expirationDate, locale)
          : undefined,
        variant: 'membership',
        eventSlug: 'afiliacion',
      }
    : null
  const methodLabel =
    paymentMethod === 'mercado_pago'
      ? 'Mercado Pago'
      : paymentMethod === 'wise_transfer'
        ? t('pages.register.paymentWiseLabel')
        : t('account.membership.transfer')
  const availablePlans = plans
  const selectedPlan = availablePlans.find((plan) => plan.code === planCode) ?? availablePlans[0]
  const membershipMethodPrice = (method) => {
    if (!selectedPlan) return ''
    const amount =
      method === 'mercado_pago'
        ? selectedPlan.price
        : selectedPlan.manualPrice ?? selectedPlan.price
    return Number.isFinite(Number(amount)) ? money(Number(amount), locale) : ''
  }
  const selectedPlanPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: selectedPlan?.manualPrice,
    fallback: selectedPlan?.price ?? 0,
  })
  const catalogPrice = Number(selectedPlan?.price ?? 0)
  const planManualPrice =
    selectedPlan?.manualPrice == null ? null : Number(selectedPlan.manualPrice)
  const planHasManualDiscount =
    planManualPrice != null &&
    Number.isFinite(planManualPrice) &&
    Number.isFinite(catalogPrice) &&
    planManualPrice < catalogPrice
  const isManualPaymentChannel =
    paymentMethod === 'transferencia' || paymentMethod === 'cash_pitbull'
  const checkoutDisplayTotal = activeDiscount ? activeDiscount.finalAmount : selectedPlanPrice
  const showChannelCompare =
    isManualPaymentChannel &&
    planHasManualDiscount &&
    Number(checkoutDisplayTotal) < catalogPrice
  const channelCompareLabel = showChannelCompare
    ? t('comboDeal.compare', { amount: money(catalogPrice, locale) })
    : ''
  const channelCompareTotal = showChannelCompare ? catalogPrice : null
  const manualMethodDetail = planHasManualDiscount ? money(planManualPrice, locale) : ''
  const checkoutLocked = submitting || (Boolean(embeddedOrder) && !changingMethod)
  // Tanda privada abierta por el admin y todavía sin contraseña validada.
  const accessLocked = membershipAccessRequired && !accessUnlocked
  const ctaDisabled = !selectedPlan || submitting
  // Igual que el settle de inscripción a torneo: en cuanto hay una orden de
  // Mercado Pago, la propia sección se convierte en la pantalla de cobro en
  // vez de abrir un modal aparte — con la flecha de "cambiar método" para
  // volver al selector sin quedar trabado.
  const mpSettling =
    Boolean(embeddedOrder) && embeddedOrder.paymentMethod === 'mercado_pago' && !changingMethod
  const oneTimePlan = useMemo(
    () => availablePlans.find((plan) => plan.collectionMode !== 'recurring') ?? null,
    [availablePlans],
  )
  const recurringPlan = useMemo(
    () => availablePlans.find((plan) => plan.collectionMode === 'recurring') ?? null,
    [availablePlans],
  )
  const billingSwitchEnabled = Boolean(oneTimePlan && recurringPlan)
  const billingMode = selectedPlan?.collectionMode === 'recurring' ? 'recurring' : 'one_time'
  const billingOptions = useMemo(() => {
    if (!billingSwitchEnabled) {
      return availablePlans.map((plan) => [
        plan.code,
        plan.name,
        plan.collectionMode === 'recurring'
          ? t('account.membership.planModeAutomaticShort')
          : t('account.membership.planModeAnnualShort'),
      ])
    }
    return [
      [
        'one_time',
        t('account.membership.planModeAnnual'),
        t('account.membership.planModeAnnualShort'),
      ],
      [
        'recurring',
        t('account.membership.planModeAutomatic'),
        t('account.membership.planModeAutomaticShort'),
      ],
    ]
  }, [availablePlans, billingSwitchEnabled, t])
  const billingHint =
    billingMode === 'recurring'
      ? t('account.membership.planModeAutomaticHint')
      : t('account.membership.planModeAnnualHint')
  const showPlanSwitch = availablePlans.length > 1
  const ctaLabel = submitting
    ? t('account.membership.creatingOrder')
    : embeddedOrder
      ? t('account.membership.continuePayment')
      : t('account.membership.continueWith', { method: methodLabel })

  const loadPlans = useCallback(
    async ({ force = false, signal } = {}) => {
      setPlansState('loading')
      setPlansError('')
      try {
        const { plans: nextPlans } = await listMembershipPlans({ force })
        if (signal?.aborted) return
        setPlans(nextPlans ?? [])
        if (nextPlans?.length) {
          setPlanCode((current) => {
            if (nextPlans.some((plan) => plan.code === current)) return current
            const preferredMode =
              typeof sessionStorage !== 'undefined'
                ? sessionStorage.getItem('plu.membership.billingMode')
                : null
            if (preferredMode === 'recurring' || preferredMode === 'one_time') {
              const match = nextPlans.find((plan) =>
                preferredMode === 'recurring'
                  ? plan.collectionMode === 'recurring'
                  : plan.collectionMode !== 'recurring',
              )
              if (match) {
                sessionStorage.removeItem('plu.membership.billingMode')
                return match.code
              }
            }
            return nextPlans[0].code
          })
        }
        setPlansState('ready')
      } catch (error) {
        if (signal?.aborted) return
        setPlansError(error?.message ?? t('account.membership.planLoadError'))
        setPlansState('error')
      }
    },
    [t],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadPlans({ signal: controller.signal })
    return () => controller.abort()
  }, [loadPlans])

  useEffect(() => {
    let active = true
    fetchRegistrationAccessRequirements()
      .then((requirements) => {
        if (!active) return
        setMembershipAccessRequired(requirements.membership)
        setManualChannelEnabled(requirements.membershipManualEnabled)
      })
      .catch(() => {
        if (active) {
          setMembershipAccessRequired(false)
          setManualChannelEnabled(false)
        }
      })
    return () => {
      active = false
    }
  }, [checkoutAvailability.membershipEnabled, checkoutAvailability.membershipManualEnabled])

  /**
   * La puerta salta sola en cuanto se sabe que la afiliación está restringida:
   * el atleta no llega a elegir plan ni medio de pago sin la contraseña.
   */
  useEffect(() => {
    if (!membershipAccessRequired) {
      setAccessUnlocked(false)
      setMembershipAccessCode('')
      setAccessGateOpen(false)
      return
    }
    setAccessGateOpen(true)
  }, [membershipAccessRequired])

  useEffect(() => {
    if (paymentMethod === 'mercado_pago') return
    // Plan recurrente, o un medio que no quedó operable (canal cerrado, o el
    // código aplicado no habilita justo ese): se vuelve a la pasarela, que es el
    // único medio para un plan recurrente. Si la pasarela está cerrada, la
    // selección se queda donde está y el escritorio de cobro muestra sólo lo
    // que sí se puede pagar.
    const methodOperable =
      selectedPlan?.collectionMode !== 'recurring' &&
      ((paymentMethod === 'transferencia' && transferSelectable) ||
        (paymentMethod === 'cash_pitbull' && cashSelectable) ||
        (paymentMethod === 'wise_transfer' && wiseOffered))
    if (!methodOperable && mercadoPagoOffered) setPaymentMethod('mercado_pago')
  }, [
    cashSelectable,
    mercadoPagoOffered,
    paymentMethod,
    selectedPlan?.collectionMode,
    transferSelectable,
    wiseOffered,
  ])

  async function applyDiscountCode(codeOverride) {
    const override = typeof codeOverride === 'string' ? codeOverride : null
    const code = (override ?? discountCodeInput).trim().toUpperCase()
    if (!code || !selectedPlan) return
    /*
     * Recotización: el mismo código ya está aplicado y lo único que cambió es
     * el canal, que puede cobrar otro importe. No vuelve a pasar por el
     * resolvedor —sería un evento de embudo y un round-trip de más por cada
     * cambio de medio de pago, además de reintentar el unlock— y tampoco vuelve
     * a resolver destino: ese canje ya llegó acá. Mismo criterio que el
     * checkout de inscripción, donde esta guarda existía sólo para el código de
     * la oferta.
     */
    const repricing = discountPreview?.valid === true && discountPreview.code === code
    setDiscountChecking(true)
    setDiscountError('')
    setDiscountPreview(null)
    try {
      let resolution = null
      if (!repricing) {
        try {
          resolution = await redeemPromotionCode(code, {
            surface: 'membership',
            planCode: selectedPlan.code,
          })
        } catch {
          // Compatibilidad durante despliegues escalonados: el preview económico
          // existente sigue operativo aunque el resolvedor nuevo aún no responda.
        }
        const resolvedDestination = promotionDestination(resolution)
        // Un código de combo abre su propia ficha (20260926100000): no se puede
        // previsualizar contra una afiliación suelta —el preview lo rechaza por
        // alcance— y su beneficio no cabe en la banda de este checkout. Se
        // acompaña al destino que resolvió el servidor, sea el torneo o la ficha
        // del paquete, con el código guardado para que llegue aplicado.
        const opensElsewhere =
          resolvedDestination?.view === 'competition' ||
          (resolvedDestination?.view === 'profile' &&
            resolvedDestination.options?.tab === ACCOUNT_OFFER_TAB)
        if (resolution?.accepted && opensElsewhere) {
          savePendingPromotionCode(resolution.code, {
            surface: 'membership',
            destination: resolution.destination,
            resolved: true,
          })
          if (resolvedDestination.view === 'profile') {
            onNavigateSection?.(resolvedDestination.options.tab)
          } else {
            onNavigate?.(resolvedDestination.view, resolvedDestination.options)
          }
          return
        }
      }

      const preview = await previewDiscountCode({
        code,
        appliesTo: 'membership',
        planCode: selectedPlan.code,
        paymentMethod: toApiPaymentMethod(paymentMethod),
      })
      if (!preview.valid) {
        setDiscountError(
          describeDiscountPreviewError(t, preview, 'account.membership.discountError'),
        )
        return
      }
      setDiscountPreview(preview)
      // El anuncio sale una sola vez y sólo cuando el resolvedor reconoció una
      // promo: un cupón suelto no tiene nada que anunciar más allá del precio
      // que ya se recalculó abajo. Va después del preview a propósito — si el
      // preview rebota, no se festeja nada.
      if (resolution?.accepted) {
        setRevealPromotion(resolution)
        setRevealOpen(true)
      }
      clearPendingPromotionCode()
    } catch (error) {
      setDiscountError(error?.message ?? t('account.membership.discountError.not_found'))
    } finally {
      setDiscountChecking(false)
    }
  }

  useEffect(() => {
    if (!selectedPlan) return
    const pending = readPendingPromotionCode()
    if (!pending || pendingPromotionAppliedRef.current === pending.code) return
    const destination = pending.context?.destination
    // El pendiente sólo se aplica solo cuando el resolvedor ya dijo que esta
    // ficha es su destino: el código no se canjea desde ninguna página pública,
    // así que llegó de otro checkout que lo resolvió antes de mandarlo acá.
    if (destination?.view !== 'profile' || destination?.tab !== 'account-membership') return
    pendingPromotionAppliedRef.current = pending.code
    setDiscountCodeInput(pending.code)
    void applyDiscountCode(pending.code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan?.code])

  // El ahorro depende del canal (transferencia paga menos que Mercado Pago), así
  // que cambiar de medio después de aplicar el cupón dejaba en pantalla un
  // descuento calculado sobre el precio anterior. Se revalida contra el canal
  // nuevo en vez de obligar al atleta a volver a tipear el código.
  useEffect(() => {
    if (!discountPreview) return
    void applyDiscountCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod])

  // La promo pública se aplica sola al crear la orden. Sin este preview el
  // checkout anunciaría el precio de lista y cobraría otro. Depende del plan y
  // del canal por el mismo motivo que el cupón.
  //
  // Con un cupón en juego no se consulta: el cupón gana (`activeDiscount`) y la
  // promo pública no se muestra ni se cobra, así que era un pedido por cada
  // cambio de plan o de canal cuyo resultado nadie leía. Al quitar el cupón el
  // efecto vuelve a correr y la repuebla.
  //
  // `discountChecking` entra en la condición porque recotizar limpia el preview
  // por un instante: sin eso, cada cambio de canal volvía a disparar la consulta
  // en ese hueco. Y no se apaga `publicPromo` acá —sólo se deja de pedir— para
  // no parpadear la línea de promo mientras se valida un código que puede
  // terminar rechazado.
  const hasAppliedCode = discountChecking || discountPreview?.valid === true
  useEffect(() => {
    if (!selectedPlan) {
      setPublicPromo(null)
      return undefined
    }
    if (hasAppliedCode) return undefined
    let cancelled = false
    void (async () => {
      try {
        const preview = await previewDiscountCode({
          appliesTo: 'membership',
          planCode: selectedPlan.code,
          paymentMethod: toApiPaymentMethod(paymentMethod),
        })
        if (!cancelled) setPublicPromo(preview.valid ? preview : null)
      } catch {
        // Una promo que no se pudo consultar no bloquea la compra: se cobra el
        // precio de lista y, si existía, la orden la aplica igual.
        if (!cancelled) setPublicPromo(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hasAppliedCode, paymentMethod, selectedPlan])

  function clearDiscountCode() {
    setDiscountCodeInput('')
    setDiscountPreview(null)
    setRevealPromotion(null)
    setRevealOpen(false)
    setDiscountError('')
    setDiscountOpen(false)
  }

  const showPaymentRecovery = useCallback(({ order = embeddedOrder, stage = 'result' } = {}) => {
    setPaymentRecovery({
      amount: order?.amount ?? selectedPlan?.price ?? null,
      concept: order?.concept ?? selectedPlan?.name ?? '',
      currency: order?.currency ?? 'ARS',
      reference: order?.reference ?? '',
      stage,
    })
  }, [embeddedOrder, selectedPlan?.name, selectedPlan?.price])

  const handleMercadoPagoResult = useCallback((response) => {
    const status = paymentUpdateStatus(response?.payment?.status ?? response?.order?.status)
    if (status === 'rechazado' || status === 'cancelado') {
      showPaymentRecovery({
        order: response?.order ?? embeddedOrder,
        stage: 'result',
      })
    } else if (status === 'aprobado') {
      setPaymentRecovery(null)
    }
  }, [embeddedOrder, showPaymentRecovery])

  const handleMercadoPagoError = useCallback(({ stage } = {}) => {
    showPaymentRecovery({ stage })
  }, [showPaymentRecovery])

  function openDiscountField() {
    if (checkoutLocked) return
    setDiscountOpen(true)
    setDiscountError('')
  }

  useEffect(() => {
    if (!discountOpen || discountPreview) return
    discountInputRef.current?.focus()
  }, [discountOpen, discountPreview])

  async function startMembershipPayment(methodOverride) {
    const method = methodOverride ?? paymentMethod
    if (submitting) return
    setCheckoutMessage('')
    setCheckoutIsError(false)
    setPaymentRecovery(null)
    if (!selectedPlan) {
      setCheckoutMessage(t('account.membership.planUnavailable'))
      setCheckoutIsError(true)
      return
    }
    // Tanda privada sin desbloquear: en vez de mandar el alta a un 403, se pide
    // la contraseña acá. El backend igual la revalida al crear la orden.
    if (accessLocked) {
      setAccessGateOpen(true)
      return
    }

    setSubmitting(true)
    try {
      const result = await onStartMembershipPayment?.(
        method,
        selectedPlan.code,
        discountPreview?.code ?? '',
        membershipAccessCode,
      )
      if (result?.error) {
        if (method === 'mercado_pago') showPaymentRecovery({ stage: 'order' })
        setCheckoutMessage(result.error)
        setCheckoutIsError(true)
        return
      }
      if (method === 'transferencia' || method === 'wise_transfer') {
        // Puede venir de cambiar de método con una orden de Mercado Pago
        // todavía pendiente: esa pantalla de settle deja de tener sentido en
        // cuanto se abre el modal de transferencia.
        setEmbeddedOrder(null)
        setChangingMethod(false)
        // El id de la orden habilita la subida del comprobante dentro del mismo
        // modal: es el momento en que el atleta tiene el ticket bancario a mano.
        setTransferOrderId(result?.createdOrder?.paymentId ?? null)
        setTransferChannel(method === 'wise_transfer' ? 'wise_transfer' : 'bank_transfer')
        setTransferAmount(result?.createdOrder?.amount ?? null)
        setManualOrder(result?.createdOrder ?? null)
        setTransferOpen(true)
        return
      }
      if (method === 'cash_pitbull') {
        setEmbeddedOrder(null)
        setChangingMethod(false)
        setManualOrder(result?.createdOrder ?? null)
        setCheckoutMessage(t('account.membership.cashPitbullCreated'))
        return
      }
      if (result?.createdOrder) {
        setEmbeddedOrder(result.createdOrder)
        setChangingMethod(false)
        return
      }
      setCheckoutMessage(t('account.membership.checkoutUnavailable'))
      setCheckoutIsError(true)
    } catch (error) {
      setCheckoutMessage(error?.message ?? t('account.membership.checkoutUnavailable'))
      setCheckoutIsError(true)
    } finally {
      setSubmitting(false)
    }
  }

  function handleCheckoutAction() {
    void startMembershipPayment()
  }

  function handleAccessUnlock({ membershipCode }) {
    setMembershipAccessCode(membershipCode)
    setAccessUnlocked(true)
    setAccessGateOpen(false)
  }

  function changePlan(nextPlanCode) {
    if (checkoutLocked) return
    setPlanCode(nextPlanCode)
    setCheckoutMessage('')
    setCheckoutIsError(false)
    clearDiscountCode()
  }

  function changeBillingMode(nextMode) {
    if (checkoutLocked) return
    if (billingSwitchEnabled) {
      const nextPlan = nextMode === 'recurring' ? recurringPlan : oneTimePlan
      if (nextPlan) changePlan(nextPlan.code)
      return
    }
    changePlan(nextMode)
  }

  function changePaymentMethod(nextMethod) {
    if (checkoutLocked) return
    if (nextMethod !== 'cash_pitbull') setManualOrder(null)
    setPaymentMethod(nextMethod)
    setCheckoutMessage('')
    setCheckoutIsError(false)
  }

  function simulateMembershipPayment() {
    const result = onActivateMembership?.(athlete.id)
    if (result?.error) {
      setCheckoutMessage(result.error)
      setCheckoutIsError(true)
      return
    }
    setCheckoutIsError(false)
    setCheckoutMessage(t('account.membership.paymentSimulated'))
  }

  function cancelMembership() {
    onCancelMembership?.(athlete.id)
    setCheckoutIsError(false)
    setCheckoutMessage(t('account.membership.cancelledMessage'))
  }

  let statusTone = 'pending'
  let statusLabel = t('account.membership.statusPending')
  let statusValue = t('account.membership.statusNoPayment')
  let statusMeta = ''
  let statusNext = t('account.membership.nextPending')

  if (membershipActive) {
    statusTone = 'active'
    statusLabel = t('account.membership.statusActive')
    statusValue = membership.memberCode
    statusMeta = membership.expirationDate
      ? t('account.membership.validUntil', {
          date: formatShortDate(membership.expirationDate, locale),
        })
      : ''
    statusNext = t('account.membership.nextActive')
  } else if (membershipScheduled) {
    statusTone = 'scheduled'
    statusLabel = t('account.membership.statusScheduled')
    statusValue = membership.startDate
      ? t('account.membership.startsOn', { date: formatShortDate(membership.startDate, locale) })
      : t('account.membership.statusScheduledValue')
    statusMeta = membership.expirationDate
      ? t('account.membership.validUntil', {
          date: formatShortDate(membership.expirationDate, locale),
        })
      : ''
    statusNext = t('account.membership.nextScheduled')
  } else if (transferUnderReview) {
    // El hold operativo manda: Finanzas está mirando el comprobante. Una fila
    // cancelada o vencida no puede tapar ese mensaje ni reabrir el checkout.
    statusTone = 'pending'
    statusLabel = t('account.membership.manualValidation')
    statusValue = t('account.membership.transferUnderReviewValue')
    statusNext = t('account.membership.transferUnderReviewNext')
  } else if (membershipExpired) {
    statusTone = 'expired'
    statusLabel = t('account.membership.statusExpired')
    statusValue = t('account.membership.statusExpiredValue')
    statusMeta = membership.expirationDate
      ? t('account.membership.expiredOn', {
          date: formatShortDate(membership.expirationDate, locale),
        })
      : ''
    statusNext = t('account.membership.nextRenew')
  } else if (membershipCancelled) {
    statusTone = 'cancelled'
    statusLabel = t('account.membership.statusCancelled')
    statusValue = t('account.membership.statusCancelledValue')
    statusNext = t('account.membership.nextRenew')
  } else if (membershipRefunded) {
    statusTone = 'cancelled'
    statusLabel = t('account.membership.statusRefunded')
    statusValue = t('account.membership.statusRefundedValue')
    statusNext = t('account.membership.nextRefunded')
  }

  return (
    <section
      id="account-membership"
      className={[
        'account-section',
        'account-section--gold',
        'account-membership',
        transferUnderReview ? 'account-membership--hold' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {membershipCanPurchase || transferUnderReview ? (
        <header className="account-membership__banner">
          <div className="account-membership__banner-copy">
            <div className="account-membership__banner-meta">
              <span className="account-membership__eyebrow">{t('account.membership.eyebrow')}</span>
              <p
                className={`account-membership__status-line account-membership__status-line--${statusTone}`}
              >
                <span className="account-membership-status__label">{statusLabel}</span>
                <span aria-hidden className="account-membership__status-sep">
                  ·
                </span>
                <span className="account-membership-status__value">{statusValue}</span>
              </p>
            </div>
            <h2>
              {transferUnderReview
                ? t('account.membership.transferUnderReviewTitle')
                : t('account.membership.title')}
            </h2>
            <p className="account-section__lead">
              {transferUnderReview
                ? t('account.membership.transferUnderReviewNext')
                : paidCheckoutOpen
                  ? t('account.membership.lead')
                  : t('account.membership.leadCheckoutSoon')}
            </p>
            {!transferUnderReview && statusTone !== 'pending' && statusNext ? (
              <p className="account-membership__banner-next">{statusNext}</p>
            ) : null}
            {statusMeta ? (
              <p className="account-membership__banner-meta-line">{statusMeta}</p>
            ) : null}
          </div>
        </header>
      ) : (
        <header className="account-membership__header">
          <div className="account-membership__intro">
            <div className="account-section__heading">
              <div className="account-section__icon account-section__icon--gold">
                <ShieldCheck size={21} />
              </div>
              <div>
                <span>{t('account.membership.eyebrow')}</span>
                <h2>{t('account.membership.titleActive')}</h2>
              </div>
            </div>
            <p className="account-section__lead">
              {membershipScheduled
                ? t('account.membership.nextScheduled')
                : t('account.membership.leadActive')}
            </p>
          </div>
        </header>
      )}

      {/* La afiliación puede estar activa porque PLU la financió, no porque
          esté paga. El aviso va debajo del estado —el derecho que se puede
          perder— y no en la ficha de Pagos, donde habría que ir a buscarlo.
          Va fuera de las dos ramas del encabezado a propósito: la deuda existe
          igual esté la afiliación activa o todavía en compra. */}
      <FinancedDebtNotice
        payment={pendingFinancedPayment}
        scope="membership"
        onSettle={() => onNavigateSection?.(ACCOUNT_PAYMENTS_TAB)}
      />

      {!membershipCanPurchase && !transferUnderReview ? (
        <div className={`account-membership-status account-membership-status--${statusTone}`}>
          <div className="account-membership-status__copy">
            <span className="account-membership-status__label">{statusLabel}</span>
            <span className="account-membership-status__value">{statusValue}</span>
          </div>
          {statusMeta || (!membershipScheduled && statusNext) ? (
            <div className="account-membership-status__aside">
              {statusMeta ? (
                <span className="account-membership-status__meta">{statusMeta}</span>
              ) : null}
              {!membershipScheduled && statusNext ? (
                <span className="account-membership-status__next">{statusNext}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {membershipActive && (
        <div className="account-card-share">
          <span className="account-card-share__label">{t('account.membership.cardEyebrow')}</span>
          <h2>{t('account.membership.cardTitle')}</h2>
          <p>{t('account.membership.cardLead')}</p>
          <button type="button" className="card-trigger-btn" onClick={openCardModal}>
            <ImageDown className="card-trigger-btn__icon" size={16} aria-hidden />
            {t('account.membership.cardAction')}
          </button>
          <CardPreviewModal
            open={cardOpen}
            onClose={() => setCardOpen(false)}
            cardData={cardData}
            initialFormat={cardInitialFormat}
          />
        </div>
      )}

      {showCheckoutSoon ? (
        <FeatureComingSoon
          className="account-membership__checkout-soon"
          eyebrow={t('account.membership.checkoutSoonEyebrow')}
          icon={CalendarClock}
          lead={t('account.membership.checkoutSoonLead')}
          role="status"
          title={t('account.membership.checkoutSoonTitle')}
          variant="inline"
        />
      ) : null}

      {showPurchaseCheckout && comboEvent && comboOffer ? (
        <Reveal className="account-membership__combo" variant="up">
          <p className="account-membership__combo-kicker">
            {t('account.membership.comboKicker', { event: comboEvent.title })}
          </p>
          <SeasonComboOffer
            variant="band"
            membershipPrice={comboPricing?.membership}
            registrationPrice={comboPricing?.registration}
            comboPrice={comboOffer.price}
            endsAt={comboOffer.endsAt}
            onCta={() => onSelectEvent?.(comboEvent)}
          />
        </Reveal>
      ) : null}

      {showPurchaseCheckout && (
        <div className="account-membership__decision account-membership__decision--solo">
          <ul
            className="account-benefits account-benefits--inline"
            aria-label={t('account.membership.includes')}
          >
            <li>
              <Check size={14} aria-hidden /> {t('account.membership.benefitCredential')}
            </li>
            <li>
              <Check size={14} aria-hidden /> {t('account.membership.benefitCode')}
            </li>
            <li>
              <Check size={14} aria-hidden /> {t('account.membership.benefitEvents')}
            </li>
          </ul>

          {mpSettling ? (
            <div className="account-membership__settle">
              <div className="account-membership__settle-bar">
                <button
                  type="button"
                  className="account-membership__settle-back"
                  onClick={() => setChangingMethod(true)}
                >
                  <ArrowLeft size={15} aria-hidden />
                  {t('account.membership.changePaymentMethod')}
                </button>
              </div>
              <MercadoPagoEmbeddedCheckout
                onCheckoutError={handleMercadoPagoError}
                onResult={handleMercadoPagoResult}
                order={embeddedOrder}
                presentation="settle"
              />
              {paymentRecovery ? (
                <PaymentRecoveryPanel
                  amount={paymentRecovery.amount}
                  concept={paymentRecovery.concept}
                  currency={paymentRecovery.currency}
                  onTransfer={() => void startMembershipPayment('transferencia')}
                  reference={paymentRecovery.reference}
                  transferAvailable={transferSelectable}
                  transferBusy={submitting}
                />
              ) : null}
            </div>
          ) : (
            <div className="account-membership__checkout">
              {changingMethod && embeddedOrder ? (
                <button
                  type="button"
                  className="account-membership__settle-back"
                  onClick={() => setChangingMethod(false)}
                >
                  <ArrowLeft size={15} aria-hidden />
                  {t('account.membership.backToMercadoPago')}
                </button>
              ) : null}
              {plansState === 'loading' ? (
                <p className="account-plan-feedback" role="status">
                  {t('account.membership.planLoading')}
                </p>
              ) : null}
              {plansState === 'error' || (plansState === 'ready' && !selectedPlan) ? (
                <div className="account-plan-feedback account-plan-feedback--error" role="alert">
                  <AlertCircle size={16} aria-hidden />
                  <span>{plansError || t('account.membership.planLoadError')}</span>
                  <button type="button" onClick={() => loadPlans({ force: true })}>
                    <RefreshCw size={14} aria-hidden />
                    {t('account.membership.retryPlans')}
                  </button>
                </div>
              ) : null}

              {showPlanSwitch ? (
                <div className={`account-membership__billing${checkoutLocked ? ' is-locked' : ''}`}>
                  <div className="account-membership__billing-head">
                    <span
                      className="account-membership__billing-label"
                      id="membership-billing-label"
                    >
                      {t('account.membership.planModeLegend')}
                    </span>
                    <p className="account-membership__billing-hint">{billingHint}</p>
                  </div>
                  <SegmentedSwitch
                    active={billingSwitchEnabled ? billingMode : (selectedPlan?.code ?? '')}
                    ariaLabel={t('account.membership.planModeLegend')}
                    className="segmented-switch--membership"
                    onChange={changeBillingMode}
                    options={billingOptions}
                  />
                </div>
              ) : null}

              {selectedPlan ? (
                <div className="account-discount">
                  {!discountPreview && publicPromo ? (
                    <p className="account-discount__applied account-discount__applied--public">
                      <Tag size={14} aria-hidden />
                      {publicPromo.description ||
                        t('account.membership.publicPromoApplied', {
                          amount: money(publicPromo.discountAmount, locale),
                        })}
                    </p>
                  ) : null}
                  {discountPreview ? (
                    /* Aplicado: el mismo registro que el canje universal y el
                       campo de inscripción — código e importe separados dentro
                       de la banda, con su palabra ("pagás" o "ahorrás"). */
                    <div className="account-discount__applied">
                      <div className="code-band" data-state="applied">
                        <span className="code-band__grain" aria-hidden />
                        <div className="code-band__frame">
                          <div className="code-band__head">
                            <span className="code-band__mark">{t('codeBand.markPrice')}</span>
                            <span className="code-band__status code-band__status--done">
                              {t('codeBand.statusApplied')}
                            </span>
                          </div>
                          <div className="code-band__row">
                            <span className="code-band__code">{discountPreview.code}</span>
                            <span className="code-band__amount">
                              <span>
                                {t(
                                  discountPreview.kind === 'fixed_price'
                                    ? 'codeBand.pay'
                                    : 'codeBand.save',
                                )}
                              </span>
                              {money(
                                discountPreview.kind === 'fixed_price'
                                  ? discountPreview.finalAmount
                                  : discountPreview.discountAmount,
                                locale,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* El código deja delegar el pago: se dice acá, con el
                          código ya aplicado y antes de elegir el medio, porque
                          es lo que cambia la decisión de quien todavía no juntó
                          la plata. Sólo aparece si además hay un canal manual
                          que el atleta pueda declarar. */}
                      {discountPreview.financed && (transferSelectable || cashSelectable) ? (
                        <p className="code-band-hint">
                          {t('account.membership.discountFinanced', {
                            days: discountPreview.financingTermDays,
                          })}
                        </p>
                      ) : null}
                      {/* El anuncio del canje se puede volver a abrir: sale
                          una sola vez al aplicar el código y ahí están los
                          canales, el cupo y la ventana, que no entran en la
                          banda. */}
                      {revealPromotion ? (
                        <button
                          type="button"
                          className="code-band-detail"
                          onClick={() => setRevealOpen(true)}
                        >
                          <Sparkles size={12} aria-hidden />
                          {t('promotionReveal.reopen')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="code-band-drop"
                        onClick={clearDiscountCode}
                        disabled={checkoutLocked}
                      >
                        {t('account.membership.discountRemove')}
                      </button>
                    </div>
                  ) : (
                    <MotionContentSwap swapKey={discountOpen ? 'field' : 'button'} mode="sync">
                      {discountOpen ? (
                        <div className="account-discount__field">
                          <label className="visually-hidden" htmlFor="membership-discount-code">
                            {t('account.membership.discountLabel')}
                          </label>
                          <div className={`code-band${discountError ? ' code-band--error' : ''}`}>
                            <span className="code-band__grain" aria-hidden />
                            <div className="code-band__frame">
                              <div className="code-band__head">
                                <span className="code-band__mark">{t('codeBand.markCode')}</span>
                                <span
                                  className={`code-band__status${discountError ? ' code-band__status--error' : ''}`}
                                >
                                  {t(
                                    discountChecking
                                      ? 'codeBand.statusChecking'
                                      : discountError
                                        ? 'codeBand.statusError'
                                        : 'codeBand.statusIdle',
                                  )}
                                </span>
                              </div>
                              <div className="code-band__row">
                                <input
                                  ref={discountInputRef}
                                  id="membership-discount-code"
                                  className="code-band__input"
                                  type="text"
                                  autoComplete="off"
                                  spellCheck={false}
                                  placeholder={t('account.membership.discountPlaceholder')}
                                  value={discountCodeInput}
                                  disabled={checkoutLocked || discountChecking}
                                  onChange={(event) =>
                                    setDiscountCodeInput(event.target.value.toUpperCase())
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      void applyDiscountCode()
                                      return
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault()
                                      clearDiscountCode()
                                    }
                                  }}
                                />
                                <CodeScanButton
                                  disabled={checkoutLocked || discountChecking}
                                  onScan={(scanned) => {
                                    setDiscountCodeInput(scanned)
                                    void applyDiscountCode(scanned)
                                  }}
                                />
                                <button
                                  type="button"
                                  className="code-band__chip"
                                  disabled={
                                    checkoutLocked || discountChecking || !discountCodeInput.trim()
                                  }
                                  onClick={applyDiscountCode}
                                >
                                  {discountChecking
                                    ? t('account.membership.discountChecking')
                                    : t('account.membership.discountApply')}
                                </button>
                              </div>
                            </div>
                          </div>
                          <p className="code-band-hint">{t('account.membership.discountHint')}</p>
                          {discountError ? (
                            <p className="code-band-error" role="alert">
                              {discountError}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="code-band-toggle account-discount__toggle"
                          disabled={checkoutLocked}
                          onClick={openDiscountField}
                        >
                          <span className="code-band-toggle__seal" aria-hidden>
                            <KeyRound size={13} />
                          </span>
                          {t('account.membership.discountToggle')}
                        </button>
                      )}
                    </MotionContentSwap>
                  )}
                </div>
              ) : null}

              {membershipAccessRequired ? (
                accessLocked ? (
                  <div className="registration-access-locked">
                    <p>
                      <strong>{t('pages.register.accessGate.lockedTitle')}</strong>
                      {t('pages.register.accessGate.lockedText')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setAccessGateOpen(true)}
                      disabled={checkoutLocked}
                    >
                      <LockKeyhole size={15} aria-hidden />
                      {t('pages.register.accessGate.lockedAction')}
                    </button>
                  </div>
                ) : (
                  <p className="registration-access-unlocked">
                    <ShieldCheck size={15} aria-hidden />
                    {t('pages.register.accessGate.unlocked')}
                  </p>
                )
              ) : null}

              <CheckoutDesk
                bar={
                  selectedPlan ? (
                    <CheckoutBar
                      className="account-membership__bar"
                      compareTotal={
                        paymentMethod === 'wise_transfer' ? null : channelCompareTotal
                      }
                      ctaLabel={ctaLabel}
                      disabled={ctaDisabled}
                      submitting={submitting}
                      total={
                        paymentMethod === 'wise_transfer'
                          ? wisePriceLabel(
                              activeDiscount ? activeDiscount.finalAmount : selectedPlanPrice,
                              locale,
                            )
                          : activeDiscount
                            ? activeDiscount.finalAmount
                            : selectedPlanPrice
                      }
                      totalLabel={t('account.membership.priceLabel')}
                      type="button"
                      onClick={handleCheckoutAction}
                    />
                  ) : null
                }
                methods={[
                  ...(mercadoPagoOffered
                    ? [
                        {
                          value: 'mercado_pago',
                          label: t('formOptions.payment.mercadoPago'),
                          priceLabel: membershipMethodPrice('mercado_pago'),
                        },
                      ]
                    : []),
                  ...(transferOffered
                    ? [
                        {
                          value: 'transferencia',
                          label: transferSelectable
                            ? t('pages.register.paymentTransferLabel')
                            : t('account.membership.transferComingSoon'),
                          priceLabel: membershipMethodPrice('transferencia'),
                          disabled: !transferSelectable,
                          detail: transferSelectable ? manualMethodDetail : undefined,
                        },
                      ]
                    : []),
                  ...(cashOffered
                    ? [
                        {
                          value: 'cash_pitbull',
                          label: cashSelectable
                            ? t('pages.register.paymentCashPitbullLabel')
                            : t('account.membership.cashPitbullComingSoon'),
                          priceLabel: membershipMethodPrice('cash_pitbull'),
                          disabled: !cashSelectable,
                          detail: cashSelectable ? manualMethodDetail : undefined,
                        },
                      ]
                    : []),
                  ...(wiseOffered && selectedPlan?.collectionMode !== 'recurring'
                    ? [{ value: 'wise_transfer', label: t('pages.register.paymentWiseLabel') }]
                    : []),
                ]}
                methodsDisabled={checkoutLocked || !selectedPlan}
                methodsLabel={t('account.membership.paymentLegend')}
                methodsLegend={t('account.membership.paymentLegend')}
                paymentHint={
                  paymentMethod === 'wise_transfer'
                    ? t('pages.register.paymentWisePriceHint')
                    : showChannelCompare
                      ? t('account.membership.manualChannelPriceHint')
                      : !mercadoPagoOffered && !transferOffered && !cashOffered && !wiseOffered
                        ? t('pages.register.paymentNoChannelHint')
                        : // Mercado Pago desaparece del selector sin que el atleta
                          // haya tocado nada: el código lo cerró y hay que decirlo.
                          codeClosesMercadoPago
                          ? t('pages.register.paymentCodeWithoutGatewayHint')
                          : mercadoPagoOffered && !manualChannelEnabled && !wiseOffered
                            ? t('pages.register.paymentMercadoPagoOnlyHint')
                            : ''
                }
                offers={
                  selectedPlan
                    ? [
                        {
                          featured: true,
                          id: selectedPlan.code,
                          name: selectedPlan.name,
                          priceLabel:
                            paymentMethod === 'wise_transfer'
                              ? wisePriceLabel(selectedPlanPrice, locale)
                              : money(
                                  activeDiscount ? activeDiscount.finalAmount : selectedPlanPrice,
                                  locale,
                                ),
                          comparePriceLabel: channelCompareLabel || undefined,
                        },
                      ]
                    : []
                }
                paymentMethod={paymentMethod}
                paymentName="membership-payment"
                selectedOfferId={selectedPlan?.code}
                onPaymentChange={(event) => changePaymentMethod(event.target.value)}
              />
              {/* Aumento programado del plan (versión futura ya publicada en
                  Tarifas): se anuncia mientras rige el precio actual. Cuando
                  llega la vigencia, /api/payments/plans ya devuelve el plan
                  nuevo y la nota se retira sola. */}
              {selectedPlan?.upcomingChange?.price ? (
                <p className="account-membership__upcoming-price">
                  {t('account.membership.upcomingPlanChange', {
                    amount: money(selectedPlan.upcomingChange.price, locale),
                    date: formatShortStamp(selectedPlan.upcomingChange.effectiveFrom, locale),
                  })}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {demoMode && !env.payments.isMock && (
        <div className="account-membership__demo">
          <p className="account-membership__demo-label">{t('account.membership.demoLabel')}</p>
          <div className="account-demo-actions">
            {showPurchaseCheckout && (
              <button
                type="button"
                className="account-secondary-action account-secondary-action--success"
                onClick={simulateMembershipPayment}
              >
                {t('account.membership.simulatePayment')}
              </button>
            )}
            {membershipActive && (
              <button
                type="button"
                className="account-secondary-action account-secondary-action--danger"
                onClick={cancelMembership}
              >
                {t('account.membership.cancelMembership')}
              </button>
            )}
          </div>
        </div>
      )}

      {demoMode && env.payments.isMock && membershipActive && (
        <div className="account-membership__demo">
          <div className="account-demo-actions">
            <button
              type="button"
              className="account-secondary-action account-secondary-action--danger"
              onClick={cancelMembership}
            >
              {t('account.membership.cancelMembership')}
            </button>
          </div>
        </div>
      )}

      {checkoutMessage && (
        <p
          className={`account-checkout-message${checkoutIsError ? ' account-checkout-message--error' : ''}`}
          role={checkoutIsError ? 'alert' : 'status'}
        >
          {checkoutMessage}
        </p>
      )}

      {paymentRecovery && !mpSettling ? (
        <PaymentRecoveryPanel
          amount={paymentRecovery.amount}
          concept={paymentRecovery.concept}
          currency={paymentRecovery.currency}
          onTransfer={() => void startMembershipPayment('transferencia')}
          reference={paymentRecovery.reference}
          transferAvailable={transferSelectable}
          transferBusy={submitting}
        />
      ) : null}

      {manualOrder?.manualPaymentChannel === 'cash_pitbull' ? (
        <ManualPaymentConfirmation
          channel="cash_pitbull"
          financedEntitlementsAt={manualOrder.financedEntitlementsAt}
          financedPaymentDueAt={manualOrder.financedPaymentDueAt}
          financingAllowed={manualOrder.financingAllowed}
          manualPaymentDeclaredAt={manualOrder.manualPaymentDeclaredAt}
          orderId={manualOrder.paymentId ?? manualOrder.id ?? null}
          onNavigate={onNavigate}
          profileTab="account-membership"
        />
      ) : null}

      {transferOpen && (
        <TransferPayModal
          athlete={athlete}
          amount={transferAmount ?? selectedPlan?.price ?? 0}
          currency={transferChannel === 'wise_transfer' ? 'USD' : 'ARS'}
          channel={transferChannel}
          orderId={transferOrderId}
          financingAllowed={manualOrder?.financingAllowed === true}
          manualPaymentDeclaredAt={manualOrder?.manualPaymentDeclaredAt ?? null}
          financedEntitlementsAt={manualOrder?.financedEntitlementsAt ?? null}
          onClose={() => setTransferOpen(false)}
        />
      )}

      {accessGateOpen && accessLocked ? (
        <RegistrationAccessGateModal
          scopes={['membership']}
          onUnlock={handleAccessUnlock}
          onCancel={() => setAccessGateOpen(false)}
        />
      ) : null}

      {/* El momento del canje. Acá la acción principal no navega —el atleta ya
          está en el checkout que va a cobrar el código—: cierra el anuncio y
          deja abajo el precio recalculado. */}
      {revealPromotion && revealOpen ? (
        <PromotionRevealModal
          campaignDescription={revealPromotion.campaign?.description ?? ''}
          campaignName={revealPromotion.campaign?.name ?? ''}
          code={revealPromotion.code}
          continueLabel={t('promotionReveal.continueHere')}
          expiresAt={promotionScarcityPresentation(revealPromotion)?.expiresAt ?? null}
          headline={(() => {
            const benefit = promotionBenefitPresentation(revealPromotion)
            return t(`secretOfferRedeemer.benefit.${benefit.type}`, benefit)
          })()}
          onClose={() => setRevealOpen(false)}
          onContinue={() => setRevealOpen(false)}
          payment={promotionPaymentPresentation(revealPromotion)}
          remaining={promotionScarcityPresentation(revealPromotion)?.remaining ?? null}
        />
      ) : null}
    </section>
  )
}
