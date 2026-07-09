import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function MembersPluHero({ onHome, onNavigate, session }) {
  const { t } = useI18n()
  const isLoggedInAthlete = session?.role === 'athlete_plu'

  return (
    <header className="members-plu-hero">
      <nav className="members-plu-hero__breadcrumb" aria-label="Breadcrumb">
        <button type="button" onClick={onHome}>
          {t('design.home')}
        </button>
        <span aria-hidden>/</span>
        <span>{t('pages.members.heroBreadcrumb')}</span>
      </nav>

      <p className="members-plu-hero__chapter">{t('pages.members.heroChapter')}</p>
      <h1 className="members-plu-hero__title">{t('pages.members.heroTitle')}</h1>
      <p className="members-plu-hero__desc">{t('pages.members.heroDesc')}</p>

      <div className="members-plu-hero__account">
        {isLoggedInAthlete ? (
          <p className="members-plu-hero__signed-in">
            {t('pages.members.heroSignedIn', { name: session?.name ?? session?.email ?? '' })}
          </p>
        ) : (
          <>
            <span className="members-plu-hero__account-label">{t('pages.members.existingMember')}</span>
            <button type="button" className="members-plu-hero__account-link" onClick={() => onNavigate('login')}>
              {t('pages.members.loginLink')}
            </button>
            <span className="members-plu-hero__account-sep" aria-hidden>
              ·
            </span>
            <button type="button" className="members-plu-hero__account-link" onClick={() => onNavigate('register')}>
              {t('pages.members.registerLink')}
            </button>
          </>
        )}
      </div>
    </header>
  )
}
