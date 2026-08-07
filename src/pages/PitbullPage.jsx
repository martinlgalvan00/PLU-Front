import {
  ArrowRight,
  FileText,
} from 'lucide-react'
import { m } from 'motion/react'
import photoMeetFloor from '../assets/DSC00346-display.jpg'
import photoCrowd from '../assets/DSC00392-display.jpg'
import PitbullHero from '../components/layout/PitbullHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventVenueMap from '../components/ui/EventVenueMap.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useEventRegistrationCapacity } from '../hooks/useEventRegistrationCapacity.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { formatRelativeTime, money } from '../lib/format.js'
import { getStatusMeta, isRegistrationOpen } from '../lib/status.js'
import AnimatedNumber from '../motion/AnimatedNumber.tsx'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER, MOTION_VIEWPORT } from '../motion/tokens.ts'
import { staggerContainer, staggerItem } from '../motion/variants.ts'

function scrollToSection(id) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  })
}

function PitbullDossierSection({
  id,
  index,
  eyebrow,
  title,
  lead,
  titleId,
  className = '',
  tone = 'default',
  hideHeader = false,
  children,
}) {
  const isOps = tone === 'ops'

  return (
    <section
      id={id}
      className={`pitbull-dossier__section${isOps ? ' pitbull-dossier__section--ops' : ''} ${className}`.trim()}
      aria-label={hideHeader ? title : undefined}
      aria-labelledby={hideHeader ? undefined : titleId}
    >
      <Reveal as="div" direction="up" className="pitbull-dossier__reveal">
        {!hideHeader ? (
          <header className={`pitbull-dossier__head${isOps ? ' pitbull-dossier__head--ops' : ''}`}>
            {isOps ? null : (
              <p className="pitbull-dossier__kicker">
                <span className="pitbull-dossier__index" aria-hidden>
                  {index}
                </span>
                <span className="pitbull-dossier__eyebrow">{eyebrow}</span>
              </p>
            )}
            <h2 id={titleId} className="pitbull-dossier__title">
              {title}
            </h2>
            {lead && !isOps ? <p className="pitbull-dossier__lead">{lead}</p> : null}
          </header>
        ) : null}

        {children ? <div className="pitbull-dossier__body">{children}</div> : null}
      </Reveal>
    </section>
  )
}

function PitbullSectionNav({ items, t }) {
  return (
    <nav className="pitbull-section-nav" aria-label={t('pages.pitbull.pageNavAria')}>
      <div className="pitbull-section-nav__inner">
        <span className="pitbull-section-nav__label">{t('pages.pitbull.pageNavLabel')}</span>
        <div className="pitbull-section-nav__track">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="pitbull-section-nav__item"
              onClick={() => scrollToSection(item.id)}
            >
              <span className="pitbull-section-nav__index" aria-hidden>
                {item.index}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

function PitbullInscriptionCounter({ registered, slots, statusLabel, statusTone, t, variant = 'default' }) {
  const { reducedMotion } = useMotionConfig()
  const pct = slots > 0 ? Math.round((registered / slots) * 100) : 0
  const isCompact = variant === 'compact'

  return (
    <div
      className={`pitbull-inscription-counter${isCompact ? ' pitbull-inscription-counter--compact' : ''}`}
      role="meter"
      aria-label={t('pages.pitbull.inscriptionCounterAria', { registered, slots })}
      aria-valuenow={registered}
      aria-valuemin={0}
      aria-valuemax={slots}
    >
      <div className="pitbull-inscription-counter__row">
        <div className="pitbull-inscription-counter__stat">
          <AnimatedNumber className="pitbull-inscription-counter__value" value={registered} />
          <span className="pitbull-inscription-counter__of">/ {slots}</span>
          <span className="pitbull-inscription-counter__unit">cupos</span>
        </div>
        {reducedMotion ? (
          <span className={`pitbull-inscription-counter__badge pitbull-inscription-counter__badge--${statusTone}`}>
            <span className="pitbull-inscription-counter__badge-dot" aria-hidden />
            {statusLabel}
          </span>
        ) : (
          <m.span
            className={`pitbull-inscription-counter__badge pitbull-inscription-counter__badge--${statusTone}`}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={MOTION_VIEWPORT}
            transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.18 }}
          >
            <span className="pitbull-inscription-counter__badge-dot" aria-hidden />
            {statusLabel}
          </m.span>
        )}
      </div>
      <div className="pitbull-inscription-counter__bar" aria-hidden>
        {reducedMotion ? (
          <div className="pitbull-inscription-counter__fill" style={{ transform: `scaleX(${pct / 100})` }} />
        ) : (
          <m.div
            className="pitbull-inscription-counter__fill"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: pct / 100 }}
            viewport={MOTION_VIEWPORT}
            transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out }}
          />
        )}
      </div>
    </div>
  )
}

