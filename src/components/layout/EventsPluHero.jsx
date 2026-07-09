import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function EventsPluHero({ onHome }) {
  const { t } = useI18n()

  return (
    <header className="events-plu-hero">
      <nav className="events-plu-hero__breadcrumb" aria-label="Breadcrumb">
        <button type="button" onClick={onHome}>
          {t('design.home')}
        </button>
        <span aria-hidden>/</span>
        <span>{t('pages.events.heroBreadcrumb')}</span>
      </nav>

      <p className="events-plu-hero__chapter">{t('pages.events.heroChapter')}</p>
      <h1 className="events-plu-hero__title">{t('pages.events.heroTitle')}</h1>
      <p className="events-plu-hero__desc">{t('pages.events.heroDesc')}</p>
    </header>
  )
}
