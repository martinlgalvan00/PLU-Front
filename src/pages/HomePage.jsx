import {
  ABOUT_PILLARS,
  COMMUNITY_HIGHLIGHTS,
  FAQ_ITEMS,
  MEMBERSHIP_PLANS,
  PLATFORM_SECTIONS,
  RECENT_RESULTS,
} from '../lib/content.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import AboutSection from '../components/ui/AboutSection.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import Button from '../components/ui/Button.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import PlatformMap from '../components/ui/PlatformMap.jsx'
import ResultCard from '../components/ui/ResultCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import StaggerReveal from '../components/ui/StaggerReveal.jsx'

const FEATURED_PLAN = MEMBERSHIP_PLANS.find((plan) => plan.highlighted) ?? MEMBERSHIP_PLANS[0]

export default function HomePage({ onNavigate, onSelectEvent }) {
  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />

      <Reveal as="section" className="home-section home-section--about" id="que-es" variant="from-left">
        <div className="home-section__inner">
          <AboutSection pillars={ABOUT_PILLARS} onNavigate={onNavigate} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--light" variant="scale">
        <div className="home-section__inner">
          <SectionHeading
            align="left"
            eyebrow="Afiliación anual"
            title="Un paso, un año de competencia."
            description="La afiliación es el requisito único para competir en eventos oficiales de PLU ARG durante el año calendario."
          />
          <div className="membership-teaser">
            <MembershipCard {...FEATURED_PLAN} onSelect={() => onNavigate('membership')} />
          </div>
          <div className="home-section__action">
            <Button variant="outline" onClick={() => onNavigate('members')}>
              Ver todos los planes
            </Button>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--pitbull" variant="from-right">
        <div className="home-section__inner">
          <PitbullSpotlight onDetail={() => onNavigate('pitbull')} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--dark">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Próximos eventos"
            title="Calendario competitivo"
            description="Meet oficiales PLU ARG en distintas sedes del país."
          />
          <StaggerReveal className="events-grid" stagger={90}>
            {UPCOMING_EVENTS.map((event, i) => (
              <EventCard
                key={event.slug}
                featured={i === 0}
                date={event.date}
                title={event.title}
                venue={event.venue}
                location={event.location}
                status={event.status}
                onAction={() => onSelectEvent(event)}
              />
            ))}
          </StaggerReveal>
          <div className="home-section__action">
            <Button variant="outline" onClick={() => onNavigate('events')}>
              Ver calendario completo
            </Button>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section" variant="fade">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Resultados"
            title="Últimas planillas oficiales"
            description="Totales, categorías y posiciones de meets recientes."
          />
          <StaggerReveal className="results-grid" stagger={70}>
            {RECENT_RESULTS.map((result) => (
              <ResultCard key={`${result.athlete}-${result.date}`} {...result} />
            ))}
          </StaggerReveal>
          <div className="home-section__action">
            <Button variant="outline" onClick={() => onNavigate('results')}>
              Ver todos los resultados
            </Button>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--light">
        <div className="home-section__inner">
          <div className="rulebook-teaser">
            <SectionHeading
              align="left"
              eyebrow="Reglamento · Rulebook"
              title="Las mismas reglas para todos, sin ambigüedad."
            />
            <div className="rulebook-teaser__action">
              <Button variant="outline" onClick={() => onNavigate('rulebook')}>
                Ver categorías y divisiones
              </Button>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--dark" variant="from-left">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Comunidad"
            title="Cada gimnasio que se suma, hace más fuerte a la federación."
            description="De Buenos Aires a Bariloche, PLU ARG conecta atletas y gimnasios bajo un mismo estándar."
          />
          <StaggerReveal className="community-grid" stagger={80} variant="scale">
            {COMMUNITY_HIGHLIGHTS.map((item) => (
              <article key={item.title} className="community-card">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </StaggerReveal>
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--dark" variant="scale">
        <div className="home-section__inner">
          <SectionHeading
            eyebrow="Navegación"
            title="Explorá toda la plataforma"
            description="Accedé a cada sección pública de PLU ARG desde un solo lugar."
          />
          <PlatformMap sections={PLATFORM_SECTIONS} onNavigate={onNavigate} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section" variant="fade">
        <div className="home-section__inner home-section__inner--narrow">
          <SectionHeading eyebrow="FAQ" title="Preguntas frecuentes" />
          <FAQAccordion items={FAQ_ITEMS} />
        </div>
      </Reveal>

      <Reveal variant="scale">
        <CTASection
          title="¿Listo para competir con respaldo federativo?"
          description="Afiliate, inscribite a Pitbull Classic o contactá al equipo PLU ARG."
          primaryLabel="Afiliarme ahora"
          onPrimary={() => onNavigate('membership')}
          secondaryLabel="Contacto"
          onSecondary={() => onNavigate('contact')}
        />
      </Reveal>
    </main>
  )
}
