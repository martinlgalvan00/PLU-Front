import { RULEBOOK_SECTIONS } from '../lib/content.js'
import SectionHeading from '../components/ui/SectionHeading.jsx'

export default function RulebookPage({ onNavigate }) {
  return (
    <main className="page">
      <div className="page__inner">
        <SectionHeading
          eyebrow="Reglamento"
          title="Rulebook PLU ARG"
          description="Normativa vigente para competencias oficiales. Consultá con el equipo federativo ante cualquier duda."
        />
        <div className="rulebook-grid">
          {RULEBOOK_SECTIONS.map((section) => (
            <article className="rulebook-card" key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.text}</p>
            </article>
          ))}
        </div>
        <div className="page__action">
          <button type="button" className="btn btn--outline" onClick={() => onNavigate('contact')}>
            Consultar al equipo técnico
          </button>
        </div>
      </div>
    </main>
  )
}
