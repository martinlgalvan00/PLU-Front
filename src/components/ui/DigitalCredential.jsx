import '../../styles/components/account-credential.css'
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, initials } from '../../lib/format.js'
import { hasCelebrated, markCelebrated } from '../../lib/celebration.js'
import {
  buildAthleteCredentialUrl,
  generateCredentialQr,
  resolveCredentialCode,
} from '../../lib/credentialQr.js'
import CredentialQr from './CredentialQr.jsx'
import TiltCard from '../../motion/TiltCard.tsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

/**
 * DigitalCredential — PLU ARG
 *
 * Credencial del atleta con flip 3D: frente de identidad (marca, foto,
 * nombre, código y vigencia) y reverso operativo (datos personales en grilla
 * + el QR de verificación que se escanea en la puerta).
 *
 * El QR usa `resolveCredentialCode`, la misma regla que la sección Mi QR y la
 * card compartible: si cada superficie resolviera su código, la misma persona
 * vería QRs distintos según por dónde entrara.
 *
 * El flip vive en `.account-credential__card`: ese nodo no puede llevar
 * isolation, overflow ni filter, porque cualquier propiedad de agrupación
 * fuerza `transform-style: flat` y el giro se degrada a un espejo 2D.
 *
 * ── Rito de emisión ──
 * La primera vez que alguien ve su credencial acreditada, la pieza se emite
 * delante suyo: la placa entra, la firma oro se traza de arriba a abajo, el
 * contenido se graba en orden y un barrido de luz cruza la card una vez
 * (`data-issued`). Después de eso la credencial entra como cualquier otra
 * superficie — un rito que se repite deja de ser un rito.
 *
 * No lleva ráfaga de papel a propósito: el confeti de "credencial emitida"
 * ya vive en el acuse de la sección Mi QR (ver QrCredentialSection) y la
 * federación festeja una vez. Acá el festejo es la pieza misma.
 */