function PitbullExperienceSection({ t }) {
  const { reducedMotion } = useMotionConfig()
  const items = [
    {
      id: 'equipment',
      label: t('pages.pitbull.experienceItemEquipment'),
      text: t('pages.pitbull.experienceItemEquipmentDesc'),
    },
    {
      id: 'judges',
      label: t('pages.pitbull.experienceItemJudges'),
      text: t('pages.pitbull.experienceItemJudgesDesc'),
    },
    {
      id: 'media',
      label: t('pages.pitbull.experienceItemMedia'),
      text: t('pages.pitbull.experienceItemMediaDesc'),
    },
    {
      id: 'warmup',
      label: t('pages.pitbull.experienceItemWarmup'),
      text: t('pages.pitbull.experienceItemWarmupDesc'),
    },
  ]

  const StageTag = reducedMotion ? 'div' : m.div
  const PillarsTag = reducedMotion ? 'ul' : m.ul
  const PillarTag = reducedMotion ? 'li' : m.li
  const stageMotion = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: MOTION_VIEWPORT,
        transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
      }
  const pillarsMotion = reducedMotion
    ? {}
    : {
        variants: staggerContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
      }
  const pillarMotion = reducedMotion ? {} : { variants: staggerItem }

  return (
    <section
      id="experiencia"
      className="pitbull-dossier__section pitbull-dossier__section--experience"
      aria-labelledby="pitbull-experience-title"
    >
      <Reveal as="div" direction="up" className="pitbull-dossier__reveal">
        <div className="pitbull-experience pitbull-experience--stage">
          <StageTag className="pitbull-experience__stage" {...stageMotion}>
            <figure className="pitbull-experience__media">
              <img
                className="pitbull-experience__img"
                src={photoMeetFloor}
                alt=""
                width={800}
                height={1200}
                loading="lazy"
                decoding="async"
              />
              <div className="pitbull-experience__scrim" aria-hidden />
            </figure>
            <header className="pitbull-experience__masthead">
              <p className="pitbull-experience__kicker">
                <span className="pitbull-experience__index" aria-hidden>
                  {t('pages.pitbull.experienceIndex')}
                </span>
                <span>{t('pages.pitbull.experienceEyebrow')}</span>
              </p>
              <h2 id="pitbull-experience-title" className="pitbull-experience__title">
                {t('pages.pitbull.experienceTitle')}
              </h2>
              <p className="pitbull-experience__lead">{t('pages.pitbull.experienceLead')}</p>
            </header>
          </StageTag>

          <PillarsTag
            className="pitbull-experience__pillars"
            aria-label={t('pages.pitbull.experienceListAria')}
            {...pillarsMotion}
          >
            {items.map((item) => (
              <PillarTag key={item.id} className="pitbull-experience__pillar" {...pillarMotion}>
                <h3 className="pitbull-experience__label">{item.label}</h3>
                <p className="pitbull-experience__text">{item.text}</p>
              </PillarTag>
            ))}
          </PillarsTag>
        </div>
      </Reveal>
    </section>
  )
}

