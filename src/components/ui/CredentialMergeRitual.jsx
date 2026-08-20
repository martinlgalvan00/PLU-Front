import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import CelebrationBurst from './CelebrationBurst.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens'
import { markCredentialMergePlayed } from '../../lib/credentialMerge.js'

function MergePlate({ label, qrSrc, alt = '', featured = false }) {
  return (
    <div
      className={
        featured
          ? 'credential-merge__plate credential-merge__plate--final'
          : 'credential-merge__plate'
      }
    >
      <span className="credential-merge__plate-stripe" aria-hidden />
      <span className="credential-merge__plate-watermark" aria-hidden>
        PLU
      </span>
      <span className="credential-merge__plate-mark">PLU</span>
      {qrSrc ? <img src={qrSrc} alt={alt} /> : <span className="credential-merge__placeholder" />}
      {label ? <span className="credential-merge__plate-label">{label}</span> : null}
    </div>
  )
}

/**
 * Ritual one-shot: dos pases visuales se acercan y quedan en una sola credencial.
 * Solo transform/opacity; reduced-motion salta al estado final.
 *
 * La ráfaga sale de la credencial ya unificada, no del arranque: lo que se
 * festeja es que los dos pases quedaron en uno, y eso recién es un hecho
 * cuando la placa final aterrizó.
 */
/** Cuándo la placa final ya aterrizó: delay + buena parte de su entrada. */
const MERGE_LANDED_MS = Math.round(MOTION_DURATION.slow * 1000 + 220)

export default function CredentialMergeRitual({
  athleteId,
  membershipId,
  meetLabel,
  membershipLabel,
  qrSrc,
  onComplete,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const finalPlateRef = useRef(null)

  useEffect(() => {
    if (!athleteId || !membershipId) return undefined
    markCredentialMergePlayed(athleteId, membershipId)

    if (reducedMotion) {
      onComplete?.()
      return undefined
    }

    const timer = window.setTimeout(
      () => {
        onComplete?.()
      },
      Math.round((MOTION_DURATION.cinematic + MOTION_DURATION.slow) * 1000),
    )

    return () => window.clearTimeout(timer)
  }, [athleteId, membershipId, onComplete, reducedMotion])

  if (reducedMotion) {
    return (
      <div className="credential-merge credential-merge--static" role="status">
        <p className="credential-merge__title">{t('account.qr.mergeTitle')}</p>
        <p className="credential-merge__subtitle">{t('account.qr.mergeSubtitle')}</p>
        <div className="credential-merge__final">
          <MergePlate qrSrc={qrSrc} alt={t('account.qr.imageAlt')} featured />
        </div>
      </div>
    )
  }

  return (
    <div className="credential-merge" role="status" aria-live="polite">
      <p className="credential-merge__title">{t('account.qr.mergeTitle')}</p>
      <p className="credential-merge__subtitle">{t('account.qr.mergeSubtitle')}</p>

      <div className="credential-merge__stage">
        <m.div
          className="credential-merge__pass credential-merge__pass--meet"
          initial={{ opacity: 1, x: -28, scale: 1 }}
          animate={{ opacity: 0, x: 0, scale: 0.92 }}
          transition={{ duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic }}
        >
          <MergePlate label={meetLabel} qrSrc={qrSrc} alt="" />
        </m.div>

        <m.div
          className="credential-merge__pass credential-merge__pass--membership"
          initial={{ opacity: 1, x: 28, scale: 1 }}
          animate={{ opacity: 0, x: 0, scale: 0.92 }}
          transition={{ duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic }}
        >
          <MergePlate label={membershipLabel} qrSrc={qrSrc} alt="" />
        </m.div>

        <m.div
          ref={finalPlateRef}
          className="credential-merge__final"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: MOTION_DURATION.slow,
            duration: MOTION_DURATION.slow,
            ease: MOTION_EASE.out,
          }}
        >
          <MergePlate qrSrc={qrSrc} alt={t('account.qr.imageAlt')} featured />
        </m.div>

        <CelebrationBurst active anchorRef={finalPlateRef} delayMs={MERGE_LANDED_MS} />
      </div>
    </div>
  )
}
