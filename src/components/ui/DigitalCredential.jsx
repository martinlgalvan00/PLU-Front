import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, initials } from '../../lib/format.js'

export default function DigitalCredential({ athlete, membership }) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)
  const membershipActive = membership?.status === 'activa'
  const location = [athlete.city, athlete.province].filter(Boolean).join(', ')

  const backFields = [
    { key: 'document', label: t('account.credential.document'), value: athlete.documentId },
    { key: 'birthDate', label: t('account.credential.birthDate'), value: formatShortDate(athlete.birthDate) },
    { key: 'gym', label: t('account.credential.gym'), value: athlete.gym || t('account.credential.noData') },
    { key: 'location', label: t('account.credential.location'), value: location || t('account.credential.noData') },
    { key: 'sex', label: t('account.credential.sex'), value: athlete.sex },
    {
      key: 'expiration',
      label: t('account.credential.expiration'),
      value: membership?.expirationDate
        ? formatShortDate(membership.expirationDate)
        : t('account.credential.pending'),
    },
  ]

  return (
    <article className="account-credential">
      <div className={`account-credential__card${flipped ? ' is-flipped' : ''}`}>
        <div className="account-credential__face account-credential__front">
          <div className="account-credential__brand">
            <div className="account-credential__monogram">PLU</div>
            <div>
              <strong>Powerlifting United</strong>
              <span>{t('account.credential.brandLine')}</span>
            </div>
          </div>
          <div className="account-credential__identity">
            <span className="account-credential__avatar" aria-hidden>{initials(athlete.fullName)}</span>
            <div>
              <small>{t('account.credential.athlete')}</small>
              <h2>{athlete.fullName}</h2>
              {membership?.memberCode && <p>{membership.memberCode}</p>}
            </div>
          </div>
          <span className={`account-credential__status ${membershipActive ? 'is-active' : 'is-inactive'}`}>
            <span className="account-credential__status-dot" aria-hidden />
            {membershipActive ? t('account.membershipActive') : t('account.membershipInactive')}
          </span>
        </div>

        <div className="account-credential__face account-credential__back">
          <dl className="account-credential__fields">
            {backFields.map(({ key, label, value }) => (
              <div key={key} className="account-credential__row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="account-credential__footer">{t('account.credential.footer')}</p>
        </div>
      </div>
      <button type="button" className="account-credential__flip" onClick={() => setFlipped((value) => !value)}>
        {flipped ? t('account.credential.viewFront') : t('account.credential.viewBack')}
      </button>
    </article>
  )
}
