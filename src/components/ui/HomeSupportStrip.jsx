import { ArrowRight } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'

export default function HomeSupportStrip({ onNavigate }) {
  const { HOME_FAQ } = useContent()

  return (
    <div className="home-support-strip">
      <div className="home-support-strip__copy">
        <p className="home-support-strip__eyebrow">{HOME_FAQ.eyebrow}</p>
        <h2 className="home-support-strip__title">{HOME_FAQ.title}</h2>
        <p className="home-support-strip__desc">{HOME_FAQ.description}</p>
      </div>

      <div className="home-support-strip__actions" role="group" aria-label={HOME_FAQ.eyebrow}>
        <button
          type="button"
          className="home-support-strip__cta motion-icon-shift"
          onClick={() => onNavigate?.('faq')}
        >
          {HOME_FAQ.ctaFaq}
          <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
        </button>
        <button
          type="button"
          className="home-support-strip__link"
          onClick={() => onNavigate?.('contact')}
        >
          {HOME_FAQ.ctaContact}
        </button>
      </div>
    </div>
  )
}
