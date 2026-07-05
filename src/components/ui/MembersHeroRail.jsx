import { ChevronRight, Sparkles } from 'lucide-react'
import Button from './Button.jsx'
import { money } from '../../lib/format.js'
import { PRICING } from '../../lib/constants.js'
import { MEMBERSHIP_CREDENTIAL_SAMPLE } from '../../lib/content.js'

function MembersHeroRail({ onAffiliate, onViewPlans }) {
  const metrics = [
    { value: money(PRICING.membership), label: 'Adulto / año' },
    { value: money(PRICING.membershipJunior), label: 'Juvenil / año' },
    { value: 'Año calendario', label: 'Vigencia' },
    { value: 'Pitbull Classic', label: 'Meet insignia' },
  ]

  return (
    <div className="members-hero-rail members-hero-rail--minimal">
      <div className="members-hero-rail__actions">
        <Button onClick={onAffiliate}>Afiliarme ahora</Button>
        <button type="button" className="members-hero-rail__ghost" onClick={onViewPlans}>
          Ver planes
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>

      <dl className="members-hero-rail__metrics" aria-label="Datos de la afiliación">
        {metrics.map(({ value, label }) => (
          <div key={label} className="members-hero-metric">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <aside className="members-credential-preview" aria-label="Vista previa credencial PLU ARG">
        <div className="members-credential-preview__top">
          <span className="members-credential-preview__label">Credencial digital</span>
          <span className="members-credential-preview__season">{MEMBERSHIP_CREDENTIAL_SAMPLE.season}</span>
        </div>
        <strong className="members-credential-preview__code">{MEMBERSHIP_CREDENTIAL_SAMPLE.affiliateCode}</strong>
        <em>{MEMBERSHIP_CREDENTIAL_SAMPLE.athlete}</em>
        <span className="members-credential-preview__status">
          <Sparkles size={11} aria-hidden />
          {MEMBERSHIP_CREDENTIAL_SAMPLE.status}
        </span>
        <span className="members-credential-preview__bar" aria-hidden />
      </aside>
    </div>
  )
}

export default MembersHeroRail
