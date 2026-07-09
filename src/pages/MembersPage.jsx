import { CalendarCheck, ClipboardList, CreditCard, ShieldCheck } from 'lucide-react'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembersPluHero from '../components/ui/MembersPluHero.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

const PROCESS_STEP_ICONS = [ClipboardList, CreditCard, ShieldCheck, CalendarCheck]

export default function MembersPage({ onNavigate, session }) {
  const {
    MEMBERSHIP_ANNUAL_STEPS,
    MEMBERSHIP_BENEFITS,
    MEMBERSHIP_FAQ,
    MEMBERSHIP_INSTITUTIONAL,
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

  return (
    <main className="page page--design members-page members-page--plu-ref">
      <Reveal>
        <MembersPluHero onHome={() => onNavigate('home')} onNavigate={onNavigate} session={session} />
      </Reveal>

      <div className="members-page__body">
        <section className="members-section members-section--plans members-plu-plans" id="planes">
          <div className="membership-grid membership-grid--plu">
            {MEMBERSHIP_PLANS.map((plan) => (
              <MembershipCard
                key={plan.id}
                {...plan}
                ctaLabel={affiliationCta}
                onSelect={goToAffiliation}
                variant="plu"
              />
            ))}
          </div>
        </section>

        <Reveal as="section" variant="up" className="members-plu-block">
          <header className="members-plu-block__head">
            <h2 className="members-plu-block__title">{t('pages.members.introTitle')}</h2>
            <p className="members-plu-block__lead">{t('pages.members.introText')}</p>
          </header>
          <ul className="members-plu-tiles" aria-label={t('pages.members.benefitsAria')}>
            {MEMBERSHIP_BENEFITS.map((item) => (
              <li key={item.id} className="members-plu-tile">
                <strong className="members-plu-tile__title">{item.title}</strong>
                <p className="members-plu-tile__text">{item.text}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--process">
          <header className="members-plu-block__head members-plu-block__head--process">
            <p className="members-plu-process__eyebrow">{t('pages.members.processEyebrow')}</p>
            <h2 className="members-plu-block__title">{t('pages.members.processTitle')}</h2>
            <p className="members-plu-block__lead">{t('pages.members.processLead')}</p>
          </header>
          <ol className="members-plu-process" aria-label={t('pages.members.processAria')}>
            {MEMBERSHIP_ANNUAL_STEPS.map((step, index) => {
              const Icon = PROCESS_STEP_ICONS[index] ?? ClipboardList
              const isLast = index === MEMBERSHIP_ANNUAL_STEPS.length - 1

              return (
                <li key={step.step} className="members-plu-process__step">
                  <div className="members-plu-process__track" aria-hidden>
                    <span className="members-plu-process__num">{step.step}</span>
                    {!isLast ? <span className="members-plu-process__rail" /> : null}
                  </div>
                  <article className="members-plu-process__card" data-step={step.step}>
                    <span className="members-plu-process__icon" aria-hidden>
                      <Icon size={16} strokeWidth={1.75} />
                    </span>
                    <div className="members-plu-process__copy">
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                    </div>
                  </article>
                </li>
              )
            })}
          </ol>
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--requirements">
          <header className="members-plu-block__head">
            <h2 className="members-plu-block__title">{t('pages.members.requirementsTitle')}</h2>
            <p className="members-plu-block__lead">{t('pages.members.requirementsLead')}</p>
          </header>

          <div className="members-plu-requirements">
            <ul className="members-plu-checklist" aria-label={t('pages.members.requirementsAria')}>
              {MEMBERSHIP_REQUIREMENTS.map((item) => (
                <li key={item.id} className="members-plu-checklist__item">
                  <span className="members-plu-checklist__marker" aria-hidden />
                  <div className="members-plu-checklist__copy">
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="members-plu-validity-card" aria-labelledby="members-validity-title">
              <h3 id="members-validity-title" className="members-plu-validity-card__title">
                {t('pages.members.validityTitle')}
              </h3>
              <p className="members-plu-validity-card__text">{t('pages.members.validityText')}</p>
              <ul className="members-plu-validity-card__notes">
                {validityNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </aside>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--note">
          <p className="members-plu-note">{MEMBERSHIP_INSTITUTIONAL.text}</p>
        </Reveal>

        <Reveal as="section" variant="up" className="members-plu-block members-plu-block--faq">
          <header className="members-plu-block__head">
            <h2 className="members-plu-block__title">{t('pages.members.faqTitle')}</h2>
          </header>
          <FAQAccordion items={MEMBERSHIP_FAQ} />
        </Reveal>
      </div>
    </main>
  )
}
