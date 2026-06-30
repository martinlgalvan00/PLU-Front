import { PITBULL_CLASSIC } from '../lib/content.js'
import { PRICING } from '../lib/constants.js'
import { money } from '../lib/format.js'
import PageHero from '../components/layout/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import CapacityBar from '../components/ui/CapacityBar.jsx'
import CTASection from '../components/ui/CTASection.jsx'

export default function PitbullPage({ onNavigate }) {
  return (
    <main className="page pitbull-page">
      <PageHero
        eyebrow="Evento insignia"
        title={PITBULL_CLASSIC.title}
        description={`${PITBULL_CLASSIC.date} · ${PITBULL_CLASSIC.venue} · ${PITBULL_CLASSIC.location}`}
      />

      <section className="page-section page-section--alt">
        <div className="page-section__inner">
          <div className="pitbull-detail">
            <div className="pitbull-detail__info">
              <h3 className="pitbull-detail__title">Información del meet</h3>
              <div className="pitbull-spotlight__tags">
                {PITBULL_CLASSIC.categories.map((cat) => (
                  <span key={cat} className="pitbull-spotlight__tag">
                    {cat}
                  </span>
                ))}
              </div>
              <ul className="pitbull-detail__list">
                <li>Divisiones: {PITBULL_CLASSIC.divisions.join(' · ')}</li>
                <li>Inscripción individual: {money(PRICING.event)}</li>
                <li>La afiliación y la inscripción se gestionan por separado.</li>
              </ul>
              <CapacityBar current={PITBULL_CLASSIC.registered} total={PITBULL_CLASSIC.slots} />
              <div className="pitbull-detail__actions">
                <Button onClick={() => onNavigate('competition')}>Inscribirme ahora</Button>
                <Button variant="outline" onClick={() => onNavigate('members')}>
                  Ver planes de afiliación
                </Button>
              </div>
            </div>
            <aside className="pitbull-detail__aside">
              <h4>Sede</h4>
              <p>
                <strong>{PITBULL_CLASSIC.venue}</strong> — {PITBULL_CLASSIC.location}
              </p>
              <p>Plataformas certificadas, jueces PLU ARG y publicación de resultados oficiales.</p>
            </aside>
          </div>
        </div>
      </section>

      <CTASection
        title="¿Primera vez en PLU ARG?"
        description="Creá tu perfil y luego gestioná por separado la afiliación y la competencia."
        primaryLabel="Crear perfil"
        onPrimary={() => onNavigate('register')}
        secondaryLabel="Ver reglamento"
        onSecondary={() => onNavigate('rulebook')}
      />
    </main>
  )
}
