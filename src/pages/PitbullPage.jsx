import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Dumbbell,
  MapPin,
  Scale,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react'
import pitbullVisual from '../assets/powerlifting-hero.png'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Button from '../components/ui/Button.jsx'
import CapacityBar from '../components/ui/CapacityBar.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventShareCard from '../components/ui/EventShareCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import { PITBULL_CATEGORY_CARDS, PITBULL_CLASSIC, PITBULL_CREDENTIAL_SAMPLE } from '../lib/content.js'
import { PRICING } from '../lib/constants.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'

const CATEGORY_ICONS = {
  equipment: Dumbbell,
  age: Users,
  weight: Scale,
  gender: UserRound,
}

const INSCRIPTION_TIMELINE = [
  {
    step: '01',
    title: 'Afiliación anual PLU ARG activa',
    detail: 'Te habilita a competir en cualquier evento oficial del año calendario.',
    icon: ShieldCheck,
  },
  {
    step: '02',
    title: 'Categoría, división y peso declarados',
    detail: 'Confirmás equipamiento, franja de edad y peso corporal antes de competir.',
    icon: Scale,
  },
  {
    step: '03',
    title: 'Pago de inscripción acreditado',
    detail: 'El cupo en Pitbull Classic queda confirmado al acreditarse el pago.',
    icon: CircleDollarSign,
  },
]

function PitbullStoryPreview() {
  const sample = PITBULL_CREDENTIAL_SAMPLE

  return (
    <div className="pitbull-story-preview" aria-hidden>
      <div className="pitbull-story-preview__frame">
        <div className="pitbull-story-preview__notch" />
        <div className="pitbull-story-preview__screen">
          <span className="pitbull-story-preview__brand">
            PLU<span>ARG</span>
          </span>
          <span className="pitbull-story-preview__event">Pitbull Classic 2026</span>
          <span className="pitbull-story-preview__avatar" />
          <strong className="pitbull-story-preview__name">{sample.athlete}</strong>
          <span className="pitbull-story-preview__meta">Master · Raw · 76kg</span>
          <span className="pitbull-story-preview__label">Voy a competir</span>
          <span className="pitbull-story-preview__number">{sample.registrationNumber}</span>
          <span className="pitbull-story-preview__date">12-13 Dic · Buenos Aires</span>
          <span className="pitbull-story-preview__status">
            <span className="pitbull-story-preview__status-dot" />
            Inscripción confirmada
          </span>
        </div>
      </div>
    </div>
  )
}

