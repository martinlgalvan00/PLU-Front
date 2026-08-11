import '../styles/pages/community.css'
import '../styles/layout/design-page-notebook.css'
import '../styles/pages/institutional-pages.css'
import { ArrowRight, BookOpen, CalendarDays, CircleCheck, Mail, MapPin, Trophy } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StaggerGroup from '../motion/StaggerGroup.tsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

function CommunityAction({ description, icon: Icon, label, onClick }) {
  return (
    <button type="button" className="community-action-row" onClick={onClick}>
      <span className="community-action-row__icon"><Icon size={19} aria-hidden /></span>
      <span className="community-action-row__copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <ArrowRight size={16} aria-hidden />
    </button>
  )
}

export default function CommunityPage({ onNavigate }) {
  const { t } = useI18n()

  const participation = ['members', 'events', 'contact']

  return (
    <main className="institutional-page community-page--institutional">
      <InstitutionalPageHero
        breadcrumb={t('pages.community.heroBreadcrumb')}
        description={t('pages.community.heroDesc')}
        eyebrow={t('pages.community.heroEyebrowNew')}
        index="C / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.community.heroTitle')}
      />

      <div className="institutional-page__inner community-institutional__inner">
        <Reveal variant="fade">
          <section className="community-manifesto" aria-labelledby="community-manifesto-title">
            <div className="community-manifesto__index" aria-hidden>
              <span>01</span>
              <i />
              <span>ARG</span>
            </div>
            <div className="community-manifesto__copy">
              <p className="institutional-kicker">{t('pages.community.manifestoEyebrow')}</p>
              <h2 id="community-manifesto-title">{t('pages.community.manifestoTitle')}</h2>
              <p>{t('pages.community.manifestoDesc')}</p>
            </div>
            <blockquote>
              <span aria-hidden>“</span>
              <p>{t('pages.community.manifestoQuote')}</p>
            </blockquote>
          </section>
        </Reveal>

        <section className="community-participation" aria-labelledby="community-participation-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">02 / {t('pages.community.participationEyebrow')}</p>
            <div>
              <h2 id="community-participation-title">{t('pages.community.participationTitle')}</h2>
              <p>{t('pages.community.participationDesc')}</p>
            </div>
          </header>
          <ol className="community-participation__steps">
            {participation.map((key, index) => (
              <li key={key}>
                <span className="community-participation__step" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{t(`pages.community.participation.${key}Title`)}</h3>
                  <p>{t(`pages.community.participation.${key}Desc`)}</p>
                  <button type="button" onClick={() => onNavigate?.(key)}>
                    {t(`pages.community.participation.${key}Cta`)}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="community-directory" aria-labelledby="community-directory-title">
          <header className="institutional-section-head institutional-section-head--compact">
            <p className="institutional-kicker">03 / {t('pages.community.channelsEyebrow')}</p>
            <div>
              <h2 id="community-directory-title">{t('pages.community.channelsTitle')}</h2>
              <p>{t('pages.community.channelsDesc')}</p>
            </div>
          </header>

          <div className="community-directory__grid">
            <StaggerGroup className="community-directory__actions" stagger={50}>
              <a className="community-action-row" href="mailto:hola@pluarg.com.ar">
                <span className="community-action-row__icon"><Mail size={19} aria-hidden /></span>
                <span className="community-action-row__copy">
                  <strong>{t('pages.community.emailTitle')}</strong>
                  <small>hola@pluarg.com.ar</small>
                </span>
                <ArrowRight size={16} aria-hidden />
              </a>
              <CommunityAction
                description={t('pages.community.calendarDesc')}
                icon={CalendarDays}
                label={t('pages.community.calendarTitle')}
                onClick={() => onNavigate?.('events')}
              />
              <CommunityAction
                description={t('pages.community.resultsDesc')}
                icon={Trophy}
                label={t('pages.community.resultsTitle')}
                onClick={() => onNavigate?.('results')}
              />
              <CommunityAction
                description={t('pages.community.rulebookDesc')}
                icon={BookOpen}
                label={t('pages.community.rulebookTitle')}
                onClick={() => onNavigate?.('rulebook')}
              />
            </StaggerGroup>

            <aside className="community-venue-note">
              <div className="community-venue-note__head">
                <span><MapPin size={18} aria-hidden /></span>
                <p className="institutional-kicker">{t('pages.community.venueEyebrow')}</p>
              </div>
              <h3>Maximal Strength Club</h3>
              <p>{t('pages.community.venueDesc')}</p>
              <button type="button" onClick={() => onNavigate?.('pitbull')}>
                {t('pages.community.venueCta')}
                <ArrowRight size={15} aria-hidden />
              </button>
            </aside>
          </div>
        </section>

        <Reveal variant="fade">
          <section className="community-honest-state" aria-labelledby="community-directory-empty-title">
            <span className="community-honest-state__icon"><CircleCheck size={22} aria-hidden /></span>
            <div>
              <p className="institutional-kicker">{t('pages.community.directoryEyebrow')}</p>
              <h2 id="community-directory-empty-title">{t('pages.community.directoryTitle')}</h2>
              <p>{t('pages.community.directoryDesc')}</p>
            </div>
            <button type="button" className="institutional-button institutional-button--primary" onClick={() => onNavigate?.('contact')}>
              {t('pages.community.directoryCta')}
              <ArrowRight size={16} aria-hidden />
            </button>
          </section>
        </Reveal>
      </div>
    </main>
  )
}
