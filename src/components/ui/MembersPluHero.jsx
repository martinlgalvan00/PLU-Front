import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import CredentialCard from './CredentialCard.jsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
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
}) {
  const { t } = useI18n()
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

  const quickLinks = [
    { id: 'afiliarme', label: t('pages.members.quickNavAffiliate'), onClick: () => scrollToId('planes') },
    { id: 'cuenta', label: t('pages.members.quickNavAccount'), onClick: () => onNavigate('login') },
    { id: 'comunidad', label: t('pages.members.quickNavCommunity'), onClick: () => onNavigate('community') },
    { id: 'reglamento', label: t('pages.members.quickNavRulebook'), onClick: () => onNavigate('rulebook') },
    { id: 'faq', label: t('pages.members.quickNavFaq'), onClick: () => scrollToId('members-faq') },
  ]

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
            <Button variant="gold" disabled={ctaDisabled} onClick={onAffiliate}>
              {affiliationCta}
            </Button>
            <Button variant="outline" onClick={() => scrollToId('requisitos')}>
              {t('pages.members.heroCtaSecondary')}
            </Button>
          </div>

          <div className="members-plu-hero__account">
            {isLoggedInAthlete ? (
              <p className="members-plu-hero__signed-in">
                {t('pages.members.heroSignedIn', { name: session?.name ?? session?.email ?? '' })}
              </p>
            ) : (
              <>
                <span className="members-plu-hero__account-label">{t('pages.members.existingMember')}</span>
                <button type="button" className="members-plu-hero__account-link" onClick={() => onNavigate('login')}>
                  {t('pages.members.loginLink')}
                </button>
                <span className="members-plu-hero__account-sep" aria-hidden>
                  ·
                </span>
                <button type="button" className="members-plu-hero__account-link" onClick={() => onNavigate('register')}>
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

      <nav className="members-plu-quicknav" aria-label={t('pages.members.quickNavAria')}>
        {quickLinks.map((link, index) => (
          <span key={link.id} className="members-plu-quicknav__item">
            {index > 0 && <span className="members-plu-quicknav__sep" aria-hidden>/</span>}
            <button type="button" className="members-plu-quicknav__link" onClick={link.onClick}>
              {link.label}
            </button>
          </span>
        ))}
      </nav>
    </header>
  )
}
