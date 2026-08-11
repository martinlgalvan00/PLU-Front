import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, initials } from '../../lib/format.js'
import TiltCard from '../../motion/TiltCard.tsx'

export default function DigitalCredential({ athlete, membership }) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)
  const membershipActive = membership?.status === 'activa'
  const location = [athlete.city, athlete.province].filter(Boolean).join(', ')
  const watermarkYear = String(new Date().getFullYear()).slice(-2)

  const backFields = [
    { key: 'document', label: t('account.credential.document'), value: athlete.documentId },
    {
      key: 'birthDate',
      label: t('account.credential.birthDate'),
      value: formatShortDate(athlete.birthDate),
    },
    {
      key: 'gym',
      label: t('account.credential.gym'),
      value: athlete.gym || t('account.credential.noData'),
    },
    {
      key: 'location',
      label: t('account.credential.location'),
      value: location || t('account.credential.noData'),
    },
    { key: 'sex', label: t('account.credential.sex'), value: athlete.sex },
    {
      key: 'expiration',
      label: t('account.credential.expiration'),
      value: membership?.expirationDate
        ? formatShortDate(membership.expirationDate)
        : t('account.credential.pending'),
    },
  ]

  function toggleFlip() {
    setFlipped((value) => !value)
  }

  function handleCardKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleFlip()
    }
  }

  return (
    <article className="account-credential">
      <TiltCard
        className="account-credential__tilt"
        innerClassName="tilt-card__inner account-credential__tilt-inner"
        maxTilt={flipped ? 0 : 3}
      >
        <div
          className="account-credential__card"
          data-flipped={flipped ? '1' : '0'}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={
            flipped ? t('account.credential.viewFront') : t('account.credential.viewBack')
          }
          onClick={toggleFlip}
          onKeyDown={handleCardKeyDown}
        >
          <div
            className="account-credential__face account-credential__face--front"
            aria-hidden={flipped}
          >
            <span className="account-credential__grain" aria-hidden />
            <span className="account-credential__watermark" aria-hidden>
              {watermarkYear}
            </span>

            <div className="account-credential__brand">
              <span className="account-credential__monogram" aria-hidden>
                PLU
              </span>
              <div className="account-credential__brand-copy">
                <strong>Powerlifting United</strong>
                <span>{t('account.credential.brandLine')}</span>
              </div>
            </div>

            <div className="account-credential__identity">
              <span
                className={`account-credential__avatar${athlete.photoUrl ? ' has-photo' : ''}`}
                aria-hidden
              >
                {athlete.photoUrl ? (
                  <img src={athlete.photoUrl} alt="" />
                ) : (
                  initials(athlete.fullName)
                )}
              </span>
              <div className="account-credential__identity-copy">
                <small>{t('account.credential.athlete')}</small>
                <h2>{athlete.fullName}</h2>
                {membership?.memberCode ? <p>{membership.memberCode}</p> : null}
              </div>
            </div>

            <div className="account-credential__foot">
              <span
                className={`account-credential__status ${membershipActive ? 'is-active' : 'is-inactive'}`}
              >
                <span className="account-credential__status-dot" aria-hidden />
                {membershipActive ? t('account.membershipActive') : t('account.membershipInactive')}
              </span>
            </div>
          </div>

          <div
            className="account-credential__face account-credential__face--back"
            aria-hidden={!flipped}
          >
            <span className="account-credential__grain" aria-hidden />
            <div className="account-credential__back-head">
              <span className="account-credential__back-eyebrow">{t('account.credential.athlete')}</span>
              <p className="account-credential__back-name">{athlete.fullName}</p>
            </div>
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
      </TiltCard>

      <p className="account-credential__hint" aria-hidden="true">
        {flipped ? t('account.credential.tapFrontHint') : t('account.credential.tapBackHint')}
      </p>

      <button
        type="button"
        className="account-credential__flip"
        aria-pressed={flipped}
        onClick={toggleFlip}
      >
        <span className="account-credential__flip-label">
          {flipped ? t('account.credential.viewFront') : t('account.credential.viewBack')}
        </span>
        <span className="account-credential__flip-faces" aria-hidden>
          <span className={`account-credential__flip-face${!flipped ? ' is-active' : ''}`} />
          <span className={`account-credential__flip-face${flipped ? ' is-active' : ''}`} />
        </span>
      </button>
    </article>
  )
}
