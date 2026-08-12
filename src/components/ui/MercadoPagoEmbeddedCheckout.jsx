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

let initializedPublicKey = null
const SUBSCRIPTION_CUSTOMIZATION = { paymentMethods: { minInstallments: 1, maxInstallments: 1 } }
const PAYMENT_CUSTOMIZATION = {
  paymentMethods: {
    creditCard: 'all',
    debitCard: 'all',
    prepaidCard: 'all',
    ticket: 'all',
    mercadoPago: 'all',
  },
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

export default function MercadoPagoEmbeddedCheckout({ order, onResult, presentation = 'default' }) {
  const { locale, t } = useI18n()
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [brickVersion, setBrickVersion] = useState(0)
  const [checking, setChecking] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const reactId = useId().replaceAll(':', '')
  const orderId = order?.paymentId ?? order?.orderId
  const isSubscription = order?.paymentMode === 'subscription'
  const isMock = env.payments.isMock
  const isModal = presentation === 'modal'
  const localeCode = locale === 'en' ? 'en-US' : 'es-AR'
  const initialization = useMemo(() => ({
    amount: Number(order?.amount ?? 0),
    ...(!isSubscription && order?.preferenceId ? { preferenceId: order.preferenceId } : {}),
  }), [isSubscription, order?.amount, order?.preferenceId])

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

  const submitPayment = useCallback(async (payload) => {
    setError('')
    try {
      if (!payload?.formData) throw new Error(t('payments.embeddedError'))
      const response = await processEmbeddedPayment({
        paymentOrderId: orderId,
        orderAccessToken: order?.orderAccessToken,
        formData: payload.formData,
      })
      const status = normalizePaymentStatus(response.payment?.status ?? response.order?.status)
      setResult({ status, data: response })
      announcePaymentUpdate(orderId, status)
      onResult?.(response)
      return response
    } catch (submitError) {
      setError(controlledPaymentError(submitError, t))
      throw submitError
    }
  }, [onResult, order?.orderAccessToken, orderId, t])

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
    let checks = 0
    const timer = setInterval(() => {
      checks += 1
      void refreshStatus({ quiet: true }).then((status) => {
        if (status !== 'pending' || checks >= 20) clearInterval(timer)
      })
    }, 3_000)
    return () => clearInterval(timer)
  }, [refreshStatus, result?.status])

  function resetCheckout() {
    setResult(null)
    setError('')
    setReady(isMock)
    setBrickVersion((current) => current + 1)
  }

  if (!orderId || !order?.amount) return null
  if (!isMock && !env.mercadoPago.configured) {
    return <p className="mp-embedded-checkout__error" role="alert">{t('payments.embeddedConfigMissing')}</p>
  }

  const resultMessage = result?.status === 'approved'
    ? t(isSubscription ? 'payments.subscriptionActivated' : 'payments.paymentApproved')
    : result?.status === 'rejected'
      ? t('payments.paymentRejected')
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
      className={`mp-embedded-checkout${isModal ? ' mp-embedded-checkout--modal' : ''}`}
      aria-labelledby={`mp-checkout-title-${orderId}`}
    >
      <header className="mp-embedded-checkout__header">
        <span className="mp-embedded-checkout__icon"><ShieldCheck size={20} aria-hidden /></span>
        <div>
          <h3 id={`mp-checkout-title-${orderId}`}>
            {t(isSubscription ? 'payments.subscriptionTitle' : 'payments.embeddedTitle')}
          </h3>
          <p>{t(isSubscription ? 'payments.subscriptionLead' : 'payments.embeddedLead')}</p>
        </div>
      </header>

      {!isMock && !ready && !result && <p className="mp-embedded-checkout__loading">{t('payments.embeddedLoading')}</p>}
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
          {result.status === 'approved' ? <CheckCircle2 size={20} aria-hidden /> : <Clock3 size={20} aria-hidden />}
          <p>{resultMessage}</p>
        </div>
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
      {!isModal ? (
        <small className="mp-embedded-checkout__security">
          {t(isMock ? 'payments.mockSecurity' : 'payments.embeddedSecurity')}
        </small>
      ) : null}
    </section>
  )
}
