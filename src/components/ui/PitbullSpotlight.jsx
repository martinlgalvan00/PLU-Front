import { Calendar, MapPin } from 'lucide-react'
import pitbullVisual from '../../assets/powerlifting-hero.png'
import { PITBULL_CLASSIC } from '../../lib/content.js'
import Button from './Button.jsx'
import CapacityBar from './CapacityBar.jsx'

export default function PitbullSpotlight({
  variant = 'card',
  onDetail,
  onRegister,
  registerLabel = 'Inscribirme',
}) {
  const isHome = variant === 'home'

  return (
    <article
      className={`pitbull-spotlight ${isHome ? 'pitbull-spotlight--home' : 'pitbull-spotlight--design'}`}
    >
      <div className={`pitbull-spotlight__copy ${isHome ? 'pitbull-spotlight__copy--accent' : ''}`}>
        <span className="pitbull-spotlight__eyebrow">
          {!isHome && <span className="pitbull-spotlight__eyebrow-dot" aria-hidden />}
          Próximo evento
        </span>
        <h2 className="pitbull-spotlight__title">{PITBULL_CLASSIC.title}</h2>
        <p className="pitbull-spotlight__desc">
          El primer gran evento oficial de PLU ARG. Categorías raw y equipped, jueces certificados,
          resultados reconocidos por PLU USA.
        </p>

        {isHome ? (
          <div className="pitbull-spotlight__meta">
            <span>
              {PITBULL_CLASSIC.date}{' '}
              <small>· dato de ejemplo</small>
            </span>
            <span>
              {PITBULL_CLASSIC.location}{' '}
              <small>· dato de ejemplo</small>
            </span>
          </div>
        ) : (
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
        )}

        {!isHome && (
          <>
            <div className="pitbull-spotlight__tags">
              {PITBULL_CLASSIC.categories.map((category) => (
                <span key={category} className="pitbull-spotlight__tag">
                  {category}
                </span>
              ))}
            </div>

            <div className="pitbull-spotlight__capacity">
              <CapacityBar
                current={PITBULL_CLASSIC.registered}
                total={PITBULL_CLASSIC.slots}
                label="Cupos ocupados"
              />
            </div>
          </>
        )}

        <div className="pitbull-spotlight__actions">
          {isHome ? (
            <>
              <button type="button" className="pitbull-spotlight__cta-primary" onClick={onDetail}>
                Ver Pitbull Classic
              </button>
              <span className="pitbull-spotlight__soon">
                Inscripción próximamente
              </span>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className={`pitbull-spotlight__visual ${isHome ? 'pitbull-spotlight__visual--home pitbull-spotlight__visual--placeholder' : ''}`} aria-hidden>
        {isHome ? (
          <>
            <div className="pitbull-spotlight__visual-overlay" />
            <span className="pitbull-spotlight__badge">Destacado</span>
            <span className="pitbull-spotlight__visual-caption">foto — podio Pitbull Classic</span>
          </>
        ) : (
          <>
            <img src={pitbullVisual} alt="" className="pitbull-spotlight__visual-img" />
            <div className="pitbull-spotlight__visual-overlay" />
            <span className="pitbull-spotlight__badge">Destacado</span>
            <div className="pitbull-spotlight__visual-date">
              <span className="pitbull-spotlight__visual-date-day">{PITBULL_CLASSIC.dateDay}</span>
              <span className="pitbull-spotlight__visual-date-month">{PITBULL_CLASSIC.dateMonth} 2026</span>
            </div>
          </>
        )}
      </div>
    </article>
  )
}
