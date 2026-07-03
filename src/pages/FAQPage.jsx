import { FAQ_GROUPS } from '../lib/content.js'
import PageHero from '../components/layout/PageHero.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SubNav from '../components/ui/SubNav.jsx'

const SUB_NAV_ITEMS = FAQ_GROUPS.map((group) => ({ href: `#${group.id}`, label: group.title }))

export default function FAQPage({ onNavigate }) {
  return (
    <main className="page faq-page">
      <div className="page__inner page__inner--narrow">
        <PageHero
          compact
          eyebrow="FAQ"
          title="Preguntas frecuentes"
          description="Todo lo que necesitás saber sobre afiliación, inscripción, pagos y resultados."
        />
      </div>

      <SubNav items={SUB_NAV_ITEMS} />

      <div className="page__inner page__inner--narrow faq-groups">
        {FAQ_GROUPS.map((group, i) => (
          <Reveal key={group.id} delay={i * 60}>
            <section id={group.id} className="anchor-target faq-group">
              <h2 className="faq-group__title">{group.title}</h2>
              <FAQAccordion items={group.items} />
            </section>
          </Reveal>
        ))}

        <Reveal>
          <div className="page__action">
            <p className="faq-groups__closing">¿No encontraste lo que buscabas?</p>
            <button type="button" className="btn" onClick={() => onNavigate('contact')}>
              Contactanos
            </button>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
