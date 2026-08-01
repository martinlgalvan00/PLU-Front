import { useContent } from '../../hooks/useContent.js'

export default function AboutSection() {
  const { ABOUT_INTRO, ABOUT_PILLARS } = useContent()
  const lead = ABOUT_INTRO.descriptionLead ?? ABOUT_INTRO.description
  const meta = ABOUT_INTRO.descriptionMeta

  return (
    <div className="about-section">
      <header className="about-section__head">
        <div className="about-section__intro">
          <p className="about-section__label">{ABOUT_INTRO.eyebrow}</p>
          <h2 className="about-section__title">
            <span className="about-section__title-line">{ABOUT_INTRO.titleLead}</span>
            <span className="about-section__title-line about-section__title-line--accent">
              {ABOUT_INTRO.titleAccent}
            </span>
          </h2>
        </div>

        <div className="about-section__copy">
          <p className="about-section__desc">{lead}</p>
          {meta ? <p className="about-section__meta">{meta}</p> : null}
        </div>
      </header>

      <ul className="about-section__pillars">
        {ABOUT_PILLARS.map(({ id, title, text }, index) => (
          <li key={id ?? title} className="about-section__pillar">
            <span className="about-section__pillar-index" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="about-section__pillar-title">{title}</h3>
            <p className="about-section__pillar-text">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
