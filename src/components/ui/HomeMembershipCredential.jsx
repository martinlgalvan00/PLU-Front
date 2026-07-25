import { useEffect, useState } from 'react'
import { Camera, QrCode } from 'lucide-react'
import { m } from 'motion/react'
import TiltCard from '../../motion/TiltCard.tsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_BLUR, MOTION_DURATION, MOTION_EASE, MOTION_STAGGER } from '../../motion/tokens.ts'

/** Shell: ancla espacial liviana. El tilt 3D lleva la presencia. */
const cardShell = {
  hidden: { opacity: 0, y: 16, scale: 0.985, filter: `blur(${MOTION_BLUR.sm}px)` },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
  },
}

const layerStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.stepFast,
      delayChildren: 0.14,
    },
  },
}

const layerItem = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

const PREVIEW_MEMBER_CODE = 'PREV-HOME-MEMBER'

/**
 * Showcase de afiliación — frente de la credencial digital real
 * (`DigitalCredential` + QR de cuenta), sin PII inventados:
 * foto / nombre / temporada como placeholders y QR de vista previa.
 */
export default function HomeMembershipCredential() {
  const { HOME_MEMBERSHIP } = useContent()
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const [qrSrc, setQrSrc] = useState('')

  const seasonYear = HOME_MEMBERSHIP.seasonNote.match(/\d+/)?.[0] ?? ''

  useEffect(() => {
    let cancelled = false
    const url = buildCredentialUrl({ code: PREVIEW_MEMBER_CODE })

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
  }, [])

  const body = (
    <div className="home-credential__stack" aria-label={t('pages.home.credentialAria')}>
      <span className="home-credential__glow" aria-hidden />
      <span className="home-credential__grain" aria-hidden />
      <span className="home-credential__watermark" aria-hidden>
        {seasonYear.slice(-2) || 'PL'}
      </span>

      {reducedMotion ? (
        <div className="home-credential__face">
          <CredentialFaceContent seasonYear={seasonYear} qrSrc={qrSrc} t={t} />
        </div>
      ) : (
        <m.div className="home-credential__face" variants={layerStagger}>
          <CredentialFaceContent seasonYear={seasonYear} qrSrc={qrSrc} t={t} motion />
        </m.div>
      )}
    </div>
  )

  const tilt = (
    <TiltCard
      className="home-credential__tilt"
      innerClassName="tilt-card__inner home-credential__card"
      maxTilt={3}
    >
      {body}
    </TiltCard>
  )

  const caption = (
    <p className="home-credential__caption">{t('pages.home.credentialPreviewNote')}</p>
  )

  if (reducedMotion) {
    return (
      <div className="home-credential">
        {tilt}
        {caption}
      </div>
    )
  }

  return (
    <m.div
      className="home-credential"
      variants={cardShell}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.35 }}
    >
      {tilt}
      {caption}
    </m.div>
  )
}

function CredentialFaceContent({ seasonYear, qrSrc, t, motion = false }) {
  const Item = motion ? m.div : 'div'
  const itemProps = motion ? { variants: layerItem } : {}

  return (
    <>
      <Item className="home-credential__brand" {...itemProps}>
        <span className="home-credential__monogram" aria-hidden>
          PLU
        </span>
        <div className="home-credential__brand-copy">
          <strong>Powerlifting United</strong>
          <span>{t('account.credential.brandLine')}</span>
        </div>
      </Item>

      <Item className="home-credential__main" {...itemProps}>
        <div className="home-credential__identity">
          <span className="home-credential__photo" aria-hidden>
            <Camera size={18} strokeWidth={1.6} />
            <span className="home-credential__photo-label">{t('pages.home.credentialPhotoLabel')}</span>
          </span>
          <div className="home-credential__identity-copy">
            <small>{t('account.credential.athlete')}</small>
            <p className="home-credential__name">{t('pages.home.credentialSampleName')}</p>
            <p className="home-credential__code">{t('pages.home.credentialSampleCode')}</p>
            {seasonYear ? (
              <p className="home-credential__season-inline">
                <span>{t('pages.home.credentialSeasonLabel')}</span>
                <strong>{seasonYear}</strong>
              </p>
            ) : null}
          </div>
        </div>

        <div className="home-credential__qr" aria-hidden>
          <div className="home-credential__qr-frame">
            {qrSrc ? (
              <img src={qrSrc} alt="" className="home-credential__qr-img" />
            ) : (
              <span className="home-credential__qr-fallback">
                <QrCode size={36} strokeWidth={1.4} />
              </span>
            )}
          </div>
          <span className="home-credential__qr-label">{t('pages.home.credentialQrLabel')}</span>
        </div>
      </Item>

      <Item className="home-credential__foot" {...itemProps}>
        <p className="home-credential__scan-hint">{t('pages.home.credentialScanHint')}</p>
        <span className="home-credential__status is-active">
          <span className="home-credential__status-dot" aria-hidden />
          {t('account.membershipActive')}
        </span>
      </Item>
    </>
  )
}
