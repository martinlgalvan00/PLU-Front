import { Check } from 'lucide-react'
import TiltCard from '../../motion/TiltCard.tsx'
import { SHOWCASE_TILT_MAX_DEG } from '../../motion/tokens.ts'
import '../../styles/components/meet-surface.css'
import '../../styles/components/staff-rail.css'

const BODY_LABELS = { operativo: 'Operativo', tecnico: 'Técnico' }

/**
 * Riel de la postulación: una credencial de staff que se va llenando con lo que
 * se escribe y el avance por sección. Es solo lectura: el formulario sigue
 * siendo la única fuente de datos. No se muestra el DNI ni ningún dato
 * sensible en la credencial.
 */
export default function StaffApplicationRail({ sections, activeId, form, ready }) {
  const done = sections.reduce((total, section) => total + section.done, 0)
  const total = sections.reduce((sum, section) => sum + section.total, 0)
  const percent = total ? Math.round((done / total) * 100) : 0
  const fullName = [form.firstName, form.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')

  return (
    <aside className="staff-rail" aria-label="Avance de la postulación">
      <TiltCard
        className="staff-rail__tilt"
        innerClassName="tilt-card__inner staff-rail__tilt-inner"
        maxTilt={SHOWCASE_TILT_MAX_DEG}
      >
        <div className="staff-pass meet-surface" data-ready={ready ? 'true' : 'false'} aria-hidden>
          <p className="staff-pass__brand">PLU ARG · Cuerpo de Staff</p>
          <p className="staff-pass__name" data-empty={fullName ? 'false' : 'true'}>
            {fullName || 'Tu nombre'}
          </p>
          <dl className="staff-pass__facts">
            <div>
              <dt>Cuerpo</dt>
              <dd>{BODY_LABELS[form.staffBody] ?? '—'}</dd>
            </div>
            <div>
              <dt>Talle</dt>
              <dd>{form.shirtSize || '—'}</dd>
            </div>
          </dl>
          <div className="staff-pass__foot">
            <span className="staff-pass__percent">{percent}%</span>
            <span className="staff-pass__state">{ready ? 'Lista para enviar' : 'Borrador'}</span>
          </div>
          <span className="staff-pass__bar">
            <i style={{ transform: `scaleX(${percent / 100})` }} />
          </span>
        </div>
      </TiltCard>

      <ol className="staff-rail__steps">
        {sections.map((section, index) => (
          <li
            key={section.id}
            className="staff-rail__step"
            data-state={section.complete ? 'done' : section.id === activeId ? 'active' : 'idle'}
          >
            <a href={`#${section.id}`} aria-current={section.id === activeId ? 'step' : undefined}>
              <span className="staff-rail__dot" aria-hidden>
                {section.complete ? <Check size={11} strokeWidth={3} /> : index + 1}
              </span>
              <span className="staff-rail__title">{section.title}</span>
              <span className="staff-rail__count">
                {section.done}/{section.total}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </aside>
  )
}
