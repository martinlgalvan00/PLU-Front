import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  formatMemberSince,
  getCommunityStats,
  getRecentMembers,
} from '../../services/communityService.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DISTANCE, MOTION_DURATION, MOTION_EASE, MOTION_STAGGER, MOTION_VIEWPORT } from '../../motion/tokens'
import { staggerContainer } from '../../motion/variants.ts'

const FEED_LIMIT = 5

function memberInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

const rosterItem = {
  hidden: { opacity: 0, x: -MOTION_DISTANCE.sm },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

export default function CommunitySpotlight({ onNavigate }) {
  const { HOME_COMMUNITY } = useContent()
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const members = useMemo(() => getRecentMembers(FEED_LIMIT, locale), [locale])
  const stats = useMemo(() => getCommunityStats(locale), [locale])

  const listVariants = {
    ...staggerContainer,
    visible: {
      ...staggerContainer.visible,
      transition: {
        staggerChildren: MOTION_STAGGER.step * 0.85,
        delayChildren: 0.08,
      },
    },
  }

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
        <p className="community-spotlight__roster-label">
          <span className="community-spotlight__live" aria-hidden />
          {HOME_COMMUNITY.recentLabel}
        </p>

        {reducedMotion ? (
          <ul className="community-spotlight__list" aria-label={HOME_COMMUNITY.recentLabel}>
            {members.map((member, index) => (
              <li key={member.id} className="community-spotlight__row">
                <span className="community-spotlight__avatar" aria-hidden>
                  {memberInitials(member.name)}
                </span>
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
        ) : (
          <m.ul
            className="community-spotlight__list"
            aria-label={HOME_COMMUNITY.recentLabel}
            initial="hidden"
            whileInView="visible"
            viewport={{
              once: MOTION_VIEWPORT.once,
              amount: 0.35,
              margin: MOTION_VIEWPORT.margin,
            }}
            variants={listVariants}
          >
            {members.map((member, index) => (
              <m.li
                key={member.id}
                className="community-spotlight__row"
                variants={rosterItem}
                whileHover={{ x: 4 }}
                transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE.out }}
              >
                <span className="community-spotlight__avatar" aria-hidden>
                  {memberInitials(member.name)}
                </span>
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
              </m.li>
            ))}
          </m.ul>
        )}
      </div>
    </article>
  )
}
