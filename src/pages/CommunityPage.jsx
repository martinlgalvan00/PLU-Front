import {
  COMMUNITY_GYM_PLACEHOLDERS,
  COMMUNITY_QUOTE,
  COMMUNITY_TESTIMONIAL_PLACEHOLDERS,
} from '../lib/content.js'
import PageHero from '../components/layout/PageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'

export default function CommunityPage({ onNavigate }) {
  return (
    <main className="page community-page">
      <div className="page__inner">
        <PageHero
          eyebrow="Comunidad"
          title="El powerlifting argentino crece de a un gimnasio por vez."
          description="PLU ARG existe porque hay atletas y gimnasios en distintas provincias entrenando bajo el mismo estándar. Esta es su federación."
        />

        <Reveal variant="zoom">
          <blockquote className="community-quote">{COMMUNITY_QUOTE}</blockquote>
        </Reveal>

        <Reveal>
          <SectionHeading
            align="left"
            eyebrow="Gimnasios afiliados"
            title="Espacio reservado para la red de gimnasios PLU ARG."
          />
        </Reveal>
        <div className="community-gym-grid">
          {COMMUNITY_GYM_PLACEHOLDERS.map((gym, i) => (
            <Reveal key={gym.id} delay={i * 60}>
              <div className="community-gym-tile">
                <span>{gym.label}</span>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="community-gym-cta">
            ¿Tu gimnasio quiere sumarse a la red PLU ARG?{' '}
            <button type="button" className="link-underline" onClick={() => onNavigate('contact')}>
              Contactanos
            </button>
          </p>
        </Reveal>

        <Reveal>
          <SectionHeading
            align="left"
            eyebrow="Historias"
            title="Espacio reservado para historias reales de atletas."
          />
        </Reveal>
        <div className="community-testimonial-grid">
          {COMMUNITY_TESTIMONIAL_PLACEHOLDERS.map((item, i) => (
            <Reveal key={item.id} delay={i * 80}>
              <article className="community-testimonial-card surface-card">
                <div className="community-testimonial-card__photo">
                  <span>{item.photoLabel}</span>
                </div>
                <p>{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>

      <CTASection
        title="¿Tu gimnasio quiere ser parte de PLU ARG?"
        primaryLabel="Quiero ser parte"
        onPrimary={() => onNavigate('contact')}
      />
    </main>
  )
}
