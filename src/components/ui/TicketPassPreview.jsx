import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { QrCode } from 'lucide-react'
import BrandLogo from './BrandLogo.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'

function hashSeed(value) {
  let hash = 2166136261
  const text = String(value || 'plu')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function buildPreviewCode(seed) {
  return `PREV-${hashSeed(seed).toString(36).toUpperCase().padStart(8, '0').slice(0, 8)}`
}

/**
 * Preview 3D de entrada digital.
 * Si no hay `qrCode`, genera un QR real de vista previa (no habilita ingreso).
 */
export default function TicketPassPreview({
  attendeeName = '',
  date = '',
  dayPassLabel = '',
  eventSlug = '',
  eventTitle = '',
  interactive = true,
  live = false,
  qrCode = '',
  quantity = 1,
  showHint = true,
  venue = '',
}) {
  const { t } = useI18n()
  const labelId = useId()
  const stageRef = useRef(null)
  const [qrSrc, setQrSrc] = useState('')
  const [tilt, setTilt] = useState({ rx: 8, ry: -12, mx: 58, my: 28 })
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const displayName = attendeeName?.trim() || t('pages.ticketsPage.passGuest')
  const seed = `${eventTitle}|${displayName}|${dayPassLabel}|${quantity}|${eventSlug}|${qrCode}`
  const previewCode = useMemo(() => (qrCode ? String(qrCode) : buildPreviewCode(seed)), [qrCode, seed])
  const isPreviewQr = !qrCode

  useEffect(() => {
    let cancelled = false
    const url = buildCredentialUrl({
      code: previewCode,
      eventSlug: eventSlug || 'preview',
      type: 'ticket',
    })

    generateCredentialQr(url)
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrSrc('')
      })

    return () => {
      cancelled = true
    }
  }, [eventSlug, previewCode])

  function handlePointerMove(event) {
    if (!interactive || reducedMotion || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    const clampedX = Math.min(1, Math.max(0, px))
    const clampedY = Math.min(1, Math.max(0, py))
    setTilt({
      rx: (0.5 - clampedY) * 16,
      ry: (clampedX - 0.5) * 22,
      mx: clampedX * 100,
      my: clampedY * 100,
    })
  }

  function handlePointerLeave() {
    if (!interactive || reducedMotion) return
    setTilt({ rx: 8, ry: -12, mx: 58, my: 28 })
  }

  const cardStyle = reducedMotion
    ? undefined
    : {
        '--ticket-rx': `${tilt.rx.toFixed(2)}deg`,
        '--ticket-ry': `${tilt.ry.toFixed(2)}deg`,
        '--ticket-mx': `${tilt.mx.toFixed(1)}%`,
        '--ticket-my': `${tilt.my.toFixed(1)}%`,
      }

  return (
    <div
      className={[
        'ticket-pass-preview',
        live ? 'ticket-pass-preview--live' : '',
        interactive && !reducedMotion ? 'ticket-pass-preview--interactive' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        ref={stageRef}
        className="ticket-pass-preview__stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <article
          className="ticket-pass-preview__card"
          style={cardStyle}
          aria-labelledby={labelId}
        >
          <div className="ticket-pass-preview__shine" aria-hidden />

          <div className="ticket-pass-preview__stub">
            <header className="ticket-pass-preview__stub-head">
              <div className="ticket-pass-preview__brand-row">
                <BrandLogo
                  variant="letterhead"
                  letterheadBlend
                  imgClassName="ticket-pass-preview__logo"
                  height={18}
                />
                <span className="ticket-pass-preview__brand">{t('pages.ticketsPage.passBrand')}</span>
              </div>
              <strong id={labelId} className="ticket-pass-preview__event">
                {eventTitle || t('pages.ticketsPage.eventFallback')}
              </strong>
            </header>

            <dl className="ticket-pass-preview__meta">
              {date ? (
                <div>
                  <dt>{t('pages.ticketsPage.date')}</dt>
                  <dd>{date}</dd>
                </div>
              ) : null}
              {venue ? (
                <div>
                  <dt>{t('pages.ticketsPage.venue')}</dt>
                  <dd>{venue}</dd>
                </div>
              ) : null}
              {dayPassLabel ? (
                <div>
                  <dt>{t('pages.tickets.day')}</dt>
                  <dd>{dayPassLabel}</dd>
                </div>
              ) : null}
            </dl>

            <footer className="ticket-pass-preview__stub-foot">
              <div className="ticket-pass-preview__guest-block">
                <span className="ticket-pass-preview__guest-label">{t('pages.ticketsPage.passGuestLabel')}</span>
                <p className="ticket-pass-preview__guest">{displayName}</p>
                {quantity > 1 ? (
                  <span className="ticket-pass-preview__qty">
                    {t('pages.tickets.confirmationCount_other', { count: quantity })}
                  </span>
                ) : null}
              </div>
              <span className="ticket-pass-preview__code">{previewCode}</span>
            </footer>
          </div>

          <div className="ticket-pass-preview__perforation" aria-hidden />

          <div className="ticket-pass-preview__qr-pane">
            <span className="ticket-pass-preview__qr-label">{t('pages.ticketsPage.passQrLabel')}</span>
            <div className="ticket-pass-preview__qr" aria-hidden>
              {qrSrc ? (
                <img src={qrSrc} alt="" className="ticket-pass-preview__qr-img" />
              ) : (
                <span className="ticket-pass-preview__qr-fallback">
                  <QrCode size={44} strokeWidth={1.5} />
                </span>
              )}
            </div>
            <span className="ticket-pass-preview__qr-hint">
              {isPreviewQr
                ? live
                  ? t('pages.ticketsPage.passQrLive')
                  : t('pages.ticketsPage.passQrTeaser')
                : t('pages.ticketsPage.passQrReady')}
            </span>
          </div>
        </article>
      </div>
      {interactive && showHint && !reducedMotion ? (
        <p className="ticket-pass-preview__hint">{t('pages.ticketsPage.passMoveHint')}</p>
      ) : null}
    </div>
  )
}
