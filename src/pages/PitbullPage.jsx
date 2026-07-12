import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  ExternalLink,
  Layers,
  MapPin,
  Megaphone,
  Scale,
} from 'lucide-react'
import PitbullHero from '../components/layout/PitbullHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import PitbullFeatureFlipCard from '../components/ui/PitbullFeatureFlipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import TicketPurchaseSection from '../components/ui/TicketPurchaseSection.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing, ticketPricingFromEvent } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    </section>
  )
}

function PitbullInscriptionCounter({ registered, slots, statusLabel, statusTone, t, variant = 'default' }) {
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
          <span className="pitbull-inscription-counter__value">{registered}</span>
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


function PitbullAthletesSection({ athleteGroups, onNavigate, t }) {
  return (
    <PitbullDossierSection
      id="atletas"
      className="pitbull-dossier__section--athletes"
      eyebrow={t('pages.pitbull.athletesEyebrow')}
      index={t('pages.pitbull.athletesIndex')}
      lead={t('pages.pitbull.athletesLead')}
      title={t('pages.pitbull.athletesTitle')}
      titleId="pitbull-athletes-title"
    >
      <div className="pitbull-athletes-brief" aria-label={t('pages.pitbull.athletesAria')}>
        <div className="pitbull-athletes-brief__lanes">
          {athleteGroups.map((group) => (
            <section
              key={group.id}
              className={`pitbull-athletes-brief__lane pitbull-athletes-brief__lane--${group.id}`}
              aria-labelledby={`pitbull-athletes-lane-${group.id}`}
            >
              <h3 id={`pitbull-athletes-lane-${group.id}`} className="pitbull-athletes-brief__lane-label">
                {group.label}
              </h3>
              <ul className="pitbull-athletes-brief__entries">
                {group.items.map((item) => (
                  <li key={item.id} className="pitbull-athletes-brief__entry">
                    <span className="pitbull-athletes-brief__entry-title">{item.title}</span>
                    <p className="pitbull-athletes-brief__entry-text">{item.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div className="pitbull-dossier__actions pitbull-dossier__actions--athletes">
        <button type="button" className="pitbull-dossier__cta" onClick={scrollToInscription}>
          {t('pages.pitbull.athletesCta')}
          <ArrowRight size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="pitbull-dossier__text-link pitbull-dossier__text-link--rulebook"
          onClick={() => onNavigate('rulebook')}
        >
          {t('pages.pitbull.athletesRulebook')}
        </button>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullScheduleStrip({ schedule, t }) {
  if (!schedule?.length) return null

  return (
    <div className="pitbull-program" aria-label={t('pages.pitbull.programAria')}>
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
            title={t('pages.pitbull.venueMapsTitle', { venue: venue.name })}
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
          <dl className="pitbull-ticket-pass__pricing" aria-label={`${t('pages.pitbull.ticketPricingAria')}: ${t('pages.pitbull.ticketPresencialLabel')}`}>
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
  eventStatus,
  locale,
  onNavigate,
  pitbullClassic,
  pricing,
  t,
}) {
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus, t)

  return (
    <PitbullDossierSection
      id="inscripcion"
      className="pitbull-dossier__section--inscription pitbull-dossier__section--stack pitbull-inscription"
      eyebrow={t('pages.pitbull.inscriptionEyebrow')}
      title={t('pages.pitbull.inscriptionTitle')}
      titleId="pitbull-inscription-title"
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

        <div className="pitbull-inscription-shell__body">
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

          <div className="pitbull-inscription-shell__footer">
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
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

const FEATURE_FACT_ICONS = {
  Pesaje: Scale,
  Briefing: Megaphone,
  Plataforma: Layers,
  Weigh: Scale,
  'Weigh-in': Scale,
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
      <ul className="pitbull-feature-flow" aria-label={t('pages.pitbull.featureFactsAria')}>
        {featureFacts.map((fact) => {
          const Icon = FEATURE_FACT_ICONS[fact.label] ?? Clock3
          return (
            <PitbullFeatureFlipCard
              key={fact.label}
              flipBackLabel={t('pages.pitbull.flipBack')}
              flipHintLabel={t('pages.pitbull.featureFlipTap')}
              icon={Icon}
              label={fact.label}
              value={fact.value}
            />
          )
        })}
      </ul>

      {schedule?.length > 0 ? (
        <PitbullScheduleStrip schedule={schedule} t={t} />
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
      id="categorias"
      className="pitbull-dossier__section--categories"
      eyebrow={t('pages.pitbull.categoriesEyebrow')}
      index={t('pages.pitbull.categoriesIndex')}
      lead={t('pages.pitbull.categoriesDesc')}
      title={t('pages.pitbull.categoriesTitle')}
      titleId="pitbull-categories-title"
    >
      <div className="pitbull-categories-panel" aria-label={t('pages.pitbull.categoriesListAria')}>
        <div className="pitbull-categories-panel__grid">
          <div className="pitbull-categories-panel__col">
            <h3 className="pitbull-categories-panel__label">{t('pages.pitbull.categoriesModalities')}</h3>
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

          <div className="pitbull-categories-panel__col pitbull-categories-panel__col--division">
            <h3 className="pitbull-categories-panel__label">{t('pages.pitbull.categoriesDivisions')}</h3>
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

        {detailCards.length > 0 ? (
          <div className="pitbull-categories-panel__details">
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
  onUploadPaymentProof,
}) {
  const {
    PITBULL_ATHLETE_GROUPS,
    PITBULL_CATEGORY_CARDS,
    PITBULL_CLASSIC,
    PITBULL_SCHEDULE,
    PITBULL_VENUE,
  } = useContent()
  const { locale, messages, t } = useI18n()
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

  function handleHeroRegister() {
    if (canRegister) {
      onNavigate('competition')
      return
    }
    onNavigate('members')
  }

  function handleHeroSecondary() {
    if (ticketsOpen) {
      scrollToSection('entradas')
      return
    }
    scrollToSection('categorias')
  }

  return (
    <main className="page page--design pitbull-page pitbull-page--premium">
      <PitbullHero
        canRegister={canRegister}
        eventStatus={eventStatus}
        locale={locale}
        onHome={() => onNavigate('home')}
        onRegister={handleHeroRegister}
        onSecondary={handleHeroSecondary}
        pitbullClassic={PITBULL_CLASSIC}
        pricing={eventPricing}
        ticketsOpen={ticketsOpen}
        title={PITBULL_CLASSIC.title}
      />

      <div className="pitbull-page__body">
        <Reveal variant="up">
          <div className="pitbull-dossier pitbull-dossier--minimal">
            <PitbullAthletesSection
              athleteGroups={PITBULL_ATHLETE_GROUPS ?? []}
              onNavigate={onNavigate}
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
                      <div className="pitbull-tickets__form-toolbar">
                        <button
                          type="button"
                          className="pitbull-tickets__form-back"
                          onClick={() => setTicketFormOpen(false)}
                        >
                          <ArrowLeft size={14} aria-hidden />
                          {t('pages.pitbull.ticketsCloseForm')}
                        </button>
                      </div>
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
                      onUploadPaymentProof={onUploadPaymentProof}
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
