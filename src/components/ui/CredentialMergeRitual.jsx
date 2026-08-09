import { useEffect } from 'react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens'
import { markCredentialMergePlayed } from '../../lib/credentialMerge.js'

/**
 * Ritual one-shot: dos pases visuales se acercan y quedan en una sola credencial.
 * Solo transform/opacity; reduced-motion salta al estado final.
 */
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

  useEffect(() => {
    if (!athleteId || !membershipId) return undefined
    markCredentialMergePlayed(athleteId, membershipId)

    if (reducedMotion) {
      onComplete?.()
      return undefined
    }

    const timer = window.setTimeout(() => {
      onComplete?.()
    }, Math.round((MOTION_DURATION.cinematic + MOTION_DURATION.slow) * 1000))

    return () => window.clearTimeout(timer)
  }, [athleteId, membershipId, onComplete, reducedMotion])

  if (reducedMotion) {
    return (
      <div className="credential-merge credential-merge--static" role="status">
        <p className="credential-merge__title">{t('account.qr.mergeTitle')}</p>
        <p className="credential-merge__subtitle">{t('account.qr.mergeSubtitle')}</p>
        {qrSrc ? (
          <div className="credential-merge__final">
            <img src={qrSrc} alt={t('account.qr.imageAlt')} />
          </div>
        ) : null}
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
          <span>{meetLabel}</span>
          {qrSrc ? <img src={qrSrc} alt="" /> : <div className="credential-merge__placeholder" />}
        </m.div>

        <m.div
          className="credential-merge__pass credential-merge__pass--membership"
          initial={{ opacity: 1, x: 28, scale: 1 }}
          animate={{ opacity: 0, x: 0, scale: 0.92 }}
          transition={{ duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic }}
        >
          <span>{membershipLabel}</span>
          {qrSrc ? <img src={qrSrc} alt="" /> : <div className="credential-merge__placeholder" />}
        </m.div>

        <m.div
          className="credential-merge__final"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: MOTION_DURATION.slow,
            duration: MOTION_DURATION.slow,
            ease: MOTION_EASE.out,
          }}
        >
          {qrSrc ? <img src={qrSrc} alt={t('account.qr.imageAlt')} /> : null}
        </m.div>
      </div>
    </div>
  )
}
