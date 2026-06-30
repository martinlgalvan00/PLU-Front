import {
  COMMUNITY_HIGHLIGHTS,
  FAQ_ITEMS,
  HOME_STATS,
  MEMBERSHIP_PLANS,
  PITBULL_CLASSIC,
  RECENT_RESULTS,
} from '../lib/content.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import HeroSection from '../components/layout/HeroSection.jsx'
import CapacityBar from '../components/ui/CapacityBar.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import ResultCard from '../components/ui/ResultCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import StatBlock from '../components/ui/StatBlock.jsx'
import TrustStrip from '../components/ui/TrustStrip.jsx'

export default function HomePage({ onNavigate, onSelectEvent }) {
  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />
      <TrustStrip />

      <section className="home-section home-section--stats">
        <div className="home-section__inner stats-row">
          {HOME_STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 80}>
              <StatBlock {...stat} />
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal as="section" className="home-section" id="que-es">
        <div className="home-section__inner home-split">
          <SectionHeading
            align="left"
            eyebrow="Qué es PLU ARG"
            title="La federación que ordena el powerlifting argentino"
            description="Unimos reglamento claro, operación profesional y comunidad competitiva. Desde Maximal coordinamos afiliaciones, eventos oficiales y resultados con estándar internacional."
          />
          <div className="about-card surface-card">
            <ul>
              <li>Reglamento unificado y arbitraje capacitado</li>
              <li>Inscripciones y pagos centralizados</li>
              <li>Resultados oficiales y exportación internacional</li>
              <li>Red de gimnasios y atletas en todo el país</li>
            </ul>
          </div>
        </div>
        <div className="section-divider" />
      </Reveal>

      <Reveal as="section" className="home-section home-section--dark">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Afiliación anual"
            title="Sumate a la comunidad PLU ARG"
            description="Elegí tu plan y competí con respaldo federativo en toda la temporada."
          />
          <div className="membership-grid">
            {MEMBERSHIP_PLANS.map((plan, i) => (
              <Reveal key={plan.id} delay={i * 100} variant="scale">
                <MembershipCard {...plan} onSelect={() => onNavigate('membership')} />
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section">
        <div className="home-section__inner">
          <div className="pitbull-spotlight surface-card">
            <div className="pitbull-spotlight__content">
              <SectionHeading
                align="left"
                eyebrow="Pitbull Classic"
                title={PITBULL_CLASSIC.title}
                description={`${PITBULL_CLASSIC.date} · ${PITBULL_CLASSIC.venue}, ${PITBULL_CLASSIC.location}`}
              />
              <div className="pitbull-spotlight__tags">
                {PITBULL_CLASSIC.categories.map((cat) => (
                  <span key={cat} className="pitbull-spotlight__tag">
                    {cat}
                  </span>
                ))}
              </div>
              <CapacityBar
                current={PITBULL_CLASSIC.registered}
                total={PITBULL_CLASSIC.slots}
              />
              <div className="hero__actions-primary">
                <button type="button" className="btn" onClick={() => onSelectEvent(UPCOMING_EVENTS[0])}>
                  Inscribirme
                </button>
                <button type="button" className="btn btn--outline" onClick={() => onNavigate('pitbull')}>
                  Ver detalle
                </button>
              </div>
            </div>
            <EventCard
              featured
              date={PITBULL_CLASSIC.date}
              title={PITBULL_CLASSIC.title}
              venue={PITBULL_CLASSIC.venue}
              location={PITBULL_CLASSIC.location}
              status="inscripcion_abierta"
              onAction={() => onSelectEvent(UPCOMING_EVENTS[0])}
              actionLabel="Inscribirme"
            />
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--dark">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Próximos eventos"
            title="Calendario competitivo"
            description="Meet oficiales PLU ARG en distintas sedes del país."
          />
          <div className="events-grid">
            {UPCOMING_EVENTS.map((event, i) => (
              <Reveal key={event.slug} delay={i * 90}>
                <EventCard
                  featured={i === 0}
                  date={event.date}
                  title={event.title}
                  venue={event.venue}
                  location={event.location}
                  status={event.status}
                  onAction={() => onSelectEvent(event)}
                />
              </Reveal>
            ))}
          </div>
          <div className="home-section__action">
            <button type="button" className="btn btn--outline" onClick={() => onNavigate('events')}>
              Ver calendario completo
            </button>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Resultados"
            title="Últimas planillas oficiales"
            description="Totales, categorías y posiciones de meets recientes."
          />
          <div className="results-grid">
            {RECENT_RESULTS.map((result, i) => (
              <Reveal key={`${result.athlete}-${result.date}`} delay={i * 80}>
                <ResultCard {...result} />
              </Reveal>
            ))}
          </div>
          <div className="home-section__action">
            <button type="button" className="btn btn--outline" onClick={() => onNavigate('results')}>
              Ver todos los resultados
            </button>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--dark">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Comunidad argentina"
            title="Más que una federación"
            description="Una red de gimnasios, jueces y atletas que empuja el deporte de fuerza en Argentina."
          />
          <div className="community-grid">
            {COMMUNITY_HIGHLIGHTS.map((item, i) => (
              <Reveal key={item.title} delay={i * 100}>
                <article className="community-card surface-card" data-index={String(i + 1).padStart(2, '0')}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section">
        <div className="home-section__inner home-section__inner--narrow">
          <SectionHeading eyebrow="FAQ" title="Preguntas frecuentes" />
          <FAQAccordion items={FAQ_ITEMS} />
        </div>
      </Reveal>

      <CTASection
        title="¿Listo para competir con respaldo federativo?"
        description="Afiliate, inscribite a Pitbull Classic o contactá al equipo PLU ARG."
        primaryLabel="Afiliarme ahora"
        onPrimary={() => onNavigate('membership')}
        secondaryLabel="Contacto"
        onSecondary={() => onNavigate('contact')}
      />
    </main>
  )
}
