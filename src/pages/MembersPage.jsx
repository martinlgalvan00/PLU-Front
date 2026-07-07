import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembersHeroRail from '../components/ui/MembersHeroRail.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function MembersPage({ onNavigate, session }) {  const {
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
        eyebrow={t('pages.members.heroEyebrow')}
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
            <header className="members-intro__head">
              <span className="members-intro__index" aria-hidden>
                {t('pages.members.introIndex')}
              </span>
              <div className="members-intro__head-copy">
                <span className="members-section__eyebrow">{t('pages.members.introEyebrow')}</span>
                <h2 className="members-section__title members-section__title--display">
                  {t('pages.members.introTitle')}
                </h2>
                <p className="members-section__text">{t('pages.members.introText')}</p>
              </div>
            </header>

            <ul className="members-benefit-list members-benefit-list--luxury" aria-label={t('pages.members.benefitsAria')}>
              {MEMBERSHIP_BENEFITS.map((item, index) => (
                <li key={item.id} className="members-benefit-list__item">
                  <span className="members-benefit-list__index" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="members-benefit-list__copy">
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-section members-section--requirements">
          <div className="members-requirements">
            <span className="members-requirements__index" aria-hidden>
              {t('pages.members.requirementsIndex')}
            </span>

            <div className="members-requirements__content">
              <header className="members-requirements__head">
                <span className="members-section__eyebrow">{t('pages.members.requirementsEyebrow')}</span>
                <h2 className="members-section__title">{t('pages.members.requirementsTitle')}</h2>
              </header>

              <ul className="members-req-list members-req-list--editorial" aria-label={t('pages.members.requirementsAria')}>
                {MEMBERSHIP_REQUIREMENTS.map((item) => (
                  <li key={item.id} className="members-req-list__item">
                    <div className="members-req-list__copy">
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="members-requirements__validity" aria-labelledby="members-validity-title">
                <header className="members-requirements__validity-head">
                  <span className="members-requirements__validity-label">{t('pages.members.validityLabel')}</span>
                  <h3 id="members-validity-title">{t('pages.members.validityTitle')}</h3>
                </header>
                <p className="members-requirements__validity-text">{t('pages.members.validityText')}</p>
                <p className="members-requirements__validity-notes">
                  {validityNotes.map((note, index) => (
                    <span key={note}>
                      {index > 0 ? <span aria-hidden> · </span> : null}
                      {note}
                    </span>
                  ))}
                </p>
              </div>
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
