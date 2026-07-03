import { Calendar, MapPin } from 'lucide-react'
import pitbullVisual from '../../assets/powerlifting-hero.png'
import { PITBULL_CLASSIC } from '../../lib/content.js'
import BrandLogo from './BrandLogo.jsx'
import Button from './Button.jsx'
import CapacityBar from './CapacityBar.jsx'

export default function PitbullSpotlight({ onDetail, onRegister, registerLabel = 'Inscribirme' }) {
  return (
    <article className="pitbull-spotlight pitbull-spotlight--design">
      <div className="pitbull-spotlight__copy">
        <div className="pitbull-spotlight__brand">
          <BrandLogo variant="argentina" imgClassName="pitbull-spotlight__brand-emblem" height={42} />
          <BrandLogo
            variant="letterhead"
            imgClassName="pitbull-spotlight__brand-letterhead"
            height={28}
          />
        </div>

        <span className="pitbull-spotlight__eyebrow">
          <span className="pitbull-spotlight__eyebrow-dot" aria-hidden />
          Próximo evento
        </span>
        <h2 className="pitbull-spotlight__title">{PITBULL_CLASSIC.title}</h2>
        <p className="pitbull-spotlight__desc">
          El primer gran evento oficial de PLU ARG. Categorías raw y equipped, jueces certificados,
          resultados reconocidos por PLU USA.
        </p>

        <ul className="pitbull-spotlight__meta">
          <li>
            <Calendar size={14} aria-hidden />
            {PITBULL_CLASSIC.date}
          </li>
          <li>
            <MapPin size={14} aria-hidden />
            {PITBULL_CLASSIC.location}
          </li>
        </ul>

        <div className="pitbull-spotlight__tags">
          {PITBULL_CLASSIC.categories.map((category) => (
            <span
              key={category}
              className={`pitbull-spotlight__tag pitbull-spotlight__tag--${category.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {category}
            </span>
          ))}
        </div>

        <div className="pitbull-spotlight__capacity">
          <CapacityBar current={PITBULL_CLASSIC.registered} total={PITBULL_CLASSIC.slots} label="Cupos ocupados" />
        </div>

        <div className="pitbull-spotlight__actions">
          <Button onClick={onDetail}>Ver Pitbull Classic</Button>
          {onRegister ? (
            <Button variant="outline" onClick={onRegister}>
              {registerLabel}
            </Button>
          ) : (
            <span className="pitbull-spotlight__soon">
              <span className="pitbull-spotlight__soon-dot" aria-hidden />
              Inscripción próximamente
            </span>
          )}
        </div>
      </div>

      <div className="pitbull-spotlight__visual" aria-hidden>
        <img src={pitbullVisual} alt="" className="pitbull-spotlight__visual-img" />
        <div className="pitbull-spotlight__visual-overlay" />
        <div className="pitbull-spotlight__visual-glow" />
        <span className="pitbull-spotlight__badge">Destacado</span>
        <div className="pitbull-spotlight__visual-emblem-wrap">
          <BrandLogo variant="argentina" imgClassName="pitbull-spotlight__visual-emblem" height={56} />
        </div>
        <div className="pitbull-spotlight__visual-date">
          <span className="pitbull-spotlight__visual-date-day">{PITBULL_CLASSIC.dateDay}</span>
          <span className="pitbull-spotlight__visual-date-month">{PITBULL_CLASSIC.dateMonth} 2026</span>
        </div>
      </div>
    </article>
  )
}
