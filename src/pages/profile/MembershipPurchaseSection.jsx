import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  ImageDown,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, money } from '../../lib/format.js'
import { isPaidCheckoutOpen } from '../../lib/registrationSchedule.js'
import { listMembershipPlans } from '../../services/paymentService.js'
import {
  getMembershipLifecycle,
  isMembershipCurrent,
  MEMBERSHIP_LIFECYCLE,
} from '../../services/membershipService.js'
import CheckoutDesk, { CheckoutBar } from '../../components/checkout/CheckoutDesk.jsx'
import MercadoPagoEmbeddedCheckout from '../../components/ui/MercadoPagoEmbeddedCheckout.jsx'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import FeatureComingSoon from '../../components/ui/FeatureComingSoon.jsx'
import TransferPayModal from '../../components/checkout/TransferPayModal.jsx'
import SegmentedSwitch from '../../components/ui/SegmentedSwitch.jsx'

export default function MembershipPurchaseSection({
  athlete,
  membership,
  onActivateMembership,
  onCancelMembership,
  onStartMembershipPayment,
  demoMode = false,
  gateEvent = null,
}) {
  const { locale, t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferOrderId, setTransferOrderId] = useState(null)
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [embeddedOrder, setEmbeddedOrder] = useState(null)
  const [changingMethod, setChangingMethod] = useState(false)
  const [plans, setPlans] = useState([])
  const [planCode, setPlanCode] = useState('plu-annual')
  const [cardOpen, setCardOpen] = useState(false)
  // En mobile el destino natural es una historia de Instagram; en desktop,
  // el post cuadrado. Mismo criterio que QrCredentialSection. El usuario
  // puede cambiarlo dentro del modal.
  const [cardInitialFormat, setCardInitialFormat] = useState('square')
  function openCardModal() {
    const prefersStory = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
    setCardInitialFormat(prefersStory ? 'story' : 'square')
    setCardOpen(true)
  }
  const [plansState, setPlansState] = useState('loading')
  const [plansError, setPlansError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkoutIsError, setCheckoutIsError] = useState(false)
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
  const paidCheckoutOpen = isPaidCheckoutOpen(gateEvent, env)
  const showPurchaseCheckout = membershipCanPurchase && paidCheckoutOpen
  const showCheckoutSoon = membershipCanPurchase && !paidCheckoutOpen
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
  const methodLabel = paymentMethod === 'mercado_pago'
    ? 'Mercado Pago'
    : t('account.membership.transfer')
  const availablePlans = plans
  const selectedPlan = availablePlans.find((plan) => plan.code === planCode) ?? availablePlans[0]
  const checkoutLocked = submitting || (Boolean(embeddedOrder) && !changingMethod)
  const ctaDisabled = !selectedPlan || submitting
  // Igual que el settle de inscripción a torneo: en cuanto hay una orden de
  // Mercado Pago, la propia sección se convierte en la pantalla de cobro en
  // vez de abrir un modal aparte — con la flecha de "cambiar método" para
  // volver al selector sin quedar trabado.
  const mpSettling = Boolean(embeddedOrder) && embeddedOrder.paymentMethod === 'mercado_pago' && !changingMethod
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
  const billingHint = billingMode === 'recurring'
    ? t('account.membership.planModeAutomaticHint')
    : t('account.membership.planModeAnnualHint')
  const showPlanSwitch = availablePlans.length > 1
  const ctaLabel = submitting
    ? t('account.membership.creatingOrder')
    : embeddedOrder
      ? t('account.membership.continuePayment')
      : t('account.membership.continueWith', { method: methodLabel })

  const loadPlans = useCallback(async ({ force = false, signal } = {}) => {
    setPlansState('loading')
    setPlansError('')
    try {
      const { plans: nextPlans } = await listMembershipPlans({ force })
      if (signal?.aborted) return
      setPlans(nextPlans ?? [])
      if (nextPlans?.length) {
        setPlanCode((current) => {
          if (nextPlans.some((plan) => plan.code === current)) return current
          const preferredMode = typeof sessionStorage !== 'undefined'
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
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    void loadPlans({ signal: controller.signal })
    return () => controller.abort()
  }, [loadPlans])

  useEffect(() => {
    if (selectedPlan?.collectionMode === 'recurring' && paymentMethod !== 'mercado_pago') {
      setPaymentMethod('mercado_pago')
    }
  }, [paymentMethod, selectedPlan?.collectionMode])

  async function startMembershipPayment(methodOverride) {
    const method = methodOverride ?? paymentMethod
    if (submitting) return
    setCheckoutMessage('')
    setCheckoutIsError(false)
    if (!selectedPlan) {
      setCheckoutMessage(t('account.membership.planUnavailable'))
      setCheckoutIsError(true)
      return
    }

    setSubmitting(true)
    try {
      const result = await onStartMembershipPayment?.(method, selectedPlan.code)
      if (result?.error) {
        setCheckoutMessage(result.error)
        setCheckoutIsError(true)
        return
      }
      if (method === 'transferencia') {
        // Puede venir de cambiar de método con una orden de Mercado Pago
        // todavía pendiente: esa pantalla de settle deja de tener sentido en
        // cuanto se abre el modal de transferencia.
        setEmbeddedOrder(null)
        setChangingMethod(false)
        // El id de la orden habilita la subida del comprobante dentro del mismo
        // modal: es el momento en que el atleta tiene el ticket bancario a mano.
        setTransferOrderId(result?.createdOrder?.paymentId ?? null)
        setTransferOpen(true)
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

  function changePlan(nextPlanCode) {
    if (checkoutLocked) return
    setPlanCode(nextPlanCode)
    setCheckoutMessage('')
    setCheckoutIsError(false)
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
      ? t('account.membership.validUntil', { date: formatShortDate(membership.expirationDate, locale) })
      : ''
    statusNext = t('account.membership.nextActive')
  } else if (membershipScheduled) {
    statusTone = 'scheduled'
    statusLabel = t('account.membership.statusScheduled')
    statusValue = membership.startDate
      ? t('account.membership.startsOn', { date: formatShortDate(membership.startDate, locale) })
      : t('account.membership.statusScheduledValue')
    statusMeta = membership.expirationDate
      ? t('account.membership.validUntil', { date: formatShortDate(membership.expirationDate, locale) })
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
      ? t('account.membership.expiredOn', { date: formatShortDate(membership.expirationDate, locale) })
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
      ].filter(Boolean).join(' ')}
    >
      {membershipCanPurchase || transferUnderReview ? (
        <header className="account-membership__banner">
          <div className="account-membership__banner-copy">
            <div className="account-membership__banner-meta">
              <span className="account-membership__eyebrow">{t('account.membership.eyebrow')}</span>
              <p className={`account-membership__status-line account-membership__status-line--${statusTone}`}>
                <span className="account-membership-status__label">{statusLabel}</span>
                <span aria-hidden className="account-membership__status-sep">·</span>
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
            {statusMeta ? <p className="account-membership__banner-meta-line">{statusMeta}</p> : null}
          </div>
        </header>
      ) : (
        <header className="account-membership__header">
          <div className="account-membership__intro">
            <div className="account-section__heading">
              <div className="account-section__icon account-section__icon--gold"><ShieldCheck size={21} /></div>
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

      {!membershipCanPurchase && !transferUnderReview ? (
        <div className={`account-membership-status account-membership-status--${statusTone}`}>
          <div className="account-membership-status__copy">
            <span className="account-membership-status__label">{statusLabel}</span>
            <span className="account-membership-status__value">{statusValue}</span>
          </div>
          {(statusMeta || (!membershipScheduled && statusNext)) ? (
            <div className="account-membership-status__aside">
              {statusMeta ? <span className="account-membership-status__meta">{statusMeta}</span> : null}
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

      {showPurchaseCheckout && (
        <div className="account-membership__decision account-membership__decision--solo">
          <ul className="account-benefits account-benefits--inline" aria-label={t('account.membership.includes')}>
            <li><Check size={14} aria-hidden /> {t('account.membership.benefitCredential')}</li>
            <li><Check size={14} aria-hidden /> {t('account.membership.benefitCode')}</li>
            <li><Check size={14} aria-hidden /> {t('account.membership.benefitEvents')}</li>
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
                <button
                  type="button"
                  className="account-membership__settle-alt"
                  disabled={submitting}
                  onClick={() => void startMembershipPayment('transferencia')}
                >
                  {t('account.membership.payByTransfer')}
                </button>
              </div>
              <MercadoPagoEmbeddedCheckout order={embeddedOrder} presentation="settle" />
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
                    <span className="account-membership__billing-label" id="membership-billing-label">
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

              <CheckoutDesk
                bar={
                  selectedPlan ? (
                    <CheckoutBar
                      ctaLabel={ctaLabel}
                      disabled={ctaDisabled}
                      submitting={submitting}
                      total={selectedPlan.price}
                      totalLabel={t('account.membership.priceLabel')}
                      type="button"
                      onClick={handleCheckoutAction}
                    />
                  ) : null
                }
                methods={[
                  { value: 'mercado_pago', label: t('formOptions.payment.mercadoPago') },
                  {
                    value: 'transferencia',
                    label: t('account.membership.transfer'),
                    disabled: !selectedPlan || selectedPlan.collectionMode === 'recurring',
                  },
                ]}
                methodsDisabled={checkoutLocked || !selectedPlan}
                methodsLabel={t('account.membership.paymentLegend')}
                methodsLegend={t('account.membership.paymentLegend')}
                offers={
                  selectedPlan
                    ? [
                        {
                          featured: true,
                          id: selectedPlan.code,
                          name: selectedPlan.name,
                          priceLabel: money(selectedPlan.price, locale),
                        },
                      ]
                    : []
                }
                paymentMethod={paymentMethod}
                paymentName="membership-payment"
                selectedOfferId={selectedPlan?.code}
                onPaymentChange={(event) => changePaymentMethod(event.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {demoMode && !env.payments.isMock && <div className="account-membership__demo">
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
      </div>}

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

      {transferOpen && (
        <TransferPayModal
          athlete={athlete}
          amount={selectedPlan?.price ?? 0}
          orderId={transferOrderId}
          onClose={() => setTransferOpen(false)}
        />
      )}
    </section>
  )
}
