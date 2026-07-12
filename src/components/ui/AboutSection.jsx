import { useContent } from '../../hooks/useContent.js'

export default function AboutSection() {
  const { ABOUT_INTRO, ABOUT_PILLARS } = useContent()

  return (
    <div className="about-section">
      <header className="about-section__head">
        <p className="about-section__label">{ABOUT_INTRO.eyebrow}</p>
        <h2 className="about-section__title">
          <span className="about-section__title-line">{ABOUT_INTRO.titleLead}</span>
          <span className="about-section__title-line about-section__title-line--accent">
            {ABOUT_INTRO.titleAccent}
          </span>
        </h2>
        <p className="about-section__desc">{ABOUT_INTRO.description}</p>
      </header>

      <ul className="about-section__pillars">
        {ABOUT_PILLARS.map(({ id, title, text }) => (
          <li key={id ?? title} className="about-section__pillar">
            <h3 className="about-section__pillar-title">{title}</h3>
            <p className="about-section__pillar-text">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
