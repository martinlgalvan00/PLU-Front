import { ArrowRight } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  formatMemberSince,
  getAffiliatedGyms,
  getCommunityStats,
  getGymMonogram,
  getMemberInitials,
  getRecentMembers,
} from '../services/communityService.js'

function CommunityStatsRail({ className = '', stats, t }) {
  return (
    <dl className={`community-stats-rail ${className}`.trim()} aria-label={t('pages.community.statsAria')}>
      <div className="community-stats-rail__metric">
        <dt>{t('pages.community.statsActiveGyms')}</dt>
        <dd>{stats.activeGymCount}</dd>
      </div>
      <div className="community-stats-rail__metric">
        <dt>{t('pages.community.statsRecentMembers')}</dt>
        <dd>{stats.memberCount}</dd>
      </div>
      <div className="community-stats-rail__metric">
        <dt>{t('pages.community.statsProvinces')}</dt>
        <dd>{stats.provinceCount}</dd>
      </div>
    </dl>
  )
}

function CommunityGymsSection({ gyms, onNavigate, t }) {
  return (
    <section className="community-section" aria-labelledby="community-gyms-title">
      <header className="community-section__head">
        <span className="community-section__index" aria-hidden>
          {t('pages.community.gymsEyebrow')}
        </span>
        <div className="community-section__copy">
          <h2 className="community-section__title" id="community-gyms-title">
            {t('pages.community.gymsTitle')}
          </h2>
          <p className="community-section__lead">{t('pages.community.gymsLead')}</p>
        </div>
        <button type="button" className="community-section__link" onClick={() => onNavigate?.('contact')}>
          {t('pages.community.gymsCta')}
          <ArrowRight size={14} aria-hidden />
        </button>
      </header>

      <ul className="community-gym-list">
        {gyms.map((gym) => (
          <li key={gym.id} className={`community-gym-card community-gym-card--${gym.status}`}>
            <span className="community-gym-card__monogram" aria-hidden>
              {getGymMonogram(gym.city)}
            </span>
            <div className="community-gym-card__main">
              <strong className="community-gym-card__name">{gym.name}</strong>
              <span className="community-gym-card__city">
                {gym.city}, {gym.province}
              </span>
            </div>
            <span className="community-gym-card__status">
              <span className="community-gym-card__status-dot" aria-hidden />
              {gym.status === 'active' ? t('pages.community.statusActive') : t('pages.community.statusSoon')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CommunityMembersFeed({ members, onNavigate, locale, t }) {
  return (
    <section className="community-section" aria-labelledby="community-members-title">
      <header className="community-section__head">
        <span className="community-section__index" aria-hidden>
          {t('pages.community.membersEyebrow')}
        </span>
        <div className="community-section__copy">
          <h2 className="community-section__title" id="community-members-title">
            {t('pages.community.membersTitle')}
          </h2>
          <p className="community-section__lead">{t('pages.community.membersLead')}</p>
        </div>
        <button type="button" className="community-section__link" onClick={() => onNavigate?.('members')}>
          {t('pages.community.membersCta')}
          <ArrowRight size={14} aria-hidden />
        </button>
      </header>

      <div className="community-member-table">
        <table className="community-member-table__grid">
          <thead>
            <tr>
              <th scope="col">{t('pages.community.tableAthlete')}</th>
              <th scope="col">{t('pages.community.tableGym')}</th>
              <th scope="col" className="community-member-table__col--division">
                {t('pages.community.tableDivision')}
              </th>
              <th scope="col" className="community-member-table__col--code">
                {t('pages.community.tableCode')}
              </th>
              <th scope="col" className="community-member-table__col--date">
                {t('pages.community.tableAffiliation')}
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td
                  className="community-member-table__cell community-member-table__cell--athlete"
                  data-label={t('pages.community.tableAthlete')}
                >
                  <span className="community-member-table__athlete">
                    <span className="community-member-table__monogram" aria-hidden>
                      {getMemberInitials(member.name)}
                    </span>
                    <span className="community-member-table__name">{member.name}</span>
                  </span>
                </td>
                <td className="community-member-table__cell" data-label={t('pages.community.tableGym')}>
                  {member.gym}
                </td>
                <td
                  className="community-member-table__cell community-member-table__col--division"
                  data-label={t('pages.community.tableDivision')}
                >
                  {member.division}
                </td>
                <td
                  className="community-member-table__cell community-member-table__cell--code community-member-table__col--code"
                  data-label={t('pages.community.tableCode')}
                >
                  <code>{member.memberCode}</code>
                </td>
                <td
                  className="community-member-table__cell community-member-table__cell--date community-member-table__col--date"
                  data-label={t('pages.community.tableAffiliation')}
                >
                  <time dateTime={member.affiliatedAt}>{formatMemberSince(member.affiliatedAt, locale)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CommunityStoriesSection({ testimonials, t }) {
  return (
    <section className="community-section community-section--stories" aria-labelledby="community-stories-title">
      <header className="community-section__head community-section__head--compact">
        <span className="community-section__index" aria-hidden>
          {t('pages.community.storiesEyebrow')}
        </span>
        <div className="community-section__copy">
          <h2 className="community-section__title" id="community-stories-title">
            {t('pages.community.storiesTitle')}
          </h2>
          <p className="community-section__lead">{t('pages.community.storiesLead')}</p>
        </div>
      </header>

      <div className="community-stories-grid">
        {testimonials.map((item, index) => (
          <article key={item.id} className="community-story-card">
            <header className="community-story-card__head">
              <span className="community-story-card__index" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="community-story-card__badge">{t('pages.community.storySoon')}</span>
            </header>
            <p className="community-story-card__text">{item.text}</p>
            <footer className="community-story-card__foot">
              <span className="community-story-card__role">{item.role}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function CommunityPage({ onNavigate }) {
  const { COMMUNITY_QUOTE, COMMUNITY_TESTIMONIAL_PLACEHOLDERS } = useContent()
  const { locale, t } = useI18n()
  const stats = getCommunityStats(locale)
  const gyms = getAffiliatedGyms(locale)
  const recentMembers = getRecentMembers(undefined, locale)

  return (
    <main className="page page--design community-page--design community-page--premium">
      <DesignPageHero
        className="community-hero"
        compact
        breadcrumbLabel={t('pages.community.heroBreadcrumb')}
        eyebrow={t('pages.community.heroEyebrow')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.community.heroTitle')}
        description={t('pages.community.heroDesc')}
      >
        <CommunityStatsRail stats={stats} t={t} className="community-stats-rail--hero" />
      </DesignPageHero>

      <div className="community-page__inner">
        <Reveal variant="fade">
          <figure className="community-manifesto community-manifesto--panel">
            <blockquote>{COMMUNITY_QUOTE}</blockquote>
          </figure>
        </Reveal>

        <div className="community-page__grid">
          <Reveal variant="fade">
            <CommunityGymsSection gyms={gyms} onNavigate={onNavigate} t={t} />
          </Reveal>

          <Reveal delay={40} variant="fade">
            <CommunityMembersFeed members={recentMembers} onNavigate={onNavigate} locale={locale} t={t} />
          </Reveal>
        </div>

        <Reveal delay={60} variant="fade">
          <CommunityStoriesSection testimonials={COMMUNITY_TESTIMONIAL_PLACEHOLDERS} t={t} />
        </Reveal>
      </div>

      <CTASection
        title={t('pages.community.ctaTitle')}
        primaryLabel={t('pages.community.ctaPrimary')}
        onPrimary={() => onNavigate?.('contact')}
      />
    </main>
  )
}
