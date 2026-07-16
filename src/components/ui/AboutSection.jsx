import { ClipboardList, Globe2, Users } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'

const PILLAR_ICONS = {
  Globe2,
  ClipboardList,
  Users,
}

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
        {ABOUT_PILLARS.map(({ id, icon, title, text }, index) => {
          const Icon = PILLAR_ICONS[icon]
          return (
            <li key={id ?? title} className="about-section__pillar">
              <div className="about-section__pillar-top">
                {Icon ? (
                  <span className="about-section__pillar-icon" aria-hidden>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                ) : null}
                <span className="about-section__pillar-index" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="about-section__pillar-body">
                <h3 className="about-section__pillar-title">{title}</h3>
                <p className="about-section__pillar-text">{text}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
