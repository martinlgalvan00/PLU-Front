import { useState } from 'react'
import { Award } from 'lucide-react'
import { PITBULL_CATEGORY_CARDS, PITBULL_CLASSIC, PITBULL_CREDENTIAL_SAMPLE } from '../lib/content.js'
import { PRICING } from '../lib/constants.js'
import { money } from '../lib/format.js'
import PageHero from '../components/layout/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import CapacityBar from '../components/ui/CapacityBar.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'

export default function PitbullPage({ onNavigate }) {
  const [flipped, setFlipped] = useState(false)

  return (
    <main className="page pitbull-page">
      <PageHero
        eyebrow="Evento insignia"
        title={PITBULL_CLASSIC.title}
        description={`${PITBULL_CLASSIC.date} · ${PITBULL_CLASSIC.venue} · ${PITBULL_CLASSIC.location}`}
      />

      <section className="page-section page-section--alt">
        <div className="page-section__inner">
          <Reveal>
            <p className="pitbull-category-kicker">
              Divisiones sujetas a confirmación final del reglamento.
            </p>
          </Reveal>
          <div className="pitbull-category-grid">
            {PITBULL_CATEGORY_CARDS.map((card, i) => (
              <Reveal key={card.title} delay={i * 80}>
                <article className="pitbull-category-card">
                  <h4>{card.title}</h4>
                  <p>{card.text}</p>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="pitbull-detail">
              <div className="pitbull-detail__info">
                <h3 className="pitbull-detail__title">Información del meet</h3>
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
          </Reveal>

          <Reveal variant="scale">
            <div className="pitbull-credential">
              <h3 className="pitbull-detail__title">Así se ve tu inscripción confirmada</h3>
              <div className="digital-card-block">
                <div className={`digital-card ${flipped ? 'is-flipped' : ''}`}>
                  <div className="card-face card-front">
                    <div className="card-brand">
                      <strong>PLU ARG</strong>
                      <small>Pitbull Classic 2026</small>
                    </div>
                    <div className="card-member">
                      <span>Atleta</span>
                      <h2>{PITBULL_CREDENTIAL_SAMPLE.athlete}</h2>
                      <p>{PITBULL_CREDENTIAL_SAMPLE.categoryLine}</p>
                    </div>
                    <Award size={28} aria-hidden />
                  </div>
                  <div className="card-face card-back">
                    <div>
                      <span>N° inscripción</span>
                      <strong>{PITBULL_CREDENTIAL_SAMPLE.registrationNumber}</strong>
                    </div>
                    <div>
                      <span>Código afiliado</span>
                      <strong>{PITBULL_CREDENTIAL_SAMPLE.affiliateCode}</strong>
                    </div>
                    <div>
                      <span>Fecha y sede</span>
                      <strong>{PITBULL_CREDENTIAL_SAMPLE.date}</strong>
                    </div>
                    <div>
                      <span>Estado</span>
                      <strong>{PITBULL_CREDENTIAL_SAMPLE.status}</strong>
                    </div>
                    <small>Dato de ejemplo — mockup de credencial de inscripción confirmada.</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--outline card-flip"
                  onClick={() => setFlipped((f) => !f)}
                >
                  Girar credencial
                </button>
              </div>
            </div>
          </Reveal>
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
