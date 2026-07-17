import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HeroStatusCard({ onSelect }) {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()
  const isButton = typeof onSelect === 'function'
  const Tag = isButton ? 'button' : 'aside'

  return (
    <Tag
      className={`hero-meta hero-meta--note${isButton ? ' hero-meta--action' : ''}`}
      aria-label={t('hero.statusNextMeet')}
      type={isButton ? 'button' : undefined}
      onClick={isButton ? onSelect : undefined}
    >
      <p className="hero-meta__label">{t('hero.statusNextMeet')}</p>
      <p className="hero-meta__meet">{t('hero.statusNextMeetValue')}</p>
      <div className="hero-meta__body">
        <p className="hero-meta__when">
          <time className="hero-meta__when-full" dateTime="2026-12-12">
            {PITBULL_CLASSIC.date}
          </time>
          <time className="hero-meta__when-short" dateTime="2026-12-12">
            {PITBULL_CLASSIC.dateShort}
          </time>
        </p>
        <p className="hero-meta__where">
          <span className="hero-meta__venue">{PITBULL_CLASSIC.venue}</span>
          <span className="hero-meta__sep" aria-hidden>
            {' '}
            ·{' '}
          </span>
          <span className="hero-meta__city">{PITBULL_CLASSIC.location}</span>
        </p>
      </div>
      <p className="hero-meta__status">
        <span className="hero-meta__status-dot" aria-hidden />
        {t('pages.pitbull.spotlight.registrationSoon')}
      </p>
    </Tag>
  )
}
