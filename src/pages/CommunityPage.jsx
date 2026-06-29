import { COMMUNITY_HIGHLIGHTS } from '../lib/content.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import PageHero from '../components/layout/PageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'

export default function CommunityPage({ onNavigate }) {
  return (
    <main className="page">
      <div className="page__inner">
        <PageHero
          eyebrow="Comunidad"
          title="El powerlifting argentino crece unido"
          description="Atletas, gimnasios, jueces y eventos que sostienen la federación PLU ARG."
        />

        <Reveal>
          <div className="community-hero surface-card">
            <p>
              Conectamos la base del deporte con competencias oficiales, formación arbitral y una red de
              gimnasios aliados en todo el país.
            </p>
          </div>
        </Reveal>

        <div className="community-grid">
          {COMMUNITY_HIGHLIGHTS.map((item, i) => (
            <Reveal key={item.title} delay={i * 80}>
              <article className="community-card surface-card" data-index={String(i + 1).padStart(2, '0')}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <SectionHeading
            eyebrow="En agenda"
            title="Próximas competencias"
            description={`${UPCOMING_EVENTS.length} eventos confirmados para la temporada 2026.`}
          />
        </Reveal>
      </div>

      <CTASection
        title="Sumate a la comunidad PLU ARG"
        description="Afiliate, competí y seguí el crecimiento del deporte en Argentina."
        primaryLabel="Afiliarme"
        onPrimary={() => onNavigate('members')}
        secondaryLabel="Ver eventos"
        onSecondary={() => onNavigate('events')}
      />
    </main>
  )
}
