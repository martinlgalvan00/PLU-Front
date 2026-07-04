import { ABOUT_INTRO } from '../../lib/content.js'
import SectionHeading from './SectionHeading.jsx'

export default function AboutSection({ pillars }) {
  return (
    <div className="about-section">
      <SectionHeading
        align="left"
        variant="ref"
        eyebrow={ABOUT_INTRO.eyebrow}
        title={ABOUT_INTRO.title}
        description={ABOUT_INTRO.description}
      />

      <ul className="about-section__pillars">
        {pillars.map(({ id, title, text }, index) => (
          <li key={id ?? title} className="about-pillar-card surface-card">
            <span className="about-pillar-card__index" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <strong className="about-pillar-card__title">{title}</strong>
            <p className="about-pillar-card__text">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
