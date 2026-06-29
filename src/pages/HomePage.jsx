import {
  ABOUT_PILLARS,
  COMMUNITY_HIGHLIGHTS,
  FAQ_ITEMS,
  HOME_STATS,
  MEMBERSHIP_PLANS,
  PITBULL_CLASSIC,
  RECENT_RESULTS,
} from '../lib/content.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import AboutSection from '../components/ui/AboutSection.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import Button from '../components/ui/Button.jsx'
import CapacityBar from '../components/ui/CapacityBar.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import ResultCard from '../components/ui/ResultCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import StatBlock from '../components/ui/StatBlock.jsx'

const FEATURED_PLAN = MEMBERSHIP_PLANS.find((plan) => plan.highlighted) ?? MEMBERSHIP_PLANS[0]

export default function HomePage({ onNavigate }) {
  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />

      <section className="home-section home-section--stats">
        <div className="home-section__inner stats-row">
          {HOME_STATS.map((stat) => (
            <StatBlock key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      <Reveal as="section" className="home-section home-section--about" id="que-es">
        <div className="home-section__inner">
          <AboutSection pillars={ABOUT_PILLARS} onNavigate={onNavigate} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--dark">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Afiliación anual"
            title="Sumate a la comunidad PLU ARG"
            description="Elegí tu plan y competí con respaldo federativo en toda la temporada."
          />
          <div className="membership-teaser">
            <MembershipCard {...FEATURED_PLAN} onSelect={() => onNavigate('register')} />
          </div>
          <div className="home-section__action">
            <Button variant="outline" onClick={() => onNavigate('members')}>
              Ver todos los planes
            </Button>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section">
        <div className="home-section__inner">
          <div className="pitbull-spotlight">
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
            <CapacityBar current={PITBULL_CLASSIC.registered} total={PITBULL_CLASSIC.slots} />
            <div className="hero__actions-primary">
              <Button onClick={() => onNavigate('register')}>Inscribirme</Button>
              <Button variant="outline" onClick={() => onNavigate('pitbull')}>
                Ver detalle
              </Button>
            </div>
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
              <EventCard
                key={event.slug}
                featured={i === 0}
                date={event.date}
                title={event.title}
                venue={event.venue}
                location={event.location}
                status={event.status}
                onAction={() => onNavigate('register')}
              />
            ))}
          </div>
          <div className="home-section__action">
            <Button variant="outline" onClick={() => onNavigate('events')}>
              Ver calendario completo
            </Button>
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
            {RECENT_RESULTS.map((result) => (
              <ResultCard key={`${result.athlete}-${result.date}`} {...result} />
            ))}
          </div>
          <div className="home-section__action">
            <Button variant="outline" onClick={() => onNavigate('results')}>
              Ver todos los resultados
            </Button>
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
            {COMMUNITY_HIGHLIGHTS.map((item) => (
              <article key={item.title} className="community-card">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
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
        onPrimary={() => onNavigate('register')}
        secondaryLabel="Contacto"
        onSecondary={() => onNavigate('contact')}
      />
    </main>
  )
}
