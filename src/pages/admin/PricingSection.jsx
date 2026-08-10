import { useEffect, useMemo, useState } from 'react'
import {
  BadgeDollarSign,
  CalendarClock,
  CirclePlus,
  LockKeyhole,
  RefreshCw,
  Save,
} from 'lucide-react'
import { env } from '../../config/env.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

const EMPTY_PLAN = {
  sourcePlanId: undefined,
  familyCode: '',
  name: '',
  description: '',
  price: '',
  currency: 'ARS',
  billingFrequency: 'annual',
  collectionMode: 'one_time',
  intervalCount: 1,
  graceDays: 0,
  effectiveFrom: '',
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function planStatus(plan, now) {
  if (!plan.active || (plan.retiredAt && new Date(plan.retiredAt) <= now)) return 'inactive'
  if (plan.effectiveFrom && new Date(plan.effectiveFrom) > now) return 'scheduled'
  return 'active'
}

export default function PricingSection({
  canEdit = false,
  configuration = { plans: [], events: [], availability: { editable: true } },
  error,
  isLoading = false,
  onCreatePlanVersion,
  onRefresh,
  onSaveComboOffer,
  onSetPlanActive,
}) {
  const { locale, t } = useI18n()
  const [planDraft, setPlanDraft] = useState(null)
  const [planError, setPlanError] = useState('')
  const [comboError, setComboError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [selectedEventSlug, setSelectedEventSlug] = useState('')
  const [comboDraft, setComboDraft] = useState({
    membershipPlanId: '',
    price: '',
    startsAt: '',
    endsAt: '',
    active: false,
  })

  useEffect(() => {
    onRefresh?.()
  }, [onRefresh])

  const locked = env.appProduction || configuration.availability?.editable === false || !canEdit
  const plans = useMemo(() => configuration.plans ?? [], [configuration.plans])
  const events = useMemo(() => configuration.events ?? [], [configuration.events])
  const now = useMemo(() => new Date(), [])
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

  useEffect(() => {
    if (!selectedEventSlug && events[0]) setSelectedEventSlug(events[0].slug)
  }, [events, selectedEventSlug])

  useEffect(() => {
    if (!selectedEvent) return
    const offer = selectedEvent.comboOffer
    setComboDraft({
      membershipPlanId: offer?.membershipPlanId ?? oneTimePlans[0]?.id ?? '',
      price: offer?.price ?? '',
      startsAt: toLocalDateTime(offer?.startsAt),
      endsAt: toLocalDateTime(offer?.endsAt),
      active: offer?.active === true,
    })
    setComboError('')
  }, [oneTimePlans, selectedEvent])

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
            currency: 'ARS',
            billingFrequency: source.billingFrequency,
            collectionMode: source.collectionMode,
            intervalCount: source.intervalCount,
            graceDays: source.graceDays,
            effectiveFrom: '',
          }
        : { ...EMPTY_PLAN },
    )
  }

  async function submitPlan(event) {
    event.preventDefault()
    setPlanError('')
    const price = Number(planDraft.price)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(planDraft.familyCode)) {
      setPlanError(t('admin.sections.pricing.familyCodeHint'))
      return
    }
    if (planDraft.name.trim().length < 3 || !Number.isInteger(price) || price <= 0) {
      setPlanError(t('admin.sections.pricing.loadError'))
      return
    }

    setPendingAction('plan')
    const result = await onCreatePlanVersion?.({ ...planDraft, price })
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

  async function submitCombo(event) {
    event.preventDefault()
    setComboError('')
    setNotice('')
    const price = Number(comboDraft.price)
    const separatePrice = Number(selectedPlan?.price ?? 0) + Number(selectedEvent?.registrationPrice ?? 0)
    if (!selectedEvent || !selectedPlan || !Number.isInteger(price) || price <= 0) {
      setComboError(t('admin.sections.pricing.loadError'))
      return
    }
    if (price > separatePrice) {
      setComboError(t('admin.eventEditor.validation.comboTooHigh'))
      return
    }
    if (comboDraft.startsAt && comboDraft.endsAt && comboDraft.endsAt < comboDraft.startsAt) {
      setComboError(t('admin.eventEditor.validation.registrationWindowInvalid'))
      return
    }

    setPendingAction('combo')
    const result = await onSaveComboOffer?.(selectedEvent.slug, { ...comboDraft, price })
    setPendingAction('')
    if (result?.error) setComboError(result.error)
    else setNotice(t('admin.sections.pricing.saved'))
  }

  return (
    <section className="admin-pricing" aria-labelledby="admin-pricing-title">
      <header className="admin-pricing__hero">
        <div>
          <p className="admin-pricing__eyebrow">
            <BadgeDollarSign size={14} aria-hidden />
            {t('admin.sections.pricing.eyebrow')}
          </p>
          <h1 id="admin-pricing-title">{t('admin.sections.pricing.title')}</h1>
          <p>{t('admin.sections.pricing.subtitle')}</p>
        </div>
        <button
          type="button"
          className="admin-pricing__refresh"
          onClick={() => onRefresh?.()}
          disabled={isLoading}
        >
          <RefreshCw size={15} aria-hidden />
          {t('admin.sections.pricing.retry')}
        </button>
      </header>

      {env.appProduction || configuration.availability?.reason === 'production_coming_soon' ? (
        <div className="admin-pricing__locked" role="status">
          <LockKeyhole size={20} aria-hidden />
          <div>
            <strong>{t('admin.sections.pricing.comingSoonTitle')}</strong>
            <p>{t('admin.sections.pricing.comingSoonLead')}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="admin-pricing__message admin-pricing__message--error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? <div className="admin-pricing__message" role="status">{notice}</div> : null}
      {isLoading && plans.length === 0 ? <p>{t('admin.sections.pricing.loading')}</p> : null}

      <section className="admin-pricing__block" aria-labelledby="pricing-plans-title">
        <header className="admin-pricing__block-head">
          <div>
            <h2 id="pricing-plans-title">{t('admin.sections.pricing.plansTitle')}</h2>
            <p>{t('admin.sections.pricing.plansLead')}</p>
          </div>
          <button type="button" onClick={() => openPlanForm()} disabled={locked}>
            <CirclePlus size={15} aria-hidden />
            {t('admin.sections.pricing.newPlan')}
          </button>
        </header>

        <div className="admin-pricing__plan-list">
          {plans.map((plan) => {
            const status = planStatus(plan, now)
            return (
              <article className="admin-pricing__plan-row" key={plan.id}>
                <div className="admin-pricing__plan-identity">
                  <span className={`admin-pricing__status admin-pricing__status--${status}`}>
                    {t(`admin.sections.pricing.${status}`)}
                  </span>
                  <h3>{plan.name}</h3>
                  <p>{plan.familyCode} · {t('admin.sections.pricing.currentVersion', { version: plan.version })}</p>
                </div>
                <div className="admin-pricing__plan-price">
                  <strong>{money(plan.price, locale)}</strong>
                  <span>
                    {t(`admin.sections.pricing.${plan.billingFrequency}`)} · {t(`admin.sections.pricing.${plan.collectionMode === 'recurring' ? 'recurring' : 'oneTime'}`)}
                  </span>
                </div>
                <div className="admin-pricing__plan-date">
                  <CalendarClock size={14} aria-hidden />
                  <span>{plan.effectiveFrom ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(plan.effectiveFrom)) : '—'}</span>
                </div>
                <div className="admin-pricing__plan-actions">
                  <button type="button" onClick={() => openPlanForm(plan)} disabled={locked}>
                    {t('admin.sections.pricing.newVersion')}
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlan(plan)}
                    disabled={locked || pendingAction === plan.id}
                  >
                    {t(`admin.sections.pricing.${plan.active ? 'retire' : 'restore'}`)}
                  </button>
                </div>
              </article>
            )
          })}
          {!isLoading && plans.length === 0 ? <p>{t('admin.sections.pricing.plansEmpty')}</p> : null}
        </div>

        {planDraft ? (
          <form className="admin-pricing__form" onSubmit={submitPlan} noValidate>
            <header>
              <h3>{planDraft.sourcePlanId
                ? t('admin.sections.pricing.formTitleVersion', { name: planDraft.name })
                : t('admin.sections.pricing.formTitleNew')}</h3>
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
                <input name="name" value={planDraft.name} onChange={(event) => setPlanDraft({ ...planDraft, name: event.target.value })} required />
              </label>
              <label className="admin-pricing__wide">
                <span>{t('admin.sections.pricing.description')}</span>
                <textarea value={planDraft.description} onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })} rows={3} />
              </label>
              <label>
                <span>{t('admin.sections.pricing.price')}</span>
                <input type="number" min="1" max="10000000" step="1" value={planDraft.price} onChange={(event) => setPlanDraft({ ...planDraft, price: event.target.value })} required />
              </label>
              <label>
                <span>{t('admin.sections.pricing.currency')}</span>
                <input value="ARS" disabled />
              </label>
              <label>
                <span>{t('admin.sections.pricing.billingFrequency')}</span>
                <select value={planDraft.billingFrequency} onChange={(event) => setPlanDraft({ ...planDraft, billingFrequency: event.target.value })}>
                  <option value="annual">{t('admin.sections.pricing.annual')}</option>
                  <option value="monthly">{t('admin.sections.pricing.monthly')}</option>
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.collectionMode')}</span>
                <select value={planDraft.collectionMode} onChange={(event) => setPlanDraft({ ...planDraft, collectionMode: event.target.value })}>
                  <option value="one_time">{t('admin.sections.pricing.oneTime')}</option>
                  <option value="recurring">{t('admin.sections.pricing.recurring')}</option>
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.intervalCount')}</span>
                <input type="number" min="1" max="24" step="1" value={planDraft.intervalCount} onChange={(event) => setPlanDraft({ ...planDraft, intervalCount: event.target.value })} />
              </label>
              <label>
                <span>{t('admin.sections.pricing.graceDays')}</span>
                <input type="number" min="0" max="90" step="1" value={planDraft.graceDays} onChange={(event) => setPlanDraft({ ...planDraft, graceDays: event.target.value })} />
              </label>
              <label>
                <span>{t('admin.sections.pricing.effectiveFrom')}</span>
                <input type="datetime-local" value={planDraft.effectiveFrom} onChange={(event) => setPlanDraft({ ...planDraft, effectiveFrom: event.target.value })} />
              </label>
            </fieldset>
            {planError ? <p className="admin-pricing__form-error" role="alert">{planError}</p> : null}
            <div className="admin-pricing__form-actions">
              <button type="button" onClick={() => setPlanDraft(null)}>{t('admin.sections.pricing.cancel')}</button>
              <button type="submit" disabled={locked || pendingAction === 'plan'}>
                <Save size={15} aria-hidden />
                {pendingAction === 'plan' ? t('admin.sections.pricing.saving') : t('admin.sections.pricing.publish')}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="admin-pricing__block" aria-labelledby="pricing-combo-title">
        <header className="admin-pricing__block-head">
          <div>
            <h2 id="pricing-combo-title">{t('admin.sections.pricing.comboTitle')}</h2>
            <p>{t('admin.sections.pricing.comboLead')}</p>
          </div>
        </header>
        {events.length === 0 ? <p>{t('admin.sections.pricing.noEvents')}</p> : (
          <form className="admin-pricing__form admin-pricing__form--combo" onSubmit={submitCombo} noValidate>
            <fieldset disabled={locked || pendingAction === 'combo' || oneTimePlans.length === 0}>
              <label>
                <span>{t('admin.sections.pricing.event')}</span>
                <select value={selectedEvent?.slug ?? ''} onChange={(event) => setSelectedEventSlug(event.target.value)}>
                  {events.map((item) => <option key={item.id} value={item.slug}>{item.title}</option>)}
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.membershipPlan')}</span>
                <select value={comboDraft.membershipPlanId} onChange={(event) => setComboDraft({ ...comboDraft, membershipPlanId: event.target.value })} required>
                  {oneTimePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price, locale)}</option>)}
                </select>
              </label>
              <label>
                <span>{t('admin.sections.pricing.registrationPrice')}</span>
                <input value={money(selectedEvent?.registrationPrice ?? 0, locale)} disabled />
              </label>
              <label>
                <span>{t('admin.sections.pricing.comboPrice')}</span>
                <input type="number" min="1" max="10000000" step="1" value={comboDraft.price} onChange={(event) => setComboDraft({ ...comboDraft, price: event.target.value })} required />
              </label>
              <label>
                <span>{t('admin.sections.pricing.comboStarts')}</span>
                <input type="datetime-local" value={comboDraft.startsAt} onChange={(event) => setComboDraft({ ...comboDraft, startsAt: event.target.value })} />
              </label>
              <label>
                <span>{t('admin.sections.pricing.comboEnds')}</span>
                <input type="datetime-local" value={comboDraft.endsAt} onChange={(event) => setComboDraft({ ...comboDraft, endsAt: event.target.value })} />
              </label>
              <label className="admin-pricing__toggle admin-pricing__wide">
                <input type="checkbox" checked={comboDraft.active} onChange={(event) => setComboDraft({ ...comboDraft, active: event.target.checked })} />
                <span>{t('admin.sections.pricing.comboActive')}</span>
              </label>
            </fieldset>
            {oneTimePlans.length === 0 ? <p className="admin-pricing__form-error">{t('admin.sections.pricing.noOneTimePlans')}</p> : null}
            {comboError ? <p className="admin-pricing__form-error" role="alert">{comboError}</p> : null}
            <div className="admin-pricing__form-actions">
              <button type="submit" disabled={locked || pendingAction === 'combo' || oneTimePlans.length === 0}>
                <Save size={15} aria-hidden />
                {pendingAction === 'combo' ? t('admin.sections.pricing.saving') : t('admin.sections.pricing.saveCombo')}
              </button>
            </div>
          </form>
        )}
      </section>
    </section>
  )
}