function PitbullWeighInSnapshot() {
  return (
    <PitbullDossierSection
      id="pesajes"
      className="pitbull-dossier__section--weighins"
      eyebrow="03"
      index="03"
      lead="Control estricto de peso corporal. Sin excepciones."
      title="Pesajes Oficiales"
      titleId="pitbull-weighins-title"
    >
      <div className="pitbull-weighins">
        <div className="pitbull-weighin-card">
          <span className="pitbull-weighin-card__day">Viernes</span>
          <div className="pitbull-weighin-card__details">
            <time className="pitbull-weighin-card__time">09:00 — 12:00<br/>16:00 — 19:00</time>
            <p className="pitbull-weighin-card__note">Pesaje adelantado. Opcional para todas las categorías.</p>
          </div>
        </div>
        <div className="pitbull-weighin-card">
          <span className="pitbull-weighin-card__day">Sábado</span>
          <div className="pitbull-weighin-card__details">
            <time className="pitbull-weighin-card__time">07:00 — 08:30</time>
            <p className="pitbull-weighin-card__note">Último llamado. Exclusivo para atletas que compiten y no se pesaron el viernes.</p>
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullLocationSection({ event, venue, t }) {
  const locality = venue.locality?.replace(/^B\d+\s*/, '') || ''
  const lead = venue.street
    ? [venue.street, locality].filter(Boolean).join(' · ')
    : t('pages.pitbull.locationLead')

  return (
    <PitbullDossierSection
      id="lugar"
      className="pitbull-dossier__section--location"
      eyebrow={t('pages.pitbull.locationEyebrow')}
      index={t('pages.pitbull.locationIndex')}
      lead={lead}
      title={venue.name || t('pages.pitbull.locationTitle')}
      titleId="pitbull-location-title"
    >
      <div className="pitbull-venue">
        <div className="pitbull-venue__map">
          <EventVenueMap
            event={event}
            role={t('pages.pitbull.locationOfficialRole')}
            venue={venue}
          />
          <div className="pitbull-venue__dock">
            <div className="pitbull-venue__dock-copy">
              <p className="pitbull-venue__role">{t('pages.pitbull.locationOfficialRole')}</p>
              {venue.street ? <p className="pitbull-venue__street">{venue.street}</p> : null}
              {locality ? <p className="pitbull-venue__locality">{locality}</p> : null}
            </div>
            {venue.mapsUrl ? (
              <a
                className="pitbull-venue__directions motion-icon-shift"
                href={venue.mapsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t('pages.pitbull.locationDirectionsCta')}
                <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullTicketsBand({ onOpen, t }) {
  return (
    <section
      id="entradas"
      className="pitbull-tickets-band"
      aria-labelledby="pitbull-tickets-title"
    >
      <div className="pitbull-tickets-band__media" aria-hidden>
        <img
          className="pitbull-tickets-band__img"
          src={photoCrowd}
          alt=""
          width={800}
          height={1200}
          loading="lazy"
          decoding="async"
        />
        <div className="pitbull-tickets-band__scrim" />
      </div>
      <div className="pitbull-tickets-band__content">
        <p className="pitbull-tickets-band__kicker">
          <span className="pitbull-tickets-band__index" aria-hidden>
            {t('pages.pitbull.ticketsIndex')}
          </span>
          <span className="pitbull-tickets-band__eyebrow">{t('pages.pitbull.ticketsEyebrow')}</span>
        </p>
        <h2 id="pitbull-tickets-title" className="pitbull-tickets-band__title">
          {t('pages.pitbull.ticketsTitle')}
        </h2>
        <p className="pitbull-tickets-band__lead">{t('pages.pitbull.ticketsLead')}</p>
        <p className="pitbull-tickets-band__facts" aria-label={t('pages.pitbull.ticketsFactsAria')}>
          <span>{t('pages.pitbull.ticketsFactId')}</span>
          <span aria-hidden>·</span>
          <span>{t('pages.pitbull.ticketsFactMembership')}</span>
          <span aria-hidden>·</span>
          <span>{t('pages.pitbull.ticketsNote')}</span>
        </p>
        <button
          type="button"
          className="pitbull-tickets-band__cta motion-icon-shift"
          onClick={onOpen}
        >
          {t('pages.pitbull.ticketPassCta')}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
      </div>
    </section>
  )
}

function PitbullRecentRegistrants({ capacityStatus, locale, recent, t }) {
  const isEmpty = recent.length === 0
  const isLive = capacityStatus === 'live'

  return (
    <div
      className={`pitbull-recent${isEmpty ? ' pitbull-recent--empty' : ''}`}
      aria-label={t('pages.pitbull.recentRegistrantsAria')}
    >
      <div className="pitbull-recent__head">
        <h3 className="pitbull-recent__title">{t('pages.pitbull.recentRegistrantsTitle')}</h3>
        {isLive ? (
          <p className="pitbull-recent__hint pitbull-recent__hint--live">
            <span className="pitbull-recent__hint-dot" aria-hidden />
            {t('pages.pitbull.recentRegistrantsLiveHint')}
          </p>
        ) : null}
      </div>

      {isEmpty ? (
        <div className="pitbull-recent__empty" role="status">
          <p className="pitbull-recent__empty-lead">{t('pages.pitbull.recentRegistrantsEmpty')}</p>
          <p className="pitbull-recent__empty-note">
            {isLive
              ? t('pages.pitbull.recentRegistrantsEmptyNote')
              : t('pages.pitbull.recentRegistrantsFallbackHint')}
          </p>
        </div>
      ) : (
        <ol className="pitbull-recent__list">
          {recent.map((item, index) => {
            const line = [item.displayName, item.gym].filter(Boolean).join(' · ')
            return (
              <li key={`${item.displayName}-${item.registeredAt ?? index}`} className="pitbull-recent__row">
                <span className="pitbull-recent__name">{line}</span>
                <time className="pitbull-recent__time" dateTime={item.registeredAt ?? undefined}>
                  {formatRelativeTime(item.registeredAt, locale)}
                </time>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function PitbullInscriptionSection({
  canRegister,
  capacityStatus,
  eventStatus,
  locale,
  onNavigate,
  pricing,
  recent,
  registered,
  slots,
  t,
}) {
  const { reducedMotion } = useMotionConfig()
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus, t)

  const bodyGroupMotion = {
    hidden: {},
    show: { transition: { staggerChildren: MOTION_STAGGER.step, delayChildren: 0.24 } },
  }
  const bodyEntryMotion = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out } },
  }
  const Body = reducedMotion ? 'div' : m.div
  const bodyProps = reducedMotion
    ? {}
    : { variants: bodyGroupMotion, initial: 'hidden', whileInView: 'show', viewport: MOTION_VIEWPORT }
  const Pricing = reducedMotion ? 'dl' : m.dl
  const Footer = reducedMotion ? 'div' : m.div
  const childProps = reducedMotion ? {} : { variants: bodyEntryMotion }

  return (
    <PitbullDossierSection
      id="inscripcion"
      className="pitbull-dossier__section--inscription pitbull-dossier__section--stack pitbull-inscription"
      hideHeader
      title={t('pages.pitbull.inscriptionTitle')}
      tone="ops"
    >
      <div className="pitbull-inscription-shell pitbull-inscription-shell--compact">
        <PitbullInscriptionCounter
          registered={registered}
          slots={slots}
          statusLabel={statusLabel}
          statusTone={statusTone}
          t={t}
          variant="compact"
        />

        <Body className="pitbull-inscription-shell__body" {...bodyProps}>
          <Pricing className="pitbull-inscription-shell__pricing" aria-label={t('pages.pitbull.costsAria')} {...childProps}>
            <div className="pitbull-inscription-shell__price">
              <dt>{t('pages.pitbull.costMembership')}</dt>
              <dd>{money(pricing.membership, locale)}</dd>
            </div>
            <div className="pitbull-inscription-shell__price">
              <dt>{t('pages.pitbull.costMeet')}</dt>
              <dd>{money(pricing.registration, locale)}</dd>
            </div>
          </Pricing>

          <Footer className="pitbull-inscription-shell__footer" {...childProps}>
            <p className="pitbull-inscription-shell__desc">
              {canRegister ? t('pages.pitbull.cardDescOpen') : t('pages.pitbull.cardDescClosed')}
            </p>

            <div className="pitbull-inscription-shell__actions">
              {canRegister ? (
                <>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--primary"
                    onClick={() => onNavigate('competition')}
                  >
                    {t('pages.pitbull.register')}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--secondary"
                    onClick={() => onNavigate('members')}
                  >
                    {t('pages.pitbull.viewMembershipPlans')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--primary"
                    onClick={() => onNavigate('members')}
                  >
                    {t('pages.pitbull.joinNow')}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--secondary"
                    onClick={() => onNavigate('rulebook')}
                  >
                    {t('pages.pitbull.viewRulebook')}
                  </button>
                </>
              )}
            </div>
          </Footer>
        </Body>
      </div>

      <PitbullRecentRegistrants
        capacityStatus={capacityStatus}
        locale={locale}
        recent={recent}
        t={t}
      />
    </PitbullDossierSection>
  )
}

/** Catálogo editorial — dos lanes (modalidades / divisiones) con índice y stagger. */
function PitbullCategoriesSection({ pitbullClassic, onNavigate, t }) {
  const { reducedMotion } = useMotionConfig()
  const groups = [
    {
      id: 'modalities',
      hint: t('pages.pitbull.categoriesModalitiesHint'),
      label: t('pages.pitbull.categoriesModalities'),
      rows: pitbullClassic.categories,
    },
    {
      id: 'divisions',
      hint: t('pages.pitbull.categoriesDivisionsHint'),
      label: t('pages.pitbull.categoriesDivisions'),
      rows: pitbullClassic.divisions,
    },
  ]

  const listMotion = reducedMotion
    ? {}
    : {
        variants: staggerContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
      }
  const itemMotion = reducedMotion ? {} : { variants: staggerItem }
  const ListTag = reducedMotion ? 'ol' : m.ol
  const ItemTag = reducedMotion ? 'li' : m.li

  return (
    <PitbullDossierSection
      id="categorias"
      className="pitbull-dossier__section--categories"
      eyebrow={t('pages.pitbull.categoriesEyebrow')}
      index={t('pages.pitbull.categoriesIndex')}
      lead={t('pages.pitbull.categoriesDesc')}
      title={t('pages.pitbull.categoriesTitle')}
      titleId="pitbull-categories-title"
    >
      <div className="pitbull-cat">
        <div className="pitbull-cat__meta">
          <span className="pitbull-cat__status">
            <FileText size={14} aria-hidden />
            {t('pages.pitbull.categoriesPendingLabel')}
          </span>
          <p className="pitbull-cat__totals">
            {t('pages.pitbull.categoriesTotals', {
              modalities: pitbullClassic.categories.length,
              divisions: pitbullClassic.divisions.length,
            })}
          </p>
          <button
            type="button"
            className="pitbull-cat__rulebook motion-icon-shift motif-tap-target"
            onClick={() => onNavigate('rulebook')}
          >
            {t('pages.pitbull.viewFullRulebook')}
            <ArrowRight size={13} aria-hidden className="motion-icon-shift__target" />
          </button>
        </div>

        <div className="pitbull-cat__lanes" aria-label={t('pages.pitbull.categoriesListAria')}>
          {groups.map((group, groupIndex) => (
            <section
              key={group.id}
              className={`pitbull-cat__lane pitbull-cat__lane--${group.id}`}
              aria-labelledby={`pitbull-cat-${group.id}`}
            >
              <header className="pitbull-cat__lane-head">
                <span className="pitbull-cat__lane-index motif-num" aria-hidden>
                  {String(groupIndex + 1).padStart(2, '0')}
                </span>
                <div className="pitbull-cat__lane-copy">
                  <p className="pitbull-cat__lane-hint">{group.hint}</p>
                  <h3 id={`pitbull-cat-${group.id}`} className="pitbull-cat__lane-title">
                    {group.label}
                  </h3>
                </div>
                <span className="pitbull-cat__lane-count">
                  {t('pages.pitbull.categoriesGroupCount', { count: group.rows.length })}
                </span>
              </header>

              <ListTag className="pitbull-cat__list" {...listMotion}>
                {group.rows.map((row, rowIndex) => (
                  <ItemTag key={row} className="pitbull-cat__row" {...itemMotion}>
                    <span className="pitbull-cat__row-index motif-num" aria-hidden>
                      {String(rowIndex + 1).padStart(2, '0')}
                    </span>
                    <span className="pitbull-cat__row-name">{row}</span>
                  </ItemTag>
                ))}
              </ListTag>
            </section>
          ))}
        </div>
      </div>
    </PitbullDossierSection>
  )
}

export default function PitbullPage({
  onNavigate,
  events = UPCOMING_EVENTS,
}) {
  const {
    PITBULL_CLASSIC,
    PITBULL_VENUE,
  } = useContent()
  const { locale, t } = useI18n()

  const pitbullEvent = events.find((event) => event.featured)
  const pitbullMapEvent = {
    ...pitbullEvent,
    date: pitbullEvent?.displayDate ?? PITBULL_CLASSIC.dateShort,
    featured: true,
    slug: pitbullEvent?.slug ?? 'pitbull-classic-2026',
    status: pitbullEvent?.status ?? 'proximamente',
    title: pitbullEvent?.title ?? PITBULL_CLASSIC.title,
  }
  const eventStatus = pitbullEvent?.status ?? 'proximamente'
  const canRegister = isRegistrationOpen(eventStatus)
  const isFinished = eventStatus === 'finalizado'
  const eventPricing = resolveEventPricing(pitbullEvent)
  const ticketsOpen = eventPricing.ticketsEnabled !== false
  const eventSlug = pitbullEvent?.slug ?? 'pitbull-classic-2026'
  const {
    status: capacityStatus,
    registered: liveRegistered,
    slots: liveSlots,
    recent: recentRegistrants,
  } = useEventRegistrationCapacity(eventSlug, {
    enabled: true,
    observeRoot: 'inscripcion',
    fallbackRegistered: PITBULL_CLASSIC.registered,
    fallbackSlots: PITBULL_CLASSIC.slots,
  })
  const sectionNavItems = [
    { id: 'experiencia', index: '02', label: 'Experiencia' },
    { id: 'pesajes', index: '03', label: 'Pesajes' },
    { id: 'categorias', index: '04', label: t('pages.pitbull.categoriesEyebrow') },
    { id: 'lugar', index: '05', label: t('pages.pitbull.locationEyebrow') },
    { id: 'inscripcion', index: '06', label: t('pages.pitbull.inscriptionEyebrow') },
    { id: 'entradas', index: '07', label: t('pages.pitbull.ticketsEyebrow') },
  ]

  function goToTicketsPage() {
    onNavigate('tickets', { eventSlug: pitbullEvent?.slug })
  }

  function handleHeroRegister() {
    if (canRegister) {
      onNavigate('competition')
      return
    }
    if (isFinished) {
      onNavigate('results')
      return
    }
    onNavigate('members')
  }

  function handleHeroSecondary() {
    if (ticketsOpen) {
      goToTicketsPage()
      return
    }
    scrollToSection('categorias')
  }

  return (
    <main className="page page--design pitbull-page pitbull-page--premium">
      <PitbullHero
        canRegister={canRegister}
        eventStatus={eventStatus}
        onHome={() => onNavigate('home')}
        onRegister={handleHeroRegister}
        onSecondary={handleHeroSecondary}
        date={PITBULL_CLASSIC.date}
        venue={PITBULL_CLASSIC.venue}
        location={PITBULL_CLASSIC.location}
        registered={liveRegistered}
        registrationFee={money(eventPricing.registration, locale)}
        slots={liveSlots}
        ticketsOpen={ticketsOpen}
        title={PITBULL_CLASSIC.title}
      />

      <PitbullSectionNav items={sectionNavItems} t={t} />

      <div className="pitbull-page__body">
        <div className="pitbull-dossier pitbull-dossier--minimal">
          <PitbullExperienceSection t={t} />
          
          <PitbullWeighInSnapshot />

          <PitbullCategoriesSection
            pitbullClassic={PITBULL_CLASSIC}
            onNavigate={onNavigate}
            t={t}
          />

          <PitbullLocationSection
            event={pitbullMapEvent}
            venue={PITBULL_VENUE}
            t={t}
          />

          <PitbullInscriptionSection
            canRegister={canRegister}
            capacityStatus={capacityStatus}
            eventStatus={eventStatus}
            locale={locale}
            onNavigate={onNavigate}
            pricing={eventPricing}
            recent={recentRegistrants}
            registered={liveRegistered}
            slots={liveSlots}
            t={t}
          />

          {ticketsOpen ? (
            <Reveal as="div" direction="up" className="pitbull-tickets-band-wrap">
              <PitbullTicketsBand onOpen={goToTicketsPage} t={t} />
            </Reveal>
          ) : (
            <Reveal
              as="section"
              direction="up"
              id="entradas"
              className="pitbull-dossier__section pitbull-tickets pitbull-tickets--closed"
              aria-live="polite"
            >
              <p className="pitbull-tickets__closed-note">{t('pages.pitbull.ticketsClosed')}</p>
            </Reveal>
          )}
        </div>
      </div>

      <CTASection
        title={t('pages.pitbull.ctaFirstTimeTitle')}
        description={t('pages.pitbull.ctaFirstTimeDesc')}
        primaryLabel={t('pages.pitbull.ctaCreateProfile')}
        onPrimary={() => onNavigate('register')}
        secondaryLabel={t('pages.pitbull.ctaViewMembership')}
        onSecondary={() => onNavigate('members')}
      />
    </main>
  )
}
