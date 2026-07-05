import {
  Award,
  BadgeCheck,
  CalendarRange,
  Camera,
  CreditCard,
  HeartPulse,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Button from '../components/ui/Button.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import MembersHeroRail from '../components/ui/MembersHeroRail.jsx'
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

const BENEFIT_ICONS = {
  events: Trophy,
  credential: BadgeCheck,
  results: Award,
}

const REQUIREMENT_ICONS = {
  id: CreditCard,
  age: Users,
  health: HeartPulse,
  photo: Camera,
}

export default function MembersPage({ onNavigate, session }) {  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const goToAffiliation = () => onNavigate(isLoggedInAthlete ? 'membership' : 'register')
  const scrollToPlans = () => document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <main className="page page--design members-page--design">
      <DesignPageHero
        compact
        breadcrumbLabel="Afiliación anual"
        onHome={() => onNavigate('home')}
        eyebrow="Afiliación anual"
        title="Un solo trámite. Un año entero de competencia oficial."
        description="La afiliación es el requisito único para competir en eventos oficiales de PLU ARG, incluida Pitbull Classic."
      >
        <MembersHeroRail onAffiliate={goToAffiliation} onViewPlans={scrollToPlans} />
      </DesignPageHero>

      <div className="members-page__body">
        <Reveal as="section" variant="up" className="members-section members-section--intro">
          <div className="members-intro">
            <div className="members-intro__head">
              <span className="members-section__eyebrow">Para quién es</span>
              <h2 className="members-section__title members-section__title--display">
                Para cualquier atleta que quiera competir bajo reglas oficiales.
              </h2>
              <p className="members-section__text">
                Sin importar el gimnasio, el nivel o si es tu primera competencia — la afiliación te
                habilita para inscribirte a cualquier evento PLU ARG del año.
              </p>
            </div>

            <ul className="members-benefit-list" aria-label="Beneficios de la afiliación">
              {MEMBERSHIP_BENEFITS.map((item) => {
                const Icon = BENEFIT_ICONS[item.id] ?? ShieldCheck
                return (
                  <li key={item.id} className="members-benefit-list__item">
                    <span className="members-benefit-list__icon" aria-hidden>
                      <Icon size={17} strokeWidth={1.75} />
                    </span>
                    <div className="members-benefit-list__copy">
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-section members-section--muted">
          <div className="members-panel members-requirements">
            <div className="members-requirements__main">
              <span className="members-section__eyebrow">Requisitos</span>
              <h2 className="members-section__title members-section__title--display">
                Todo lo que necesitás antes de empezar.
              </h2>
              <ul className="members-req-list members-req-list--minimal">
                {MEMBERSHIP_REQUIREMENTS.map((item, index) => {
                  const Icon = REQUIREMENT_ICONS[item.id] ?? ShieldCheck
                  return (
                    <li key={item.id}>
                      <span className="members-req-list__index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="members-req-list__icon" aria-hidden>
                        <Icon size={16} strokeWidth={1.75} />
                      </span>
                      <div className="members-req-list__copy">
                        <strong>{item.title}</strong>
                        <span>{item.text}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <aside className="members-validity-card">
              <span className="members-validity-card__icon" aria-hidden>
                <CalendarRange size={20} strokeWidth={1.75} />
              </span>
              <span className="members-section__eyebrow">Vigencia</span>
              <h3>Año calendario completo</h3>
              <p>
                La afiliación rige desde el pago acreditado hasta el <strong>31 de diciembre</strong> del
                mismo año. Renová antes de tu primera competencia del año siguiente.
              </p>
              <ul className="members-validity-card__notes">
                <li>Pago único — sin cuotas mensuales</li>
                <li>Validación manual disponible si Mercado Pago falla</li>
              </ul>
            </aside>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-section">
          <div className="members-section__head members-section__head--center">
            <span className="members-section__eyebrow">Proceso</span>
            <h2 className="members-section__title">Cuatro pasos, todo online.</h2>
          </div>
          <div className="members-process members-process--timeline">
            {MEMBERSHIP_ANNUAL_STEPS.map((step) => (
              <article key={step.step} className="members-process-step">
                <span className="members-process-step__num">{step.step}</span>
                <div className="members-process-step__copy">
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        </Reveal>

        <section className="members-section" id="planes">
          <div className="members-section__head members-section__head--center">
            <span className="members-section__eyebrow">Planes</span>
            <h2 className="members-section__title">Elegí tu plan de afiliación.</h2>
          </div>
          <div className="membership-grid">
            {MEMBERSHIP_PLANS.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 80}>
                <MembershipCard {...plan} onSelect={goToAffiliation} />
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal as="section" variant="scale" className="members-section members-section--dark" id="comenzar">
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
            <Button onClick={goToAffiliation}>Comenzar mi afiliación</Button>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-section members-section--narrow">
          <div className="members-section__head members-section__head--center">
            <span className="members-section__eyebrow">Preguntas sobre la afiliación</span>
            <h2 className="members-section__title">Antes de empezar</h2>
          </div>
          <FAQAccordion items={MEMBERSHIP_FAQ} />
        </Reveal>
      </div>
    </main>
  )
}
