import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  fetchCommunitySpotlight,
  formatMemberSince,
  getCommunityStats,
  getRecentMembers,
} from '../../services/communityService.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DISTANCE, MOTION_DURATION, MOTION_EASE, MOTION_STAGGER, MOTION_VIEWPORT } from '../../motion/tokens.ts'
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

function RosterAvatar({ member }) {
  if (member.photoUrl) {
    return (
      <span className="community-spotlight__avatar community-spotlight__avatar--photo" aria-hidden>
        <img src={member.photoUrl} alt="" />
      </span>
    )
  }

  return (
    <span className="community-spotlight__avatar" aria-hidden>
      {memberInitials(member.name)}
    </span>
  )
}

function RosterList({ members, recentLabel, locale, reducedMotion, listVariants }) {
  if (reducedMotion) {
    return (
      <ul className="community-spotlight__list" aria-label={recentLabel}>
        {members.map((member, index) => (
          <li key={member.id} className="community-spotlight__row">
            <RosterAvatar member={member} />
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
    )
  }

  return (
    <m.ul
      className="community-spotlight__list"
      aria-label={recentLabel}
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
        >
          <RosterAvatar member={member} />
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
  )
}

export default function CommunitySpotlight({ onNavigate }) {
  const { HOME_COMMUNITY } = useContent()
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const [members, setMembers] = useState(() => getRecentMembers(FEED_LIMIT, locale))
  const [stats, setStats] = useState(() => getCommunityStats(locale))

  useEffect(() => {
    let active = true
    fetchCommunitySpotlight(FEED_LIMIT, locale)
      .then((spotlight) => {
        if (!active) return
        setMembers(spotlight.members)
        setStats(spotlight.stats)
      })
      .catch(() => {
        // El servicio ya cae a fallback; este catch es por si el estado desmontó.
      })
    return () => {
      active = false
    }
  }, [locale])

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

        <ul className="community-spotlight__stats" aria-label={t('pages.community.statsAria')}>
          <li className="community-spotlight__stat-editorial">
            <strong>{String(stats.activeGymCount).padStart(2, '0')}</strong>
            <span>{t('pages.community.statsActiveGyms')}</span>
          </li>
          <li className="community-spotlight__stat-editorial">
            <strong>{String(stats.memberCount).padStart(2, '0')}</strong>
            <span>{t('pages.community.statsRecentMembers')}</span>
          </li>
          <li className="community-spotlight__stat-editorial">
            <strong>{String(stats.provinceCount).padStart(2, '0')}</strong>
            <span>{t('pages.community.statsProvinces')}</span>
          </li>
        </ul>

        <button
          type="button"
          className="community-spotlight__cta-editorial motion-icon-shift"
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

        <RosterList
          members={members}
          recentLabel={HOME_COMMUNITY.recentLabel}
          locale={locale}
          reducedMotion={reducedMotion}
          listVariants={listVariants}
        />
      </div>
    </article>
  )
}
