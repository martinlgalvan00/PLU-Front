import '../styles/pages/design-phase2.css'
import '../styles/pages/members.css'
import '../styles/layout/design-page-notebook.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, RefreshCw } from 'lucide-react'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import FeatureComingSoon from '../components/ui/FeatureComingSoon.jsx'
import MembersBenefitsShowcase from '../components/ui/MembersBenefitsShowcase.jsx'
import MembersPluHero from '../components/ui/MembersPluHero.jsx'
import MembersProcessStepper from '../components/ui/MembersProcessStepper.jsx'
import MembersRequirementsCarousel from '../components/ui/MembersRequirementsCarousel.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { FEATURE_KEYS, isAppProduction, isFeatureEnabled } from '../lib/featureAvailability.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import { PRICING } from '../lib/constants.js'
import { getCountdownParts } from '../lib/countdown.js'
import { money } from '../lib/format.js'
import { getFeaturedEvent, getPitbullClassicEvent } from '../lib/eventNavigation.js'
import { resolveEventPricing, resolveLiveComboOffer } from '../lib/eventPricing.js'
import { listMembershipPlans } from '../services/paymentService.js'
import { hasCurrentMembership } from '../services/membershipService.js'

const SEASON_COMBO_FALLBACK = {
  active: true,
  price: PRICING.combo,
  endsAt: '2026-08-28T23:59:59-03:00',
}

function padCountdownUnit(value) {
  return String(value).padStart(2, '0')
}

function mapLivePlan(plan, featureTemplate, t) {
  const isRecurring = plan.collectionMode === 'recurring'
  const isMonthly = plan.billingFrequency === 'monthly'
  return {
    id: plan.id ?? plan.code,
    code: plan.code,
    title: plan.name,
    kicker: isMonthly
      ? t('pages.members.planMonthly')
      : t('pages.membershipCard.periodAnnual'),
    price: plan.price,
    period: isMonthly
      ? t('pages.members.planMonthly')
      : t('pages.membershipCard.periodAnnual'),
    features: featureTemplate,
    highlighted: true,
    procedureType: 'membership',
    collectionMode: isRecurring ? 'recurring' : 'one_time',
    billingFrequency: plan.billingFrequency ?? 'annual',
  }
}

