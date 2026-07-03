import { ABOUT_INTRO } from '../../lib/content.js'
import Button from './Button.jsx'
import SectionHeading from './SectionHeading.jsx'

const PILLAR_NUMBERS = ['01', '02', '03']

export default function AboutSection({ pillars, onNavigate }) {
  return (
    <div className="about-section">
      <SectionHeading
        align="left"
        eyebrow={ABOUT_INTRO.eyebrow}
        title={ABOUT_INTRO.title}
        description={ABOUT_INTRO.description}
      />

      <div className="about-pillars about-pillars--design">
        {pillars.map(({ title, text }, i) => (
          <article key={title} className="about-pillar about-pillar--design">
            <div className="about-pillar__num" aria-hidden>
              {PILLAR_NUMBERS[i]}
            </div>
            <div className="about-pillar__body">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </article>
        ))}
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
