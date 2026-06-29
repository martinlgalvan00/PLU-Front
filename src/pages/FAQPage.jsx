import { FAQ_ITEMS } from '../lib/content.js'
import PageHero from '../components/layout/PageHero.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import Reveal from '../components/ui/Reveal.jsx'

export default function FAQPage({ onNavigate }) {
  return (
    <main className="page">
      <div className="page__inner page__inner--narrow">
        <PageHero
          compact
          eyebrow="FAQ"
          title="Preguntas frecuentes"
          description="Afiliación, pagos, eventos y resultados."
        />
        <Reveal>
          <FAQAccordion items={FAQ_ITEMS} />
        </Reveal>
        <div className="page__action">
          <button type="button" className="btn" onClick={() => onNavigate('contact')}>
            Escribinos
          </button>
        </div>
      </div>
    </main>
  )
}
