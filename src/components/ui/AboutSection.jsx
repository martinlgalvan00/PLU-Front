import { BookOpen, ClipboardList, MapPin, Trophy } from 'lucide-react'
import { ABOUT_INTRO } from '../../lib/content.js'
import Button from './Button.jsx'
import SectionHeading from './SectionHeading.jsx'

const ICONS = {
  BookOpen,
  ClipboardList,
  Trophy,
  MapPin,
}

// Números de acento por pilar para darle más impacto visual
const PILLAR_ACCENT = ['01', '02', '03', '04']

export default function AboutSection({ pillars, onNavigate }) {
  return (
    <div className="about-section">
      <SectionHeading
        align="left"
        eyebrow={ABOUT_INTRO.eyebrow}
        title={ABOUT_INTRO.title}
        description={ABOUT_INTRO.description}
      />

      <div className="about-pillars">
        {pillars.map(({ icon, title, text }, i) => {
          const Icon = ICONS[icon]
          return (
            <article key={title} className="about-pillar">
              <div className="about-pillar__num" aria-hidden>{PILLAR_ACCENT[i]}</div>
              <div className="about-pillar__icon" aria-hidden>
                {Icon && <Icon size={18} strokeWidth={1.5} />}
              </div>
              <div className="about-pillar__body">
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          )
        })}
      </div>

      <div className="about-actions">
        <Button variant="outline" onClick={() => onNavigate('rulebook')}>
          Ver reglamento
        </Button>
        <Button variant="ghost" onClick={() => onNavigate('members')}>
          Planes de afiliación
        </Button>
      </div>
    </div>
  )
}
