import { useEffect, useRef, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Globe,
  MapPin,
  QrCode,
  Scale,
  ShieldCheck,
  Ticket,
  Users,
  Zap,
} from 'lucide-react'
import pitbullVisual from '../assets/powerlifting-hero.png'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventShareCard from '../components/ui/EventShareCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import TicketPurchaseSection from '../components/ui/TicketPurchaseSection.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing, ticketPricingFromEvent } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'

const INSCRIPTION_ICONS = [ShieldCheck, Scale, CircleDollarSign]

const PITBULL_BENEFIT_ICONS = {
  Globe,
  QrCode,
  ShieldCheck,
  ClipboardList,
  Zap,
  Ticket,
  Users,
}

function scrollToInscription() {
  document.getElementById('inscripcion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function PitbullDossierSection({
  id,
  index,
  eyebrow,
  title,
  lead,
  titleId,
  className = '',
  children,
}) {
  return (
    <section
      id={id}
      className={`pitbull-dossier__section ${className}`.trim()}
      aria-labelledby={titleId}
    >
      <header className="pitbull-dossier__head">
        <p className="pitbull-dossier__kicker">
          <span className="pitbull-dossier__index" aria-hidden>
            {index}
          </span>
          <span className="pitbull-dossier__eyebrow">{eyebrow}</span>
        </p>
        <h2 id={titleId} className="pitbull-dossier__title">
          {title}
        </h2>
        {lead ? <p className="pitbull-dossier__lead">{lead}</p> : null}
      </header>

      {children ? <div className="pitbull-dossier__body">{children}</div> : null}
    </section>
  )
}

