import { useEffect, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import Button from './Button.jsx'
import CredentialCard from './CredentialCard.jsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import {
  buildCredentialUrl,
  buildRandomPreviewCredentialCode,
  generateCredentialQr,
} from '../../lib/credentialQr.js'

function scrollToId(id) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function MembersPluHero({
  onNavigate,
  session,
  affiliationCta,
  ctaDisabled,
  onAffiliate,
  price,
  pricePeriod,
}) {
  const { locale, t } = useI18n()
  const { MEMBERSHIP_CREDENTIAL_SAMPLE } = useContent()
  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const [previewCode] = useState(() => buildRandomPreviewCredentialCode())
  const [credentialQrSrc, setCredentialQrSrc] = useState(null)

  useEffect(() => {
    let cancelled = false
    // QR de vista previa (código PREV-*, no verificable) — aleatorio por visita
    // para que al escanear se abra el easter egg de CredentialPage.
    generateCredentialQr(buildCredentialUrl({ code: previewCode }))
      .then((dataUrl) => {
        if (!cancelled) setCredentialQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setCredentialQrSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [previewCode])

  const hasPrice = Number.isFinite(price)

  return (
    <header className="members-plu-hero">
      <div className="members-plu-hero__grid">
        <div className="members-plu-hero__main">
          <p className="members-plu-hero__chapter">
            <span className="members-plu-hero__chapter-dot" aria-hidden />
            {t('pages.members.heroChapter')}
          </p>
          <h1 className="members-plu-hero__title">
            <span className="members-plu-hero__title-line">{t('pages.members.heroTitleLead')}</span>
            <span className="members-plu-hero__title-line members-plu-hero__title-line--accent">
              {t('pages.members.heroTitleAccent')}
            </span>
          </h1>
          <p className="members-plu-hero__desc">{t('pages.members.heroDesc')}</p>

          <div className="members-plu-hero__cta-row">
            <div className="members-plu-hero__buy">
              <Button variant="gold" disabled={ctaDisabled} onClick={onAffiliate}>
                {affiliationCta}
              </Button>
              {hasPrice ? (
                <p className="members-plu-hero__price">
                  <strong className="members-plu-hero__price-amount">{money(price, locale)}</strong>
                  <span className="members-plu-hero__price-period">{pricePeriod}</span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="members-plu-hero__secondary motion-icon-shift"
              onClick={() => scrollToId('requisitos')}
            >
              {t('pages.members.heroCtaSecondary')}
              <ArrowDown size={15} aria-hidden className="motion-icon-shift__target" />
            </button>
          </div>

          <div className="members-plu-hero__account">
            {isLoggedInAthlete ? (
              <p className="members-plu-hero__signed-in">
                {t('pages.members.heroSignedIn', { name: session?.name ?? session?.email ?? '' })}
              </p>
            ) : (
              <>
                <span className="members-plu-hero__account-label">
                  {t('pages.members.existingMember')}
                </span>
                <button
                  type="button"
                  className="members-plu-hero__account-link"
                  onClick={() => onNavigate('login')}
                >
                  {t('pages.members.loginLink')}
                </button>
                <span className="members-plu-hero__account-sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="members-plu-hero__account-link"
                  onClick={() => onNavigate('register')}
                >
                  {t('pages.members.registerLink')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="members-plu-hero__showcase">
          <CredentialCard
            className="members-plu-hero__card-tilt"
            eyebrow={t('pages.members.credentialAthleteLabel')}
            name={MEMBERSHIP_CREDENTIAL_SAMPLE.athlete}
            code={MEMBERSHIP_CREDENTIAL_SAMPLE.affiliateCode}
            codeLabel={t('pages.members.credentialCodeLabel')}
            season={MEMBERSHIP_CREDENTIAL_SAMPLE.season}
            status={MEMBERSHIP_CREDENTIAL_SAMPLE.status}
            qrSrc={credentialQrSrc}
            qrAlt={t('pages.members.credentialQrAlt')}
            qrCaption={t('pages.members.credentialQrCaption')}
            flipToBackLabel={t('pages.members.credentialFlipToBack')}
            flipToFrontLabel={t('pages.members.credentialFlipToFront')}
            flipAriaLabel={t('pages.members.credentialFlipAria', {
              name: MEMBERSHIP_CREDENTIAL_SAMPLE.athlete,
            })}
            maxTilt={4.5}
          />
          <p className="members-cred__caption">{t('pages.members.credentialPreviewNote')}</p>
        </div>
      </div>
    </header>
  )
}
