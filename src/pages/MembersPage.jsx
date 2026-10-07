import '../styles/pages/design-phase2.css'
import '../styles/pages/members.css'
import '../styles/layout/design-page-notebook.css'
import '../styles/pages/members-sections.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, RefreshCw } from 'lucide-react'
import { m } from 'motion/react'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import FeatureComingSoon from '../components/ui/FeatureComingSoon.jsx'
import MembersBlockHead from '../components/ui/MembersBlockHead.jsx'
import MembersPluHero from '../components/ui/MembersPluHero.jsx'
import MembersRequirementsCarousel from '../components/ui/MembersRequirementsCarousel.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SeasonComboOffer from '../components/ui/SeasonComboOffer.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { FEATURE_KEYS, isFeatureEnabled } from '../lib/featureAvailability.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import { PRICING } from '../lib/constants.js'
import { getFeaturedEvent, getPitbullClassicEvent } from '../lib/eventNavigation.js'
import { resolveEventPricing, resolveLiveComboOffer } from '../lib/eventPricing.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { MOTION_VIEWPORT } from '../motion/tokens.ts'
import { staggerContainer, staggerItem } from '../motion/variants.ts'
import { listMembershipPlans } from '../services/paymentService.js'
import { hasCurrentMembership } from '../services/membershipService.js'
import { isStaffSession } from '../lib/roles.js'

