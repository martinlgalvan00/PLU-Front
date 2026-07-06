import { useState } from 'react'
import { CalendarDays, MapPin, RotateCcw } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function PitbullFeatureVisual({
  alt,
  categories = [],
  date,
  divisions = [],
  location,
  src,
  venue,
}) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)

  function toggleFlip() {
    setFlipped((value) => !value)
  }

  return (
    <button
      type="button"
      className={`pitbull-feature-flip${flipped ? ' is-flipped' : ''}`}
      onClick={toggleFlip}
      aria-pressed={flipped}
      aria-label={flipped ? t('pages.pitbull.flipShowPhoto') : t('pages.pitbull.flipShowDetails')}
    >
      <span className="pitbull-feature-flip__inner">
        <span className="pitbull-feature-flip__face pitbull-feature-flip__face--front">
          <img src={src} alt={alt} className="pitbull-feature-flip__img" loading="lazy" decoding="async" />
          <span className="pitbull-feature-flip__overlay" aria-hidden />
          <span className="pitbull-feature-flip__hint">{t('pages.pitbull.flipHint')}</span>
        </span>

        <span className="pitbull-feature-flip__face pitbull-feature-flip__face--back">
          <span className="pitbull-feature-flip__back">
            <span className="pitbull-feature-flip__back-eyebrow">{t('pages.pitbull.featureBackEyebrow')}</span>
            <span className="pitbull-feature-flip__back-row">
              <MapPin size={14} aria-hidden />
              <span>
                <strong>{venue}</strong>
                <small>{location}</small>
              </span>
            </span>
            <span className="pitbull-feature-flip__back-row">
              <CalendarDays size={14} aria-hidden />
              <span>{date}</span>
            </span>
            <span className="pitbull-feature-flip__tags" aria-label={t('pages.pitbull.featureBackCategories')}>
              {categories.map((category) => (
                <span key={category} className="pitbull-feature-flip__tag">
                  {category}
                </span>
              ))}
            </span>
            {divisions.length > 0 ? (
              <span className="pitbull-feature-flip__divisions">{divisions.join(' · ')}</span>
            ) : null}
          </span>
          <span className="pitbull-feature-flip__hint pitbull-feature-flip__hint--back">
            <RotateCcw size={12} aria-hidden />
            {t('pages.pitbull.flipBack')}
          </span>
        </span>
      </span>
    </button>
  )
}
