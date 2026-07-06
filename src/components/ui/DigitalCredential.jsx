import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, initials } from '../../lib/format.js'

export default function DigitalCredential({ athlete, membership }) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)
  const membershipActive = membership?.status === 'activa'

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
          <div><small>{t('account.credential.document')}</small><strong>{athlete.documentId}</strong></div>
          <div><small>{t('account.credential.birthDate')}</small><strong>{formatShortDate(athlete.birthDate)}</strong></div>
          <div><small>{t('account.credential.gym')}</small><strong>{athlete.gym || t('account.credential.noData')}</strong></div>
          <div><small>{t('account.credential.location')}</small><strong>{[athlete.city, athlete.province].filter(Boolean).join(', ')}</strong></div>
          <div><small>{t('account.credential.sex')}</small><strong>{athlete.sex}</strong></div>
          <div><small>{t('account.credential.expiration')}</small><strong>{membership?.expirationDate ? formatShortDate(membership.expirationDate) : t('account.credential.pending')}</strong></div>
          <p>{t('account.credential.footer')}</p>
        </div>
      </div>
      <button type="button" className="account-credential__flip" onClick={() => setFlipped((value) => !value)}>
        {flipped ? t('account.credential.viewFront') : t('account.credential.viewBack')}
      </button>
    </article>
  )
}
