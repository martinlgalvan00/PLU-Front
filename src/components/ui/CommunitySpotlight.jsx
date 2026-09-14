import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { LazyPhoto } from './LazyPhoto.jsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { fetchCommunitySpotlight, formatMemberSince } from '../../services/communityService.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_DISTANCE,
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
} from '../../motion/tokens.ts'
import { staggerContainer } from '../../motion/variants.ts'

const FEED_LIMIT = 5
const EMPTY_STATS = Object.freeze({
  activeGymCount: 0,
  memberCount: 0,
  provinceCount: 0,
})

function isPositiveStat(value) {
  return Number(value) > 0
}

function visibleCommunityStats(stats, t) {
  return [
    {
      key: 'gyms',
      value: stats.activeGymCount,
      label: t('pages.community.statsActiveGyms'),
    },
    {
      key: 'members',
      value: stats.memberCount,
      label: t('pages.community.statsRecentMembers'),
    },
    {
      key: 'provinces',
      value: stats.provinceCount,
      label: t('pages.community.statsProvinces'),
    },
  ].filter((item) => isPositiveStat(item.value))
}

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
        <LazyPhoto src={member.photoUrl} alt="" className="community-spotlight__avatar-photo" />
      </span>
    )
  }

  return (
    <span className="community-spotlight__avatar" aria-hidden>
      {memberInitials(member.name)}
    </span>
  )
}

function RosterEmpty({ label }) {
  return (
    <div className="community-spotlight__empty" role="status">
      {label}
    </div>
  )
}

function RosterList({ members, recentLabel, emptyLabel, locale, reducedMotion, listVariants }) {
  if (members.length === 0) {
    return <RosterEmpty label={emptyLabel} />
  }

  if (reducedMotion) {
    return (
      <ul className="community-spotlight__list" aria-label={recentLabel}>
        {members.map((member) => (
          <li key={member.id} className="community-spotlight__row">
            <RosterAvatar member={member} />
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
      {members.map((member) => (
        <m.li key={member.id} className="community-spotlight__row" variants={rosterItem}>
          <RosterAvatar member={member} />
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
  const [members, setMembers] = useState([])
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    setLoaded(false)
    fetchCommunitySpotlight(FEED_LIMIT, locale)
      .then((spotlight) => {
        if (!active) return
        setMembers(spotlight.members)
        setStats(spotlight.stats)
      })
      .catch(() => {
        if (!active) return
        setMembers([])
        setStats(EMPTY_STATS)
      })
      .finally(() => {
        if (active) setLoaded(true)
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

  const visibleStats = visibleCommunityStats(stats, t)

  return (
    <article className="community-spotlight community-spotlight--editorial">
      <header className="community-spotlight__intro">
        <p className="community-spotlight__eyebrow">{HOME_COMMUNITY.eyebrow}</p>
        <h2 className="community-spotlight__title">{HOME_COMMUNITY.title}</h2>
        <p className="community-spotlight__desc">{HOME_COMMUNITY.description}</p>

        {visibleStats.length > 0 ? (
          <ul
            className="community-spotlight__stats"
            data-count={visibleStats.length}
            aria-label={t('pages.community.statsAria')}
          >
            {visibleStats.map((item) => (
              <li key={item.key} className="community-spotlight__stat-editorial">
                <strong>{String(item.value).padStart(2, '0')}</strong>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className="community-spotlight__cta-editorial motion-icon-shift"
          onClick={() => onNavigate('community')}
        >
          {HOME_COMMUNITY.cta}
          <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
        </button>
      </header>

      <div className="community-spotlight__roster" aria-busy={!loaded || undefined}>
        <p className="community-spotlight__roster-label">{HOME_COMMUNITY.recentLabel}</p>

        <RosterList
          members={members}
          recentLabel={HOME_COMMUNITY.recentLabel}
          emptyLabel={
            loaded ? HOME_COMMUNITY.emptyRecentLabel : HOME_COMMUNITY.loadingRecentLabel
          }
          locale={locale}
          reducedMotion={reducedMotion}
          listVariants={listVariants}
        />
      </div>
    </article>
  )
}
