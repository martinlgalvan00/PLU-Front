import { Pencil, AlertCircle } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import DigitalCredential from '../../components/ui/DigitalCredential.jsx'
import { formatShortDate } from '../../lib/format.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'
import { resolveSessionIdentity } from '../../lib/roles.js'

export default function ProfileHero({
  athlete,
  membership,
  athleteRegistrations,
  nextEvent,
  onNavigateSection,
  session = null,
}) {
  const { t } = useI18n()
  const activeRegistrations = athleteRegistrations.filter((item) => item.status !== 'cancelada')
  const profileStatus = isProfileComplete(athlete)
  const identity = resolveSessionIdentity(session)
  const roleEyebrow =
    identity.mode === 'admin'
      ? (identity.roleLabel ?? t('nav.roleAdmin'))
      : t('nav.roleAthlete')

  const registrationCount = activeRegistrations.length
  const memberSince = membership?.startDate ? formatShortDate(membership.startDate) : null

  return (
    <section className="account-hero">
      <div className="account-hero__inner">
        <div className="account-hero__identity-col">
          <div className="account-hero__copy">
            <span className="account-hero__eyebrow">{roleEyebrow}</span>
            <h1 className="account-hero__name">{athlete.fullName}</h1>
            {identity.staffAccess ? (
              <p className="account-hero__role">{t('nav.roleStaffAccess')}</p>
            ) : null}
          </div>

          <p className="account-hero__meta">
            <span className="account-hero__meta-regs">
              {t(
                `account.hero.activeRegistrations_${registrationCount === 1 ? 'one' : 'other'}`,
                { count: registrationCount },
              )}
            </span>
            {nextEvent?.title ? (
              <>
                <span className="account-hero__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="account-hero__meta-event">{nextEvent.title}</span>
              </>
            ) : null}
            {memberSince ? (
              <>
                <span className="account-hero__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="account-hero__meta-since">
                  {t('account.hero.memberSince')} {memberSince}
                </span>
              </>
            ) : null}
          </p>

          <button
            type="button"
            className="account-hero__edit-link"
            onClick={() => onNavigateSection('account-personal-data')}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            <span>{t('account.hero.editData')}</span>
            {!profileStatus.complete ? (
              <span
                className="account-hero__profile-badge account-hero__profile-badge--warn"
                aria-label={t(
                  `account.personalData.profileIncomplete_${profileStatus.missing.length === 1 ? 'one' : 'other'}`,
                  { count: profileStatus.missing.length },
                )}
              >
                <AlertCircle size={12} aria-hidden />
                {profileStatus.missing.length}
              </span>
            ) : null}
          </button>
        </div>

        <DigitalCredential athlete={athlete} membership={membership} />
      </div>
    </section>
  )
}
