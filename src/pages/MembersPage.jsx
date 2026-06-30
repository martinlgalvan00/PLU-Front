import PageHero from '../components/layout/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import { MEMBERSHIP_PLANS } from '../lib/content.js'

export default function MembersPage({ onNavigate }) {
  return (
    <main className="page">
      <PageHero
        eyebrow="Afiliación anual"
        title="Elegí tu plan PLU ARG"
        description="La afiliación habilita tu código de atleta, acceso a eventos oficiales y respaldo federativo durante toda la temporada."
      />

      <section className="page-section">
        <div className="page-section__inner">
          <SectionHeading
            title="Planes disponibles"
            description="Todos los planes incluyen código de atleta y acceso al calendario oficial PLU ARG."
          />
          <div className="membership-grid">
            {MEMBERSHIP_PLANS.map((plan) => (
              <MembershipCard key={plan.id} {...plan} onSelect={() => onNavigate('membership')} />
            ))}
          </div>
          <div className="page-section__action">
            <Button variant="outline" onClick={() => onNavigate('membership')}>
              Ir al formulario de afiliación
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
