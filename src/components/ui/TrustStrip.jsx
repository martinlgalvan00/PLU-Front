import { Award, Globe2, ShieldCheck, Users } from 'lucide-react'

const ITEMS = [
  { icon: ShieldCheck, label: 'Estándar internacional' },
  { icon: Users, label: 'Comunidad federada' },
  { icon: Award, label: 'Eventos oficiales' },
  { icon: Globe2, label: 'Exportación PLU USA' },
]

export default function TrustStrip() {
  return (
    <div className="trust-strip" role="list">
      {ITEMS.map(({ icon: Icon, label }) => (
        <div key={label} className="trust-strip__item" role="listitem">
          <span className="trust-strip__icon">
            <Icon size={18} />
          </span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