function useCountUp(target, duration = 1400, enabled = true) {
  const [value, setValue] = useState(0)
  const frameRef = useRef(null)

  useEffect(() => {
    if (!enabled || target === 0) {
      setValue(target)
      return
    }
    const start = performance.now()
    function tick(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration, enabled])

  return value
}

function PitbullInscriptionCounter({ registered, slots, statusLabel, statusTone, t }) {
  const sectionRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const count = useCountUp(registered, 1200, visible)
  const pct = slots > 0 ? Math.round((registered / slots) * 100) : 0

  return (
    <div
      ref={sectionRef}
      className="pitbull-inscription-counter"
      role="meter"
      aria-label={t('pages.pitbull.inscriptionCounterAria', { registered, slots })}
      aria-valuenow={registered}
      aria-valuemin={0}
      aria-valuemax={slots}
    >
      <div className="pitbull-inscription-counter__row">
        <div className="pitbull-inscription-counter__stat">
          <span className="pitbull-inscription-counter__value">{count}</span>
          <span className="pitbull-inscription-counter__of">/ {slots}</span>
          <span className="pitbull-inscription-counter__unit">cupos</span>
        </div>
        <span className={`pitbull-inscription-counter__badge pitbull-inscription-counter__badge--${statusTone}`}>
          <span className="pitbull-inscription-counter__badge-dot" aria-hidden />
          {statusLabel}
        </span>
      </div>
      <div className="pitbull-inscription-counter__bar" aria-hidden>
        <div
          className="pitbull-inscription-counter__fill"
          style={{ '--counter-pct': `${pct}%` }}
        />
      </div>
    </div>
  )
}

function PitbullBenefitsSection({ benefitsAthletes, benefitsSpectators, t }) {
  const renderBenefit = (benefit) => {
    const Icon = PITBULL_BENEFIT_ICONS[benefit.icon] ?? ShieldCheck

    return (
      <li key={benefit.id} className="pitbull-benefits-lane__item">
        <span className="pitbull-benefits-lane__icon" aria-hidden>
          <Icon size={14} strokeWidth={1.75} />
        </span>
        <div className="pitbull-benefits-lane__copy">
          <strong className="pitbull-benefits-lane__title">{benefit.title}</strong>
          <span className="pitbull-benefits-lane__desc">{benefit.desc}</span>
        </div>
      </li>
    )
  }

  return (
    <section
      className="pitbull-dossier__section pitbull-dossier__section--benefits pitbull-benefits-panel"
      aria-labelledby="pitbull-benefits-title"
    >
      <header className="pitbull-benefits-hero pitbull-dossier__head">
        <p className="pitbull-dossier__kicker pitbull-benefits-hero__kicker-row">
          <span className="pitbull-benefits-hero__stripe" aria-hidden />
          <span className="pitbull-dossier__eyebrow">{t('pages.pitbull.benefitsKicker')}</span>
        </p>
        <div className="pitbull-benefits-hero__main">
          <h2 id="pitbull-benefits-title" className="pitbull-benefits-hero__title">
            {t('pages.pitbull.benefitsPanelTitle')}
          </h2>
          <p className="pitbull-benefits-hero__lead">{t('pages.pitbull.benefitsPanelLead')}</p>
        </div>
      </header>

      <div className="pitbull-dossier__body pitbull-benefits-panel__body">
        <div className="pitbull-benefits-shell" aria-label={t('pages.pitbull.benefitsSpecAria')}>
        <div className="pitbull-benefits-shell__head" aria-hidden>
          <span className="pitbull-benefits-shell__corner" />
          <span className="pitbull-benefits-shell__col-head">
            {t('pages.pitbull.benefitsAthleteEyebrow')}
          </span>
          <span className="pitbull-benefits-shell__col-head pitbull-benefits-shell__col-head--spectator">
            {t('pages.pitbull.benefitsSpectatorEyebrow')}
          </span>
        </div>

        <div className="pitbull-benefits-lanes">
          <div className="pitbull-benefits-lane">
            <h3 className="pitbull-benefits-lane__label">{t('pages.pitbull.benefitsAthleteEyebrow')}</h3>
            <ul className="pitbull-benefits-lane__list" role="list">
              {benefitsAthletes.map(renderBenefit)}
            </ul>
          </div>

          <div className="pitbull-benefits-lane pitbull-benefits-lane--spectator">
            <h3 className="pitbull-benefits-lane__label">{t('pages.pitbull.benefitsSpectatorEyebrow')}</h3>
            <ul className="pitbull-benefits-lane__list" role="list">
              {benefitsSpectators.map(renderBenefit)}
            </ul>
          </div>
        </div>
      </div>
      </div>
    </section>
  )
}

function PitbullScheduleStrip({ schedule }) {
  if (!schedule?.length) return null

  return (
    <div className="pitbull-program" aria-label="Programa del evento">
      <div className="pitbull-program__head" aria-hidden>
        <span className="pitbull-program__corner" />
        {schedule.map((day) => (
          <div key={day.day} className="pitbull-program__day-head">
            <span className="pitbull-program__day-name">{day.day}</span>
            <span className="pitbull-program__day-date">{day.date}</span>
          </div>
        ))}
      </div>

      <div className="pitbull-program__rows">
        {schedule[0].items.map((slot, rowIndex) => (
          <div key={slot.time} className="pitbull-program__row">
            <span className="pitbull-program__time">{slot.time}</span>
            {schedule.map((day) => (
              <p key={`${day.day}-${slot.time}`} className="pitbull-program__cell">
                {day.items[rowIndex]?.label}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PitbullLocationSection({ venue, t }) {
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
      <div className="pitbull-location">
        <div className="pitbull-location__map-shell">
          <iframe
            className="pitbull-location__map"
            src={venue.mapsEmbedUrl}
            title={`${venue.name} en Google Maps`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <div className="pitbull-location__map-overlay" aria-hidden />
        </div>

        <div className="pitbull-location__details">
          <dl className="pitbull-location__dl">
            <div className="pitbull-location__row">
              <dt>
                <MapPin size={12} aria-hidden />
                {t('pages.pitbull.locationVenueLabel')}
              </dt>
              <dd>{venue.name}</dd>
            </div>
            <div className="pitbull-location__row">
              <dt>{t('pages.pitbull.locationAddressLabel')}</dt>
              <dd>{venue.address}</dd>
            </div>
          </dl>

          <p className="pitbull-location__note">
            {t('pages.pitbull.locationDirectionsNote')}
          </p>

          <a
            href={venue.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pitbull-location__maps-link"
          >
            {t('pages.pitbull.locationMapsLink')}
            <ExternalLink size={13} aria-hidden />
          </a>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullTicketPass({ locale, onOpen, pricing, t }) {
  return (
    <div className="pitbull-ticket-pass">
      <div className="pitbull-ticket-pass__channels">
        <div className="pitbull-ticket-pass__channel pitbull-ticket-pass__channel--online">
          <span className="pitbull-ticket-pass__channel-badge">
            {t('pages.pitbull.ticketOnlineLabel')}
          </span>
          <dl className="pitbull-ticket-pass__pricing" aria-label={t('pages.pitbull.ticketPricingAria')}>
            <div className="pitbull-ticket-pass__price">
              <dt>{t('pages.pitbull.ticketDayLabel')}</dt>
              <dd>{money(pricing.day, locale)}</dd>
            </div>
            <div className="pitbull-ticket-pass__price pitbull-ticket-pass__price--both">
              <dt>{t('pages.pitbull.ticketBothLabel')}</dt>
              <dd>{money(pricing.bothDays, locale)}</dd>
            </div>
          </dl>
          <p className="pitbull-ticket-pass__channel-note pitbull-ticket-pass__channel-note--highlight">
            {t('pages.pitbull.ticketOnlineNote')}
          </p>
          <div className="pitbull-ticket-pass__actions">
            <button type="button" className="pitbull-dossier__cta" onClick={onOpen}>
              {t('pages.pitbull.ticketPassCta')}
              <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </div>

        <div className="pitbull-ticket-pass__channel pitbull-ticket-pass__channel--presencial">
          <span className="pitbull-ticket-pass__channel-badge pitbull-ticket-pass__channel-badge--muted">
            {t('pages.pitbull.ticketPresencialLabel')}
          </span>
          <dl className="pitbull-ticket-pass__pricing" aria-label={`${t('pages.pitbull.ticketPricingAria')} — ${t('pages.pitbull.ticketPresencialLabel')}`}>
            <div className="pitbull-ticket-pass__price">
              <dt>{t('pages.pitbull.ticketDayLabel')}</dt>
              <dd>{money(pricing.dayPresencial, locale)}</dd>
            </div>
            <div className="pitbull-ticket-pass__price pitbull-ticket-pass__price--both">
              <dt>{t('pages.pitbull.ticketBothLabel')}</dt>
              <dd>{money(pricing.bothDaysPresencial, locale)}</dd>
            </div>
          </dl>
          <p className="pitbull-ticket-pass__channel-note">
            {t('pages.pitbull.ticketPresencialNote')}
          </p>
        </div>
      </div>
    </div>
  )
}

function PitbullInscriptionSection({
  canRegister,
  credentialSample,
  eventStatus,
  inscriptionSteps,
  locale,
  onNavigate,
  pitbullClassic,
  pricing,
  t,
}) {
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus, t)
  const [credentialOpen, setCredentialOpen] = useState(false)

  const timeline = useMemo(
    () =>
      inscriptionSteps.map((step, index) => ({
        ...step,
        step: String(index + 1).padStart(2, '0'),
        icon: INSCRIPTION_ICONS[index] ?? ShieldCheck,
      })),
    [inscriptionSteps],
  )

  return (
    <PitbullDossierSection
      id="inscripcion"
      className="pitbull-dossier__section--inscription pitbull-inscription"
      eyebrow={t('pages.pitbull.inscriptionEyebrow')}
      index={t('pages.pitbull.inscriptionIndex')}
      lead={canRegister ? t('pages.pitbull.inscriptionLeadOpen') : t('pages.pitbull.inscriptionLeadClosed')}
      title={t('pages.pitbull.inscriptionTitle')}
      titleId="pitbull-inscription-title"
    >
      <div className="pitbull-inscription-shell">
        <div className="pitbull-inscription-shell__counter-col">
          <PitbullInscriptionCounter
            registered={pitbullClassic.registered}
            slots={pitbullClassic.slots}
            statusLabel={statusLabel}
            statusTone={statusTone}
            t={t}
          />
        </div>

        <div className="pitbull-inscription-shell__card">
          <dl className="pitbull-inscription-shell__pricing" aria-label={t('pages.pitbull.costsAria')}>
            <div className="pitbull-inscription-shell__price">
              <dt>{t('pages.pitbull.costMembership')}</dt>
              <dd>{money(pricing.membership, locale)}</dd>
            </div>
            <div className="pitbull-inscription-shell__price">
              <dt>{t('pages.pitbull.costMeet')}</dt>
              <dd>{money(pricing.registration, locale)}</dd>
            </div>
          </dl>

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
                  className="pitbull-inscription__card-link"
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
                  className="pitbull-inscription__card-link"
                  onClick={() => onNavigate('rulebook')}
                >
                  {t('pages.pitbull.viewRulebook')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="pitbull-inscription-shell__extras">
          <details className="pitbull-inscription__requirements pitbull-inscription__requirements--editorial">
            <summary className="pitbull-inscription__req-summary">
              <span className="pitbull-inscription__req-index" aria-hidden>
                01–03
              </span>
              <span className="pitbull-inscription__req-summary-copy">
                <span className="pitbull-inscription__req-eyebrow">{t('pages.pitbull.reqEyebrow')}</span>
                <span className="pitbull-inscription__req-title">{t('pages.pitbull.reqTitle')}</span>
              </span>
              <ChevronDown size={18} className="pitbull-inscription__req-chevron" aria-hidden />
            </summary>

            <ol className="pitbull-inscription__timeline" aria-label={t('pages.pitbull.reqEyebrow')}>
              {timeline.map(({ detail, icon: Icon, step, title }) => (
                <li key={title} className="pitbull-inscription__timeline-item">
                  <span className="pitbull-inscription__timeline-index" aria-hidden>
                    {step}
                  </span>
                  <div className="pitbull-inscription__timeline-copy">
                    <div className="pitbull-inscription__timeline-title-row">
                      <span className="pitbull-inscription__timeline-icon" aria-hidden>
                        <Icon size={14} strokeWidth={1.75} />
                      </span>
                      <strong>{title}</strong>
                    </div>
                    <p>{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </details>

          <div className="pitbull-inscription__credential pitbull-inscription__credential--compact">
            <button
              type="button"
              className="pitbull-inscription__credential-toggle"
              aria-expanded={credentialOpen}
              onClick={() => setCredentialOpen((open) => !open)}
            >
              <QrCode size={15} aria-hidden />
              <span>{credentialOpen ? t('pages.pitbull.credentialHide') : t('pages.pitbull.credentialToggle')}</span>
              <ChevronDown size={16} aria-hidden className={credentialOpen ? 'is-open' : ''} />
            </button>

            {credentialOpen ? (
              <div className="pitbull-inscription__credential-panel">
                <p className="pitbull-inscription__credential-desc">{t('pages.pitbull.credentialDesc')}</p>
                <div className="pitbull-credential-showcase pitbull-credential-showcase--solo">
                  <div className="pitbull-credential-showcase__card">
                    <div className="pitbull-credential__card">
                      <EventShareCard
                        preview
                        athleteName={credentialSample.athlete}
                        athleteCode={credentialSample.affiliateCode}
                        eventTitle={pitbullClassic.title}
                        eventDate={pitbullClassic.date}
                        eventVenue={pitbullClassic.venue}
                        eventLocation="Buenos Aires"
                        category="Master"
                        division="Raw"
                        eventSlug="pitbull-classic-2026"
                        variant="event"
                      />
                    </div>
                    <p className="pitbull-credential__hint">
                      {t('pages.pitbull.credentialCardHint', { name: credentialSample.athlete })}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullFeatureSection({ featureFacts, schedule, onNavigate, t }) {
  return (
    <PitbullDossierSection
      className="pitbull-dossier__section--feature"
      eyebrow={t('pages.pitbull.featureEyebrow')}
      index={t('pages.pitbull.featureIndex')}
      lead={t('pages.pitbull.featureLead')}
      title={t('pages.pitbull.featureTitle')}
      titleId="pitbull-feature-title"
    >
      <ul className="pitbull-feature-facts pitbull-feature-facts--horizontal" aria-label={t('pages.pitbull.featureFactsAria')}>
        {featureFacts.map((fact) => (
          <li key={fact.label} className="pitbull-feature-facts__item">
            <span className="pitbull-feature-facts__label">{fact.label}</span>
            <span className="pitbull-feature-facts__value">{fact.value}</span>
          </li>
        ))}
      </ul>

      {schedule?.length > 0 ? (
        <PitbullScheduleStrip schedule={schedule} />
      ) : null}

      <div className="pitbull-dossier__actions pitbull-dossier__actions--feature">
        <button type="button" className="pitbull-dossier__cta" onClick={scrollToInscription}>
          {t('pages.pitbull.ctaInscription')}
          <ArrowRight size={14} aria-hidden />
        </button>
        <button type="button" className="pitbull-dossier__text-link" onClick={() => onNavigate('rulebook')}>
          {t('pages.pitbull.ctaRulebook')}
        </button>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullCategoriesSection({ categoryCards, pitbullClassic, onNavigate, t }) {
  const detailCards = categoryCards.filter((card) => card.id === 'weight' || card.id === 'gender')

  return (
    <PitbullDossierSection
      className="pitbull-dossier__section--categories"
      eyebrow={t('pages.pitbull.categoriesEyebrow')}
      index={t('pages.pitbull.categoriesIndex')}
      lead={t('pages.pitbull.categoriesDesc')}
      title={t('pages.pitbull.categoriesTitle')}
      titleId="pitbull-categories-title"
    >
      <div className="pitbull-categories-shell" aria-label={t('pages.pitbull.categoriesListAria')}>
        <div className="pitbull-categories-shell__matrix">
          <div className="pitbull-categories-shell__head" aria-hidden>
            <span className="pitbull-categories-shell__corner" />
            <span className="pitbull-categories-shell__col-head">
              {t('pages.pitbull.categoriesModalities')}
            </span>
            <span className="pitbull-categories-shell__col-head pitbull-categories-shell__col-head--division">
              {t('pages.pitbull.categoriesDivisions')}
            </span>
          </div>

          <div className="pitbull-categories-shell__lanes">
            <div className="pitbull-categories-shell__lane">
              <span className="pitbull-categories-shell__lane-label">
                {t('pages.pitbull.categoriesModalities')}
              </span>
              <ul className="pitbull-categories-chips" role="list">
                {pitbullClassic.categories.map((category) => (
                  <li
                    key={category}
                    className="pitbull-categories-chips__item pitbull-categories-chips__item--modality"
                  >
                    {category}
                  </li>
                ))}
              </ul>
            </div>

            <div className="pitbull-categories-shell__lane pitbull-categories-shell__lane--division">
              <span className="pitbull-categories-shell__lane-label">
                {t('pages.pitbull.categoriesDivisions')}
              </span>
              <ul className="pitbull-categories-chips" role="list">
                {pitbullClassic.divisions.map((division) => (
                  <li
                    key={division}
                    className="pitbull-categories-chips__item pitbull-categories-chips__item--division"
                  >
                    {division}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {detailCards.length > 0 ? (
          <div className="pitbull-categories-shell__details">
            {detailCards.map((card) => (
              <div key={card.id} className="pitbull-categories-detail">
                <span className="pitbull-categories-detail__label">{card.title}</span>
                <p className="pitbull-categories-detail__text">{card.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <footer className="pitbull-categories-foot">
        <button type="button" className="pitbull-dossier__text-link pitbull-dossier__text-link--rulebook" onClick={() => onNavigate('rulebook')}>
          {t('pages.pitbull.viewFullRulebook')}
          <ArrowRight size={14} aria-hidden />
        </button>
      </footer>
    </PitbullDossierSection>
  )
}

export default function PitbullPage({
  onNavigate,
  events = UPCOMING_EVENTS,
  tickets = [],
  createdOrder,
  onSubmitTicketPurchase,
  onApproveTicketPurchase,
}) {
  const {
    PITBULL_BENEFITS_ATHLETES,
    PITBULL_BENEFITS_SPECTATORS,
    PITBULL_CATEGORY_CARDS,
    PITBULL_CLASSIC,
    PITBULL_CREDENTIAL_SAMPLE,
    PITBULL_SCHEDULE,
    PITBULL_VENUE,
  } = useContent()
  const { locale, messages, t } = useI18n()
  const inscriptionSteps = messages.pages.pitbull.inscriptionSteps ?? []
  const featureFacts = messages.pages.pitbull.featureFacts ?? []

  const pitbullEvent = events.find((event) => event.featured)
  const eventStatus = pitbullEvent?.status ?? 'proximamente'
  const canRegister = eventStatus === 'inscripcion_abierta' || eventStatus === 'cupos_limitados'
  const eventPricing = resolveEventPricing(pitbullEvent)
  const ticketPricing = ticketPricingFromEvent(pitbullEvent)
  const ticketsOpen = eventPricing.ticketsEnabled !== false

  const ticketEvent = pitbullEvent ?? {
    title: PITBULL_CLASSIC.title,
    slug: 'pitbull-classic-2026',
    venue: PITBULL_CLASSIC.venue,
    date: PITBULL_CLASSIC.date,
    location: PITBULL_CLASSIC.location,
  }

  const [ticketDay1, ticketDay2] = PITBULL_CLASSIC.dateDay.split(/[–-]/)
  const ticketDayLabels = {
    day1: `${ticketDay1} ${PITBULL_CLASSIC.dateMonth}`,
    day2: `${ticketDay2 ?? ticketDay1} ${PITBULL_CLASSIC.dateMonth}`,
  }

  const [ticketFormOpen, setTicketFormOpen] = useState(false)
  const hasTicketOrder = createdOrder?.type === 'tickets'

  function openTicketForm() {
    setTicketFormOpen(true)
    requestAnimationFrame(() => {
      document.getElementById('pitbull-ticket-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  return (
    <main className="page page--design pitbull-page pitbull-page--premium">
      <DesignPageHero
        className="pitbull-hero"
        compact
        breadcrumbLabel={t('pages.pitbull.heroBreadcrumb')}
        eyebrow={t('pages.pitbull.heroEyebrow', {
          date: `${PITBULL_CLASSIC.dateDay} ${PITBULL_CLASSIC.dateMonth} 2026`,
          location: PITBULL_CLASSIC.location.split(',')[0],
        })}
        onHome={() => onNavigate('home')}
        title={PITBULL_CLASSIC.title}
      />

      <div className="pitbull-page__body">
        <Reveal variant="up">
          <div className="pitbull-dossier pitbull-dossier--minimal">
            <figure className="pitbull-dossier__visual">
              <img
                src={pitbullVisual}
                alt={t('pages.pitbull.visualAlt')}
                className="pitbull-dossier__visual-img"
                loading="lazy"
                decoding="async"
              />
            </figure>

            <PitbullBenefitsSection
              benefitsAthletes={PITBULL_BENEFITS_ATHLETES ?? []}
              benefitsSpectators={PITBULL_BENEFITS_SPECTATORS ?? []}
              t={t}
            />

            <PitbullFeatureSection
              featureFacts={featureFacts}
              schedule={PITBULL_SCHEDULE ?? []}
              onNavigate={onNavigate}
              t={t}
            />

            <PitbullCategoriesSection
              categoryCards={PITBULL_CATEGORY_CARDS}
              pitbullClassic={PITBULL_CLASSIC}
              onNavigate={onNavigate}
              t={t}
            />

            <PitbullLocationSection
              venue={PITBULL_VENUE}
              t={t}
            />

            <PitbullInscriptionSection
              canRegister={canRegister}
              credentialSample={PITBULL_CREDENTIAL_SAMPLE}
              eventStatus={eventStatus}
              inscriptionSteps={inscriptionSteps}
              locale={locale}
              onNavigate={onNavigate}
              pitbullClassic={PITBULL_CLASSIC}
              pricing={eventPricing}
              t={t}
            />

            {ticketsOpen ? (
              <PitbullDossierSection
                id="entradas"
                className={`pitbull-dossier__section--tickets pitbull-tickets${ticketFormOpen || hasTicketOrder ? ' pitbull-tickets--checkout' : ''}`}
                eyebrow={t('pages.pitbull.ticketsEyebrow')}
                index={t('pages.pitbull.ticketsIndex')}
                lead={t('pages.pitbull.ticketsLead')}
                title={
                  ticketFormOpen || hasTicketOrder
                    ? t('pages.pitbull.ticketsFormTitle')
                    : t('pages.pitbull.ticketsTitle')
                }
                titleId="pitbull-tickets-title"
              >
                {!ticketFormOpen && !hasTicketOrder ? (
                  <PitbullTicketPass locale={locale} onOpen={openTicketForm} pricing={ticketPricing} t={t} />
                ) : (
                  <div id="pitbull-ticket-form" className="pitbull-tickets__form-shell">
                    {!hasTicketOrder ? (
                      <button
                        type="button"
                        className="pitbull-tickets__form-back"
                        onClick={() => setTicketFormOpen(false)}
                      >
                        <ArrowLeft size={14} aria-hidden />
                        {t('pages.pitbull.ticketsCloseForm')}
                      </button>
                    ) : null}

                    <TicketPurchaseSection
                      editorial
                      event={ticketEvent}
                      dayLabels={ticketDayLabels}
                      pricing={ticketPricing}
                      tickets={tickets}
                      createdOrder={createdOrder}
                      onSubmit={onSubmitTicketPurchase}
                      onApprovePayment={onApproveTicketPurchase}
                    />
                  </div>
                )}
              </PitbullDossierSection>
            ) : (
              <section id="entradas" className="pitbull-dossier__section pitbull-tickets pitbull-tickets--closed" aria-live="polite">
                <p className="pitbull-tickets__closed-note">{t('pages.pitbull.ticketsClosed')}</p>
              </section>
            )}
          </div>
        </Reveal>
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
