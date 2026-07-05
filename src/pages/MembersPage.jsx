import {
  Award,
  BadgeCheck,
  CalendarRange,
  Camera,
  ChevronRight,
  CreditCard,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
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
  MEMBERSHIP_CREDENTIAL_SAMPLE,
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

function MembersHeroRail({ onAffiliate, onViewPlans }) {
  const stats = [
    {
      icon: ShieldCheck,
      value: money(PRICING.membership),
      label: 'Tarifa adulto / año',
      tone: 'celeste',
    },
    {
      icon: Users,
      value: money(PRICING.membershipJunior),
      label: 'Tarifa juvenil / año',
      tone: 'gold',
    },
    {
      icon: CalendarRange,
      value: 'Año calendario',
      label: 'Vigencia hasta 31 dic',
    },
    {
      icon: Trophy,
      value: 'Pitbull Classic',
      label: 'Meet insignia incluido',
      tone: 'open',
    },
  ]

  return (
    <div className="members-hero-rail">
      <div className="members-hero-rail__main">
        <div className="members-hero-rail__head">
          <div className="members-hero-rail__actions">
            <Button onClick={onAffiliate}>Afiliarme ahora</Button>
            <button type="button" className="members-hero-rail__ghost" onClick={onViewPlans}>
              Ver planes
              <ChevronRight size={14} aria-hidden />
            </button>
          </div>
          <p className="members-hero-rail__hint">
            Desde <strong>{money(PRICING.membershipJunior)}</strong> · pago único anual
          </p>
        </div>

        <div className="members-hero-rail__stats" aria-label="Datos de la afiliación">
          {stats.map(({ icon: Icon, value, label, tone }) => (
            <article
              key={label}
              className={`members-hero-stat${tone ? ` members-hero-stat--${tone}` : ''}`.trim()}
            >
              <span className="members-hero-stat__icon" aria-hidden>
                <Icon size={15} strokeWidth={1.75} />
              </span>
              <div className="members-hero-stat__copy">
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="members-credential-preview" aria-label="Vista previa credencial PLU ARG">
        <span className="members-credential-preview__label">Credencial digital</span>
        <strong className="members-credential-preview__code">{MEMBERSHIP_CREDENTIAL_SAMPLE.affiliateCode}</strong>
        <em>{MEMBERSHIP_CREDENTIAL_SAMPLE.athlete}</em>
        <small>{MEMBERSHIP_CREDENTIAL_SAMPLE.season}</small>
        <span className="members-credential-preview__status">
          <Sparkles size={12} aria-hidden />
          {MEMBERSHIP_CREDENTIAL_SAMPLE.status}
        </span>
        <span className="members-credential-preview__bar" aria-hidden />
      </aside>
    </div>
  )
}

export default function MembersPage({ onNavigate, session }) {
  const isLoggedInAthlete = session?.role === 'athlete_plu'
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
        <Reveal as="section" variant="up" className="members-section">
          <div className="members-overview">
            <article className="members-overview__lead surface-card surface-card--flat">
              <span className="members-section__eyebrow">Para quién es</span>
              <h2 className="members-section__title">
                Para cualquier atleta que quiera competir bajo reglas oficiales.
              </h2>
              <p className="members-section__text">
                Sin importar el gimnasio, el nivel o si es tu primera competencia — la afiliación te
                habilita para inscribirte a cualquier evento PLU ARG del año.
              </p>
            </article>

            <div className="members-benefits" aria-label="Beneficios de la afiliación">
              {MEMBERSHIP_BENEFITS.map((item, index) => {
                const Icon = BENEFIT_ICONS[item.id] ?? ShieldCheck
                return (
                  <Reveal key={item.id} delay={index * 70}>
                    <article className="members-benefit-card surface-card surface-card--flat">
                      <span className="members-benefit-card__icon" aria-hidden>
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </article>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </Reveal>

        <Reveal as="section" variant="up" className="members-section members-section--muted">
          <div className="members-requirements">
            <div className="members-requirements__main">
              <span className="members-section__eyebrow">Requisitos</span>
              <h2 className="members-section__title">Todo lo que necesitás antes de empezar.</h2>
              <ul className="members-req-list">
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

            <aside className="members-validity-card surface-card surface-card--flat">
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
          <div className="members-process">
            {MEMBERSHIP_ANNUAL_STEPS.map((step, index) => (
              <Reveal key={step.step} delay={index * 70}>
                <article className="members-process-card surface-card surface-card--flat">
                  <span className="members-process-card__num">{step.step}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              </Reveal>
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