export default function MembersPage({
  memberships = [],
  onNavigate,
  onSelectEvent,
  session,
  events = [],
}) {
  const {
    MEMBERSHIP_ANNUAL_STEPS,
    MEMBERSHIP_BENEFITS,
    MEMBERSHIP_FAQ,
    MEMBERSHIP_INSTITUTIONAL,
    MEMBERSHIP_PLANS,
    MEMBERSHIP_REQUIREMENTS,
  } = useContent()
  const { messages, t, locale } = useI18n()
  const [livePlans, setLivePlans] = useState([])
  const [plansLoaded, setPlansLoaded] = useState(false)
  const [plansError, setPlansError] = useState('')
  const [billingMode, setBillingMode] = useState('one_time')
  const [now, setNow] = useState(() => new Date())
  const validityNotes = messages.pages.members.validityNotes

  // La promo publicada en esta pagina nombra Pitbull de forma explicita. Un
  // evento de prueba marcado como destacado no puede cambiar el torneo que se
  // va a cotizar/inscribir desde este CTA.
  const featuredEvent = useMemo(
    () => getPitbullClassicEvent(events) ?? getFeaturedEvent(events),
    [events],
  )
  const pendingComboEndsAt = useMemo(() => {
    if (featuredEvent?.comboOffer) return featuredEvent.comboOffer.endsAt ?? null
    return SEASON_COMBO_FALLBACK.endsAt
  }, [featuredEvent])

  const liveComboOffer = useMemo(() => {
    const fromEvent = resolveLiveComboOffer(featuredEvent, now)
    if (fromEvent) return fromEvent
    // Sin oferta live del evento todavía: usamos la promo de temporada.
    if (!featuredEvent?.comboOffer) {
      return resolveLiveComboOffer({ comboOffer: SEASON_COMBO_FALLBACK }, now)
    }
    return null
  }, [featuredEvent, now])

  const comboCountdown = useMemo(
    () => (liveComboOffer?.endsAt ? getCountdownParts(liveComboOffer.endsAt, now) : null),
    [liveComboOffer?.endsAt, now],
  )

  const eventPricing = useMemo(() => resolveEventPricing(featuredEvent), [featuredEvent])
  const comboSavings = liveComboOffer
    ? Math.max(
      0,
      Number(eventPricing.membership || PRICING.membership)
        + Number(eventPricing.registration || PRICING.event)
        - Number(liveComboOffer.price),
    )
    : 0

  const loadPlans = useCallback(async ({ force = false, signal } = {}) => {
    setPlansLoaded(false)
    setPlansError('')
    try {
      const { plans } = await listMembershipPlans({ force })
      if (!signal?.aborted) setLivePlans(plans ?? [])
    } catch (error) {
      if (!signal?.aborted) setPlansError(error?.message ?? t('pages.members.plansLoadError'))
    } finally {
      if (!signal?.aborted) setPlansLoaded(true)
    }
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    void loadPlans({ signal: controller.signal })
    return () => controller.abort()
  }, [loadPlans])

  const catalogPlans = useMemo(() => {
    const featureTemplate = MEMBERSHIP_PLANS.find((plan) => plan.id === 'athlete')?.features ?? []
    if (livePlans.length) {
      return livePlans.map((plan) => mapLivePlan(plan, featureTemplate, t))
    }
    if (isAppProduction()) return []
    return MEMBERSHIP_PLANS
      .filter((plan) => plan.id !== 'combo')
      .map((plan) => ({
        ...plan,
        collectionMode: plan.collectionMode ?? 'one_time',
        highlighted: Boolean(plan.highlighted),
      }))
  }, [MEMBERSHIP_PLANS, livePlans, t])

  const oneTimePlans = useMemo(
    () => catalogPlans.filter((plan) => plan.collectionMode !== 'recurring'),
    [catalogPlans],
  )
  const recurringPlans = useMemo(
    () => catalogPlans.filter((plan) => plan.collectionMode === 'recurring'),
    [catalogPlans],
  )
  const billingSwitchEnabled =
    isFeatureEnabled(FEATURE_KEYS.recurringMembership) &&
    oneTimePlans.length > 0 &&
    recurringPlans.length > 0

  useEffect(() => {
    if (!billingSwitchEnabled) return
    setBillingMode((current) => {
      if (current === 'recurring' && recurringPlans.length) return 'recurring'
      if (current === 'one_time' && oneTimePlans.length) return 'one_time'
      return oneTimePlans.length ? 'one_time' : 'recurring'
    })
  }, [billingSwitchEnabled, oneTimePlans.length, recurringPlans.length])

  const billingHint = billingMode === 'recurring'
    ? t('pages.members.autoRenewHintOn')
    : t('pages.members.autoRenewHintOff')

  const visiblePlans = useMemo(() => {
    if (!catalogPlans.length) return []
    if (!billingSwitchEnabled) return catalogPlans
    const pool = billingMode === 'recurring' ? recurringPlans : oneTimePlans
    const preferred = pool[0]
    return preferred ? [{ ...preferred, highlighted: true }] : []
  }, [billingMode, billingSwitchEnabled, catalogPlans, oneTimePlans, recurringPlans])

  const isLoggedInAthlete = session?.role === 'athlete_plu'
  // Vigencia, no solo estado: una afiliación marcada activa pero vencida
  // deshabilitaba el CTA de afiliarse sin que el atleta pudiera renovar.
  const hasActiveMembership = isLoggedInAthlete && hasCurrentMembership(memberships, session.athleteId)
  const paidCheckoutOpen = isPaidCheckoutOpen(featuredEvent, env)
  const checkoutLocked = !paidCheckoutOpen
  const showComboPromo = Boolean(liveComboOffer)
    && Boolean(comboCountdown)
    && !comboCountdown.expired
    && !hasActiveMembership

  useEffect(() => {
    if (!pendingComboEndsAt || hasActiveMembership) return
    const endMs = new Date(pendingComboEndsAt).getTime()
    if (!Number.isFinite(endMs) || Date.now() >= endMs) return

    const id = window.setInterval(() => {
      const next = new Date()
      setNow(next)
      if (next.getTime() >= endMs) window.clearInterval(id)
    }, 1000)

    return () => window.clearInterval(id)
  }, [pendingComboEndsAt, hasActiveMembership])

  const livePlansUnavailable = isAppProduction() && (!plansLoaded || catalogPlans.length === 0)
  const comboCountdownAria = comboCountdown
    ? t('pages.members.comboPromoCountdownAria', {
      days: comboCountdown.days,
      hours: comboCountdown.hours,
      minutes: comboCountdown.minutes,
    })
    : ''
  const comboCountdownUnits = comboCountdown
    ? [
      { key: 'days', value: padCountdownUnit(comboCountdown.days), label: t('pages.members.comboPromoUnitDays') },
      { key: 'hours', value: padCountdownUnit(comboCountdown.hours), label: t('pages.members.comboPromoUnitHours') },
      { key: 'minutes', value: padCountdownUnit(comboCountdown.minutes), label: t('pages.members.comboPromoUnitMinutes') },
      { key: 'seconds', value: padCountdownUnit(comboCountdown.seconds), label: t('pages.members.comboPromoUnitSeconds') },
    ]
    : []
  const affiliationCta = checkoutLocked
    ? t('pages.members.ctaCheckoutSoon')
    : isLoggedInAthlete
      ? hasActiveMembership
        ? t('pages.members.ctaAlreadyAffiliated')
        : t('pages.members.ctaAuthenticated')
      : t('pages.members.ctaGuest')
  const goToAffiliation = () => {
    if (hasActiveMembership || checkoutLocked) return
    if (billingSwitchEnabled && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('plu.membership.billingMode', billingMode)
    }
    onNavigate(isLoggedInAthlete ? 'membership' : 'register')
  }
  const goToCombo = () => {
    if (hasActiveMembership || checkoutLocked) return
    if (onSelectEvent && featuredEvent) {
      onSelectEvent(featuredEvent)
      return
    }
    onNavigate(isLoggedInAthlete ? 'competition' : 'register')
  }

  const gridClassName = [
    'membership-grid',
    'membership-grid--plu',
    visiblePlans.length > 1 ? 'membership-grid--plu-multi' : 'membership-grid--plu-solo',
  ].join(' ')

  return (
    <main className="page page--design members-page members-page--plu-ref">
      <Reveal>
        <MembersPluHero
          onNavigate={onNavigate}
          session={session}
          affiliationCta={affiliationCta}
          ctaDisabled={hasActiveMembership || checkoutLocked || (isLoggedInAthlete && livePlansUnavailable)}
          onAffiliate={goToAffiliation}
        />
      </Reveal>

      <div className="members-page__body">
        <section className="members-section members-section--plans members-plu-plans" id="planes">
          <header className="members-plu-block__head members-plu-plans__head">
            <p className="members-plu-process__eyebrow">{t('pages.members.plansEyebrow')}</p>
            <h2 className="members-plu-block__title">{t('pages.members.plansTitle')}</h2>
            <p className="members-plu-block__lead">
              {checkoutLocked
                ? t('pages.members.plansLeadCheckoutSoon')
                : billingSwitchEnabled
                  ? t('pages.members.plansLeadWithBilling')
                  : t('pages.members.plansLead')}
            </p>
          </header>

          {showComboPromo ? (
            <Reveal
              as="aside"
              className="members-combo-promo"
              aria-label={t('pages.members.comboPromoTitle')}
              variant="up"
            >
              <div className="members-combo-promo__head">
                <div className="members-combo-promo__meta">
                  <p className="members-combo-promo__eyebrow">{t('pages.members.comboPromoEyebrow')}</p>
                  <p className="members-combo-promo__urgency">{t('pages.members.comboPromoCountdownLabel')}</p>
                </div>
                <div
                  className="members-combo-promo__countdown"
                  role="timer"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={comboCountdownAria}
                >
                  {comboCountdownUnits.map((unit, index) => (
                    <div key={unit.key} className="members-combo-promo__unit-wrap">
                      {index > 0 ? (
                        <span className="members-combo-promo__sep" aria-hidden="true">:</span>
                      ) : null}
                      <div className="members-combo-promo__unit">
                        <span className="members-combo-promo__unit-value" aria-hidden="true">
                          {unit.value}
                        </span>
                        <span className="members-combo-promo__unit-label">{unit.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="members-combo-promo__copy">
                <h3 className="members-combo-promo__title">{t('pages.members.comboPromoTitle')}</h3>
                <p className="members-combo-promo__lead">{t('pages.members.comboPromoLead')}</p>
              </div>

              <div className="members-combo-promo__deal">
                <div className="members-combo-promo__price-block">
                  <strong className="members-combo-promo__price">{money(liveComboOffer.price, locale)}</strong>
                  {comboSavings > 0 ? (
                    <p className="members-combo-promo__savings">
                      {t('pages.members.comboPromoSavings', { amount: money(comboSavings, locale) })}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn--gold members-combo-promo__cta"
                  disabled={checkoutLocked}
                  onClick={goToCombo}
                >
                  {checkoutLocked ? t('pages.members.ctaCheckoutSoon') : t('pages.members.comboPromoCta')}
                </button>
              </div>
            </Reveal>
          ) : null}

          {visiblePlans.length ? (
            <div className={gridClassName}>
              {visiblePlans.map((plan) => (
                <MembershipCard
                  key={plan.id}
                  {...plan}
                  billingToggleEnabled={billingSwitchEnabled && !checkoutLocked}
                  billingAutoRenew={billingMode === 'recurring'}
                  billingToggleHint={billingHint}
                  billingToggleLabel={t('pages.members.autoRenewLabel')}
                  ctaLabel={affiliationCta}
                  ctaDisabled={hasActiveMembership || checkoutLocked || livePlansUnavailable}
                  onBillingAutoRenewChange={(enabled) => {
                    setBillingMode(enabled ? 'recurring' : 'one_time')
                  }}
                  onSelect={goToAffiliation}
                  variant="plu"
                />
              ))}
            </div>
          ) : null}
          {!hasActiveMembership && visiblePlans.length ? (
            <p className="members-plu-plans__reassure">
              {t('pages.members.closureReassure')}
            </p>
          ) : null}
          {isAppProduction() && !plansLoaded ? (
            <p className="members-plans-feedback" role="status">
              {t('pages.members.plansLoading')}
            </p>
          ) : null}
          {isAppProduction() && plansLoaded && catalogPlans.length === 0 ? (
            <FeatureComingSoon
              actionIcon={plansError ? RefreshCw : undefined}
              actionLabel={plansError ? t('pages.members.plansRetry') : undefined}
              className="members-plans-feedback members-plans-feedback--notice"
              eyebrow={t('pages.members.plansComingSoonEyebrow')}
              icon={CalendarClock}
              lead={t('pages.members.plansComingSoonLead')}
              onAction={plansError ? () => loadPlans({ force: true }) : undefined}
              role={plansError ? 'alert' : 'status'}
              title={plansError ? t('pages.members.plansLoadError') : t('pages.members.plansComingSoon')}
              variant="inline"
            />
          ) : null}
        </section>

        {hasActiveMembership ? (
          <Reveal as="section" variant="up" className="members-plu-block members-plu-block--closure members-plu-block--closure-active">
            <div className="members-plu-closure members-plu-closure--active" aria-labelledby="members-closure-title">
              <h2 className="members-plu-closure__title" id="members-closure-title">
                {t('pages.members.closureTitleActive')}
              </h2>
              <p className="members-plu-closure__lead">
                {t('pages.members.closureLeadActive')}
              </p>
              <div className="members-plu-closure__actions">
                <button
                  type="button"
                  className="btn btn--gold members-plu-closure__cta"
                  onClick={() => onNavigate?.('profile')}
                >
                  {t('pages.members.afterPayCtaCredential')}
                </button>
                <button
                  type="button"
                  className="btn btn--outline members-plu-closure__cta"
                  onClick={() => onNavigate?.('events')}
                >
                  {t('pages.members.afterPayCtaCalendar')}
                </button>
              </div>
            </div>
          </Reveal>
        ) : null}

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--benefits">
          <MembersBenefitsShowcase
            items={MEMBERSHIP_BENEFITS}
            title={t('pages.members.introTitle')}
            lead={t('pages.members.introText')}
            ariaLabel={t('pages.members.benefitsAria')}
          />
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--process">
          <MembersProcessStepper
            steps={MEMBERSHIP_ANNUAL_STEPS}
            ariaLabel={t('pages.members.processAria')}
            eyebrow={t('pages.members.processEyebrow')}
            title={t('pages.members.processTitle')}
            lead={t('pages.members.processLead')}
          />
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--requirements" id="requisitos">
          <div className="members-plu-requirements">
            <MembersRequirementsCarousel
              items={MEMBERSHIP_REQUIREMENTS}
              ariaLabel={t('pages.members.requirementsAria')}
              title={t('pages.members.requirementsTitle')}
              lead={t('pages.members.requirementsLead')}
            />

            <aside className="members-req-validity" aria-labelledby="members-validity-title">
              <span className="members-req-validity__glow" aria-hidden />
              <header className="members-req-validity__head">
                <span className="members-req-validity__icon" aria-hidden>
                  <CalendarClock size={20} strokeWidth={1.5} />
                </span>
                <p className="members-req-validity__eyebrow" id="members-validity-title">
                  {t('pages.members.validityTitle')}
                </p>
              </header>
              <p className="members-req-validity__text">{t('pages.members.validityText')}</p>
              <ul className="members-req-validity__notes">
                {validityNotes.map((note) => (
                  <li key={note}>
                    <span className="members-req-validity__note-mark" aria-hidden />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--note">
          <p className="members-plu-note__eyebrow">{MEMBERSHIP_INSTITUTIONAL.eyebrow}</p>
          <p className="members-plu-note">{MEMBERSHIP_INSTITUTIONAL.text}</p>
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--faq" id="members-faq">
          <header className="members-plu-block__head members-plu-block__head--faq">
            <h2 className="members-plu-block__title">{t('pages.members.faqTitle')}</h2>
          </header>
          <FAQAccordion items={MEMBERSHIP_FAQ} variant="ref" numbered />
        </Reveal>
      </div>
    </main>
  )
}
