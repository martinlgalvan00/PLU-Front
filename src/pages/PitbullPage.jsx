import { PITBULL_CLASSIC } from '../lib/content.js'
import { PRICING } from '../lib/constants.js'
import { money } from '../lib/format.js'
import PageHero from '../components/layout/PageHero.jsx'
import CapacityBar from '../components/ui/CapacityBar.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'

export default function PitbullPage({ onNavigate }) {
  return (
    <main className="page">
      <div className="page__inner">
        <PageHero
          eyebrow="Evento insignia"
          title={PITBULL_CLASSIC.title}
          description={`${PITBULL_CLASSIC.date} · ${PITBULL_CLASSIC.venue} · ${PITBULL_CLASSIC.location}`}
        />

        <Reveal>
          <div className="pitbull-detail surface-card">
            <div className="pitbull-detail__info">
              <h3>Información del meet</h3>
              <ul>
                <li>Categorías: {PITBULL_CLASSIC.categories.join(' · ')}</li>
                <li>Divisiones: {PITBULL_CLASSIC.divisions.join(' · ')}</li>
                <li>Inscripción individual: {money(PRICING.event)}</li>
                <li>Combo afiliación + evento: {money(PRICING.combo)}</li>
              </ul>
              <CapacityBar
                current={PITBULL_CLASSIC.registered}
                total={PITBULL_CLASSIC.slots}
              />
              <button type="button" className="btn" onClick={() => onNavigate('register')}>
                Inscribirme ahora
              </button>
            </div>
            <aside className="pitbull-detail__aside">
              <h4>Sede</h4>
              <p>Maximal Strength Club — Buenos Aires</p>
              <p>Plataformas certificadas, jueces PLU ARG y transmisión de resultados en vivo.</p>
            </aside>
          </div>
        </Reveal>
      </div>

      <CTASection
        title="¿Primera vez en PLU ARG?"
        description="Podés inscribirte con afiliación incluida en un solo trámite."
        primaryLabel="Afiliarme + inscribirme"
        onPrimary={() => onNavigate('register')}
        secondaryLabel="Ver reglamento"
        onSecondary={() => onNavigate('rulebook')}
      />
    </main>
  )
}
