import { Component, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CardPayment, Payment, Wallet, initMercadoPago } from '@mercadopago/sdk-react'
import { CheckCircle2, Clock3, ExternalLink, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import { env } from '../../config/env.js'
import { money } from '../../lib/format.js'
import { syncMercadoPagoSubmitLabel } from '../../lib/mercadoPagoBrickUi.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  createPreference as createPreferenceRequest,
  processEmbeddedPayment,
  processEmbeddedSubscription,
  getPaymentOrderStatus,
  notifyMockPayment,
  reportPaymentClientEvent,
} from '../../services/paymentService.js'
import { trackConversion, trackEvent } from '../../services/analyticsService.js'

let initializedPublicKey = null

// Re-skin del Brick: acento oro PLU, tipografía del sitio y fondo
// transparente para que el formulario se sienta parte de la página.
// `font` solo alcanza campos seguros (tarjeta/CVV). Los hex de marca
// salen de palette.css (--plu-gold-500 / --color-brand-action-text).
const BRICK_FONT = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'

function readCssColor(name, fallback) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function currentThemeIsLight() {
  return typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-theme') === 'light'
}

// `isLight` decide la variante ('default'/'dark') que arma el resto de los
// customVariables.
function buildBrickVisual(isLight) {
  return {
    font: BRICK_FONT,
    hideFormTitle: true,
    style: {
      theme: isLight ? 'default' : 'dark',
      customVariables: {
        baseColor: '#f2b705',
        buttonTextColor: '#14181f',
        formBackgroundColor: 'transparent',
        formPadding: '0px',
        inputBackgroundColor: 'transparent',
        textPrimaryColor: readCssColor('--color-text-primary', isLight ? '#0d0e12' : '#f4f4f5'),
        textSecondaryColor: readCssColor('--color-text-muted', isLight ? '#636878' : '#9a9aa8'),
        outlinePrimaryColor: readCssColor('--color-border', isLight ? 'rgba(15, 17, 23, 0.10)' : 'rgba(255, 255, 255, 0.14)'),
        outlineSecondaryColor: readCssColor('--color-border-subtle', isLight ? 'rgba(15, 17, 23, 0.06)' : 'rgba(255, 255, 255, 0.08)'),
        errorColor: readCssColor('--color-danger-text', isLight ? '#b42318' : '#ff8b86'),
        // Sin esto, el badge "Cuotas sin interés"/"Cuotas disponibles" cae al
        // verde por defecto de Mercado Pago, un acento ajeno a la paleta PLU.
        successColor: readCssColor('--color-success-text', '#2d7a4a'),
        borderRadiusSmall: '6px',
        borderRadiusMedium: '10px',
        borderRadiusLarge: '10px',
        inputFocusedBoxShadow: '0 0 0 2px rgba(242, 183, 5, 0.28)',
      },
    },
  }
}
/**
 * Medios del Payment Brick. `mercadoPago` (dinero en cuenta y Mercado Crédito)
 * sólo aparece si la preferencia existe, y Mercado Pago además lo filtra por
 * monto mínimo, así que no se puede confiar en que el brick lo ofrezca. Cuando
 * podemos montar el Wallet Brick la cuenta de Mercado Pago vive ahí y sólo ahí
 * —`PAYMENT_METHODS_CARD_ONLY`—, para no ofrecer el mismo medio dos veces en la
 * misma pantalla.
 */
const PAYMENT_METHODS_CARD_ONLY = {
  creditCard: 'all',
  debitCard: 'all',
  prepaidCard: 'all',
  ticket: 'all',
}
const PAYMENT_METHODS = {
  ...PAYMENT_METHODS_CARD_ONLY,
  mercadoPago: 'all',
}
const WALLET_CUSTOMIZATION = {
  valueProp: 'practicality',
  customStyle: {
    buttonHeight: '48px',
    borderRadius: '10px',
  },
}

/**
 * Nombre del paso de embudo segun el tipo de orden. `membership_checkout_opened`
 * es uno de los pasos canonicos (`MEMBERSHIP_FUNNEL_STEPS` en
 * `server/routes/analytics.js`); los otros dos no forman parte de ese embudo
 * pero sirven para medir que checkout se usa mas.
 */
const CHECKOUT_OPENED_STEPS = {
  membership: 'membership_checkout_opened',
  competition: 'registration_checkout_opened',
  tickets: 'tickets_checkout_opened',
}