export default function DigitalCredential({ athlete, membership }) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const [flipped, setFlipped] = useState(false)
  // El giro con peso (se aleja y vuelve) solo puede dispararse después del
  // primer toggle: en el estado inicial la animación se ejecutaría al montar.
  const [flipTouched, setFlipTouched] = useState(false)
  const membershipActive = membership?.status === 'activa'
  const canFlip = membershipActive
  const isFlipped = canFlip && flipped

  /* Clave propia, distinta de la que gobierna la ráfaga
     (`credential.<athleteId>.<code>`): son dos gestos independientes y el rito
     de emisión no debe apagar el acuse de la sección Mi QR ni al revés. Una
     renovación con código nuevo vuelve a emitirse. */
  const issueKey =
    membershipActive && membership?.memberCode ? `credential-issue.${membership.memberCode}` : null
  const [isFirstIssue] = useState(
    () => Boolean(issueKey) && !reducedMotion && !hasCelebrated(issueKey),
  )

  useEffect(() => {
    if (!isFirstIssue || !issueKey) return
    markCelebrated(issueKey)
  }, [isFirstIssue, issueKey])

  /* El QR se genera con import dinámico y se cachea por URL en la lib, así que
     montarlo acá no re-encodea nada si la sección Mi QR ya lo pidió. Solo se
     pide cuando hay dorso: sin afiliación activa la card no gira. */
  const credentialCode = resolveCredentialCode({ athlete, membership })
  const [qrSrc, setQrSrc] = useState(null)
  const [qrFailed, setQrFailed] = useState(false)

  useEffect(() => {
    if (!canFlip || !credentialCode) {
      setQrSrc(null)
      setQrFailed(false)
      return undefined
    }
    let cancelled = false
    setQrFailed(false)
    generateCredentialQr(buildAthleteCredentialUrl(credentialCode))
      .then((dataUrl) => {
        if (cancelled) return
        setQrSrc(dataUrl)
      })
      .catch(() => {
        if (cancelled) return
        setQrSrc(null)
        setQrFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [canFlip, credentialCode])
  const location = [athlete.city, athlete.province].filter(Boolean).join(', ')
  const watermarkYear = String(new Date().getFullYear()).slice(-2)
  const expiration = membership?.expirationDate
    ? formatShortDate(membership.expirationDate)
    : t('account.credential.pending')

  const frontMeta = [
    membership?.memberCode
      ? {
          key: 'code',
          label: t('account.credential.memberCode'),
          value: membership.memberCode,
          mono: true,
        }
      : null,
    membershipActive
      ? { key: 'expiration', label: t('account.credential.expiration'), value: expiration }
      : null,
  ].filter(Boolean)

  const backFields = canFlip
    ? [
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
          value: expiration,
        },
      ]
    : []

  function toggleFlip() {
    if (!canFlip) return
    setFlipTouched(true)
    setFlipped((value) => !value)
  }

  function handleCardKeyDown(event) {
    if (!canFlip) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleFlip()
    }
  }

  return (
    <article className="account-credential" data-issued={isFirstIssue ? '1' : '0'}>
      <TiltCard
        className="account-credential__tilt"
        innerClassName="tilt-card__inner account-credential__tilt-inner"
        maxTilt={isFlipped ? 0 : 3}
      >
        <div
          className="account-credential__card"
          data-flipped={isFlipped ? '1' : '0'}
          data-flippable={canFlip ? '1' : '0'}
          data-flip-touched={flipTouched ? '1' : '0'}
          data-issued={isFirstIssue ? '1' : '0'}
          role={canFlip ? 'button' : undefined}
          tabIndex={canFlip ? 0 : undefined}
          aria-pressed={canFlip ? isFlipped : undefined}
          aria-label={
            canFlip
              ? isFlipped
                ? t('account.credential.viewFront')
                : t('account.credential.viewBack')
              : undefined
          }
          onClick={canFlip ? toggleFlip : undefined}
          onKeyDown={canFlip ? handleCardKeyDown : undefined}
        >
          <div
            className="account-credential__face account-credential__face--front"
            aria-hidden={isFlipped}
          >
            <span className="account-credential__grain" aria-hidden />
            {/* Barrido de emisión: cruza la placa una sola vez y queda
                inerte. Solo transform + opacity. */}
            {isFirstIssue ? <span className="account-credential__sheen" aria-hidden /> : null}
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
              </div>
            </div>

            <div className="account-credential__foot">
              {frontMeta.length ? (
                <dl className="account-credential__meta">
                  {frontMeta.map(({ key, label, value, mono }) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd className={mono ? 'account-credential__code' : undefined}>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <span
                className={`account-credential__status ${membershipActive ? 'is-active' : 'is-inactive'}`}
              >
                <span className="account-credential__status-dot" aria-hidden />
                {membershipActive ? t('account.membershipActive') : t('account.membershipInactive')}
              </span>
            </div>
          </div>

          {canFlip ? (
            <div
              className="account-credential__face account-credential__face--back"
              aria-hidden={!isFlipped}
            >
              <span className="account-credential__grain" aria-hidden />

              <div className="account-credential__back-head">
                <span className="account-credential__monogram" aria-hidden>
                  PLU
                </span>
                <span className="account-credential__back-eyebrow">
                  {t('account.credential.brandLine')}
                </span>
              </div>

              <div className="account-credential__back-main">
                <dl className="account-credential__fields">
                  {backFields.map(({ key, label, value }) => (
                    <div key={key} className="account-credential__row">
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>

                {/* La cara operativa: lo que el staff escanea en la puerta. */}
                <div className="account-credential__back-qr">
                  <CredentialQr
                    className="account-credential__qr-chip"
                    src={qrSrc}
                    alt={t('account.qr.imageAlt')}
                    failed={qrFailed}
                    size="sm"
                  />
                  <span className="account-credential__qr-caption">
                    {t('account.qr.cardScanHint')}
                  </span>
                </div>
              </div>

              <div className="account-credential__back-foot">
                {membership?.memberCode ? (
                  <span className="account-credential__back-code">{membership.memberCode}</span>
                ) : null}
                <p className="account-credential__footer">{t('account.credential.footer')}</p>
              </div>
            </div>
          ) : null}
        </div>
      </TiltCard>

      {canFlip ? (
        <>
          <p className="account-credential__hint" aria-hidden="true">
            {isFlipped ? t('account.credential.tapFrontHint') : t('account.credential.tapBackHint')}
          </p>

          <button
            type="button"
            className="account-credential__flip"
            aria-pressed={isFlipped}
            onClick={toggleFlip}
          >
            <span className="account-credential__flip-label">
              {isFlipped ? t('account.credential.viewFront') : t('account.credential.viewBack')}
            </span>
            <span className="account-credential__flip-faces" aria-hidden>
              <span className={`account-credential__flip-face${!isFlipped ? ' is-active' : ''}`} />
              <span className={`account-credential__flip-face${isFlipped ? ' is-active' : ''}`} />
            </span>
          </button>
        </>
      ) : null}
    </article>
  )
}
