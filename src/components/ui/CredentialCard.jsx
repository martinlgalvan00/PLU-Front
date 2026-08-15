import '../../styles/components/credential-card.css'
import { useState } from 'react'
import { QrCode, RotateCcw } from 'lucide-react'
import TiltCard from '../../motion/TiltCard.tsx'
import CredentialQr from './CredentialQr.jsx'

/**
 * CredentialCard — PLU ARG
 *
 * Credencial digital con flip 3D: frente de identidad (marca, atleta, código,
 * temporada, estado) y dorso de verificación (QR + código).
 *
 * El hit-target envuelve al TiltCard (click/tap/teclado). El tilt solo setea
 * CSS vars en el root; el rotate del tilt vive en el flipper junto con el
 * flip — nunca anidados en el mismo eje (si no, backface-visibility rompe).
 *
 * Bajo prefers-reduced-motion el flip se resuelve como crossfade de opacity.
 */
export default function CredentialCard({
  eyebrow,
  name,
  code,
  codeLabel,
  season,
  status,
  qrSrc = null,
  qrAlt = '',
  qrFailed = false,
  qrCaption,
  validUntil = null,
  flipToBackLabel,
  flipToFrontLabel,
  flipAriaLabel,
  brandMark = 'PLU',
  brandSub = 'Argentina',
  className = '',
  maxTilt = 3,
}) {
  const [isFlipped, setIsFlipped] = useState(false)

  const toggleFlip = () => setIsFlipped((value) => !value)

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleFlip()
    }
  }

  return (
    <div
      className={`credential-card-hit ${className}`.trim()}
      role="button"
      tabIndex={0}
      aria-pressed={isFlipped}
      aria-label={flipAriaLabel}
      onClick={toggleFlip}
      onKeyDown={handleKeyDown}
    >
      <TiltCard
        className="credential-card-tilt"
        innerClassName="tilt-card__inner credential-card__inner"
        maxTilt={isFlipped ? 0 : maxTilt}
      >
        <div
          className="credential-card__flipper"
          data-flipped={isFlipped ? '1' : '0'}
        >
          <div
            className="credential-card__face credential-card__face--front"
            aria-hidden={isFlipped}
          >
            <span className="credential-card__glow" aria-hidden />
            <span className="credential-card__grain" aria-hidden />
            <span className="credential-card__frame" aria-hidden />
            <span className="credential-card__watermark" aria-hidden>
              {brandMark}
            </span>
            <span className="credential-card__stripe" aria-hidden />

            <div className="credential-card__layer credential-card__layer--front">
              <header className="credential-card__head">
                <div className="credential-card__brand">
                  <span className="credential-card__mark">{brandMark}</span>
                  <span className="credential-card__mark-sub">{brandSub}</span>
                </div>
                <span className="credential-card__chip" aria-hidden>
                  <span className="credential-card__chip-shine" />
                </span>
              </header>

              <div className="credential-card__identity">
                <p className="credential-card__eyebrow">{eyebrow}</p>
                <p className="credential-card__name">{name}</p>
                <p className="credential-card__code">
                  <span className="credential-card__code-label">{codeLabel}</span>
                  <span className="credential-card__code-value">{code}</span>
                </p>
              </div>

              <footer className="credential-card__foot">
                <span className="credential-card__season">{season}</span>
                <span className="credential-card__foot-side">
                  <span className="credential-card__status">
                    <span className="credential-card__status-dot" aria-hidden />
                    {status}
                  </span>
                  <span className="credential-card__flip-badge" aria-hidden>
                    <QrCode size={13} strokeWidth={2} />
                    {flipToBackLabel}
                  </span>
                </span>
              </footer>
            </div>
          </div>

          <div
            className="credential-card__face credential-card__face--back"
            aria-hidden={!isFlipped}
          >
            <span className="credential-card__frame" aria-hidden />
            <span className="credential-card__stripe" aria-hidden />

            <div className="credential-card__layer credential-card__layer--back">
              <header className="credential-card__back-brand">
                <span className="credential-card__mark">{brandMark}</span>
                <span className="credential-card__mark-sub">{brandSub}</span>
              </header>

              <div className="credential-card__qr-block">
                <CredentialQr
                  className="credential-card__qr-chip"
                  src={qrSrc}
                  alt={qrAlt}
                  failed={qrFailed}
                  size="md"
                />
                <span className="credential-card__qr-caption">{qrCaption}</span>
                {validUntil ? <span className="credential-card__qr-valid">{validUntil}</span> : null}
              </div>

              <footer className="credential-card__foot credential-card__foot--back">
                <span className="credential-card__code-value">{code}</span>
                <span className="credential-card__flip-badge" aria-hidden>
                  <RotateCcw size={13} strokeWidth={2} />
                  {flipToFrontLabel}
                </span>
              </footer>
            </div>
          </div>
        </div>
      </TiltCard>
    </div>
  )
}
