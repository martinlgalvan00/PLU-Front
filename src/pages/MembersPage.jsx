import '../styles/pages/design-phase2.css'
import '../styles/pages/members.css'
import '../styles/layout/design-page-notebook.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, RefreshCw } from 'lucide-react'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembersBenefitsShowcase from '../components/ui/MembersBenefitsShowcase.jsx'
import MembersPluHero from '../components/ui/MembersPluHero.jsx'
import MembersProcessStepper from '../components/ui/MembersProcessStepper.jsx'
import MembersRequirementsCarousel from '../components/ui/MembersRequirementsCarousel.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { env } from '../config/env.js'
import { listMembershipPlans } from '../services/paymentService.js'
import { hasCurrentMembership } from '../services/membershipService.js'

export default function MembersPage({ memberships = [], onNavigate, session }) {
  const {
    MEMBERSHIP_ANNUAL_STEPS,
    MEMBERSHIP_BENEFITS,
    MEMBERSHIP_FAQ,
    MEMBERSHIP_INSTITUTIONAL,
    MEMBERSHIP_PLANS,
    MEMBERSHIP_REQUIREMENTS,
  } = useContent()
  const { messages, t } = useI18n()
  const [livePlans, setLivePlans] = useState([])
  const [plansLoaded, setPlansLoaded] = useState(false)
  const [plansError, setPlansError] = useState('')
  const validityNotes = messages.pages.members.validityNotes

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

  const visiblePlans = useMemo(() => {
    if (!livePlans.length) return env.appProduction ? [] : MEMBERSHIP_PLANS
    const featureTemplate = MEMBERSHIP_PLANS.find((plan) => plan.id === 'athlete')?.features ?? []
    return livePlans.map((plan) => ({
      id: plan.id,
      title: plan.name,
      kicker: plan.billingFrequency === 'monthly'
        ? t('pages.members.planMonthly')
        : t('pages.membershipCard.periodAnnual'),
      price: plan.price,
      period: plan.billingFrequency === 'monthly'
        ? t('pages.members.planMonthly')
        : t('pages.membershipCard.periodAnnual'),
      features: featureTemplate,
      highlighted: false,
      procedureType: 'membership',
    }))
  }, [MEMBERSHIP_PLANS, livePlans, t])

  const isLoggedInAthlete = session?.role === 'athlete_plu'
  // Vigencia, no solo estado: una afiliación marcada activa pero vencida
  // deshabilitaba el CTA de afiliarse sin que el atleta pudiera renovar.
  const hasActiveMembership = isLoggedInAthlete && hasCurrentMembership(memberships, session.athleteId)
  const livePlansUnavailable = env.appProduction && (!plansLoaded || visiblePlans.length === 0)
  const affiliationCta = isLoggedInAthlete
    ? hasActiveMembership
      ? t('pages.members.ctaAlreadyAffiliated')
      : t('pages.members.ctaAuthenticated')
    : t('pages.members.ctaGuest')
  const goToAffiliation = () => {
    if (hasActiveMembership) return
    onNavigate(isLoggedInAthlete ? 'membership' : 'register')
  }

  return (
    <main className="page page--design members-page members-page--plu-ref">
      <Reveal>
        <MembersPluHero
          onNavigate={onNavigate}
          session={session}
          affiliationCta={affiliationCta}
          ctaDisabled={hasActiveMembership || (isLoggedInAthlete && livePlansUnavailable)}
          onAffiliate={goToAffiliation}
        />
      </Reveal>

      <div className="members-page__body">
        <section className="members-section members-section--plans members-plu-plans" id="planes">
          <header className="members-plu-block__head members-plu-plans__head">
            <p className="members-plu-process__eyebrow">{t('pages.members.plansEyebrow')}</p>
            <h2 className="members-plu-block__title">{t('pages.members.plansTitle')}</h2>
            <p className="members-plu-block__lead">{t('pages.members.plansLead')}</p>
          </header>
          <div className="membership-grid membership-grid--plu">
            {visiblePlans.map((plan) => (
              <MembershipCard
                key={plan.id}
                {...plan}
                ctaLabel={affiliationCta}
                ctaDisabled={hasActiveMembership || livePlansUnavailable}
                onSelect={goToAffiliation}
                variant="plu"
              />
            ))}
          </div>
          {env.appProduction && !plansLoaded ? (
            <p className="members-plans-feedback" role="status">
              {t('pages.members.plansLoading')}
            </p>
          ) : null}
          {env.appProduction && plansLoaded && visiblePlans.length === 0 ? (
            <div className="members-plans-feedback" role={plansError ? 'alert' : 'status'}>
              <span>{plansError || t('pages.members.plansComingSoon')}</span>
              {plansError ? (
                <button type="button" onClick={() => loadPlans({ force: true })}>
                  <RefreshCw size={14} aria-hidden />
                  {t('pages.members.plansRetry')}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

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
