import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CreditCard,
  ImageDown,
  Landmark,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PRICING } from '../../lib/constants.js'
import { formatShortDate, money } from '../../lib/format.js'
import { env } from '../../config/env.js'
import { listMembershipPlans } from '../../services/paymentService.js'
import {
  getMembershipLifecycle,
  isMembershipCurrent,
  MEMBERSHIP_LIFECYCLE,
} from '../../services/membershipService.js'
import MercadoPagoEmbeddedCheckout from '../../components/ui/MercadoPagoEmbeddedCheckout.jsx'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import TransferProofUpload from '../../components/ui/TransferProofUpload.jsx'

function TransferModal({ athlete, amount, orderId, onClose }) {
  const { t, locale } = useI18n()
  const panelRef = useRef(null)
  const dialogStateRef = useRef({ onClose })
  dialogStateRef.current = { onClose }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        dialogStateRef.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), a[href]',
      ) ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  return (
    <div className="account-payment-modal__overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        aria-labelledby="transfer-title"
        aria-modal="true"
        className="account-payment-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <span>{t('account.membership.transferEyebrow')}</span>
            <h2 id="transfer-title">{t('account.membership.transferTitle')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('account.membership.transferClose')}><X size={19} /></button>
        </header>
        <div className="account-payment-modal__notice">{t('account.membership.transferNotice')}</div>
        <dl className="account-transfer-data">
          <div><dt>{t('account.membership.transferAlias')}</dt><dd>{env.payments.transferAlias || t('account.membership.transferAskAdmin')}</dd></div>
          <div><dt>{t('account.membership.transferCbu')}</dt><dd>{env.payments.transferCbu || t('account.membership.transferAskAdmin')}</dd></div>
          <div><dt>{t('account.membership.transferHolder')}</dt><dd>{env.payments.transferHolder || t('account.membership.transferAskAdmin')}</dd></div>
          <div><dt>{t('account.membership.transferAmount')}</dt><dd>{money(amount, locale)}</dd></div>
          <div><dt>{t('account.membership.transferReference')}</dt><dd>{athlete.documentId} · {athlete.fullName}</dd></div>
        </dl>
        <p>{t('account.membership.transferHint')}</p>
        {orderId ? <TransferProofUpload orderId={orderId} /> : null}
        <button type="button" className="account-primary-action" onClick={onClose}>{t('account.membership.transferUnderstood')}</button>
      </section>
    </div>
  )
}

