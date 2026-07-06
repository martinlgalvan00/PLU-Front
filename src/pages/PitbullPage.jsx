import { useMemo, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  CircleDollarSign,
  Dumbbell,
  QrCode,
  Scale,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import pitbullVisual from '../assets/powerlifting-hero.png'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventShareCard from '../components/ui/EventShareCard.jsx'
import PitbullFeatureVisual from '../components/ui/PitbullFeatureVisual.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import TicketPurchaseSection from '../components/ui/TicketPurchaseSection.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing, ticketPricingFromEvent } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'

const CATEGORY_ICONS = {
  equipment: Dumbbell,
  age: Users,
  weight: Scale,
  gender: UserRound,
}

const INSCRIPTION_ICONS = [ShieldCheck, Scale, CircleDollarSign]

function scrollToInscription() {
  document.getElementById('inscripcion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function scrollToTickets() {
  document.getElementById('entradas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function PitbullHeroSpec({
  eventStatus,
  locale,
  onNavigate,
  pitbullClassic,
  pricing,
  registered,
  slots,
  ticketsOpen,
  t,
}) {
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus, t)
  const slotsLeft = Math.max(0, slots - registered)
  const canRegister = eventStatus === 'inscripcion_abierta' || eventStatus === 'cupos_limitados'

  const facts = [
    {
      label: t('pages.pitbull.heroDate'),
      value: `${pitbullClassic.dateDay} ${pitbullClassic.dateMonth}`,
    },
    {
      label: t('pages.pitbull.heroSlots'),
      value: String(slotsLeft),
      accent: slotsLeft <= 20 ? 'warn' : 'open',
    },
    {
      label: t('pages.pitbull.heroFee'),
      value: money(pricing.registration, locale),
    },
  ]

  return (
    <article className="pitbull-hero-spec">
      <header className="pitbull-hero-spec__head">
        <span className="pitbull-hero-spec__status">
          <span className={`pitbull-hero-spec__dot pitbull-hero-spec__dot--${statusTone}`} aria-hidden />
          <span>{statusLabel}</span>
        </span>
      </header>

      <dl className="pitbull-hero-spec__facts" aria-label={t('pages.pitbull.heroMetricsAria')}>
        {facts.map(({ accent, label, value }) => (
          <div key={label} className={`pitbull-hero-spec__fact${accent ? ` pitbull-hero-spec__fact--${accent}` : ''}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <footer className="pitbull-hero-spec__foot">
        <div className="pitbull-hero-spec__actions">
        {canRegister ? (
          <button
            type="button"
            className="pitbull-hero-spec__cta pitbull-hero-spec__cta--primary"
            onClick={() => onNavigate('competition')}
          >
            {t('pages.pitbull.register')}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="pitbull-hero-spec__cta pitbull-hero-spec__cta--primary"
            onClick={scrollToInscription}
          >
            {t('pages.pitbull.howToRegister')}
            <ArrowRight size={13} aria-hidden />
          </button>
        )}
        <div className="pitbull-hero-spec__secondary" role="group" aria-label={t('pages.pitbull.heroSecondaryAria')}>
          {ticketsOpen ? (
            <button type="button" className="pitbull-hero-spec__link" onClick={scrollToTickets}>
              <Ticket size={13} aria-hidden />
              {t('pages.pitbull.heroTickets')}
            </button>
          ) : null}
          <button type="button" className="pitbull-hero-spec__link" onClick={() => onNavigate('events')}>
            {t('pages.pitbull.calendar')}
          </button>
        </div>
        </div>
      </footer>
    </article>
  )
}

function PitbullTicketPass({ event, locale, onOpen, pricing, t }) {
  return (
    <article className="pitbull-ticket-pass">
      <div className="pitbull-ticket-pass__stub">
        <div className="pitbull-ticket-pass__stripe" aria-hidden />
        <div className="pitbull-ticket-pass__body">
          <div className="pitbull-ticket-pass__copy">
            <span className="pitbull-ticket-pass__eyebrow">{t('pages.pitbull.ticketPassEyebrow')}</span>
            <h3 className="pitbull-ticket-pass__title">{event.title}</h3>
            <p className="pitbull-ticket-pass__meta">
              {event.date} · {event.venue}
            </p>
            <p className="pitbull-ticket-pass__hint">{t('pages.pitbull.ticketPassHint')}</p>
          </div>

          <dl className="pitbull-ticket-pass__pricing" aria-label={t('pages.pitbull.ticketPricingAria')}>
            <div>
              <dt>{t('pages.pitbull.ticketDayLabel')}</dt>
              <dd>{money(pricing.day, locale)}</dd>
            </div>
            <div className="pitbull-ticket-pass__pricing-both">
              <dt>{t('pages.pitbull.ticketBothLabel')}</dt>
              <dd>{money(pricing.bothDays, locale)}</dd>
            </div>
          </dl>

          <button type="button" className="pitbull-ticket-pass__cta" onClick={onOpen}>
            <Ticket size={16} aria-hidden />
            {t('pages.pitbull.ticketPassCta')}
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </div>
    </article>
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
    <section id="inscripcion" className="pitbull-inscription" aria-labelledby="pitbull-inscription-title">
      <div className="pitbull-inscription__inner">
        <header className="pitbull-inscription__head pitbull-inscription__head--editorial">
          <span className="pitbull-inscription__index" aria-hidden>
            {t('pages.pitbull.inscriptionIndex')}
          </span>
          <div className="pitbull-inscription__head-copy">
            <span className="pitbull-inscription__eyebrow">{t('pages.pitbull.inscriptionEyebrow')}</span>
            <h2 id="pitbull-inscription-title" className="pitbull-inscription__title">
              {t('pages.pitbull.inscriptionTitle')}
            </h2>
            <p className="pitbull-inscription__head-lead">
              {canRegister ? t('pages.pitbull.inscriptionLeadOpen') : t('pages.pitbull.inscriptionLeadClosed')}
            </p>
          </div>
          <div className="pitbull-inscription__status-inline">
            <span className={`pitbull-inscription__status-dot pitbull-inscription__status-dot--${statusTone}`} aria-hidden />
            <strong>{statusLabel}</strong>
          </div>
        </header>

        <div className="pitbull-inscription__action-rail pitbull-inscription__action-rail--primary">
          <p className="pitbull-inscription__price-note">
            {t('pages.pitbull.inscriptionPriceNote', {
              membership: money(pricing.membership, locale),
              meet: money(pricing.registration, locale),
            })}
          </p>
          <p className="pitbull-inscription__card-desc">
            {canRegister ? t('pages.pitbull.cardDescOpen') : t('pages.pitbull.cardDescClosed')}
          </p>

          <div className="pitbull-inscription__card-actions">
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
    </section>
  )
}

function PitbullCategoriesSection({ categoryCards, onNavigate, pitbullClassic, t }) {
  const [expanded, setExpanded] = useState(false)
  const summary = t('pages.pitbull.categoriesSummary', {
    count: categoryCards.length,
    categories: pitbullClassic.categories.join(' · '),
    divisions: pitbullClassic.divisions.join(' · '),
  })

  return (
    <Reveal
      as="section"
      className={`pitbull-section pitbull-section--categories${expanded ? ' pitbull-section--categories-open' : ''}`}
      variant="fade"
    >
      <div className="pitbull-categories__shell">
        <button
          type="button"
          className="pitbull-categories__trigger"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="pitbull-categories__trigger-copy">
            <span className="pitbull-categories__eyebrow">{t('pages.pitbull.categoriesEyebrow')}</span>
            <span className="pitbull-categories__title">{t('pages.pitbull.categoriesTitle')}</span>
            {!expanded && <span className="pitbull-categories__summary">{summary}</span>}
          </span>
          <ChevronDown size={20} className="pitbull-categories__chevron" aria-hidden />
        </button>

        <div className="pitbull-categories__body" data-open={expanded}>
          <div className="pitbull-categories__body-inner">
            <p className="pitbull-categories__desc">{t('pages.pitbull.categoriesDesc')}</p>

            <div className="pitbull-category-grid">
              {categoryCards.map((card) => {
                const Icon = CATEGORY_ICONS[card.id] ?? ShieldCheck

                return (
                  <article className="pitbull-category-card surface-card surface-card--flat" key={card.id}>
                    <span className="pitbull-category-card__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <h3 className="pitbull-category-card__title">{card.title}</h3>
                    <p className="pitbull-category-card__text">{card.text}</p>
                  </article>
                )
              })}
            </div>

            <button type="button" className="pitbull-section__rulebook-link" onClick={() => onNavigate('rulebook')}>
              {t('pages.pitbull.viewFullRulebook')}
              <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </Reveal>
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
  const { PITBULL_CATEGORY_CARDS, PITBULL_CLASSIC, PITBULL_CREDENTIAL_SAMPLE } = useContent()
  const { locale, messages, t } = useI18n()
  const inscriptionSteps = messages.pages.pitbull.inscriptionSteps ?? []

  const pitbullEvent = events.find((event) => event.featured)
  const eventStatus = pitbullEvent?.status ?? 'proximamente'
  const canRegister = eventStatus === 'inscripcion_abierta' || eventStatus === 'cupos_limitados'
  const slots = pitbullEvent?.slots ?? PITBULL_CLASSIC.slots
  const registered = pitbullEvent?.registered ?? PITBULL_CLASSIC.registered
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
      >
        <PitbullHeroSpec
          eventStatus={eventStatus}
          locale={locale}
          onNavigate={onNavigate}
          pitbullClassic={PITBULL_CLASSIC}
          pricing={eventPricing}
          registered={registered}
          slots={slots}
          ticketsOpen={ticketsOpen}
          t={t}
        />
      </DesignPageHero>

      <div className="pitbull-page__body">
        <Reveal variant="up">
          <section className="pitbull-feature" aria-label={t('pages.pitbull.featureAria')}>
            <PitbullFeatureVisual
              alt={t('pages.pitbull.visualAlt')}
              src={pitbullVisual}
              venue={PITBULL_CLASSIC.venue}
              location={PITBULL_CLASSIC.location}
              date={PITBULL_CLASSIC.date}
              categories={PITBULL_CLASSIC.categories}
              divisions={PITBULL_CLASSIC.divisions}
            />

            <div className="pitbull-feature__body">
              <header className="pitbull-feature__head">
                <span className="pitbull-feature__index" aria-hidden>
                  {t('pages.pitbull.featureIndex')}
                </span>
                <div className="pitbull-feature__head-copy">
                  <span className="pitbull-feature__eyebrow">{t('pages.pitbull.featureEyebrow')}</span>
                  <p className="pitbull-feature__hook">{t('pages.pitbull.featureHook')}</p>
                </div>
              </header>

              <div className="pitbull-feature__actions">
                <button type="button" className="pitbull-feature__cta" onClick={scrollToInscription}>
                  {t('pages.pitbull.ctaInscription')}
                  <ArrowRight size={14} aria-hidden />
                </button>
                <button type="button" className="pitbull-feature__text-link" onClick={() => onNavigate('rulebook')}>
                  {t('pages.pitbull.ctaRulebook')}
                </button>
              </div>
            </div>
          </section>
        </Reveal>

        <PitbullCategoriesSection
          categoryCards={PITBULL_CATEGORY_CARDS}
          onNavigate={onNavigate}
          pitbullClassic={PITBULL_CLASSIC}
          t={t}
        />

        <Reveal variant="fade">
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
        </Reveal>

        <Reveal variant="fade">
          {ticketsOpen ? (
            <section id="entradas" className="pitbull-tickets" aria-labelledby="pitbull-tickets-title">
              <div className="pitbull-tickets__inner">
                <header className="pitbull-tickets__head pitbull-tickets__head--compact">
                  <span className="pitbull-tickets__index" aria-hidden>
                    {t('pages.pitbull.ticketsIndex')}
                  </span>
                  <div className="pitbull-tickets__head-copy">
                    <span className="pitbull-tickets__eyebrow">{t('pages.pitbull.ticketsEyebrow')}</span>
                    <h2 id="pitbull-tickets-title" className="pitbull-tickets__title">
                      {t('pages.pitbull.ticketsTitle')}
                    </h2>
                  </div>
                </header>

                {!ticketFormOpen && !hasTicketOrder ? (
                  <PitbullTicketPass
                    event={ticketEvent}
                    locale={locale}
                    onOpen={openTicketForm}
                    pricing={ticketPricing}
                    t={t}
                  />
                ) : (
                  <div id="pitbull-ticket-form" className="pitbull-tickets__form-shell">
                    {!hasTicketOrder ? (
                      <button
                        type="button"
                        className="pitbull-tickets__form-back"
                        onClick={() => setTicketFormOpen(false)}
                      >
                        <X size={14} aria-hidden />
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
              </div>
            </section>
          ) : (
            <section id="entradas" className="pitbull-tickets pitbull-tickets--closed" aria-live="polite">
              <div className="pitbull-tickets__inner">
                <p className="pitbull-tickets__closed-note">{t('pages.pitbull.ticketsClosed')}</p>
              </div>
            </section>
          )}
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
