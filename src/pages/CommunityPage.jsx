import { ArrowRight } from 'lucide-react'
import {
  COMMUNITY_GYM_PLACEHOLDERS,
  COMMUNITY_HIGHLIGHTS,
  COMMUNITY_QUOTE,
  COMMUNITY_TESTIMONIAL_PLACEHOLDERS,
} from '../lib/content.js'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'

function CommunityHeroHighlights() {
  return (
    <div className="design-hero__stats community-highlights" aria-label="Pilares de la comunidad">
      {COMMUNITY_HIGHLIGHTS.map(({ title, text }) => (
        <article key={title} className="community-highlight">
          <strong>{title}</strong>
          <span>{text}</span>
        </article>
      ))}
    </div>
  )
}

export default function CommunityPage({ onNavigate }) {
  return (
    <main className="page page--design community-page--design">
      <DesignPageHero
        breadcrumbLabel="Comunidad"
        onHome={() => onNavigate?.('home')}
        eyebrow="Red PLU ARG"
        title="El powerlifting argentino crece de a un gimnasio por vez."
        description="Atletas y sedes en distintas provincias, entrenando bajo el mismo estándar internacional."
      >
        <CommunityHeroHighlights />
      </DesignPageHero>

      <div className="community-page__inner">
        <Reveal>
          <figure className="community-manifesto">
            <blockquote>{COMMUNITY_QUOTE}</blockquote>
          </figure>
        </Reveal>

        <Reveal>
          <section className="community-shell" aria-labelledby="community-network-title">
            <header className="community-shell__head">
              <div className="community-shell__head-copy">
                <span className="community-shell__eyebrow">Gimnasios afiliados</span>
                <h2 className="community-shell__title" id="community-network-title">
                  Red en expansión
                </h2>
                <p className="community-shell__lead">
                  Sedes aliadas en el AMBA, el litoral y el interior. Pronto, mapa y directorio
                  completo.
                </p>
              </div>
              <button
                type="button"
                className="community-shell__link"
                onClick={() => onNavigate?.('contact')}
              >
                Sumar mi gimnasio
                <ArrowRight size={14} aria-hidden />
              </button>
            </header>

            <div className="community-network">
              {COMMUNITY_GYM_PLACEHOLDERS.map((gym) => (
                <article key={gym.id} className="community-network__node">
                  <span className="community-network__city">{gym.label}</span>
                  <span className="community-network__venue">{gym.sub}</span>
                </article>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={60}>
          <section className="community-stories" aria-labelledby="community-stories-title">
            <header className="community-stories__head">
              <span className="community-stories__eyebrow">Historias</span>
              <h2 className="community-stories__title" id="community-stories-title">
                Voces de la comunidad
              </h2>
            </header>

            <div className="community-stories__grid">
              {COMMUNITY_TESTIMONIAL_PLACEHOLDERS.map((item) => (
                <article key={item.id} className="community-story-card">
                  <span className="community-story-card__mark" aria-hidden>
                    “
                  </span>
                  <p>{item.text}</p>
                  <footer className="community-story-card__foot">
                    <span className="community-story-card__role">{item.role}</span>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        </Reveal>
      </div>

      <CTASection
        title="¿Tu gimnasio quiere ser parte de PLU ARG?"
        primaryLabel="Quiero ser parte"
        onPrimary={() => onNavigate?.('contact')}
      />
    </main>
  )
}
