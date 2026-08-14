import { Component, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { CardPayment, Payment, initMercadoPago } from '@mercadopago/sdk-react'
import { CheckCircle2, Clock3, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import { env } from '../../config/env.js'
import { money } from '../../lib/format.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  processEmbeddedPayment,
  processEmbeddedSubscription,
  getPaymentOrderStatus,
  notifyMockPayment,
  reportPaymentClientEvent,
} from '../../services/paymentService.js'
import { trackConversion, trackEvent } from '../../services/analyticsService.js'

let initializedPublicKey = null

// Re-skin del Brick con la identidad PLU: mismo acento dorado y misma
// tipografía que el resto del sitio, en vez del celeste/Poppins-less default
// de Mercado Pago. `font` solo alcanza los campos seguros (tarjeta/CVV);
// los valores de color salen de palette.css (--plu-gold-500 /
// --color-brand-action-text) — son tokens de marca, no cambian por tema.
const BRICK_VISUAL_CUSTOMIZATION = {
  font: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  style: {
    theme: 'default',
    customVariables: {
      baseColor: '#f2b705',
      buttonTextColor: '#14181f',
      borderRadiusSmall: '6px',
      borderRadiusMedium: '10px',
      borderRadiusLarge: '10px',
    },
  },
}
const SUBSCRIPTION_CUSTOMIZATION = {
  paymentMethods: { minInstallments: 1, maxInstallments: 1 },
  visual: BRICK_VISUAL_CUSTOMIZATION,
}
const PAYMENT_CUSTOMIZATION = {
  paymentMethods: {
    creditCard: 'all',
    debitCard: 'all',
    prepaidCard: 'all',
    ticket: 'all',
    mercadoPago: 'all',
  },
  visual: BRICK_VISUAL_CUSTOMIZATION,
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

export default function MercadoPagoEmbeddedCheckout({ order, onResult, presentation = 'default' }) {
  const { locale, t } = useI18n()
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [brickVersion, setBrickVersion] = useState(0)
  const [checking, setChecking] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [pollExhausted, setPollExhausted] = useState(false)
  const reactId = useId().replaceAll(':', '')
  const orderId = order?.paymentId ?? order?.orderId
  const isSubscription = order?.paymentMode === 'subscription'
  const isMock = env.payments.isMock
  const isModal = presentation === 'modal'
  const isSettle = presentation === 'settle'
  const localeCode = locale === 'en' ? 'en-US' : 'es-AR'
  const realPreferenceId = isRealMercadoPagoPreferenceId(order?.preferenceId)
    ? order.preferenceId
    : null
  const initialization = useMemo(() => ({
    amount: Number(order?.amount ?? 0),
    ...(!isSubscription && realPreferenceId ? { preferenceId: realPreferenceId } : {}),
  }), [isSubscription, order?.amount, realPreferenceId])

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
      trackEvent('payment_submitted', { metadata: { concept: order?.concept ?? null } })
      const response = await processEmbeddedPayment({
        paymentOrderId: orderId,
        orderAccessToken: order?.orderAccessToken,
        formData: payload.formData,
      })
      const status = normalizePaymentStatus(response.payment?.status ?? response.order?.status)
      setResult({ status, data: response })
      announcePaymentUpdate(orderId, status)
      if (status === 'approved') {
        trackConversion('payment_approved', { value: Number(order?.amount ?? 0) })
      } else if (status === 'rejected') {
        trackEvent('payment_rejected', { type: 'error' })
      }
      onResult?.(response)
      return response
    } catch (submitError) {
      setError(controlledPaymentError(submitError, t))
      throw submitError
    }
  }, [onResult, order?.amount, order?.concept, order?.orderAccessToken, orderId, t])

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
        <PaymentBrickErrorBoundary key={brickVersion} onError={handleRenderError}>
          <div className={ready ? 'mp-embedded-checkout__brick is-ready' : 'mp-embedded-checkout__brick'}>
            {isSubscription ? (
              <CardPayment
                key={brickVersion}
                id={`card-payment-brick-${reactId}-${brickVersion}`}
                initialization={initialization}
                customization={SUBSCRIPTION_CUSTOMIZATION}
                locale={localeCode}
                onReady={handleReady}
                onError={handleRenderError}
                onSubmit={submitSubscription}
              />
            ) : (
              <Payment
                key={brickVersion}
                id={`payment-brick-${reactId}-${brickVersion}`}
                initialization={initialization}
                customization={PAYMENT_CUSTOMIZATION}
                locale={localeCode}
                onReady={handleReady}
                onError={handleRenderError}
                onSubmit={submitPayment}
              />
            )}
          </div>
        </PaymentBrickErrorBoundary>
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
