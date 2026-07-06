import {
  Award,
  BadgeCheck,
  CreditCard,
  Camera,
  HeartPulse,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembersHeroRail from '../components/ui/MembersHeroRail.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

const BENEFIT_ICONS = {
  events: Trophy,
  credential: BadgeCheck,
  results: Award,
}

const REQUIREMENT_ICONS = {
  id: CreditCard,
  age: Users,
  health: HeartPulse,
  photo: Camera,
}

export default function MembersPage({ onNavigate, session }) {
  const {
    MEMBERSHIP_ANNUAL_STEPS,
    MEMBERSHIP_BENEFITS,
    MEMBERSHIP_FAQ,
    MEMBERSHIP_PLANS,
    MEMBERSHIP_REQUIREMENTS,
  } = useContent()
  const { messages, t } = useI18n()
  const validityNotes = messages.pages.members.validityNotes

  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const affiliationCta = isLoggedInAthlete
    ? t('pages.members.ctaAuthenticated')
    : t('pages.members.ctaGuest')
  const goToAffiliation = () => onNavigate(isLoggedInAthlete ? 'membership' : 'register')
  const scrollToPlans = () => document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <main className="page page--design members-page--design members-page--premium">
      <DesignPageHero
        className="members-hero"
        compact
        breadcrumbLabel={t('pages.members.heroBreadcrumb')}
        onHome={() => onNavigate('home')}
        title={t('pages.members.heroTitle')}
        description={t('pages.members.heroDesc')}
      >
        <MembersHeroRail
          actionLabel={affiliationCta}
          onAffiliate={goToAffiliation}
          onViewPlans={scrollToPlans}
        />
      </DesignPageHero>

      <div className="members-page__body">
        <Reveal as="section" variant="up" className="members-section members-section--intro">
          <div className="members-intro">
            <div className="members-intro__head">
              <span className="members-section__eyebrow">{t('pages.members.introEyebrow')}</span>
              <h2 className="members-section__title members-section__title--display">
                {t('pages.members.introTitle')}
              </h2>
              <p className="members-section__text">{t('pages.members.introText')}</p>
            </div>

            <ul className="members-benefit-list" aria-label={t('pages.members.benefitsAria')}>
              {MEMBERSHIP_BENEFITS.map((item) => {
                const Icon = BENEFIT_ICONS[item.id] ?? ShieldCheck
                return (
                  <li key={item.id} className="members-benefit-list__item">
                    <span className="members-benefit-list__icon" aria-hidden>
                      <Icon size={17} strokeWidth={1.75} />
                    </span>
                    <div className="members-benefit-list__copy">
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-section members-section--requirements">
          <div className="members-requirements">
            <header className="members-requirements__head">
              <span className="members-requirements__index" aria-hidden>
                {t('pages.members.requirementsIndex')}
              </span>
              <div className="members-requirements__head-copy">
                <span className="members-section__eyebrow">{t('pages.members.requirementsEyebrow')}</span>
                <h2 className="members-section__title">{t('pages.members.requirementsTitle')}</h2>
              </div>
            </header>

            <div className="members-requirements__body">
              <ol className="members-req-timeline" aria-label={t('pages.members.requirementsAria')}>
                {MEMBERSHIP_REQUIREMENTS.map((item, index) => {
                  const Icon = REQUIREMENT_ICONS[item.id] ?? ShieldCheck
                  return (
                    <li key={item.id} className="members-req-timeline__item">
                      <span className="members-req-timeline__index">{String(index + 1).padStart(2, '0')}</span>
                      <div className="members-req-timeline__copy">
                        <div className="members-req-timeline__title-row">
                          <span className="members-req-timeline__icon" aria-hidden>
                            <Icon size={13} strokeWidth={1.75} />
                          </span>
                          <strong>{item.title}</strong>
                        </div>
                        <p>{item.text}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>

              <aside className="members-validity-ledger" aria-labelledby="members-validity-title">
                <span className="members-validity-ledger__label">{t('pages.members.validityLabel')}</span>
                <h3 id="members-validity-title">{t('pages.members.validityTitle')}</h3>
                <p>{t('pages.members.validityText')}</p>
                <ul className="members-validity-ledger__notes">
                  {validityNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-section">
          <div className="members-section__head members-section__head--center">
            <span className="members-section__eyebrow">{t('pages.members.processEyebrow')}</span>
            <h2 className="members-section__title">{t('pages.members.processTitle')}</h2>
          </div>
          <div className="members-process members-process--timeline">
            {MEMBERSHIP_ANNUAL_STEPS.map((step) => (
              <article key={step.step} className="members-process-step">
                <span className="members-process-step__num">{step.step}</span>
                <div className="members-process-step__copy">
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        </Reveal>

        <section className="members-section" id="planes">
          <div className="members-section__head members-section__head--center">
            <span className="members-section__eyebrow">{t('pages.members.plansEyebrow')}</span>
            <h2 className="members-section__title">{t('pages.members.plansTitle')}</h2>
          </div>
          <div className="membership-grid membership-grid--editorial">
            {MEMBERSHIP_PLANS.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 60}>
                <MembershipCard {...plan} ctaLabel={affiliationCta} onSelect={goToAffiliation} />
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal as="section" variant="up" className="members-section members-section--narrow">
          <div className="members-section__head members-section__head--center">
            <span className="members-section__eyebrow">{t('pages.members.faqEyebrow')}</span>
            <h2 className="members-section__title">{t('pages.members.faqTitle')}</h2>
          </div>
          <FAQAccordion items={MEMBERSHIP_FAQ} />
        </Reveal>
      </div>
    </main>
  )
}