export default function MembershipPurchaseSection({
  athlete,
  membership,
  onActivateMembership,
  onCancelMembership,
  onStartMembershipPayment,
  demoMode = false,
}) {
  const { locale, t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferOrderId, setTransferOrderId] = useState(null)
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [embeddedOrder, setEmbeddedOrder] = useState(null)
  const [plans, setPlans] = useState([])
  const [planCode, setPlanCode] = useState('plu-annual')
  const [cardOpen, setCardOpen] = useState(false)
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
  const membershipCanPurchase = !membershipActive && !membershipScheduled
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
  const comboSavings = PRICING.membership + PRICING.event - PRICING.combo
  const methodLabel = paymentMethod === 'mercado_pago'
    ? 'Mercado Pago'
    : t('account.membership.transfer')
  const fallbackPlan = useMemo(() => ({
    code: 'plu-annual',
    name: t('account.membership.membershipPlanLabel'),
    price: PRICING.membership,
    currency: 'ARS',
    billingFrequency: 'annual',
    collectionMode: 'one_time',
  }), [t])
  const availablePlans = plans.length ? plans : env.appProduction ? [] : [fallbackPlan]
  const selectedPlan = availablePlans.find((plan) => plan.code === planCode) ?? availablePlans[0]
  const checkoutLocked = submitting || Boolean(embeddedOrder)

  const loadPlans = useCallback(async ({ force = false, signal } = {}) => {
    setPlansState('loading')
    setPlansError('')
    try {
      const { plans: nextPlans } = await listMembershipPlans({ force })
      if (signal?.aborted) return
      setPlans(nextPlans ?? [])
      if (nextPlans?.length) {
        setPlanCode((current) =>
          nextPlans.some((plan) => plan.code === current) ? current : nextPlans[0].code,
        )
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

  async function startMembershipPayment() {
    if (submitting || embeddedOrder) return
    setCheckoutMessage('')
    setCheckoutIsError(false)
    if (!selectedPlan) {
      setCheckoutMessage(t('account.membership.planUnavailable'))
      setCheckoutIsError(true)
      return
    }

    setSubmitting(true)
    try {
      const result = await onStartMembershipPayment?.(paymentMethod, selectedPlan.code)
      if (result?.error) {
        setCheckoutMessage(result.error)
        setCheckoutIsError(true)
        return
      }
      if (paymentMethod === 'transferencia') {
        // El id de la orden habilita la subida del comprobante dentro del mismo
        // modal: es el momento en que el atleta tiene el ticket bancario a mano.
        setTransferOrderId(result?.createdOrder?.paymentId ?? null)
        setTransferOpen(true)
        return
      }
      if (result?.createdOrder) {
        setEmbeddedOrder(result.createdOrder)
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

  function changePlan(nextPlanCode) {
    if (checkoutLocked) return
    setPlanCode(nextPlanCode)
    setCheckoutMessage('')
    setCheckoutIsError(false)
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
  } else if (membershipExpired) {
    statusTone = 'expired'
    statusLabel = t('account.membership.statusExpired')
    statusValue = t('account.membership.statusExpiredValue')
    statusMeta = membership.expirationDate
      ? t('account.membership.expiredOn', { date: formatShortDate(membership.expirationDate, locale) })
      : ''
    statusNext = t('account.membership.nextRenew')
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
    <section id="account-membership" className="account-section account-section--gold account-membership">
      <header className="account-membership__header">
        <div className="account-membership__intro">
          <div className="account-section__heading">
            <div className="account-section__icon account-section__icon--gold"><ShieldCheck size={21} /></div>
            <div>
              <span>{t('account.membership.eyebrow')}</span>
              <h2>{membershipActive ? t('account.membership.titleActive') : t('account.membership.title')}</h2>
            </div>
          </div>
          <p className="account-section__lead">
            {membershipActive ? t('account.membership.leadActive') : t('account.membership.lead')}
          </p>
        </div>

        {membershipCanPurchase && (
          <div className="account-membership__price">
            <span className="account-membership__price-label">{t('account.membership.priceLabel')}</span>
            <p className="account-membership__price-value">
              {selectedPlan ? money(selectedPlan.price, locale) : '—'}
            </p>
          </div>
        )}
      </header>

      <div className={`account-membership-status account-membership-status--${statusTone}`}>
        <div className="account-membership-status__copy">
          <span className="account-membership-status__label">{statusLabel}</span>
          <span className="account-membership-status__value">{statusValue}</span>
        </div>
        <div className="account-membership-status__aside">
          {statusMeta ? <span className="account-membership-status__meta">{statusMeta}</span> : null}
          <span className="account-membership-status__next">{statusNext}</span>
        </div>
      </div>

      {membershipActive && (
        <div className="account-card-share">
          <span className="account-card-share__label">{t('account.membership.cardEyebrow')}</span>
          <h2>{t('account.membership.cardTitle')}</h2>
          <p>{t('account.membership.cardLead')}</p>
          <button type="button" className="card-trigger-btn" onClick={() => setCardOpen(true)}>
            <ImageDown className="card-trigger-btn__icon" size={16} aria-hidden />
            {t('account.membership.cardAction')}
          </button>
          <CardPreviewModal open={cardOpen} onClose={() => setCardOpen(false)} cardData={cardData} />
        </div>
      )}

      {membershipCanPurchase && (
        <div className="account-membership__grid">
          <div className="account-membership__plan">
            <h3 className="account-membership__plan-title">{t('account.membership.includes')}</h3>
            <ul className="account-benefits">
              <li><Check size={15} aria-hidden /> {t('account.membership.benefitCredential')}</li>
              <li><Check size={15} aria-hidden /> {t('account.membership.benefitCode')}</li>
              <li><Check size={15} aria-hidden /> {t('account.membership.benefitEvents')}</li>
            </ul>

            <aside className="account-combo-offer">
              <div className="account-combo-offer__copy">
                <span>{env.appProduction
                  ? t('account.membership.comboComingSoon')
                  : t('account.membership.comboEyebrow')}</span>
                <h3>{t('account.membership.comboTitle')}</h3>
                <p>{env.appProduction
                  ? t('account.membership.comboComingSoonLead')
                  : t('account.membership.comboLead')}</p>
              </div>
              {!env.appProduction ? <dl className="account-combo-offer__prices">
                <div>
                  <dt>{t('account.membership.comboSeparate')}</dt>
                  <dd>{money(PRICING.membership + PRICING.event, locale)}</dd>
                </div>
                <div>
                  <dt>{t('account.membership.comboOffer')}</dt>
                  <dd>{money(PRICING.combo, locale)}</dd>
                </div>
                <div>
                  <dt>{t('account.membership.comboSavings')}</dt>
                  <dd>{money(comboSavings, locale)}</dd>
                </div>
              </dl> : null}
            </aside>
          </div>

          <div className="account-membership__checkout">
            {env.appProduction && plansState === 'loading' ? (
              <p className="account-plan-feedback" role="status">
                {t('account.membership.planLoading')}
              </p>
            ) : null}
            {env.appProduction && plansState === 'error' ? (
              <div className="account-plan-feedback account-plan-feedback--error" role="alert">
                <AlertCircle size={16} aria-hidden />
                <span>{plansError || t('account.membership.planLoadError')}</span>
                <button type="button" onClick={() => loadPlans({ force: true })}>
                  <RefreshCw size={14} aria-hidden />
                  {t('account.membership.retryPlans')}
                </button>
              </div>
            ) : null}
            {availablePlans.length > 1 && (
              <label className="field">
                <span>{t('account.membership.planSelector')}</span>
                <select
                  value={selectedPlan?.code ?? ''}
                  disabled={checkoutLocked}
                  onChange={(event) => changePlan(event.target.value)}
                >
                  {availablePlans.map((plan) => (
                    <option key={plan.code} value={plan.code}>
                      {plan.name} · {money(plan.price, locale)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset className="account-payment-options" disabled={checkoutLocked || !selectedPlan}>
              <legend>{t('account.membership.paymentLegend')}</legend>
              <label className={paymentMethod === 'mercado_pago' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="membership-payment"
                  value="mercado_pago"
                  checked={paymentMethod === 'mercado_pago'}
                  onChange={(event) => changePaymentMethod(event.target.value)}
                />
                <CreditCard size={20} aria-hidden />
                <span>
                  <span className="account-payment-options__label">Mercado Pago</span>
                  <small>{t('account.membership.onlineCheckout')}</small>
                </span>
              </label>
              <label className={paymentMethod === 'transferencia' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="membership-payment"
                  value="transferencia"
                  checked={paymentMethod === 'transferencia'}
                  disabled={!selectedPlan || selectedPlan.collectionMode === 'recurring'}
                  onChange={(event) => changePaymentMethod(event.target.value)}
                />
                <Landmark size={20} aria-hidden />
                <span>
                  <span className="account-payment-options__label">{t('account.membership.transfer')}</span>
                  <small>{t('account.membership.manualValidation')}</small>
                </span>
              </label>
            </fieldset>

            <div className="account-membership__actions">
              <button
                type="button"
                className="account-primary-action account-primary-action--block"
                disabled={!selectedPlan || checkoutLocked}
                aria-busy={submitting}
                onClick={startMembershipPayment}
              >
                {submitting ? <LoaderCircle size={16} aria-hidden /> : null}
                {submitting
                  ? t('account.membership.creatingOrder')
                  : embeddedOrder
                    ? t('account.membership.orderCreated')
                    : t('account.membership.continueWith', { method: methodLabel })}
              </button>
            </div>
            {embeddedOrder && <MercadoPagoEmbeddedCheckout order={embeddedOrder} />}
          </div>
        </div>
      )}

      {demoMode && !env.payments.isMock && <div className="account-membership__demo">
        <p className="account-membership__demo-label">{t('account.membership.demoLabel')}</p>
        <div className="account-demo-actions">
          {membershipCanPurchase && (
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
        <TransferModal
          athlete={athlete}
          amount={selectedPlan?.price ?? 0}
          orderId={transferOrderId}
          onClose={() => setTransferOpen(false)}
        />
      )}
    </section>
  )
}
