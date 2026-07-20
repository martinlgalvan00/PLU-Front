import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, initials } from '../../lib/format.js'

export default function DigitalCredential({ athlete, membership }) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)
  const tiltRef = useRef(null)
  const animationFrameRef = useRef(null)
  const membershipActive = membership?.status === 'activa'
  const location = [athlete.city, athlete.province].filter(Boolean).join(', ')

  useEffect(
    () => () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    },
    [],
  )

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

  function resetTilt() {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)

    const tilt = tiltRef.current
    if (!tilt) return

    tilt.classList.remove('is-tilting')
    tilt.style.removeProperty('--credential-tilt-x')
    tilt.style.removeProperty('--credential-tilt-y')
    tilt.style.removeProperty('--credential-glow-x')
    tilt.style.removeProperty('--credential-glow-y')
  }

  function handlePointerMove(event) {
    if (event.pointerType === 'touch') return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const tilt = tiltRef.current
    if (!tilt) return

    const bounds = tilt.getBoundingClientRect()
    const horizontal = (event.clientX - bounds.left) / bounds.width
    const vertical = (event.clientY - bounds.top) / bounds.height
    const rotateX = (0.5 - vertical) * 9
    const rotateY = (horizontal - 0.5) * 11

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = requestAnimationFrame(() => {
      tilt.classList.add('is-tilting')
      tilt.style.setProperty('--credential-tilt-x', `${rotateX.toFixed(2)}deg`)
      tilt.style.setProperty('--credential-tilt-y', `${rotateY.toFixed(2)}deg`)
      tilt.style.setProperty('--credential-glow-x', `${(horizontal * 100).toFixed(1)}%`)
      tilt.style.setProperty('--credential-glow-y', `${(vertical * 100).toFixed(1)}%`)
    })
  }

  return (
    <article className="account-credential">
      <div
        ref={tiltRef}
        className="account-credential__tilt"
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        onPointerCancel={resetTilt}
      >
        <div className={`account-credential__card${flipped ? ' is-flipped' : ''}`}>
          <div className="account-credential__face account-credential__front" aria-hidden={flipped}>
            <div className="account-credential__brand">
              <div className="account-credential__monogram">PLU</div>
              <div>
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
              <div>
                <small>{t('account.credential.athlete')}</small>
                <h2>{athlete.fullName}</h2>
                {membership?.memberCode && <p>{membership.memberCode}</p>}
              </div>
            </div>
            <span
              className={`account-credential__status ${membershipActive ? 'is-active' : 'is-inactive'}`}
            >
              <span className="account-credential__status-dot" aria-hidden />
              {membershipActive ? t('account.membershipActive') : t('account.membershipInactive')}
            </span>
          </div>

          <div className="account-credential__face account-credential__back" aria-hidden={!flipped}>
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
      </div>
      <button
        type="button"
        className="account-credential__flip"
        aria-pressed={flipped}
        onClick={() => setFlipped((value) => !value)}
      >
        {flipped ? t('account.credential.viewFront') : t('account.credential.viewBack')}
      </button>
    </article>
  )
}