/**
 * Pasos de pago separados por flujo.
 *
 * `payment_submitted` y `payment_approved` a secas los emiten los tres
 * checkouts, y el embudo de afiliacion los tomaba como propios: alguien que
 * pagaba una inscripcion aportaba un `payment_submitted` sin ningun
 * `membership_checkout_opened` que lo precediera, la cadena se cortaba y el
 * paso entero se reportaba en cero. Con datos reales el panel mostraba 0 pagos
 * habiendo dos registrados.
 *
 * Los nombres van escritos enteros y no armados con plantilla a proposito: son
 * el contrato con `MEMBERSHIP_FUNNEL_STEPS` de `server/routes/analytics.js`, y
 * un `${prefijo}_payment_submitted` no se encuentra buscando el paso por su
 * nombre —ni por grep, ni por el test que verifica que cada paso tenga quien lo
 * emita—.
 */
const PAYMENT_FUNNEL_STEPS = {
  membership: {
    submitted: 'membership_payment_submitted',
    approved: 'membership_payment_approved',
  },
  competition: {
    submitted: 'registration_payment_submitted',
    approved: 'registration_payment_approved',
  },
  tickets: {
    submitted: 'tickets_payment_submitted',
    approved: 'tickets_payment_approved',
  },
}

// Motivo puntual de rechazo que manda Mercado Pago (`payment.status_detail`),
// mapeado a un mensaje accionable en vez del genérico "reintentá con otro
// medio" — así la persona sabe si tiene que revisar el CVV, llamar al banco
// o directamente probar otra tarjeta. Códigos no listados acá (o ausentes)
// caen al mensaje genérico `payments.paymentRejected`.
const REJECTION_REASON_KEYS = {
  cc_rejected_bad_filled_card_number: 'paymentRejectedCardNumber',
  cc_rejected_bad_filled_date: 'paymentRejectedExpiry',
  cc_rejected_bad_filled_security_code: 'paymentRejectedCvv',
  cc_rejected_bad_filled_other: 'paymentRejectedBadData',
  cc_rejected_insufficient_amount: 'paymentRejectedInsufficientFunds',
  cc_rejected_card_disabled: 'paymentRejectedCardDisabled',
  cc_rejected_call_for_authorize: 'paymentRejectedCallForAuthorize',
  cc_rejected_duplicated_payment: 'paymentRejectedDuplicated',
  cc_rejected_high_risk: 'paymentRejectedHighRisk',
  cc_rejected_blacklist: 'paymentRejectedHighRisk',
  cc_rejected_invalid_installments: 'paymentRejectedInstallments',
  cc_rejected_max_attempts: 'paymentRejectedMaxAttempts',
  cc_rejected_time_out: 'paymentRejectedTimeout',
}

function resolveRejectionMessage(statusDetail, t) {
  const key = REJECTION_REASON_KEYS[statusDetail]
  return t(key ? `payments.${key}` : 'payments.paymentRejected')
}

const MOCK_TOKEN = 'mock_card_token_local_dev_only'
const MOCK_OUTCOMES = [
  { id: 'mock_approved', labelKey: 'payments.mockApprove', variant: 'success' },
  { id: 'mock_rejected', labelKey: 'payments.mockReject', variant: 'outline' },
  { id: 'mock_pending', labelKey: 'payments.mockPending', variant: 'outline' },
  { id: 'mock_error', labelKey: 'payments.mockError', variant: 'outline' },
]

class PaymentBrickErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function ensureMercadoPago(locale) {
  if (!env.mercadoPago.publicKey || initializedPublicKey === env.mercadoPago.publicKey) return
  initMercadoPago(env.mercadoPago.publicKey, {
    locale: locale === 'en' ? 'en-US' : 'es-AR',
    advancedFraudPrevention: true,
  })
  initializedPublicKey = env.mercadoPago.publicKey
}

function normalizePaymentStatus(status) {
  if (status === 'approved' || status === 'aprobado' || status === 'authorized') return 'approved'
  if (status === 'rejected' || status === 'rechazado' || status === 'cancelled') return 'rejected'
  return 'pending'
}

function controlledPaymentError(error, t) {
  const message = String(error?.message ?? '').trim()
  if (!message || message === 'Error interno' || Number(error?.status) >= 500) {
    return t('payments.embeddedRetryableError')
  }
  return message
}

function announcePaymentUpdate(orderId, status) {
  window.dispatchEvent(new CustomEvent('plu:payment-updated', {
    detail: { orderId, status },
  }))
}

