import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HeroStatusCard() {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()

  return (
    <aside className="hero-meta hero-meta--note" aria-label={t('hero.statusNextMeet')}>
      <p className="hero-meta__when">
        <time dateTime="2026-12-12">{PITBULL_CLASSIC.date}</time>
      </p>
      <p className="hero-meta__meet">{t('hero.statusNextMeetValue')}</p>
      <p className="hero-meta__where">
        {PITBULL_CLASSIC.venue}
        <span aria-hidden> · </span>
        {PITBULL_CLASSIC.location}
      </p>
      <p className="hero-meta__status">{t('pages.pitbull.spotlight.registrationSoon')}</p>
    </aside>
  )
}
