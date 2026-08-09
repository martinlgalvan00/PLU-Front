import { useI18n } from '../../i18n/I18nProvider.jsx'

const LOCALE_OPTIONS = [
  { code: 'es', short: 'ES' },
  { code: 'en', short: 'EN' },
]

export default function LanguageToggle({ compact = false, variant = 'switch' }) {
  const { locale, setLocale, t } = useI18n()
  const isEnglish = locale === 'en'
  const activeIndex = locale === 'en' ? 1 : 0

  if (variant === 'glyph') {
    const activeShort = isEnglish ? 'EN' : 'ES'
    const switchTitle = isEnglish ? t('locale.switchToEs') : t('locale.switchToEn')
    const switchLabel = `${t('locale.label')}: ${isEnglish ? t('locale.en') : t('locale.es')}`

    return (
      <button
        type="button"
        className={`locale-switch locale-switch--glyph${compact ? ' locale-switch--compact' : ''}`}
        data-locale={locale}
        aria-label={switchLabel}
        title={switchTitle}
        onClick={() => setLocale(isEnglish ? 'es' : 'en')}
      >
        <span className="locale-switch__glyph" aria-hidden>
          {activeShort}
        </span>
      </button>
    )
  }

  if (variant === 'segment') {
    return (
      <div
        className={`locale-switch locale-switch--segment${compact ? ' locale-switch--compact' : ''}`}
        role="group"
        aria-label={t('locale.label')}
        data-locale={locale}
        style={{ '--locale-active-index': activeIndex }}
      >
        <span className="locale-switch__segment-thumb" aria-hidden />
        {LOCALE_OPTIONS.map(({ code, short }) => {
          const active = locale === code
          const optionLabel = code === 'en' ? t('locale.en') : t('locale.es')
          const switchTitle = code === 'en' ? t('locale.switchToEn') : t('locale.switchToEs')

          return (
            <button
              key={code}
              type="button"
              className={`locale-switch__segment-option${active ? ' is-active' : ''}`}
              aria-pressed={active}
              aria-label={optionLabel}
              title={active ? optionLabel : switchTitle}
              onClick={() => setLocale(code)}
            >
              <span className="locale-switch__segment-label">{short}</span>
            </button>
          )
        })}
      </div>
    )
  }

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
      className={`locale-switch${compact ? ' locale-switch--compact' : ''}`}
      data-locale={locale}
      onClick={toggle}
    >
      <span className="locale-switch__track" aria-hidden>
        <span
          className={`locale-switch__thumb ${isEnglish ? 'locale-switch__thumb--en' : 'locale-switch__thumb--es'}`}
        />
        <span className="locale-switch__code locale-switch__code--es">ES</span>
        <span className="locale-switch__code locale-switch__code--en">EN</span>
      </span>
      {!compact && (
        <span className="locale-switch__label">{isEnglish ? t('locale.en') : t('locale.es')}</span>
      )}
    </button>
  )
}