function mapLivePlan(plan, featureTemplate, t) {
  const isRecurring = plan.collectionMode === 'recurring'
  const isMonthly = plan.billingFrequency === 'monthly'
  return {
    id: plan.id ?? plan.code,
    code: plan.code,
    title: plan.name,
    kicker: isMonthly ? t('pages.members.planMonthly') : t('pages.membershipCard.periodAnnual'),
    price: plan.price,
    period: isMonthly ? t('pages.members.planMonthly') : t('pages.membershipCard.periodAnnual'),
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
  checkoutAvailability = {},
}) {
  const {
    MEMBERSHIP_ANNUAL_STEPS,
    MEMBERSHIP_BENEFITS,
    MEMBERSHIP_FAQ,
    MEMBERSHIP_INSTITUTIONAL,
    MEMBERSHIP_REQUIREMENTS,
  } = useContent()
  const { messages, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const [livePlans, setLivePlans] = useState([])
  const [plansLoaded, setPlansLoaded] = useState(false)
  const [plansError, setPlansError] = useState('')
  const [billingMode, setBillingMode] = useState('one_time')
  const [now, setNow] = useState(() => new Date())
  const validityNotes = messages.pages.members.validityNotes
  const ReqList = reducedMotion ? 'ul' : m.ul
  const FlowList = reducedMotion ? 'ul' : m.ul
  const RailItem = reducedMotion ? 'li' : m.li
  const railListProps = reducedMotion
    ? {}
    : {
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
        variants: staggerContainer,
      }
  const railItemProps = reducedMotion ? {} : { variants: staggerItem }

  // La promo publicada en esta pagina nombra Pitbull de forma explicita. Un
  // evento de prueba marcado como destacado no puede cambiar el torneo que se
  // va a cotizar/inscribir desde este CTA.
  const featuredEvent = useMemo(
    () => getPitbullClassicEvent(events) ?? getFeaturedEvent(events),
    [events],
  )
  // Un combo con audience 'code' es secreto: sólo se ofrece a quien ya
  // canjeó el código en el checkout (RegisterPage), nunca como promo
  // pública en esta página. Antes había además un fallback hardcodeado que
  // inventaba un combo "siempre activo" cuando el evento destacado no traía
  // uno propio — eso hacía aparecer la tarjeta con precios y fecha fija sin
  // que ningún admin la hubiera configurado.
  const isPublicComboOffer = Boolean(
    featuredEvent?.comboOffer && featuredEvent.comboOffer.audience !== 'code',
  )
  const pendingComboEndsAt = isPublicComboOffer ? (featuredEvent.comboOffer.endsAt ?? null) : null

  const liveComboOffer = useMemo(
    () => (isPublicComboOffer ? resolveLiveComboOffer(featuredEvent, now) : null),
    [featuredEvent, now, isPublicComboOffer],
  )

  const eventPricing = useMemo(() => resolveEventPricing(featuredEvent), [featuredEvent])

  const loadPlans = useCallback(
    async ({ force = false, signal } = {}) => {
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
    },
    [t],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadPlans({ signal: controller.signal })
    return () => controller.abort()
  }, [loadPlans])

  // Solo catálogo vivo de /api/payments/plans. Nunca inventar adulto/juvenil
  // desde content estático: la afiliación persistida es un producto anual
  // (plu-annual ± renovación), no franjas de edad.
  const catalogPlans = useMemo(() => {
    if (!livePlans.length) return []
    return livePlans.map((plan) => mapLivePlan(plan, [], t))
  }, [livePlans, t])

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

  const billingHint =
    billingMode === 'recurring'
      ? t('pages.members.autoRenewHintOn')
      : t('pages.members.autoRenewHintOff')

  const visiblePlans = useMemo(() => {
    if (!catalogPlans.length) return []
    if (billingSwitchEnabled) {
      const pool = billingMode === 'recurring' ? recurringPlans : oneTimePlans
      const preferred = pool[0]
      return preferred ? [{ ...preferred, highlighted: true }] : []
    }
    // Sin switch: un solo producto público (pago único). No listar
    // one_time + recurring como si fueran dos afiliaciones distintas.
    const preferred = oneTimePlans[0] ?? catalogPlans[0]
    return preferred ? [{ ...preferred, highlighted: true }] : []
  }, [billingMode, billingSwitchEnabled, catalogPlans, oneTimePlans, recurringPlans])

  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const canUseAthleteCheckout = isLoggedInAthlete || isStaffSession(session)
  // Vigencia, no solo estado: una afiliación marcada activa pero vencida
  // deshabilitaba el CTA de afiliarse sin que el atleta pudiera renovar.
  const hasActiveMembership =
    isLoggedInAthlete && hasCurrentMembership(memberships, session.athleteId)
  const membershipCheckoutEnabled = checkoutAvailability.membershipEnabled !== false
  const registrationCheckoutEnabled = checkoutAvailability.registrationEnabled !== false
  const paidCheckoutOpen =
    membershipCheckoutEnabled &&
    isPaidCheckoutOpen(featuredEvent, env, new Date(), { checkoutKind: 'membership' })
  const comboCheckoutOpen =
    membershipCheckoutEnabled &&
    registrationCheckoutEnabled &&
    isPaidCheckoutOpen(featuredEvent, env, new Date(), { checkoutKind: 'combo' })
  const checkoutLocked = !paidCheckoutOpen
  const comboLocked = !comboCheckoutOpen
  const showComboPromo = Boolean(liveComboOffer) && !hasActiveMembership

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

  const livePlansUnavailable = !plansLoaded || catalogPlans.length === 0
  const affiliationCta = checkoutLocked
    ? t('pages.members.ctaCheckoutSoon')
    : canUseAthleteCheckout
      ? hasActiveMembership
        ? t('pages.members.ctaAlreadyAffiliated')
        : t('pages.members.ctaAuthenticated')
      : t('pages.members.ctaGuest')
  const goToAffiliation = () => {
    if (hasActiveMembership || checkoutLocked) return
    if (billingSwitchEnabled && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('plu.membership.billingMode', billingMode)
    }
    onNavigate(canUseAthleteCheckout ? 'membership' : 'register')
  }
  const goToCombo = () => {
    if (hasActiveMembership || comboLocked) return
    if (onSelectEvent && featuredEvent) {
      onSelectEvent(featuredEvent)
      return
    }
    onNavigate(canUseAthleteCheckout ? 'competition' : 'register')
  }
  const goToEvent = () => {
    if (onSelectEvent && featuredEvent) {
      onSelectEvent(featuredEvent)
      return
    }
    onNavigate?.('events')
  }
  const canOpenFeaturedEvent = Boolean(onSelectEvent && featuredEvent)

  const gridClassName = [
    'membership-grid',
    'membership-grid--plu',
    visiblePlans.length > 1 ? 'membership-grid--plu-multi' : 'membership-grid--plu-solo',
  ].join(' ')

  return (
    <main className="page page--design members-page members-page--plu-ref">
      {/* Hero anima al montar; no envolver en Reveal (doble entrada). */}
      <MembersPluHero
        onNavigate={onNavigate}
        session={session}
        affiliationCta={affiliationCta}
        ctaDisabled={
          hasActiveMembership || checkoutLocked || (isLoggedInAthlete && livePlansUnavailable)
        }
        onAffiliate={goToAffiliation}
        price={visiblePlans[0]?.price}
        pricePeriod={
          visiblePlans[0]?.period === t('pages.membershipCard.periodAnnual')
            ? t('pages.membershipCard.perYear')
            : visiblePlans[0]?.period
        }
      />

      <div className="members-page__body">
        <section
          className={[
            'members-section',
            'members-section--plans',
            'members-plu-plans',
            'members-plu-plans--statement',
            showComboPromo ? 'members-plu-plans--with-combo' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          id="planes"
        >
          {showComboPromo ? (
            <Reveal className="members-plu-plans__combo" variant="up">
              <SeasonComboOffer
                variant="band"
                membershipPrice={eventPricing.membership || PRICING.membership}
                registrationPrice={eventPricing.registration || PRICING.event}
                comboPrice={liveComboOffer.price}
                endsAt={liveComboOffer.endsAt}
                ctaDisabled={comboLocked}
                ctaLabel={comboLocked ? t('pages.members.ctaCheckoutSoon') : t('comboDeal.cta')}
                onCta={goToCombo}
              />
            </Reveal>
          ) : null}

          <div
            className={[
              'members-plu-offer',
              'members-plu-offer--masthead',
              'members-plu-offer--statement',
              visiblePlans.length > 1 ? 'members-plu-offer--multi' : 'members-plu-offer--solo',
            ].join(' ')}
          >
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

            <div className="members-plu-offer__stage">
              <div className="members-plu-offer__buy">
                {visiblePlans.length ? (
                  <Reveal className={gridClassName} variant="up">
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
                  </Reveal>
                ) : null}

                {!plansLoaded ? (
                  <p className="members-plans-feedback" role="status">
                    {t('pages.members.plansLoading')}
                  </p>
                ) : null}
                {plansLoaded && catalogPlans.length === 0 ? (
                  <FeatureComingSoon
                    actionIcon={plansError ? RefreshCw : undefined}
                    actionLabel={plansError ? t('pages.members.plansRetry') : undefined}
                    className="members-plans-feedback members-plans-feedback--notice"
                    eyebrow={t('pages.members.plansComingSoonEyebrow')}
                    icon={CalendarClock}
                    lead={t('pages.members.plansComingSoonLead')}
                    onAction={plansError ? () => loadPlans({ force: true }) : undefined}
                    role={plansError ? 'alert' : 'status'}
                    title={
                      plansError
                        ? t('pages.members.plansLoadError')
                        : t('pages.members.plansComingSoon')
                    }
                    variant="inline"
                  />
                ) : null}
              </div>

              <p className="members-plu-offer__terms">
                <span className="members-plu-offer__terms-label">
                  {t('pages.members.validityTitle')}
                </span>
                <span className="members-plu-offer__terms-text">
                  {t('pages.members.validityText')}
                  {validityNotes.length ? ` · ${validityNotes.join(' · ')}` : ''}
                </span>
              </p>
            </div>

            <div className="members-plu-offer__includes">
              <h3 className="members-plu-offer__includes-title" id="members-includes-title">
                {t('pages.members.introTitle')}
              </h3>
              <ReqList
                className="members-plu-offer__list"
                aria-labelledby="members-includes-title"
                {...railListProps}
              >
                {MEMBERSHIP_BENEFITS.map((benefit, index) => (
                  <RailItem
                    key={benefit.id}
                    className="members-plu-offer__item"
                    aria-label={`${benefit.title}. ${benefit.text}`}
                    {...railItemProps}
                  >
                    <span className="members-plu-offer__index" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="members-plu-offer__item-title">{benefit.title}</span>
                  </RailItem>
                ))}
              </ReqList>
            </div>
          </div>
        </section>

        {hasActiveMembership ? (
          <Reveal
            as="section"
            variant="up"
            className="members-plu-block members-plu-block--closure members-plu-block--closure-active"
          >
            <div
              className="members-plu-closure members-plu-closure--active"
              aria-labelledby="members-closure-title"
            >
              <h2 className="members-plu-closure__title" id="members-closure-title">
                {t('pages.members.closureTitleActive')}
              </h2>
              <p className="members-plu-closure__lead">{t('pages.members.closureLeadActive')}</p>
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

        <section
          className="members-plu-block members-plu-block--guide"
          id="requisitos"
          aria-labelledby="members-process-title"
        >
          <div className="members-guide members-guide--process">
            <div className="members-guide__col">
              <header className="members-guide__head">
                <p className="members-guide__eyebrow">{t('pages.members.processEyebrow')}</p>
                <h2 className="members-guide__title" id="members-process-title">
                  {t('pages.members.processTitle')}
                </h2>
                <p className="members-guide__lead">{t('pages.members.processLead')}</p>
              </header>
              <ol className="members-guide__list" aria-label={t('pages.members.processAria')}>
                {MEMBERSHIP_ANNUAL_STEPS.map((step, index) => (
                  <li key={step.step ?? step.title} className="members-guide__item">
                    <span className="members-guide__index" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="members-guide__item-title">{step.title}</h3>
                    <p className="members-guide__item-text">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <MembersRequirementsCarousel
            items={MEMBERSHIP_REQUIREMENTS}
            title={t('pages.members.requirementsTitle')}
            lead={t('pages.members.requirementsLead')}
            ariaLabel={t('pages.members.requirementsAria')}
          />
        </section>

        <section
          className="members-plu-block members-plu-block--flow"
          aria-labelledby="members-flow-title"
        >
          <MembersBlockHead
            eyebrow={t('pages.members.flowEyebrow')}
            title={t('pages.members.flowTitle')}
            titleId="members-flow-title"
          />
          <FlowList className="members-flow" {...railListProps}>
            <RailItem className="members-flow__door" {...railItemProps}>
              <span className="members-flow__index" aria-hidden>
                01
              </span>
              <h3 className="members-flow__title">
                {canOpenFeaturedEvent ? featuredEvent.title : t('pages.members.flowCalendarTitle')}
              </h3>
              <p className="members-flow__text">{t('pages.members.flowEventLead')}</p>
              <button
                type="button"
                className="members-flow__link motion-icon-shift"
                onClick={goToEvent}
              >
                {canOpenFeaturedEvent
                  ? t('pages.members.flowEventCta')
                  : t('pages.members.flowCalendarCta')}
                <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
              </button>
            </RailItem>
            <RailItem className="members-flow__door" {...railItemProps}>
              <span className="members-flow__index" aria-hidden>
                02
              </span>
              <h3 className="members-flow__title">{t('pages.members.flowShopTitle')}</h3>
              <p className="members-flow__text">{t('pages.shop.heroDesc')}</p>
              <button
                type="button"
                className="members-flow__link motion-icon-shift"
                onClick={() => onNavigate?.('shop')}
              >
                {t('pages.members.flowShopCta')}
                <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
              </button>
            </RailItem>
          </FlowList>
        </section>

        <Reveal
          as="section"
          variant="up"
          className="members-plu-block members-plu-block--faq"
          id="members-faq"
        >
          <header className="members-plu-block__head members-plu-block__head--faq">
            <h2 className="members-plu-block__title">{t('pages.members.faqTitle')}</h2>
          </header>
          <FAQAccordion items={MEMBERSHIP_FAQ} variant="ref" numbered />
          <p className="members-plu-faq__note">
            <span className="members-plu-note__eyebrow">{MEMBERSHIP_INSTITUTIONAL.eyebrow}</span>
            {MEMBERSHIP_INSTITUTIONAL.text}
          </p>
        </Reveal>
      </div>
    </main>
  )
}
