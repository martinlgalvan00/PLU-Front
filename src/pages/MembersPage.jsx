import PageHero from '../components/layout/PageHero.jsx'
import MembershipCard from '../components/ui/MembershipCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { MEMBERSHIP_PLANS } from '../lib/content.js'

export default function MembersPage({ onNavigate }) {
  return (
    <main className="page">
      <div className="page__inner">
        <PageHero
          eyebrow="Afiliación anual"
          title="Elegí tu plan PLU ARG"
          description="La afiliación habilita tu código de atleta, acceso a eventos oficiales y respaldo federativo durante toda la temporada."
        />
        <div className="membership-grid">
          {MEMBERSHIP_PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 100} variant="scale">
              <MembershipCard {...plan} onSelect={() => onNavigate('membership')} />
            </Reveal>
          ))}
        </div>
      </div>
    </main>
  )
}