function scrollToInscription() {
  document.getElementById('inscripcion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function EventStatusBadge({ status }) {
  const { label, tone } = getStatusMeta(status)
  return <span className={`events-status-badge events-status-badge--${tone}`}>{label}</span>
}

function PitbullHeroRail({ eventStatus, onNavigate, slots, registered }) {
  const slotsLeft = slots - registered
  const canRegister = eventStatus === 'inscripcion_abierta' || eventStatus === 'cupos_limitados'

  const stats = [
    {
      icon: CalendarDays,
      value: PITBULL_CLASSIC.dateDay,
      label: `${PITBULL_CLASSIC.dateMonth} 2026`,
    },
    {
      icon: MapPin,
      value: 'Buenos Aires',
      label: PITBULL_CLASSIC.venue,
    },
    {
      icon: Users,
      value: String(slotsLeft),
      label: 'Cupos libres',
      tone: 'open',
    },
    {
      icon: Ticket,
      value: money(PRICING.event),
      label: 'Inscripción',
    },
  ]

  return (
    <div className="pitbull-hero-rail">
      <div className="pitbull-hero-rail__head">
        <div className="pitbull-hero-rail__status-row">
          <EventStatusBadge status={eventStatus} />
          {!canRegister && (
            <span className="pitbull-hero-rail__soon-pill">
              <span className="pitbull-hero-rail__soon-dot" aria-hidden />
              Inscripción próximamente
            </span>
          )}
        </div>

        <div className="pitbull-hero-rail__actions">
          {canRegister ? (
            <Button className="btn--small" onClick={() => onNavigate('competition')}>
              Inscribirme
              <ArrowRight size={14} aria-hidden />
            </Button>
          ) : (
            <Button className="btn--small" onClick={scrollToInscription}>
              Cómo inscribirme
              <ArrowRight size={14} aria-hidden />
            </Button>
          )}
          <button
            type="button"
            className="pitbull-hero-rail__link"
            onClick={() => onNavigate('events')}
          >
            Ver calendario
          </button>
        </div>
      </div>

      <div className="pitbull-hero-rail__stats" aria-label="Datos del evento">
        {stats.map(({ icon: Icon, label, tone, value }) => (
          <article
            key={label}
            className={`pitbull-hero-stat${tone ? ` pitbull-hero-stat--${tone}` : ''}`.trim()}
          >
            <span className="pitbull-hero-stat__icon" aria-hidden>
              <Icon size={14} />
            </span>
            <div className="pitbull-hero-stat__copy">
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function PitbullInscriptionSection({ canRegister, eventStatus, onNavigate }) {
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus)
  const nextStepLabel = canRegister ? 'Completá tu inscripción' : 'Preparate con afiliación'

  return (
    <section id="inscripcion" className="pitbull-inscription" aria-labelledby="pitbull-inscription-title">
      <div className="pitbull-inscription__inner">
        <div className="pitbull-inscription__grid">
          <div className="pitbull-inscription__requirements">
            <span className="pitbull-inscription__eyebrow">Requisitos</span>
            <h2 id="pitbull-inscription-title" className="pitbull-inscription__title">
              Afiliación e inscripción son pasos distintos
            </h2>
            <p className="pitbull-inscription__lead">
              La afiliación anual te habilita a competir en cualquier evento oficial del año. La
              inscripción al meet se paga aparte y confirma tu cupo en Pitbull Classic.
            </p>

            <ol className="pitbull-inscription__timeline">
              {INSCRIPTION_TIMELINE.map(({ detail, icon: Icon, step, title }) => (
                <li key={step} className="pitbull-inscription__timeline-item">
                  <span className="pitbull-inscription__timeline-step">{step}</span>
                  <div className="pitbull-inscription__timeline-copy">
                    <span className="pitbull-inscription__timeline-icon" aria-hidden>
                      <Icon size={14} />
                    </span>
                    <div>
                      <strong>{title}</strong>
                      <p>{detail}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="pitbull-inscription__pricing">
              <article className="pitbull-inscription__price-card">
                <span className="pitbull-inscription__price-step">Paso 1 · Afiliación</span>
                <span className="pitbull-inscription__price-value">{money(PRICING.membership)}</span>
                <p>Vigente todo el año calendario</p>
              </article>
              <span className="pitbull-inscription__pricing-arrow" aria-hidden>
                <ArrowRight size={16} />
              </span>
              <article className="pitbull-inscription__price-card pitbull-inscription__price-card--event">
                <span className="pitbull-inscription__price-step">Paso 2 · Inscripción</span>
                <span className="pitbull-inscription__price-value">{money(PRICING.event)}</span>
                <p>Cupo en Pitbull Classic</p>
              </article>
            </div>
          </div>

          <div className="pitbull-inscription__status-card">
            <span className="pitbull-inscription__card-label">Estado de inscripción</span>
            <span className="pitbull-inscription__next-step">{nextStepLabel}</span>
            <div className="pitbull-inscription__card-status">
              <span
                className={`pitbull-inscription__status-dot pitbull-inscription__status-dot--${statusTone}`}
                aria-hidden
              />
              <strong>{statusLabel}</strong>
            </div>
            <p className="pitbull-inscription__card-desc">
              {canRegister
                ? 'La inscripción está abierta. Necesitás afiliación vigente y completar el pago del evento desde tu cuenta.'
                : 'La inscripción todavía no está abierta. Podés afiliarte ahora para estar listo cuando se habilite el cupo.'}
            </p>

            <ul className="pitbull-inscription__checklist">
              <li className={canRegister ? 'is-done' : 'is-current'}>
                <CheckCircle2 size={14} aria-hidden />
                Perfil PLU ARG
              </li>
              <li className={canRegister ? 'is-current' : ''}>
                <CheckCircle2 size={14} aria-hidden />
                Afiliación vigente
              </li>
              <li>
                <CheckCircle2 size={14} aria-hidden />
                Inscripción al meet
              </li>
            </ul>

            {canRegister ? (
              <>
                <Button className="pitbull-inscription__card-cta" onClick={() => onNavigate('competition')}>
                  Inscribirme a Pitbull Classic
                  <ArrowRight size={15} aria-hidden />
                </Button>
                <button
                  type="button"
                  className="pitbull-inscription__card-link"
                  onClick={() => onNavigate('members')}
                >
                  Ver planes de afiliación
                </button>
              </>
            ) : (
              <>
                <Button className="pitbull-inscription__card-cta" onClick={() => onNavigate('members')}>
                  Afiliarme para estar listo
                  <ArrowRight size={15} aria-hidden />
                </Button>
                <button
                  type="button"
                  className="pitbull-inscription__card-link"
                  onClick={() => onNavigate('rulebook')}
                >
                  Ver reglamento
                </button>
              </>
            )}
          </div>
        </div>

        <div className="pitbull-inscription__credential">
          <div className="pitbull-inscription__credential-head">
            <span className="pitbull-inscription__credential-eyebrow">Card de inscripción</span>
            <h3 className="pitbull-inscription__credential-title">Así se ve tu inscripción confirmada</h3>
            <p className="pitbull-inscription__credential-desc">
              Al confirmar generás la card oficial y una versión vertical lista para compartir en
              Instagram.
            </p>
          </div>

          <div className="pitbull-credential-showcase">
            <div className="pitbull-credential-showcase__card">
              <div className="pitbull-credential__card">
                <EventShareCard
                  preview
                  athleteName={PITBULL_CREDENTIAL_SAMPLE.athlete}
                  athleteCode={PITBULL_CREDENTIAL_SAMPLE.affiliateCode}
                  eventTitle={PITBULL_CLASSIC.title}
                  eventDate={PITBULL_CLASSIC.date}
                  eventVenue={PITBULL_CLASSIC.venue}
                  eventLocation="Buenos Aires"
                  category="Master"
                  division="Raw"
                  eventSlug="pitbull-classic-2026"
                  variant="event"
                />
              </div>
              <p className="pitbull-credential__hint">
                Card cuadrada · {PITBULL_CREDENTIAL_SAMPLE.athlete} es dato de ejemplo
              </p>
            </div>

            <div className="pitbull-credential-showcase__story">
              <span className="pitbull-credential-showcase__story-label">Para tu historia</span>
              <PitbullStoryPreview />
              <p className="pitbull-credential__hint">
                Formato 9:16 · se genera automáticamente al confirmar
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function PitbullPage({ onNavigate, events = UPCOMING_EVENTS }) {
  const pitbullEvent = events.find((event) => event.featured)
  const eventStatus = pitbullEvent?.status ?? 'proximamente'
  const canRegister = eventStatus === 'inscripcion_abierta' || eventStatus === 'cupos_limitados'
  const slots = pitbullEvent?.slots ?? PITBULL_CLASSIC.slots
  const registered = pitbullEvent?.registered ?? PITBULL_CLASSIC.registered

  return (
    <main className="page page--design pitbull-page pitbull-page--premium">
      <DesignPageHero
        compact
        breadcrumbLabel="Pitbull Classic"
        onHome={() => onNavigate('home')}
        eyebrow="Evento insignia"
        title={PITBULL_CLASSIC.title}
        description={PITBULL_CLASSIC.tagline}
      >
        <PitbullHeroRail
          eventStatus={eventStatus}
          onNavigate={onNavigate}
          slots={slots}
          registered={registered}
        />
      </DesignPageHero>

      <div className="pitbull-page__body">
        <Reveal variant="up">
          <section className="pitbull-feature" aria-label="Resumen del evento">
            <div className="pitbull-feature__visual">
              <img src={pitbullVisual} alt="" className="pitbull-feature__visual-img" />
              <div className="pitbull-feature__visual-overlay" />
              <span className="pitbull-feature__badge">Evento insignia PLU ARG</span>

              <div className="pitbull-feature__visual-foot">
                <div className="pitbull-feature__tags">
                  {PITBULL_CLASSIC.categories.map((category) => (
                    <span key={category} className="pitbull-feature__tag">
                      {category}
                    </span>
                  ))}
                </div>
                <div className="pitbull-feature__capacity">
                  <CapacityBar current={registered} total={slots} label="Cupos ocupados" />
                </div>
              </div>
            </div>

            <div className="pitbull-feature__panel">
              <h2 className="pitbull-feature__panel-title">El meet</h2>
              <p className="pitbull-feature__panel-lead">
                Dos jornadas de competencia bajo estándar PLU USA, con plataformas certificadas,
                jueces PLU ARG y publicación oficial de resultados.
              </p>

              <ul className="pitbull-feature__highlights">
                <li>
                  <ShieldCheck size={16} aria-hidden />
                  Requiere afiliación anual activa antes de inscribirte
                </li>
                <li>
                  <Dumbbell size={16} aria-hidden />
                  Divisiones: {PITBULL_CLASSIC.divisions.join(' · ')}
                </li>
                <li>
                  <CalendarDays size={16} aria-hidden />
                  {PITBULL_CLASSIC.date}
                </li>
              </ul>

              <div className="pitbull-feature__actions">
                <Button variant="outline" onClick={scrollToInscription}>
                  Ver requisitos e inscripción
                  <ArrowRight size={15} aria-hidden />
                </Button>
                <button
                  type="button"
                  className="pitbull-feature__text-link"
                  onClick={() => onNavigate('rulebook')}
                >
                  Ver reglamento
                </button>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal as="section" className="pitbull-section pitbull-section--categories" variant="fade">
          <SectionHeading
            align="left"
            variant="ref"
            eyebrow="Categorías"
            title="Divisiones y reglamento"
            description="Divisiones sujetas a confirmación final del reglamento oficial PLU ARG."
          />

          <div className="pitbull-category-grid">
            {PITBULL_CATEGORY_CARDS.map((card, index) => {
              const Icon = CATEGORY_ICONS[card.id] ?? ShieldCheck

              return (
                <Reveal key={card.id} delay={index * 60}>
                  <article className="pitbull-category-card surface-card surface-card--flat">
                    <span className="pitbull-category-card__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <h3 className="pitbull-category-card__title">{card.title}</h3>
                    <p className="pitbull-category-card__text">{card.text}</p>
                  </article>
                </Reveal>
              )
            })}
          </div>

          <button
            type="button"
            className="pitbull-section__rulebook-link"
            onClick={() => onNavigate('rulebook')}
          >
            Ver reglamento completo
            <ArrowRight size={14} aria-hidden />
          </button>
        </Reveal>

        <Reveal variant="fade">
          <PitbullInscriptionSection
            canRegister={canRegister}
            eventStatus={eventStatus}
            onNavigate={onNavigate}
          />
        </Reveal>
      </div>

      <CTASection
        title="¿Primera vez en PLU ARG?"
        description="Creá tu perfil, afiliate para la temporada y cuando abra la inscripción completá el pago del meet desde tu cuenta."
        primaryLabel="Crear perfil"
        onPrimary={() => onNavigate('register')}
        secondaryLabel="Ver afiliación"
        onSecondary={() => onNavigate('members')}
      />
    </main>
  )
}
