import { Calendar, MapPin, Trophy } from 'lucide-react'
import pitbullVisual from '../../assets/PLU Argentina.jpg'
import { PITBULL_CLASSIC } from '../../lib/content.js'
import Button from './Button.jsx'
import CapacityBar from './CapacityBar.jsx'

const TAG_TONES = {
  Raw: 'raw',
  'Classic Raw': 'classic',
  Equipped: 'equipped',
}

export default function PitbullSpotlight({ onRegister, onDetail }) {
  const slotsLeft = PITBULL_CLASSIC.slots - PITBULL_CLASSIC.registered
  const fillPercent = Math.round((PITBULL_CLASSIC.registered / PITBULL_CLASSIC.slots) * 100)

  return (
    <article className="pitbull-spotlight surface-card surface-card--spotlight">
      <div className="pitbull-spotlight__visual" aria-hidden>
        <img src={pitbullVisual} alt="" className="pitbull-spotlight__visual-img" />
        <div className="pitbull-spotlight__visual-overlay" />
        <div className="pitbull-spotlight__visual-glow" />
        <span className="pitbull-spotlight__badge">
          <Trophy size={14} />
          Evento insignia 2026
        </span>
        <div className="pitbull-spotlight__visual-stat">
          <strong>{PITBULL_CLASSIC.slots}</strong>
          <span>plazas totales</span>
        </div>
      </div>

      <div className="pitbull-spotlight__body">
        <header className="pitbull-spotlight__header">
          <span className="pitbull-spotlight__eyebrow">Pitbull Classic</span>
          <h2 className="pitbull-spotlight__title">
            El meet más fuerte
            <em> de la temporada</em>
          </h2>
        </header>

        <ul className="pitbull-spotlight__meta">
          <li>
            <Calendar size={16} aria-hidden />
            <span>{PITBULL_CLASSIC.date}</span>
          </li>
          <li>
            <MapPin size={16} aria-hidden />
            <span>
              {PITBULL_CLASSIC.venue}, {PITBULL_CLASSIC.location}
            </span>
          </li>
        </ul>

        <div className="pitbull-spotlight__tags" aria-label="Categorías">
          {PITBULL_CLASSIC.categories.map((category) => (
            <span
              key={category}
              className={`pitbull-spotlight__tag pitbull-spotlight__tag--${TAG_TONES[category] ?? 'raw'}`}
            >
              {category}
            </span>
          ))}
        </div>

        <div className="pitbull-spotlight__capacity">
          <CapacityBar current={PITBULL_CLASSIC.registered} total={PITBULL_CLASSIC.slots} />
          {slotsLeft > 0 && fillPercent >= 35 && (
            <p className="pitbull-spotlight__urgency">
              Quedan <strong>{slotsLeft}</strong> plazas — no te quedes afuera
            </p>
          )}
        </div>

        <div className="pitbull-spotlight__actions">
          <Button onClick={onRegister}>Inscribirme</Button>
          <Button variant="outline" onClick={onDetail}>
            Ver detalle
          </Button>
        </div>
      </div>
    </article>
  )
}
