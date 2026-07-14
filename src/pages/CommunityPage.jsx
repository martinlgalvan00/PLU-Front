import PluPageHero from '../components/layout/PluPageHero.jsx'
import CommunitySectionHeader from '../components/community/CommunitySectionHeader.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import AnimatedNumber from '../motion/AnimatedNumber.tsx'
import StaggerGroup from '../motion/StaggerGroup.tsx'
import {
  formatMemberSince,
  getAffiliatedGyms,
  getCommunityStats,
  getGymMonogram,
  getMemberInitials,
  getRecentMembers,
} from '../services/communityService.js'

const MEMBERS_PREVIEW = 5

function CommunityStatsRail({ className = '', stats, t }) {
  return (
    <dl className={`community-stats-rail ${className}`.trim()} aria-label={t('pages.community.statsAria')}>
      <div className="community-stats-rail__metric">
        <dt>{t('pages.community.statsActiveGyms')}</dt>
        <dd>
          <AnimatedNumber value={stats.activeGymCount} duration={0.48} />
        </dd>
      </div>
      <div className="community-stats-rail__metric">
        <dt>{t('pages.community.statsRecentMembers')}</dt>
        <dd>
          <AnimatedNumber value={stats.memberCount} duration={0.48} />
        </dd>
      </div>
      <div className="community-stats-rail__metric">
        <dt>{t('pages.community.statsProvinces')}</dt>
        <dd>
          <AnimatedNumber value={stats.provinceCount} duration={0.48} />
        </dd>
      </div>
    </dl>
  )
}

function CommunityGymsSection({ gyms, onNavigate, t }) {
  return (
    <section className="community-section" aria-labelledby="community-gyms-title">
      <CommunitySectionHeader
        ctaLabel={t('pages.community.gymsCta')}
        description={t('pages.community.gymsLead')}
        onCta={() => onNavigate?.('contact')}
        title={t('pages.community.gymsTitle')}
        titleId="community-gyms-title"
      />

      <StaggerGroup as="ul" className="community-gym-list" stagger={55} variant="up">
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
      </StaggerGroup>
    </section>
  )
}

function CommunityMembersFeed({ members, onNavigate, locale, t }) {
  return (
    <section className="community-section" aria-labelledby="community-members-title">
      <CommunitySectionHeader
        ctaLabel={t('pages.community.membersCta')}
        description={t('pages.community.membersLead')}
        onCta={() => onNavigate?.('members')}
        title={t('pages.community.membersTitle')}
        titleId="community-members-title"
      />

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

export default function CommunityPage({ onNavigate }) {
  const { locale, t } = useI18n()
  const stats = getCommunityStats(locale)
  const gyms = getAffiliatedGyms(locale)
  const recentMembers = getRecentMembers(MEMBERS_PREVIEW, locale)

  return (
    <main className="page page--design page--plu-ref community-page--design community-page--premium">
      <PluPageHero
        breadcrumbLabel={t('pages.community.heroBreadcrumb')}
        className="community-page__hero"
        description={t('pages.community.heroDesc')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.community.heroTitle')}
      >
        <CommunityStatsRail stats={stats} t={t} className="community-stats-rail--hero" />
      </PluPageHero>

      <div className="community-page__inner">
        <Reveal variant="fade">
          <CommunityGymsSection gyms={gyms} onNavigate={onNavigate} t={t} />
        </Reveal>

        <Reveal delay={40} variant="fade">
          <CommunityMembersFeed members={recentMembers} onNavigate={onNavigate} locale={locale} t={t} />
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
