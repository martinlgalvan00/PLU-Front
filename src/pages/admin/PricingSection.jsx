import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeDollarSign,
  CalendarClock,
  CalendarOff,
  Check,
  ChevronDown,
  CirclePlus,
  Copy,
  Pencil,
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
import { getDiscountCodeAvailability } from '../../services/pricingAdminService.js'

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

const EMPTY_DISCOUNT_CODE = {
  id: undefined,
  code: '',
  description: '',
  percentOff: '',
  appliesTo: 'membership',
  maxRedemptions: '',
  expiresAt: '',
  active: true,
  enablesManualPayment: false,
}

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
  if (!expiresAt) return { label: t('admin.sections.pricing.noExpiry'), urgent: false, expired: false }
  const date = new Date(expiresAt)
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  const diffDays = Math.floor((date.getTime() - now.getTime()) / DAY_MS)

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays)
    return {
      label: daysAgo === 1
        ? t('admin.sections.pricing.expiredYesterday')
        : t('admin.sections.pricing.expiredDaysAgo', { count: daysAgo }),
      urgent: true,
      expired: true,
    }
  }
  if (diffDays === 0) return { label: t('admin.sections.pricing.expiresToday'), urgent: true, expired: false }
  if (diffDays === 1) return { label: t('admin.sections.pricing.expiresTomorrow'), urgent: true, expired: false }
  if (diffDays <= 7) {
    return { label: t('admin.sections.pricing.expiresInDays', { count: diffDays }), urgent: true, expired: false }
  }
  return { label: t('admin.sections.pricing.expiresOn', { date: dateLabel }), urgent: false, expired: false }
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
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
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
  onSetPlanActive,
  onSetPlanRetirement,
  onUpsertDiscountCode,
  onSetDiscountCodeActive,
  onDeleteDiscountCode,
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
  })
  const [retirementPlanId, setRetirementPlanId] = useState(null)
  const [retirementDraft, setRetirementDraft] = useState('')
  const [codeDraft, setCodeDraft] = useState(null)
  const [codeError, setCodeError] = useState('')
  const [copiedCodeId, setCopiedCodeId] = useState(null)
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

  useEffect(() => () => {
    window.clearTimeout(copyFeedbackTimeoutRef.current)
  }, [])

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

  const pricingWritesEnabled = isFeatureEnabled(FEATURE_KEYS.pricingWrites)
  const locked =
    !pricingWritesEnabled || configuration.availability?.editable === false || !canEdit
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
    () => plans.filter((plan) => {
      if (!plan.active || plan.collectionMode !== 'one_time') return false
      if (plan.effectiveFrom && new Date(plan.effectiveFrom) > now) return false
      return !plan.retiredAt || new Date(plan.retiredAt) > now
    }),
    [now, plans],
  )
  const selectedEvent = events.find((event) => event.slug === selectedEventSlug) ?? events[0] ?? null
  const selectedPlan = oneTimePlans.find((plan) => plan.id === comboDraft.membershipPlanId) ?? null
  const separatePrice =
    Number(selectedPlan?.price ?? 0) + Number(selectedEvent?.registrationPrice ?? 0)
  const comboPriceValue = Number(comboDraft.price)
  const comboSavings =
    Number.isInteger(comboPriceValue) && comboPriceValue > 0 ? separatePrice - comboPriceValue : null
  const comboOverLimit = comboSavings != null && comboSavings < 0
  // Mismo tope que aplica staff_save_event_combo_offer del lado del servidor:
  // la suma de los precios manuales (o de catálogo si el plan/evento no tiene
  // uno propio) del plan y el evento.
  const separateManualPrice =
    Number(selectedPlan?.manualPrice ?? selectedPlan?.price ?? 0) +
    Number(selectedEvent?.registrationManualPrice ?? selectedEvent?.registrationPrice ?? 0)
  const comboManualPriceValue = comboDraft.manualPrice === '' ? null : Number(comboDraft.manualPrice)
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
    const firstField = form?.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])')
    firstField?.focus?.()
    return undefined
  }, [planFormOpen])

  const codeFormOpen = Boolean(codeDraft)
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
            percentOff: source.percentOff,
            appliesTo: source.appliesTo,
            maxRedemptions: source.maxRedemptions ?? '',
            expiresAt: toLocalDateTime(source.expiresAt),
            active: source.active,
            enablesManualPayment: source.enablesManualPayment ?? false,
          }
        : { ...EMPTY_DISCOUNT_CODE },
    )
  }

  async function submitCode(event) {
    event.preventDefault()
    setCodeError('')
    const percentOff = Number(codeDraft.percentOff)
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(codeDraft.code.toUpperCase())) {
      setCodeError(t('admin.sections.pricing.codeFormatHint'))
      return
    }
    if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99) {
      setCodeError(t('admin.sections.pricing.loadError'))
      return
    }

    setPendingAction('code')
    const result = await onUpsertDiscountCode?.({
      ...codeDraft,
      code: codeDraft.code.toUpperCase(),
      percentOff,
      maxRedemptions: codeDraft.maxRedemptions === '' ? undefined : Number(codeDraft.maxRedemptions),
    })
    setPendingAction('')
    if (result?.error) {
      setCodeError(result.error)
      return
    }
    setCodeDraft(null)
    setNotice(t('admin.sections.pricing.saved'))
  }

  async function toggleCode(code) {
    setPendingAction(code.id)
    setNotice('')
    const result = await onSetDiscountCodeActive?.(code.id, !code.active)
    setPendingAction('')
    if (result?.error) setCodeError(result.error)
    else setNotice(t('admin.sections.pricing.saved'))
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
    setNotice(t('admin.sections.pricing.codeDeleted'))
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
    const separatePrice = Number(selectedPlan?.price ?? 0) + Number(selectedEvent?.registrationPrice ?? 0)
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

    setPendingAction('combo')
    const result = await onSaveComboOffer?.(selectedEvent.slug, { ...comboDraft, price, manualPrice })
    setPendingAction('')
    if (result?.error) setComboError(result.error)
    else {
      setNotice(t('admin.sections.pricing.saved'))
      setComboEditorOpen(false)
    }
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
      {notice ? <div className="admin-pricing__message" role="status">{notice}</div> : null}
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

        <div className="admin-pricing__plan-list" role="list" aria-label={t('admin.sections.pricing.plansTitle')}>
          {plans.map((plan) => {
            const status = planStatus(plan, now)
            const effectiveLabel = plan.effectiveFrom
              ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(plan.effectiveFrom))
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
                    <span><code>{plan.familyCode}</code></span>
                    <span>{t('admin.sections.pricing.currentVersion', { version: plan.version })}</span>
                    <span>{t(`admin.sections.pricing.${plan.billingFrequency}`)}</span>
                    <span>
                      {t(`admin.sections.pricing.${plan.collectionMode === 'recurring' ? 'recurring' : 'oneTime'}`)}
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
                      {t(`admin.sections.pricing.${plan.active ? 'activeSwitch' : 'cancelledSwitch'}`)}
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
          <form
            ref={planFormRef}
            className="admin-pricing__form"
            onSubmit={submitPlan}
            noValidate
          >
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
                  onChange={(event) => setPlanDraft({ ...planDraft, familyCode: event.target.value.toLowerCase() })}
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
                  onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })}
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
                  onChange={(event) => setPlanDraft({ ...planDraft, manualPrice: event.target.value })}
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
                  onChange={(event) => setPlanDraft({ ...planDraft, billingFrequency: event.target.value })}
                >
                  <option value="annual">{t('admin.sections.pricing.annual')}</option>
                  <option value="monthly">{t('admin.sections.pricing.monthly')}</option>
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.collectionMode')}</span>
                <select
                  value={planDraft.collectionMode}
                  onChange={(event) => setPlanDraft({ ...planDraft, collectionMode: event.target.value })}
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
                  onChange={(event) => setPlanDraft({ ...planDraft, intervalCount: event.target.value })}
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
                  onChange={(event) => setPlanDraft({ ...planDraft, graceDays: event.target.value })}
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.effectiveFrom')}</span>
                <input
                  type="datetime-local"
                  value={planDraft.effectiveFrom}
                  onChange={(event) => setPlanDraft({ ...planDraft, effectiveFrom: event.target.value })}
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.retiresAt')}</span>
                <input
                  type="datetime-local"
                  value={planDraft.retiresAt}
                  onChange={(event) => setPlanDraft({ ...planDraft, retiresAt: event.target.value })}
                />
                <small>{t('admin.sections.pricing.retiresAtHint')}</small>
              </label>
            </fieldset>
            {planError ? <p className="admin-pricing__form-error" role="alert">{planError}</p> : null}
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

      <section className="admin-pricing__block admin-pricing__block--combo" aria-labelledby="pricing-combo-title">
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
                  ? t('admin.sections.pricing.comboOfferOn')
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
                    {comboSavings != null && comboSavings >= 0
                      ? money(comboSavings, locale)
                      : '—'}
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
                  onChange={(event) => setComboDraft({ ...comboDraft, membershipPlanId: event.target.value })}
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
                      onChange={(event) => setComboDraft({ ...comboDraft, price: event.target.value })}
                      disabled={locked || pendingAction === 'combo' || oneTimePlans.length === 0}
                      required
                    />
                  </label>
                  <p className="admin-pricing__combo-max">
                    {t('admin.sections.pricing.comboMax', { amount: money(separatePrice, locale) })}
                  </p>
                  {comboSavings != null ? (
                    <p className={`admin-pricing__combo-delta${comboOverLimit ? ' is-invalid' : ''}`.trim()}>
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
                onChange={(event) => setComboDraft({ ...comboDraft, manualPrice: event.target.value })}
                disabled={locked || pendingAction === 'combo' || oneTimePlans.length === 0}
              />
              <small>
                {comboManualOverLimit
                  ? t('admin.sections.pricing.comboOverLimit')
                  : t('admin.sections.pricing.comboMax', { amount: money(separateManualPrice, locale) })}
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
                  onChange={(event) => setComboDraft({ ...comboDraft, startsAt: event.target.value })}
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.comboEnds')}</span>
                <input
                  type="datetime-local"
                  value={comboDraft.endsAt}
                  onChange={(event) => setComboDraft({ ...comboDraft, endsAt: event.target.value })}
                />
              </label>
              <label className="admin-pricing__toggle">
                <input
                  type="checkbox"
                  checked={comboDraft.active}
                  onChange={(event) => setComboDraft({ ...comboDraft, active: event.target.checked })}
                />
                <span>{t('admin.sections.pricing.comboActive')}</span>
              </label>
            </fieldset>

            {oneTimePlans.length === 0 ? (
              <p className="admin-pricing__form-error">{t('admin.sections.pricing.noOneTimePlans')}</p>
            ) : null}
            {comboError ? <p className="admin-pricing__form-error" role="alert">{comboError}</p> : null}

            <div className="admin-pricing__form-actions">
              <button
                type="submit"
                className="admin-pricing__btn admin-pricing__btn--primary"
                disabled={
                  locked || pendingAction === 'combo' || oneTimePlans.length === 0 ||
                  comboOverLimit || comboManualOverLimit
                }
              >
                <Save size={15} aria-hidden />
                {pendingAction === 'combo' ? t('admin.sections.pricing.saving') : t('admin.sections.pricing.saveCombo')}
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
            <span className="admin-pricing__btn-label">{t('admin.sections.pricing.newDiscountCode')}</span>
          </button>
        </header>

        <div className="admin-pricing__plan-list" role="list" aria-label={t('admin.sections.pricing.discountCodesTitle')}>
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
                    <h3><code>{code.code}</code></h3>
                    <button
                      type="button"
                      className="admin-pricing__btn admin-pricing__btn--quiet admin-pricing__copy-code"
                      onClick={() => copyDiscountCode(code)}
                      aria-label={t('admin.sections.pricing.copyDiscountCode', { code: code.code })}
                    >
                      {copiedCodeId === code.id
                        ? <Check size={14} aria-hidden />
                        : <Copy size={14} aria-hidden />}
                      <span aria-live="polite">
                        {copiedCodeId === code.id
                          ? t('admin.sections.pricing.discountCodeCopied')
                          : t('admin.sections.pricing.copy')}
                      </span>
                    </button>
                    <span className={`admin-pricing__status${status === 'active' ? ' admin-pricing__status--active' : ''}`}>
                      {t(`admin.sections.pricing.discountStatus.${status}`)}
                    </span>
                    {code.enablesManualPayment ? (
                      <span className="admin-pricing__status admin-pricing__status--manual">
                        {t('admin.sections.pricing.enablesManualPaymentBadge')}
                      </span>
                    ) : null}
                  </div>
                  <p className="admin-pricing__plan-meta">
                    <span>{t(`admin.sections.pricing.appliesTo.${code.appliesTo}`)}</span>
                    {!availability.hasLimit ? <span>{usageLabel}</span> : null}
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
                        <span>{t('admin.sections.pricing.remainingRedemptions', { count: availability.remaining })}</span>
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
                  {code.description ? <p className="admin-pricing__plan-meta">{code.description}</p> : null}
                </div>

                <strong className="admin-pricing__plan-amount admin-pricing__plan-amount--percent">
                  −{code.percentOff}%
                </strong>

                <div className="admin-pricing__plan-actions">
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
                    aria-label={t('admin.sections.pricing.deleteDiscountCodeAria', { code: code.code })}
                  >
                    <Trash2 size={14} aria-hidden />
                    {t('admin.sections.pricing.deleteDiscountCode')}
                  </button>
                  <label
                    className={`admin-pricing__switch${code.active ? ' is-active' : ' is-cancelled'}`.trim()}
                    aria-label={t(`admin.sections.pricing.${code.active ? 'active' : 'inactive'}`)}
                  >
                    <input
                      type="checkbox"
                      checked={code.active}
                      onChange={() => toggleCode(code)}
                      disabled={locked || availability.exhausted || pendingAction === code.id}
                    />
                    <span aria-hidden />
                    <strong>
                      {availability.exhausted
                        ? t('admin.sections.pricing.exhaustedSwitch')
                        : t(`admin.sections.pricing.${code.active ? 'activeSwitch' : 'cancelledSwitch'}`)}
                    </strong>
                  </label>
                </div>
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
                  onChange={(event) => setCodeDraft({ ...codeDraft, code: event.target.value.toUpperCase() })}
                  required
                />
                <small>{t('admin.sections.pricing.codeFormatHint')}</small>
              </label>
              <label>
                <span>{t('admin.sections.pricing.percentOff')}</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={codeDraft.percentOff}
                  onChange={(event) => setCodeDraft({ ...codeDraft, percentOff: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>{t('admin.sections.pricing.appliesToLabel')}</span>
                <select
                  value={codeDraft.appliesTo}
                  onChange={(event) => setCodeDraft({ ...codeDraft, appliesTo: event.target.value })}
                >
                  <option value="membership">{t('admin.sections.pricing.appliesTo.membership')}</option>
                  <option value="registration">{t('admin.sections.pricing.appliesTo.registration')}</option>
                  <option value="both">{t('admin.sections.pricing.appliesTo.both')}</option>
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.maxRedemptions')}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t('admin.sections.pricing.unlimitedUses')}
                  value={codeDraft.maxRedemptions}
                  onChange={(event) => setCodeDraft({ ...codeDraft, maxRedemptions: event.target.value })}
                />
                <small>{t('admin.sections.pricing.maxRedemptionsHint')}</small>
              </label>
              <label>
                <span>{t('admin.sections.pricing.expiresAt')}</span>
                <input
                  type="datetime-local"
                  value={codeDraft.expiresAt}
                  onChange={(event) => setCodeDraft({ ...codeDraft, expiresAt: event.target.value })}
                />
                <small>{t('admin.sections.pricing.expiresAtHint')}</small>
              </label>
              <label className="admin-pricing__wide">
                <span>{t('admin.sections.pricing.description')}</span>
                <input
                  value={codeDraft.description}
                  onChange={(event) => setCodeDraft({ ...codeDraft, description: event.target.value })}
                />
              </label>
              <label className="admin-pricing__toggle admin-pricing__wide">
                <input
                  type="checkbox"
                  checked={codeDraft.enablesManualPayment}
                  onChange={(event) => setCodeDraft({ ...codeDraft, enablesManualPayment: event.target.checked })}
                />
                <span>{t('admin.sections.pricing.enablesManualPayment')}</span>
              </label>
              <small className="admin-pricing__wide">{t('admin.sections.pricing.enablesManualPaymentHint')}</small>
            </fieldset>
            {codeError ? <p className="admin-pricing__form-error" role="alert">{codeError}</p> : null}
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
          description={t('admin.sections.pricing.deleteCodeConfirmDescription', { code: codeToDelete.code })}
          warning={t('admin.sections.pricing.deleteCodeConfirmWarning')}
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
            <h2 id="pricing-subscriptions-title">{t('admin.sections.pricing.subscriptionsTitle')}</h2>
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

        <div className="admin-pricing__plan-list" role="list" aria-label={t('admin.sections.pricing.subscriptionsTitle')}>
          {subscriptions.map((subscription) => {
            const statusKey = SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? 'pending'
            const canCancel = !['cancelled', 'ended'].includes(subscription.status)
            const nextBillingLabel = subscription.nextBillingAt
              ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(subscription.nextBillingAt))
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
                    <span className={`admin-pricing__status${subscription.status === 'authorized' ? ' admin-pricing__status--active' : ''}`}>
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

                <strong className="admin-pricing__plan-amount">{money(subscription.amount, locale)}</strong>

                <div className="admin-pricing__plan-actions">
                  <button
                    type="button"
                    className="admin-pricing__btn admin-pricing__btn--quiet is-danger"
                    onClick={() => { setCancelError(''); setCancelTarget(subscription) }}
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
