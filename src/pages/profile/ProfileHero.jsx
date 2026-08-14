import { Pencil, CheckCircle2, AlertCircle } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import DigitalCredential from '../../components/ui/DigitalCredential.jsx'
import { formatShortDate, initials } from '../../lib/format.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'

export default function ProfileHero({ athlete, membership, athleteRegistrations, nextEvent, onNavigateSection }) {
  const { t } = useI18n()
  const membershipActive = membership?.status === 'activa'
  const activeRegistrations = athleteRegistrations.filter((item) => item.status !== 'cancelada')
  const profileStatus = isProfileComplete(athlete)

  return (
    <section className="account-hero">
      <div className="account-hero__inner">
        <div className="account-hero__identity-col">
          <div className="account-hero__identity">
            <div className="account-hero__avatar" aria-hidden>
              {athlete.photoUrl ? <img src={athlete.photoUrl} alt="" /> : initials(athlete.fullName)}
            </div>
            <div className="account-hero__copy">
              <span className="account-hero__eyebrow">{t('account.eyebrow')}</span>
              <h1 className="account-hero__name">{athlete.fullName}</h1>
              <div className="account-hero__badges">
                <span className={`account-badge ${membershipActive ? 'account-badge--active' : 'account-badge--pending'}`}>
                  {membershipActive ? t('account.membershipActive') : t('account.membershipInactive')}
                </span>
                {membership?.memberCode && <span className="account-badge account-badge--code">{membership.memberCode}</span>}
              </div>
            </div>
          </div>

          <div className="account-hero__stats" role="list">
            {membership?.startDate && (
              <div className="account-hero__stat" role="listitem">
                <span>{t('account.hero.memberSince')}</span>
                <span className="account-hero__stat-value">{formatShortDate(membership.startDate)}</span>
              </div>
            )}
            <div className="account-hero__stat account-hero__stat--count" role="listitem">
              <span>{t('account.hero.activeRegistrations')}</span>
              <span className="account-hero__stat-value">{activeRegistrations.length}</span>
            </div>
            {nextEvent && (
              <div className="account-hero__stat account-hero__stat--event" role="listitem">
                <span>{t('account.hero.nextEvent')}</span>
                <span className="account-hero__stat-value">{nextEvent.title}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="account-hero__edit-link"
            onClick={() => onNavigateSection('account-personal-data')}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            <span>{t('account.hero.editData')}</span>
            {/* Badge inline de completitud en el botón */}
            {profileStatus.complete ? (
              <span className="account-hero__profile-badge account-hero__profile-badge--ok" aria-label={t('account.personalData.profileComplete')}>
                <CheckCircle2 size={12} aria-hidden />
              </span>
            ) : (
              <span className="account-hero__profile-badge account-hero__profile-badge--warn" aria-label={t(`account.personalData.profileIncomplete_${profileStatus.missing.length === 1 ? 'one' : 'other'}`, { count: profileStatus.missing.length })}>
                <AlertCircle size={12} aria-hidden />
                {profileStatus.missing.length}
              </span>
            )}
          </button>
        </div>

        <DigitalCredential athlete={athlete} membership={membership} />
      </div>
    </section>
  )
}
