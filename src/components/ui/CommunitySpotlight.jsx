import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  formatMemberSince,
  getCommunityStats,
  getRecentMembers,
} from '../../services/communityService.js'

const FEED_LIMIT = 5

export default function CommunitySpotlight({ onNavigate }) {
  const { HOME_COMMUNITY } = useContent()
  const { locale, t } = useI18n()

  const members = useMemo(() => getRecentMembers(FEED_LIMIT, locale), [locale])
  const stats = useMemo(() => getCommunityStats(locale), [locale])

  return (
    <article className="community-spotlight community-spotlight--editorial">
      <header className="community-spotlight__intro">
        <p className="community-spotlight__eyebrow">{HOME_COMMUNITY.eyebrow}</p>
        <h2 className="community-spotlight__title">{HOME_COMMUNITY.title}</h2>
        <p className="community-spotlight__desc">{HOME_COMMUNITY.description}</p>

        <p className="community-spotlight__pulse" aria-label={t('pages.community.statsAria')}>
          <span>
            <strong>{stats.activeGymCount}</strong> {t('pages.community.statsActiveGyms')}
          </span>
          <span className="community-spotlight__pulse-sep" aria-hidden>
            ·
          </span>
          <span>
            <strong>{stats.memberCount}</strong> {t('pages.community.statsRecentMembers')}
          </span>
          <span className="community-spotlight__pulse-sep" aria-hidden>
            ·
          </span>
          <span>
            <strong>{stats.provinceCount}</strong> {t('pages.community.statsProvinces')}
          </span>
        </p>

        <button
          type="button"
          className="community-spotlight__cta motion-icon-shift"
          onClick={() => onNavigate('community')}
        >
          {HOME_COMMUNITY.cta}
          <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
        </button>
      </header>

      <div className="community-spotlight__roster">
        <p className="community-spotlight__roster-label">{HOME_COMMUNITY.recentLabel}</p>

        <ul className="community-spotlight__list" aria-label={HOME_COMMUNITY.recentLabel}>
          {members.map((member, index) => (
            <li key={member.id} className="community-spotlight__row">
              <span className="community-spotlight__index" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="community-spotlight__row-main">
                <strong className="community-spotlight__row-name">{member.name}</strong>
                <span className="community-spotlight__row-meta">
                  {member.gym}
                  <span aria-hidden> · </span>
                  {member.province}
                </span>
              </span>
              {member.affiliatedAt ? (
                <time className="community-spotlight__row-date" dateTime={member.affiliatedAt}>
                  {formatMemberSince(member.affiliatedAt, locale)}
                </time>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
