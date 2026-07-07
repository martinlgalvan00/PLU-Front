import { useI18n } from '../../i18n/I18nProvider.jsx'
import { FlagAr, FlagUs } from './LocaleFlag.jsx'

export default function LanguageToggle({ compact = false }) {
  const { locale, setLocale, t } = useI18n()
  const isEnglish = locale === 'en'

  function toggle() {
    setLocale(isEnglish ? 'es' : 'en')
  }

  const switchLabel = `${t('locale.label')}: ${isEnglish ? t('locale.en') : t('locale.es')}`

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isEnglish}
      aria-label={switchLabel}
      title={isEnglish ? t('locale.switchToEs') : t('locale.switchToEn')}
      className={`locale-switch ${compact ? 'locale-switch--compact' : ''}`}
      data-locale={locale}
      onClick={toggle}
    >
      <span className="locale-switch__track" aria-hidden>
        <span className="locale-switch__code locale-switch__code--es">ES</span>
        <span className="locale-switch__code locale-switch__code--en">EN</span>
        <span className="locale-switch__flag locale-switch__flag--ar">
          <FlagAr title={t('locale.es')} />
        </span>
        <span className="locale-switch__flag locale-switch__flag--us">
          <FlagUs title={t('locale.en')} />
        </span>
        <span className={`locale-switch__thumb ${isEnglish ? 'locale-switch__thumb--en' : 'locale-switch__thumb--es'}`}>
          {isEnglish ? <FlagUs title={t('locale.en')} /> : <FlagAr title={t('locale.es')} />}
        </span>
      </span>
      {!compact && (
        <span className="locale-switch__label">{isEnglish ? t('locale.en') : t('locale.es')}</span>
      )}
    </button>
  )
}
