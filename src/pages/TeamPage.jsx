import '../styles/pages/institutional-pages.css'
import '../styles/layout/design-page-notebook.css'
import { ArrowRight, Mail } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

const TEAM_ROLES = [
  { key: 'officials', reqsKey: 'officialsReqs' },
  { key: 'meetDirector', reqsKey: 'meetDirectorReqs' },
  { key: 'hostFacility', reqsKey: 'hostFacilityReqs' },
]

export default function TeamPage({ onNavigate }) {
  const { messages, t } = useI18n()
  const team = messages.pages.team
  const benefits = Array.isArray(team.benefits) ? team.benefits : []

  return (
    <main className="institutional-page team-page--institutional">
      <InstitutionalPageHero
        breadcrumb={t('pages.team.heroBreadcrumb')}
        description={t('pages.team.description')}
        eyebrow={t('pages.team.eyebrow')}
        index="N / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.team.title')}
      />

      <div className="institutional-page__inner team-page__inner">
        <section className="team-why" aria-labelledby="team-why-title">
          <header className="institutional-section-head institutional-section-head--compact">
            <p className="institutional-kicker">01 / {t('pages.team.whyEyebrow')}</p>
            <div>
              <h2 id="team-why-title">{t('pages.team.whyTitle')}</h2>
            </div>
          </header>

          <ul className="team-why__list team-why__list--compact">
            {benefits.map((item, index) => (
              <li key={item.id}>
                <span aria-hidden>{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
              </li>
            ))}
          </ul>
        </section>

        <section className="team-paths" aria-labelledby="team-paths-title">
          <header className="institutional-section-head institutional-section-head--compact">
            <p className="institutional-kicker">02 / {t('pages.team.rolesEyebrow')}</p>
            <div>
              <h2 id="team-paths-title">{t('pages.team.rolesTitle')}</h2>
            </div>
          </header>

          <ol className="team-paths__list">
            {TEAM_ROLES.map((role, index) => {
              const reqs = Array.isArray(team[role.reqsKey]) ? team[role.reqsKey] : []
              return (
                <li key={role.key} className="team-paths__item">
                  <div className="team-paths__index" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="team-paths__body">
                    <h3>{t(`pages.team.${role.key}Title`)}</h3>
                    {reqs.length > 0 ? (
                      <ul className="team-paths__reqs">
                        {reqs.map((req) => (
                          <li key={req}>{req}</li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      className="team-paths__apply"
                      onClick={() => onNavigate?.('contact')}
                    >
                      <span>{t('pages.team.roleApply')}</span>
                      <ArrowRight size={14} aria-hidden />
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>

          <p className="team-paths__note">{t('pages.team.reviewNote')}</p>
        </section>

        <Reveal delay={40}>
          <section className="team-close" aria-labelledby="team-close-title">
            <div className="team-close__copy">
              <p className="institutional-kicker">03 / {t('pages.team.closeEyebrow')}</p>
              <h2 id="team-close-title">{t('pages.team.closeTitle')}</h2>
              <p>{t('pages.team.closeLead')}</p>
            </div>
            <div className="team-close__actions">
              <button
                type="button"
                className="team-close__primary"
                onClick={() => onNavigate?.('contact')}
              >
                <Mail size={16} aria-hidden />
                <span>{t('pages.team.ctaContact')}</span>
                <ArrowRight size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="team-close__secondary"
                onClick={() => onNavigate?.('community')}
              >
                <span>{t('pages.team.ctaCommunity')}</span>
                <ArrowRight size={13} aria-hidden />
              </button>
            </div>
          </section>
        </Reveal>
      </div>
    </main>
  )
}
