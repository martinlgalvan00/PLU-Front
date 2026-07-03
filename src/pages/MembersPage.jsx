import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Button from '../components/ui/Button.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { money } from '../lib/format.js'
import { PRICING } from '../lib/constants.js'
import {
  MEMBERSHIP_ANNUAL_STEPS,
  MEMBERSHIP_BENEFITS,
  MEMBERSHIP_FAQ,
  MEMBERSHIP_PLANS,
  MEMBERSHIP_REQUIREMENTS,
} from '../lib/content.js'

export default function MembersPage({ onNavigate }) {
  return (
    <main className="page page--design members-page--design">
      <DesignPageHero
        breadcrumbLabel="Afiliación anual"
        onHome={() => onNavigate('home')}
        eyebrow="Afiliación anual"
        title="Un solo trámite. Un año entero de competencia oficial."
        description="La afiliación es el requisito único para competir en eventos oficiales de PLU ARG, incluida Pitbull Classic."
      >
        <div className="design-hero__actions">
          <Button onClick={() => onNavigate('register')}>Afiliarme ahora</Button>
          <p className="design-hero__price">
            Desde <strong>{money(PRICING.membershipJunior)}</strong> / año
          </p>
        </div>
      </DesignPageHero>

      <Reveal as="section" className="design-section">
        <div className="design-grid-2">
          <div>
            <span className="design-section__eyebrow">Para quién es</span>
            <h2 className="design-section__title">
              Para cualquier atleta que quiera competir bajo reglas oficiales.
            </h2>
            <p className="design-section__text">
              Sin importar el gimnasio, el nivel o si es tu primera competencia — la afiliación te
              habilita para inscribirte a cualquier evento PLU ARG del año.
            </p>
          </div>
          <div>
            <span className="design-section__eyebrow">Beneficios</span>
            <ul className="design-benefit-list">
              {MEMBERSHIP_BENEFITS.map((item) => (
                <li key={item}>
                  <span>＋</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="design-section design-section--muted">
        <div className="design-grid-2">
          <div>
            <span className="design-section__eyebrow">Requisitos</span>
            <ol className="design-requirements">
              {MEMBERSHIP_REQUIREMENTS.map((item, index) => (
                <li key={item}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <span className="design-section__eyebrow">Vigencia</span>
            <div className="design-note-card">
              <p>
                La afiliación es válida por <strong>año calendario</strong>: desde el pago acreditado
                hasta el 31 de diciembre del mismo año. Se renueva antes de la primera competencia del
                año siguiente.
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="design-section">
        <span className="design-section__eyebrow" style={{ display: 'block', textAlign: 'center' }}>
          Proceso
        </span>
        <h2 className="design-section__title design-section__title--center">Cuatro pasos, todo online.</h2>
        <div className="design-grid-4">
          {MEMBERSHIP_ANNUAL_STEPS.map((step, i) => (
            <Reveal key={step.step} delay={i * 80}>
              <article className="design-process-card">
                <div className="design-process-card__num">{step.step}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Reveal>

      <section className="design-section" id="planes">
        <span className="design-section__eyebrow" style={{ display: 'block', textAlign: 'center' }}>
          Planes
        </span>
        <h2 className="design-section__title design-section__title--center">
          Elegí tu plan de afiliación.
        </h2>
        <div className="membership-grid">
          {MEMBERSHIP_PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 80}>
              <MembershipCard {...plan} onSelect={() => onNavigate('register')} />
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal as="section" variant="scale" className="design-section design-section--dark" id="comenzar">
        <div className="design-cta-band">
          <div className="design-cta-band__price">
            <strong>{money(PRICING.membership)}</strong>
            <span>ARS / año</span>
          </div>
          <span className="design-cta-band__hint">Tarifa atleta adulto</span>
          <p>
            La afiliación se paga una sola vez al año. Elegí tu plan y completá el trámite online con
            Mercado Pago o validación manual.
          </p>
          <Button onClick={() => onNavigate('register')}>Comenzar mi afiliación</Button>
        </div>
      </Reveal>

      <Reveal as="section" className="design-section design-section--narrow">
        <span className="design-section__eyebrow" style={{ display: 'block', textAlign: 'center' }}>
          Preguntas sobre la afiliación
        </span>
        <h2 className="design-section__title" style={{ textAlign: 'center', marginBottom: 30 }}>
          Antes de empezar
        </h2>
        <FAQAccordion items={MEMBERSHIP_FAQ} />
      </Reveal>
    </main>
  )
}
