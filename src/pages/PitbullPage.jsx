import { useState } from 'react'
import {
  ArrowRight,
  FileText,
  Medal,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react'
import { m } from 'motion/react'
import photoMeetFloor from '../assets/DSC00346-display.jpg'
import PitbullHero from '../components/layout/PitbullHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventVenueMap from '../components/ui/EventVenueMap.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta, isRegistrationOpen } from '../lib/status.js'
import AnimatedNumber from '../motion/AnimatedNumber.tsx'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER, MOTION_VIEWPORT } from '../motion/tokens.ts'
import { staggerContainer, staggerItem } from '../motion/variants.ts'

const BENEFIT_ICONS = {
  record: Trophy,
  standard: ShieldCheck,
  ranking: Medal,
  community: Users,
}

/** Fila editorial — numeral e ícono funcional, mismo lenguaje visual que
 * el numerado de "Camino del competidor" (sin card, sin hover reactivo). */
function PitbullValueRow({ index, Icon, label, text }) {
  const num = String(index + 1).padStart(2, '0')
  return (
    <li className="pitbull-value-row__item">
      <span className="pitbull-value-row__index motif-num" aria-hidden>
        {num}
      </span>
      <div className="pitbull-value-row__copy">
        <h4 className="pitbull-value-row__label">
          {Icon ? <Icon size={15} strokeWidth={1.75} aria-hidden className="pitbull-value-row__icon" /> : null}
          {label}
        </h4>
        <p className="pitbull-value-row__text">{text}</p>
      </div>
    </li>
  )
}

function scrollToSection(id) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  })
}

function scrollToInscription() {
  scrollToSection('inscripcion')
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
              <span aria-hidden>{item.index}</span>
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

function PitbullBentoExperience({ t }) {
  return (
    <PitbullDossierSection
      id="experiencia"
      className="pitbull-dossier__section--bento"
      eyebrow="02"
      index="02"
      lead="Diseñado para elevar tu rendimiento. Un entorno que respeta tu esfuerzo y empuja tus límites."
      title="Experiencia Premium"
      titleId="pitbull-bento-title"
    >
      <div className="pitbull-bento">
        <div className="pitbull-bento__card pitbull-bento__card--large">
          <span className="pitbull-bento__watermark" aria-hidden>PLU</span>
          <div className="pitbull-bento__content">
            <h3 className="pitbull-bento__title">Equipamiento Oficial</h3>
            <p className="pitbull-bento__desc">Plataforma y discos calibrados bajo estándares internacionales. Todo pensado para que logres tu mejor total en las condiciones más óptimas.</p>
          </div>
        </div>
        <div className="pitbull-bento__card">
          <div className="pitbull-bento__content">
            <h3 className="pitbull-bento__title">Jueces Certificados</h3>
            <p className="pitbull-bento__desc">Reglamento estricto, transparente y sin favoritismos.</p>
          </div>
        </div>
        <div className="pitbull-bento__card">
          <div className="pitbull-bento__content">
            <h3 className="pitbull-bento__title">Media Coverage</h3>
            <p className="pitbull-bento__desc">Fotografía y video de primer nivel para documentar tus marcas.</p>
          </div>
        </div>
        <div className="pitbull-bento__card pitbull-bento__card--wide">
          <div className="pitbull-bento__content">
            <h3 className="pitbull-bento__title">Warm-up VIP</h3>
            <p className="pitbull-bento__desc">Área de calentamiento exclusiva con racks profesionales y discos calibrados, asegurando que llegues a la plataforma en tu punto máximo de activación.</p>
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullWeighInSnapshot({ t }) {
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
  return (
    <PitbullDossierSection
      id="lugar"
      className="pitbull-dossier__section--location"
      eyebrow={t('pages.pitbull.locationEyebrow')}
      index={t('pages.pitbull.locationIndex')}
      lead={t('pages.pitbull.locationLead')}
      title={t('pages.pitbull.locationTitle')}
      titleId="pitbull-location-title"
    >
      <EventVenueMap
        event={event}
        role={t('pages.pitbull.locationOfficialRole')}
        venue={venue}
      />
    </PitbullDossierSection>
  )
}

function PitbullTicketPass({ onOpen, t }) {
  return (
    <div className="pitbull-ticket-invite">
      <div className="pitbull-ticket-invite__copy">
        <p className="pitbull-ticket-invite__hook">{t('pages.pitbull.ticketsHook')}</p>
        <p className="pitbull-ticket-invite__note">{t('pages.pitbull.ticketsNote')}</p>
        <ul className="pitbull-ticket-invite__facts" aria-label={t('pages.pitbull.ticketsFactsAria')}>
          <li>{t('pages.pitbull.ticketsFactId')}</li>
          <li>{t('pages.pitbull.ticketsFactMembership')}</li>
        </ul>
      </div>
      <button type="button" className="pitbull-ticket-invite__cta" onClick={onOpen}>
        {t('pages.pitbull.ticketPassCta')}
        <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  )
}

function PitbullInscriptionSection({
  canRegister,
  eventStatus,
  locale,
  onNavigate,
  pitbullClassic,
  pricing,
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
          registered={pitbullClassic.registered}
          slots={pitbullClassic.slots}
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
  const { locale, messages, t } = useI18n()

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
        registered={PITBULL_CLASSIC.registered}
        registrationFee={money(eventPricing.registration, locale)}
        slots={PITBULL_CLASSIC.slots}
        ticketsOpen={ticketsOpen}
        title={PITBULL_CLASSIC.title}
      />

      <PitbullSectionNav items={sectionNavItems} t={t} />

      <div className="pitbull-page__body">
        <div className="pitbull-dossier pitbull-dossier--minimal">
          <PitbullBentoExperience t={t} />
          
          <PitbullWeighInSnapshot t={t} />
          
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
            eventStatus={eventStatus}
            locale={locale}
            onNavigate={onNavigate}
            pitbullClassic={PITBULL_CLASSIC}
            pricing={eventPricing}
            t={t}
          />

          {ticketsOpen ? (
            <PitbullDossierSection
              id="entradas"
              className="pitbull-dossier__section--tickets pitbull-tickets"
              eyebrow={t('pages.pitbull.ticketsEyebrow')}
              index={t('pages.pitbull.ticketsIndex')}
              lead={t('pages.pitbull.ticketsLead')}
              title={t('pages.pitbull.ticketsTitle')}
              titleId="pitbull-tickets-title"
            >
              <PitbullTicketPass onOpen={goToTicketsPage} t={t} />
            </PitbullDossierSection>
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
