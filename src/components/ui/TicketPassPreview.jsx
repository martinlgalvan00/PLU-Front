import '../../styles/components/ticket-pass-preview.css'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { m } from 'motion/react'
import { QrCode } from 'lucide-react'
import BrandLogo from './BrandLogo.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'
import { getDeviceTier } from '../../motion/deviceTier.ts'
import { MOTION_DURATION, MOTION_EASE, MOTION_TIER_SCALE, TILT_MAX_DEG } from '../../motion/tokens.ts'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'

/** Reposo elegante: la entrada queda apenas inclinada, como un objeto
 * fotografiado en ángulo, siempre dentro de TILT_MAX_DEG. */
const RESTING_TILT = { rx: TILT_MAX_DEG * 0.5, ry: -TILT_MAX_DEG * 0.66 }

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
  const [tilt, setTilt] = useState(RESTING_TILT)
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])
  // Igual criterio que TiltCard: sin puntero fino no hay tracking (touch ya
  // tiene su propio gesto de scroll), y la amplitud se escala por tier para
  // no sostener el tracking a pleno en equipos limitados.
  const canTilt = useMemo(() => !reducedMotion && hasFinePointer(), [reducedMotion])
  const tiltScale = useMemo(() => MOTION_TIER_SCALE[getDeviceTier()], [])

  const displayName = attendeeName?.trim() || t('pages.ticketsPage.passGuest')
  const seed = `${eventTitle}|${displayName}|${dayPassLabel}|${quantity}|${eventSlug}|${qrCode}`
  const previewCode = useMemo(
    () => (qrCode ? String(qrCode) : buildPreviewCode(seed)),
    [qrCode, seed],
  )
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
    if (!interactive || !canTilt || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    const clampedX = Math.min(1, Math.max(0, px))
    const clampedY = Math.min(1, Math.max(0, py))
    // Amplitud tope TILT_MAX_DEG (6°) a cada lado del centro — pieza
    // protagonista, pero sin pasarse del presupuesto de 3D contenido.
    setTilt({
      rx: (0.5 - clampedY) * TILT_MAX_DEG * 2 * tiltScale,
      ry: (clampedX - 0.5) * TILT_MAX_DEG * 2 * tiltScale,
    })
  }

  function handlePointerLeave() {
    if (!interactive || !canTilt) return
    setTilt(RESTING_TILT)
  }

  const cardStyle = reducedMotion
    ? undefined
    : {
        '--ticket-rx': `${tilt.rx.toFixed(2)}deg`,
        '--ticket-ry': `${tilt.ry.toFixed(2)}deg`,
      }

  const Root = reducedMotion ? 'div' : m.div
  const rootMotionProps = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic },
      }

  return (
    <Root
      className={[
        'ticket-pass-preview',
        !isPreviewQr ? 'ticket-pass-preview--ready' : '',
        interactive && canTilt ? 'ticket-pass-preview--interactive' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rootMotionProps}
    >
      <div
        ref={stageRef}
        className="ticket-pass-preview__stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <article className="ticket-pass-preview__card" style={cardStyle} aria-labelledby={labelId}>
          <div className="ticket-pass-preview__stub">
            <header className="ticket-pass-preview__stub-head">
              <div className="ticket-pass-preview__brand-row">
                <BrandLogo
                  variant="letterhead"
                  letterheadBlend
                  imgClassName="ticket-pass-preview__logo"
                  height={18}
                  crossOrigin="anonymous"
                />
                <span className="ticket-pass-preview__brand">
                  {t('pages.ticketsPage.passBrand')}
                </span>
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
                <span className="ticket-pass-preview__guest-label">
                  {t('pages.ticketsPage.passGuestLabel')}
                </span>
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
            <span className="ticket-pass-preview__qr-label">
              {t('pages.ticketsPage.passQrLabel')}
            </span>
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
      {interactive && showHint && canTilt ? (
        <p className="ticket-pass-preview__hint">{t('pages.ticketsPage.passMoveHint')}</p>
      ) : null}
    </Root>
  )
}
