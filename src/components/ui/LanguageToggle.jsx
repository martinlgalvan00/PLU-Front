import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function LanguageToggle({ compact = false }) {
  const { locale, setLocale, t } = useI18n()

  function toggle() {
    setLocale(locale === 'es' ? 'en' : 'es')
  }

  return (
    <button
      type="button"
      className={`pref-toggle ${compact ? 'pref-toggle--compact' : ''}`}
      onClick={toggle}
      aria-label={t('locale.label')}
      title={t('locale.label')}
    >
      <span className="pref-toggle__lang">{locale === 'es' ? 'EN' : 'ES'}</span>
      {!compact && <span>{locale === 'es' ? t('locale.en') : t('locale.es')}</span>}
    </button>
  )
}
