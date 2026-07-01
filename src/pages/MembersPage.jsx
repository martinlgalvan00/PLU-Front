import { BadgeCheck, Barcode, CalendarDays, Check, Globe2, X } from 'lucide-react'
import { money } from '../lib/format.js'
import { PRICING } from '../lib/constants.js'
import {
  MEMBERSHIP_ANNUAL_STEPS,
  MEMBERSHIP_COMPARE_ROWS,
  MEMBERSHIP_PLANS,
} from '../lib/content.js'
import PageHero from '../components/layout/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'

const BENEFITS = [
  { icon: Barcode, label: 'Código PLU ARG', desc: 'ID único como atleta afiliado durante la temporada.' },
  { icon: CalendarDays, label: 'Acceso a eventos', desc: 'Todos los meets oficiales del calendario federativo.' },
  { icon: Globe2, label: 'Estándar internacional', desc: 'Reglamento y operación alineados a PLU USA.' },
  { icon: BadgeCheck, label: 'Respaldo federativo', desc: 'Validación administrativa, arbitral y exportación oficial.' },
]

export default function MembersPage({ onNavigate }) {
  return (
    <main className="page members-page">
      <PageHero
        eyebrow="Afiliación anual 2026"
        title="Tu licencia para competir con respaldo PLU ARG"
        description="La afiliación anual habilita tu código de atleta, tarjeta digital, acceso a eventos oficiales y operación federativa durante toda la temporada."
      />

      <section className="members-page__stats" aria-label="Resumen de afiliación">
        <div className="members-stat">
          <strong>3</strong>
          <span>Planes disponibles</span>
        </div>
        <div className="members-stat members-stat--price">
          <strong>{money(PRICING.membershipJunior)}</strong>
          <span>Desde / temporada</span>
        </div>
        <div className="members-stat members-stat--season">
          <strong>2026</strong>
          <span>Vigencia anual</span>
        </div>
      </section>

      <section className="page-section members-page__intro">
        <div className="page-section__inner">
          <div className="membership-annual-intro surface-card">
            <div className="membership-annual-intro__copy">
              <span className="membership-annual-intro__eyebrow">Membresía federativa</span>
              <h2>Afiliación anual, no es solo un pago</h2>
              <p>
                Es tu identidad competitiva dentro de PLU ARG: código único, estado de afiliación,
                habilitación para inscripciones y respaldo institucional en cada meet oficial.
              </p>
              <Button onClick={() => onNavigate('membership')}>Comenzar afiliación</Button>
            </div>
            <div className="membership-annual-intro__card" aria-hidden>
              <span className="membership-annual-intro__card-label">Tarjeta digital</span>
              <strong>PLU ARG</strong>
              <em>Atleta afiliado</em>
              <small>Código · PLU-ARG-2026-XXX</small>
              <div className="membership-annual-intro__card-bar" />
            </div>
          </div>
        </div>
      </section>

      <section className="page-section page-section--benefits">
        <div className="page-section__inner">
          <div className="members-benefits">
            {BENEFITS.map(({ icon: Icon, label, desc }, index) => (
              <Reveal key={label} delay={index * 80}>
                <div className="members-benefit">
                  <div className="members-benefit__icon" aria-hidden>
                    <Icon size={18} strokeWidth={1.5} />
                  </div>
                  <div>
                    <strong className="members-benefit__label">{label}</strong>
                    <p className="members-benefit__desc">{desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section members-page__steps">
        <div className="page-section__inner">
          <SectionHeading
            eyebrow="Cómo funciona"
            title="Afiliación en 4 pasos"
            description="Desde la elección del plan hasta tu código activo de atleta PLU ARG."
          />
          <ol className="membership-steps">
            {MEMBERSHIP_ANNUAL_STEPS.map((item, index) => (
              <Reveal key={item.step} delay={index * 100} variant="up">
                <li className="membership-step">
                  <span className="membership-step__index">{item.step}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-section page-section--plans">
        <div className="page-section__inner">
          <Reveal>
            <SectionHeading
              title="Planes de afiliación anual"
              description="Elegí el plan que mejor se adapte a tu categoría y objetivo competitivo."
            />
          </Reveal>

          <div className="membership-grid">
            {MEMBERSHIP_PLANS.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 120} variant="up">
                <MembershipCard {...plan} onSelect={() => onNavigate('membership')} />
              </Reveal>
            ))}
          </div>

          <div className="membership-compare surface-card">
            <h3>Compará planes</h3>
            <div className="membership-compare__table">
              <div className="membership-compare__row membership-compare__row--head">
                <span>Beneficio</span>
                <span>Atleta</span>
                <span>Juvenil</span>
                <span>Combo</span>
              </div>
              {MEMBERSHIP_COMPARE_ROWS.map((row) => (
                <div key={row.label} className="membership-compare__row">
                  <span>{row.label}</span>
                  <span>{row.athlete ? <Check size={16} /> : <span className="membership-compare__no"><X size={16} /></span>}</span>
                  <span>{row.junior ? <Check size={16} /> : <span className="membership-compare__no"><X size={16} /></span>}</span>
                  <span>{row.combo ? <Check size={16} /> : <span className="membership-compare__no"><X size={16} /></span>}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="page-section__action">
            <Button variant="outline" onClick={() => onNavigate('membership')}>
              Ir al formulario de afiliación
            </Button>
          </div>
        </div>
      </section>

      <CTASection
        title="¿Listo para tu afiliación anual?"
        description="Completá el formulario, pagá con Mercado Pago y recibí tu código PLU ARG."
        primaryLabel="Afiliarme ahora"
        onPrimary={() => onNavigate('membership')}
        secondaryLabel="Ver eventos"
        onSecondary={() => onNavigate('events')}
      />
    </main>
  )
}
