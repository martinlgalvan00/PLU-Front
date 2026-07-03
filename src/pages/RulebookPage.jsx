import {
  RULEBOOK_DIVISIONS,
  RULEBOOK_DOWNLOAD,
  RULEBOOK_EQUIPMENT,
  RULEBOOK_JUDGING,
  RULEBOOK_WEIGHT_CATEGORIES,
} from '../lib/content.js'
import PageHero from '../components/layout/PageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SubNav from '../components/ui/SubNav.jsx'

const SUB_NAV_ITEMS = [
  { href: '#reg-descarga', label: 'Descarga' },
  { href: '#reg-categorias', label: 'Categorías de peso' },
  { href: '#reg-divisiones', label: 'Divisiones' },
  { href: '#reg-equipamiento', label: 'Equipamiento' },
  { href: '#reg-jueceo', label: 'Jueceo' },
]

export default function RulebookPage({ onNavigate }) {
  return (
    <main className="page rulebook-page">
      <div className="page__inner">
        <PageHero
          eyebrow="Rulebook"
          title="Reglamento oficial PLU ARG"
          description="Categorías, divisiones, equipamiento y criterios de jueceo — el mismo estándar para cada atleta, en cada evento."
        />
      </div>

      <SubNav items={SUB_NAV_ITEMS} />

      <div className="page__inner rulebook-sections">
        <Reveal>
          <section id="reg-descarga" className="anchor-target rulebook-download">
            <div>
              <h3>{RULEBOOK_DOWNLOAD.title}</h3>
              <p>{RULEBOOK_DOWNLOAD.subtitle}</p>
            </div>
            <button type="button" className="btn btn--outline" disabled>
              {RULEBOOK_DOWNLOAD.action}
            </button>
          </section>
        </Reveal>

        <Reveal>
          <section id="reg-categorias" className="anchor-target rulebook-block">
            <p className="rulebook-block__kicker">01 · Categorías de peso corporal</p>
            <div className="rulebook-weight-grid">
              {RULEBOOK_WEIGHT_CATEGORIES.map((item) => (
                <div key={item.title} className="rulebook-weight-col">
                  <h4>{item.title}</h4>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="reg-divisiones" className="anchor-target rulebook-block">
            <p className="rulebook-block__kicker">02 · Divisiones por edad</p>
            <div className="rulebook-divisions-grid">
              {RULEBOOK_DIVISIONS.map((division, i) => (
                <Reveal key={division.title} delay={i * 80}>
                  <div className="rulebook-division-tile">
                    <h4>{division.title}</h4>
                    <p>{division.range}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="rulebook-block__note">
              Rangos de ejemplo, sujetos a confirmación en el reglamento final.
            </p>
          </section>
        </Reveal>

        <Reveal>
          <section id="reg-equipamiento" className="anchor-target rulebook-block">
            <p className="rulebook-block__kicker">03 · Equipamiento</p>
            <div className="rulebook-equipment-grid">
              {RULEBOOK_EQUIPMENT.map((item, i) => (
                <Reveal key={item.title} delay={i * 80}>
                  <article className="rulebook-equipment-card surface-card">
                    <h4>{item.title}</h4>
                    <p>{item.text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="reg-jueceo" className="anchor-target rulebook-block">
            <p className="rulebook-block__kicker">04 · Criterios básicos de jueceo</p>
            <ol className="rulebook-judging-list">
              {RULEBOOK_JUDGING.map((rule, i) => (
                <Reveal key={rule.numeral} delay={i * 80} as="li">
                  <span className="rulebook-judging-list__numeral">{rule.numeral}</span>
                  <p>{rule.text}</p>
                </Reveal>
              ))}
            </ol>
          </section>
        </Reveal>

        <div className="page__action">
          <button type="button" className="btn btn--outline" onClick={() => onNavigate('contact')}>
            Consultar al equipo técnico
          </button>
        </div>
      </div>
    </main>
  )
}