function resolvePayerEmail(order) {
  return (
    order?.payerEmail
    || order?.athleteEmail
    || order?.email
    || order?.buyerEmail
    || 'mock-payer@pluarg.local'
  )
}

function buildMockFormData(order, paymentMethodId) {
  return {
    token: MOCK_TOKEN,
    payment_method_id: paymentMethodId,
    payment_type_id: 'credit_card',
    installments: 1,
    payer: { email: resolvePayerEmail(order) },
  }
}

function isRealMercadoPagoPreferenceId(preferenceId) {
  const value = String(preferenceId ?? '').trim()
  return Boolean(value && !value.startsWith('mock_') && !value.startsWith('mock://'))
}

function resolvePreferenceId(order) {
  return (
    order?.preferenceId
    || order?.providerPreferenceId
    || order?.provider_preference_id
    || order?.preference?.id
    || order?.checkout?.preference?.id
    || null
  )
}

export default function MercadoPagoEmbeddedCheckout({ order, onResult, presentation = 'default' }) {
  const { locale, t } = useI18n()
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [brickVersion, setBrickVersion] = useState(0)
  const [checking, setChecking] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [pollExhausted, setPollExhausted] = useState(false)
  const [walletPreferenceId, setWalletPreferenceId] = useState(null)
  const [preferenceReady, setPreferenceReady] = useState(() => (
    isRealMercadoPagoPreferenceId(resolvePreferenceId(order))
  ))
  // Si crear la preferencia embebida falla dos veces seguidas, el checkout de
  // tarjeta sigue funcionando (fallback silencioso a `PAYMENT_METHODS`), pero
  // la opción de cuenta MP se pierde sin que nadie se entere. Este estado le
  // da a la persona una salida visible en vez de un botón que simplemente
  // nunca aparece.
  const [walletPreferenceError, setWalletPreferenceError] = useState(false)
  const [preferenceRetrying, setPreferenceRetrying] = useState(false)
  const [preferenceRetryNonce, setPreferenceRetryNonce] = useState(0)
  // Sin memoizar a propósito: el Brick real tarda en montar (la preferencia
  // embebida reintenta con espera antes de asentarse — ver el efecto de
  // `preferenceReady` más abajo), y ese margen es lo que deja que
  // `readCssColor` lea los tokens ya resueltos por el CSS del tema en vez de
  // los del primer render, cuando la hoja de estilos puede no estar aplicada
  // todavía. Memoizar por tema congelaba esa primera lectura para siempre.
  // El objeto es liviano; recalcularlo en cada render no pesa, y el Brick de
  // Mercado Pago solo lee `customization` al montar (no se reconstruye si
  // cambia en un render posterior), así que esto no dispara remontajes ni
  // pierde una tarjeta a medio completar.
  const brickVisual = buildBrickVisual(currentThemeIsLight())
  const brickRef = useRef(null)
  const reactId = useId().replaceAll(':', '')
  const orderId = order?.paymentId ?? order?.orderId
  const isSubscription = order?.paymentMode === 'subscription'
  const isMock = env.payments.isMock
  const isModal = presentation === 'modal'
  const isSettle = presentation === 'settle'
  const localeCode = locale === 'en' ? 'en-US' : 'es-AR'
  const resolvedPreferenceId = resolvePreferenceId(order)
  const initialPreferenceId = isRealMercadoPagoPreferenceId(resolvedPreferenceId)
    ? resolvedPreferenceId
    : null
  const realPreferenceId = walletPreferenceId ?? initialPreferenceId
  // Pagar con el dinero de la cuenta exige iniciar sesión en Mercado Pago: no
  // hay forma embebida de hacerlo, el Wallet Brick redirige y vuelve por
  // `back_urls`. Antes esto estaba apagado en settle, y como afiliación e
  // inscripción son las dos presentaciones settle, la cuenta de Mercado Pago no
  // se podía usar en ningún checkout. Las tarjetas siguen cobrándose embebidas.
  const canRenderWallet = !isSubscription && Boolean(realPreferenceId)
  const paymentCustomization = useMemo(
    () => ({
      paymentMethods: canRenderWallet ? PAYMENT_METHODS_CARD_ONLY : PAYMENT_METHODS,
      visual: brickVisual,
    }),
    [brickVisual, canRenderWallet],
  )
  const subscriptionCustomization = useMemo(
    () => ({
      paymentMethods: { minInstallments: 1, maxInstallments: 1 },
      visual: brickVisual,
    }),
    [brickVisual],
  )
  const initialization = useMemo(() => ({
    amount: Number(order?.amount ?? 0),
    ...(!isSubscription && realPreferenceId ? { preferenceId: realPreferenceId } : {}),
  }), [isSubscription, order?.amount, realPreferenceId])
  const walletInitialization = useMemo(
    () => ({ preferenceId: realPreferenceId, redirectMode: 'self' }),
    [realPreferenceId],
  )
  const canRenderPaymentBrick = isSubscription || preferenceReady

  useEffect(() => {
    if (isMock) {
      setReady(true)
      return undefined
    }
    try {
      ensureMercadoPago(locale)
    } catch (initializationError) {
      setError(t('payments.embeddedRenderError'))
      void reportPaymentClientEvent({
        paymentOrderId: orderId,
        orderAccessToken: order?.orderAccessToken,
        stage: 'initialization',
        errorCode: initializationError?.name ?? 'sdk_initialization_error',
        message: initializationError?.message ?? t('payments.embeddedRenderError'),
      }).catch(() => {
        // La telemetria es best-effort: la pagina ya contiene el error y el reintento.
      })
    }
    return undefined
  }, [brickVersion, isMock, locale, order?.orderAccessToken, orderId, t])

  useEffect(() => {
    setWalletPreferenceId(initialPreferenceId)
  }, [initialPreferenceId, orderId])

  useEffect(() => {
    if (isMock || isSubscription) {
      setPreferenceReady(true)
      return undefined
    }
    if (realPreferenceId || !orderId || !env.mercadoPago.configured) {
      setPreferenceReady(true)
      return undefined
    }

    let cancelled = false
    setWalletPreferenceError(false)
    setPreferenceRetrying(true)

    // Un solo reintento inmediato antes de rendirse: cubre el hipo transitorio
    // típico (red, cold start) sin hacer esperar de más a quien sí puede pagar
    // con tarjeta mientras tanto (`preferenceReady` se cumple igual al final).
    async function loadPreference() {
      const maxAttempts = 2
      let lastError = null
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (cancelled) return
        try {
          const response = await createPreferenceRequest({
            paymentId: orderId,
            orderAccessToken: order?.orderAccessToken,
          })
          const preferenceId = response?.preference?.id ?? response?.paymentOrder?.preferenceId ?? null
          if (!cancelled && isRealMercadoPagoPreferenceId(preferenceId)) {
            setWalletPreferenceId(preferenceId)
          }
          lastError = null
          break
        } catch (preferenceError) {
          lastError = preferenceError
          if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 1500))
        }
      }
      if (cancelled) return
      if (lastError) {
        setWalletPreferenceError(true)
        void reportPaymentClientEvent({
          paymentOrderId: orderId,
          orderAccessToken: order?.orderAccessToken,
          stage: 'preference',
          errorCode: lastError?.name ?? 'preference_creation_error',
          message: lastError?.message ?? 'No se pudo preparar la preferencia embebida.',
        }).catch(() => {
          // La telemetria es best-effort: no debe tapar el estado de error visible.
        })
      }
      setPreferenceRetrying(false)
      setPreferenceReady(true)
    }

    void loadPreference()

    return () => {
      cancelled = true
    }
  }, [isMock, isSubscription, order?.orderAccessToken, orderId, preferenceRetryNonce, realPreferenceId])

  const retryWalletPreference = useCallback(() => {
    setWalletPreferenceError(false)
    setPreferenceRetryNonce((current) => current + 1)
  }, [])

  // Paso del embudo "abrio el checkout". Es el eslabon que faltaba entre ver la
  // pantalla de afiliacion e intentar pagar: sin el, el informe no podia
  // distinguir a quien miro el precio y se fue de quien llego hasta la tarjeta.
  // Se emite por orden y no por render (`orderId` en las dependencias), asi el
  // doble montaje de StrictMode y los reintentos del brick no lo repiten.
  useEffect(() => {
    const step = CHECKOUT_OPENED_STEPS[order?.type]
    if (!step || !orderId) return
    trackEvent(step, { metadata: { paymentMode: order?.paymentMode ?? 'payment' } })
  }, [order?.paymentMode, order?.type, orderId])

  const submitPayment = useCallback(async (payload) => {
    setError('')
    try {
      if (!payload?.formData) throw new Error(t('payments.embeddedError'))
      // Pasos del embudo. Nunca viaja el token de tarjeta ni el medio de pago:
      // solo el hecho de que hubo un intento y como termino.
      const flowSteps = PAYMENT_FUNNEL_STEPS[order?.type]
      // El generico se conserva: es el que cuenta intentos de pago del sitio
      // entero, sin importar que se estuviera pagando.
      trackEvent('payment_submitted', { metadata: { concept: order?.concept ?? null } })
      if (flowSteps) trackEvent(flowSteps.submitted)
      const response = await processEmbeddedPayment({
        paymentOrderId: orderId,
        orderAccessToken: order?.orderAccessToken,
        formData: payload.formData,
      })
      const status = normalizePaymentStatus(response.payment?.status ?? response.order?.status)
      setResult({ status, data: response })
      announcePaymentUpdate(orderId, status)
      if (status === 'approved') {
        // Solo el generico viaja como conversion: duplicar el tipo inflaria el
        // contador de conversiones del resumen al doble.
        trackConversion('payment_approved', { value: Number(order?.amount ?? 0) })
        if (flowSteps) trackEvent(flowSteps.approved, { value: Number(order?.amount ?? 0) })
      } else if (status === 'rejected') {
        trackEvent('payment_rejected', { type: 'error' })
      }
      onResult?.(response)
      return response
    } catch (submitError) {
      setError(controlledPaymentError(submitError, t))
      throw submitError
    }
  }, [onResult, order?.amount, order?.concept, order?.orderAccessToken, order?.type, orderId, t])

  const submitSubscription = useCallback(async (formData) => {
    setError('')
    try {
      const response = await processEmbeddedSubscription({
        paymentOrderId: orderId,
        orderAccessToken: order?.orderAccessToken,
        planCode: order.plan?.code,
        cardToken: formData.token,
      })
      // Autorizar la suscripción no equivale a cobrar el primer ciclo. La
      // orden queda pendiente hasta el authorized_payment canónico de MP.
      setResult({ status: 'pending', data: response })
      announcePaymentUpdate(orderId, 'pending')
      onResult?.(response)
      return response
    } catch (submitError) {
      setError(controlledPaymentError(submitError, t))
      throw submitError
    }
  }, [onResult, order?.orderAccessToken, order?.plan?.code, orderId, t])

  const simulateOutcome = useCallback(async (paymentMethodId) => {
    setSimulating(true)
    setError('')
    try {
      if (isSubscription) {
        await submitSubscription({ token: MOCK_TOKEN })
        return
      }
      await submitPayment({ formData: buildMockFormData(order, paymentMethodId) })
    } catch {
      // El error ya quedó en estado local.
    } finally {
      setSimulating(false)
    }
  }, [isSubscription, order, submitPayment, submitSubscription])

  const forceMockAccreditation = useCallback(async () => {
    const paymentId = result?.data?.payment?.id
    if (!paymentId) {
      setError(t('payments.mockForceMissingPayment'))
      return
    }
    setSimulating(true)
    setError('')
    try {
      const response = await notifyMockPayment({
        paymentId,
        orderId,
        orderAccessToken: order?.orderAccessToken,
        status: 'approved',
      })
      const status = normalizePaymentStatus(response.payment?.status ?? response.order?.status)
      setResult({ status, data: response })
      announcePaymentUpdate(orderId, status)
      onResult?.(response)
    } catch (notifyError) {
      setError(controlledPaymentError(notifyError, t))
    } finally {
      setSimulating(false)
    }
  }, [onResult, order?.orderAccessToken, orderId, result?.data?.payment?.id, t])

  const handleReady = useCallback(() => setReady(true), [])

  useEffect(() => {
    if (isMock || isSubscription || !canRenderPaymentBrick) return undefined
    const root = brickRef.current
    if (!root) return undefined

    const sync = () => syncMercadoPagoSubmitLabel(root, t)
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-checked', 'aria-selected'],
    })
    return () => observer.disconnect()
  }, [brickVersion, canRenderPaymentBrick, isMock, isSubscription, ready, t])
  const handleRenderError = useCallback((brickError) => {
    setError(t('payments.embeddedRenderError'))
    void reportPaymentClientEvent({
      paymentOrderId: orderId,
      orderAccessToken: order?.orderAccessToken,
      stage: 'render',
      errorCode: brickError?.type ?? brickError?.name ?? 'brick_render_error',
      message: brickError?.message ?? t('payments.embeddedRenderError'),
    }).catch(() => {
      // La telemetria no debe reemplazar el error original ni bloquear el reintento.
    })
  }, [order?.orderAccessToken, orderId, t])
  const refreshStatus = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setChecking(true)
    try {
      const response = await getPaymentOrderStatus(orderId, order?.orderAccessToken)
      const status = normalizePaymentStatus(response.order?.status)
      setResult((current) => ({ status, data: current?.data ?? response }))
      if (status !== 'pending') {
        announcePaymentUpdate(orderId, status)
        onResult?.(response)
      }
      return status
    } catch (statusError) {
      if (!quiet) setError(
        Number(statusError?.status) >= 500
          ? t('payments.statusError')
          : controlledPaymentError(statusError, t),
      )
      return 'pending'
    } finally {
      if (!quiet) setChecking(false)
    }
  }, [onResult, order?.orderAccessToken, orderId, t])

  useEffect(() => {
    if (result?.status !== 'pending') return undefined
    setPollExhausted(false)
    let checks = 0
    const timer = setInterval(() => {
      checks += 1
      void refreshStatus({ quiet: true }).then((status) => {
        if (status !== 'pending' || checks >= 20) {
          clearInterval(timer)
          // Mercado Pago no confirmó en el minuto que esperamos automático:
          // no significa que haya fallado, solo que la revisión del banco
          // está tardando. Dejar de sondear en silencio a la persona sin
          // explicarle nada se sentía como que el pago se había perdido.
          if (status === 'pending') setPollExhausted(true)
        }
      })
    }, 3_000)
    return () => clearInterval(timer)
  }, [refreshStatus, result?.status])

  function resetCheckout() {
    setResult(null)
    setError('')
    setReady(isMock)
    setPollExhausted(false)
    setBrickVersion((current) => current + 1)
  }

  if (!orderId || !order?.amount) return null
  if (!isMock && !env.mercadoPago.configured) {
    return <p className="mp-embedded-checkout__error" role="alert">{t('payments.embeddedConfigMissing')}</p>
  }

  const resultMessage = result?.status === 'approved'
    ? t(isSubscription ? 'payments.subscriptionActivated' : 'payments.paymentApproved')
    : result?.status === 'rejected'
      ? resolveRejectionMessage(result?.data?.payment?.statusDetail, t)
      : t(isSubscription ? 'payments.subscriptionPendingCharge' : 'payments.paymentPending')
  const mockPaymentId = result?.data?.payment?.id ?? null
  const payerEmail = resolvePayerEmail(order)
  const mockPrimary = MOCK_OUTCOMES.find((outcome) => outcome.variant === 'success')
  const mockSecondary = MOCK_OUTCOMES.filter((outcome) => outcome.variant !== 'success')
  const formattedAmount = money(Number(order?.amount ?? 0), locale)
  const summaryLabel = order?.plan?.name
    || order?.description
    || t(isSubscription ? 'payments.subscriptionTitle' : 'payments.embeddedTitle')

  return (
    <section
      className={`mp-embedded-checkout${isModal ? ' mp-embedded-checkout--modal' : ''}${
        isSettle ? ' mp-embedded-checkout--settle' : ''
      }`}
      aria-labelledby={`mp-checkout-title-${orderId}`}
    >
      <header className={`mp-embedded-checkout__header${isSettle ? ' visually-hidden' : ''}`}>
        <span className="mp-embedded-checkout__icon"><ShieldCheck size={20} aria-hidden /></span>
        <div>
          <h3 id={`mp-checkout-title-${orderId}`}>
            {t(isSubscription ? 'payments.subscriptionTitle' : 'payments.embeddedTitle')}
          </h3>
          <p>{t(isSubscription ? 'payments.subscriptionLead' : 'payments.embeddedLead')}</p>
        </div>
      </header>

      {!isMock && !ready && !result && (
        <div className="mp-embedded-checkout__skeleton" role="status" aria-live="polite">
          <span className="mp-embedded-checkout__skeleton-bar mp-embedded-checkout__skeleton-bar--wide" aria-hidden="true" />
          <span className="mp-embedded-checkout__skeleton-bar" aria-hidden="true" />
          <span className="mp-embedded-checkout__skeleton-bar" aria-hidden="true" />
          <span className="mp-embedded-checkout__skeleton-bar mp-embedded-checkout__skeleton-bar--cta" aria-hidden="true" />
          <p className="mp-embedded-checkout__loading">{t('payments.embeddedLoading')}</p>
        </div>
      )}
      {isMock && simulating && !result && (
        <p className="mp-embedded-checkout__loading">{t('payments.mockProcessing')}</p>
      )}

      {!result && isMock && (
        <div className="mp-embedded-checkout__mock">
          <div className="mp-embedded-checkout__mock-summary">
            <div className="mp-embedded-checkout__mock-summary-top">
              <span className="mp-embedded-checkout__mock-summary-label">{summaryLabel}</span>
              <span className="mp-embedded-checkout__mock-chip" role="status">
                {t('payments.mockChip')}
              </span>
            </div>
            <strong className="mp-embedded-checkout__mock-amount">{formattedAmount}</strong>
            <p className="mp-embedded-checkout__mock-payer">{payerEmail}</p>
          </div>

          {!isModal ? (
            <details className="mp-embedded-checkout__mock-details">
              <summary>{t('payments.mockDetails')}</summary>
              <dl className="mp-embedded-checkout__mock-meta">
                <div>
                  <dt>{t('payments.mockOrderId')}</dt>
                  <dd><code>{orderId}</code></dd>
                </div>
                {order?.status ? (
                  <div>
                    <dt>{t('payments.mockOrderStatus')}</dt>
                    <dd><code>{order.status}</code></dd>
                  </div>
                ) : null}
                {mockPaymentId ? (
                  <div>
                    <dt>{t('payments.mockPaymentId')}</dt>
                    <dd><code>{mockPaymentId}</code></dd>
                  </div>
                ) : null}
              </dl>
            </details>
          ) : null}

          <div className="mp-embedded-checkout__mock-panel">
            {isSubscription ? (
              <button
                type="button"
                className="mp-embedded-checkout__mock-cta"
                disabled={simulating}
                onClick={() => void simulateOutcome('mock_approved')}
              >
                {t('payments.mockAuthorizeSubscription')}
              </button>
            ) : (
              <>
                {mockPrimary ? (
                  <button
                    type="button"
                    className="mp-embedded-checkout__mock-cta"
                    disabled={simulating}
                    onClick={() => void simulateOutcome(mockPrimary.id)}
                  >
                    {t(mockPrimary.labelKey)}
                  </button>
                ) : null}
                {isModal ? (
                  <details className="mp-embedded-checkout__mock-more">
                    <summary>{t('payments.mockMoreOutcomes')}</summary>
                    <div className="mp-embedded-checkout__mock-alts" role="group" aria-label={t('payments.mockAltsLabel')}>
                      {mockSecondary.map((outcome) => (
                        <button
                          key={outcome.id}
                          type="button"
                          className="mp-embedded-checkout__mock-alt"
                          disabled={simulating}
                          onClick={() => void simulateOutcome(outcome.id)}
                        >
                          {t(outcome.labelKey)}
                        </button>
                      ))}
                    </div>
                  </details>
                ) : (
                  <div className="mp-embedded-checkout__mock-alts" role="group" aria-label={t('payments.mockAltsLabel')}>
                    {mockSecondary.map((outcome) => (
                      <button
                        key={outcome.id}
                        type="button"
                        className="mp-embedded-checkout__mock-alt"
                        disabled={simulating}
                        onClick={() => void simulateOutcome(outcome.id)}
                      >
                        {t(outcome.labelKey)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {!result && !isMock && (
        <div className="mp-embedded-checkout__real-options">
          {canRenderWallet ? (
            // El Wallet Brick vive en su propio widget del SDK (no se puede
            // reescribir su HTML interno), pero se envuelve con el mismo
            // marco visual que los selectores del Payment Brick de abajo
            // para que ambos se lean como una sola lista de medios de pago,
            // no como dos bloques separados.
            <PaymentBrickErrorBoundary key={`wallet-${brickVersion}`} onError={handleRenderError}>
              <div className="mp-embedded-checkout__wallet-tile">
                <div className="mp-embedded-checkout__wallet-tile-copy">
                  <strong>{t('payments.walletTitle')}</strong>
                  {/* El salto a Mercado Pago no es opcional: el saldo de la
                      cuenta requiere iniciar sesión ahí. Anunciarlo antes
                      evita que la persona crea que perdió el checkout. */}
                  <span>
                    <ExternalLink size={12} aria-hidden />
                    {t('payments.walletRedirectNote')}
                  </span>
                </div>
                <div className="mp-embedded-checkout__wallet">
                  <Wallet
                    key={`wallet-brick-${brickVersion}`}
                    id={`wallet-brick-${reactId}-${brickVersion}`}
                    initialization={walletInitialization}
                    customization={WALLET_CUSTOMIZATION}
                    locale={localeCode}
                    onReady={handleReady}
                    onError={handleRenderError}
                  />
                </div>
              </div>
            </PaymentBrickErrorBoundary>
          ) : walletPreferenceError ? (
            // No bloquea el pago con tarjeta (sigue debajo, intacto): solo
            // avisa que la cuenta de Mercado Pago no se pudo ofrecer esta vez
            // y ofrece reintentarlo, en vez de desaparecer sin explicación.
            <div className="mp-embedded-checkout__wallet-tile mp-embedded-checkout__wallet-tile--notice">
              <div className="mp-embedded-checkout__wallet-tile-copy">
                <strong>{t('payments.walletUnavailableTitle')}</strong>
                <span>{t('payments.walletUnavailableNote')}</span>
              </div>
              <button
                type="button"
                className="btn btn--small btn--outline"
                onClick={retryWalletPreference}
                disabled={preferenceRetrying}
              >
                <RefreshCw size={14} aria-hidden /> {t('payments.retryWalletPreference')}
              </button>
            </div>
          ) : null}

          {canRenderPaymentBrick ? (
            <PaymentBrickErrorBoundary key={`payment-${brickVersion}`} onError={handleRenderError}>
              <div
                ref={brickRef}
                className={ready ? 'mp-embedded-checkout__brick is-ready' : 'mp-embedded-checkout__brick'}
              >
                {isSubscription ? (
                  <CardPayment
                    key={brickVersion}
                    id={`card-payment-brick-${reactId}-${brickVersion}`}
                    initialization={initialization}
                    customization={subscriptionCustomization}
                    locale={localeCode}
                    onReady={handleReady}
                    onError={handleRenderError}
                    onSubmit={submitSubscription}
                  />
                ) : (
                  <Payment
                    // Si un reintento de Wallet recupera la preferencia después de que
                    // este Brick ya montó con el fallback (medios sin filtrar), hay que
                    // remontarlo — el SDK no reconfigura `paymentMethods` en caliente,
                    // y sin esto "Mercado Pago" quedaría ofrecido dos veces.
                    key={`${brickVersion}-${canRenderWallet}`}
                    id={`payment-brick-${reactId}-${brickVersion}`}
                    initialization={initialization}
                    customization={paymentCustomization}
                    locale={localeCode}
                    onReady={handleReady}
                    onError={handleRenderError}
                    onSubmit={submitPayment}
                  />
                )}
              </div>
            </PaymentBrickErrorBoundary>
          ) : null}
        </div>
      )}

      {result && (
        <div className={`mp-embedded-checkout__result mp-embedded-checkout__result--${result.status}`} role="status">
          {result.status === 'approved' ? <CheckCircle2 size={26} aria-hidden /> : <Clock3 size={20} aria-hidden />}
          <p>{resultMessage}</p>
        </div>
      )}
      {result?.status === 'pending' && pollExhausted && (
        <p className="mp-embedded-checkout__poll-followup">{t('payments.pollExhausted')}</p>
      )}
      {result?.status === 'pending' && (
        <div className="mp-embedded-checkout__actions">
          <button type="button" className="btn btn--small btn--outline" onClick={() => refreshStatus()} disabled={checking || simulating}>
            <RefreshCw size={14} aria-hidden /> {t('payments.checkStatus')}
          </button>
          {isMock && !isSubscription && (
            <button type="button" className="btn btn--small" onClick={() => void forceMockAccreditation()} disabled={simulating}>
              {t('payments.mockForceApprove')}
            </button>
          )}
        </div>
      )}
      {result?.status === 'rejected' && (
        <div className="mp-embedded-checkout__actions">
          <button type="button" className="btn btn--small" onClick={resetCheckout}>
            <RotateCcw size={14} aria-hidden /> {t('payments.tryAgain')}
          </button>
        </div>
      )}
      {error && <p className="mp-embedded-checkout__error" role="alert">{error}</p>}
      {error && !result && (
        <button type="button" className="mp-embedded-checkout__retry btn btn--small btn--outline" onClick={resetCheckout}>
          {t('payments.reloadCheckout')}
        </button>
      )}
      {!isModal && !isSettle ? (
        <small className="mp-embedded-checkout__security">
          {t(isMock ? 'payments.mockSecurity' : 'payments.embeddedSecurity')}
        </small>
      ) : null}
    </section>
  )
}
